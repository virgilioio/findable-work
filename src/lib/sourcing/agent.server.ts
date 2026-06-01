// Server-only sourcing agent: normalize -> research -> search -> collect.
// Emits task lifecycle events through a callback so the caller (chat SSE) can
// stream them and persist agent_tasks rows.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { openaiChat } from "./openai.server";
import {
  budgetSearchCriteria,
  currentPeriod,
  detectAmbiguousRegion,
  linkedinSlug,
  type SearchCriteria,
} from "./budget";
import { searchApolloWithFallback, enrichApolloProfiles } from "./apollo.server";
import { searchPdl, PdlQuotaError } from "./pdl.server";
import { getPrompt } from "@/lib/prompts/registry.server";
import { spendCreditsAdmin } from "@/lib/billing/credits.functions";
import { CANDIDATE_ADD_COST } from "@/lib/billing/bundles";

export type AgentTask = {
  id: string;
  conversation_id: string;
  user_id: string;
  message_id: string | null;
  kind: "normalize" | "research" | "search" | "collect";
  label: string;
  status: "running" | "done" | "failed";
  summary: string | null;
  data: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
};

export type TaskEvent = AgentTask;

type Ctx = {
  userId: string;
  conversationId: string;
  messageId?: string | null;
  jobBrief?: { title?: string; description?: string; location?: string; requirements?: string[] };
  brief: string;
  limit: number;
  onTask: (t: TaskEvent) => void;
};

async function insertTask(
  userId: string,
  conversationId: string,
  kind: AgentTask["kind"],
  label: string,
  messageId?: string | null,
): Promise<AgentTask> {
  const { data, error } = await supabaseAdmin
    .from("agent_tasks")
    .insert({
      user_id: userId,
      conversation_id: conversationId,
      message_id: messageId ?? null,
      kind,
      label,
      status: "running",
      data: {},
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as AgentTask;
}

async function finishTask(
  task: AgentTask,
  status: "done" | "failed",
  summary: string,
  data: Record<string, unknown> = {},
): Promise<AgentTask> {
  const { data: updated, error } = await supabaseAdmin
    .from("agent_tasks")
    .update({
      status,
      summary,
      data: data as any,
      finished_at: new Date().toISOString(),
    })
    .eq("id", task.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return updated as AgentTask;
}

const RESEARCH_TOOL = {
  type: "function",
  function: {
    name: "provide_research_results",
    description: "Provide enriched sourcing criteria for a recruiter.",
    parameters: {
      type: "object",
      properties: {
        researched_titles: { type: "array", items: { type: "string" } },
        researched_companies: { type: "array", items: { type: "string" } },
        researched_keywords: { type: "array", items: { type: "string" } },
        research_reasoning: { type: "string" },
      },
      required: ["researched_titles", "researched_companies", "researched_keywords", "research_reasoning"],
    },
  },
} as const;

export type SourceResult = {
  preview_total: number;
  added: number;
  skipped: number;
  apollo_count: number;
  pdl_count: number;
  apollo_error: string | null;
  pdl_error: string | null;
  project_id: string;
  requested: number;
  pool_limited: boolean;
  broadened: boolean;
  needs_clarification?: {
    reason: "ambiguous_region";
    region: string;
    suggested_countries: string[];
  };
  insufficient_credits?: boolean;
  credits_required?: number;
  credits_balance?: number;
};

export async function runSourcingAgent(ctx: Ctx): Promise<SourceResult> {
  const { userId, conversationId, messageId, brief, jobBrief, limit, onTask } = ctx;

  // ── 1. Normalize ────────────────────────────────────────────────
  const tNorm = await insertTask(userId, conversationId, "normalize", "Normalizing brief", messageId);
  onTask(tNorm);
  let normalized: any = {};
  try {
    const promptText =
      jobBrief?.title
        ? `Title: ${jobBrief.title}\nLocation: ${jobBrief.location ?? ""}\nRequirements: ${(jobBrief.requirements ?? []).join("; ")}\n\nRecruiter brief: ${brief}`
        : brief;
    const completion = await openaiChat({
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: await getPrompt("sourcing.agent_normalize") },
        { role: "user", content: promptText },
      ],
    });
    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    normalized = JSON.parse(raw);
    onTask(
      await finishTask(tNorm, "done", `${normalized.title ?? "Untitled"} · ${normalized.location ?? "any location"}`, normalized),
    );
    // Rename the conversation to the normalized job title so the sidebar
    // reflects the canonical role (e.g. "Senior React Developer").
    if (normalized?.title && typeof normalized.title === "string") {
      const newTitle = normalized.title.trim().slice(0, 200);
      if (newTitle) {
        await supabaseAdmin
          .from("conversations")
          .update({ title: newTitle, updated_at: new Date().toISOString() })
          .eq("id", conversationId)
          .eq("user_id", userId);
      }
    }
  } catch (e: any) {
    onTask(await finishTask(tNorm, "failed", e?.message ?? "Normalization failed"));
    throw e;
  }

  // ── Guard: ambiguous multi-country region acronym ──────────────
  // If the user (or LLM) gave only a region acronym (LATAM, EMEA, APAC, ...)
  // as the location, refuse to search. Different countries inside a region
  // have very different talent pools — the agent must ask the user which
  // specific countries to target.
  const candidateRegionTokens: string[] = [];
  if (typeof normalized.location === "string" && normalized.location.trim()) {
    // The normalize prompt may emit "City, State, Country" — scan each part.
    for (const part of normalized.location.split(",")) candidateRegionTokens.push(part);
  }
  // Backstop: also scan the raw brief in case the LLM dropped the location
  // (per the location.rules partial it should leave region acronyms empty).
  for (const tok of brief.split(/[\s,/\-—–|()]+/)) candidateRegionTokens.push(tok);
  let ambiguous: { region: string; suggestedCountries: string[] } | null = null;
  for (const tok of candidateRegionTokens) {
    const hit = detectAmbiguousRegion(tok);
    if (hit) { ambiguous = hit; break; }
  }
  // If we detected a region acronym, BUT the brief also mentions concrete
  // countries from that region (because the user already answered a prior
  // clarification card), use those concrete countries instead of asking
  // again. This breaks the "ask LATAM countries forever" loop.
  let concreteCountries: string[] = [];
  if (ambiguous) {
    const briefLower = ` ${brief.toLowerCase()} `;
    for (const country of ambiguous.suggestedCountries) {
      const needle = country.toLowerCase();
      // Word-ish boundary: surrounded by non-letter chars.
      const re = new RegExp(
        `[^a-záéíóúñ]${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^a-záéíóúñ]`,
        "i",
      );
      if (re.test(briefLower)) concreteCountries.push(country);
    }
    if (concreteCountries.length > 0) {
      // User has already specified the countries — proceed with them.
      normalized.location = concreteCountries.join(", ");
      ambiguous = null;
    }
  }
  if (ambiguous) {
    return {
      preview_total: 0,
      added: 0,
      skipped: 0,
      apollo_count: 0,
      pdl_count: 0,
      apollo_error: null,
      pdl_error: null,
      project_id: "",
      requested: limit,
      pool_limited: false,
      broadened: false,
      needs_clarification: {
        reason: "ambiguous_region",
        region: ambiguous.region,
        suggested_countries: ambiguous.suggestedCountries,
      },
    };
  }

  // ── 2. Research ─────────────────────────────────────────────────
  const tRes = await insertTask(userId, conversationId, "research", "Researching titles & companies", messageId);
  onTask(tRes);
  let research: any = { researched_titles: [], researched_companies: [], researched_keywords: [] };
  try {
    const userMsg =
      `Title: ${normalized.title ?? ""}\n` +
      `Location: ${normalized.location ?? ""}\n` +
      `Skills: ${(normalized.skills ?? []).join(", ")}\n` +
      `Return at most 3 alt titles, 3 target companies, 5 boost keywords.`;
    const completion = await openaiChat({
      messages: [
        { role: "system", content: await getPrompt("sourcing.research") },
        { role: "user", content: userMsg },
      ],
      tools: [RESEARCH_TOOL],
      tool_choice: { type: "function", function: { name: "provide_research_results" } },
    });
    const call = completion.choices?.[0]?.message?.tool_calls?.[0];
    research = JSON.parse(call?.function?.arguments ?? "{}");
    onTask(
      await finishTask(
        tRes,
        "done",
        `${(research.researched_titles ?? []).length} titles · ${(research.researched_companies ?? []).length} companies · ${(research.researched_keywords ?? []).length} keywords`,
        research,
      ),
    );
  } catch (e: any) {
    onTask(await finishTask(tRes, "failed", e?.message ?? "Research failed"));
    // not fatal, continue with what we have
  }

  // ── Build criteria + create project ────────────────────────────
  const criteria: SearchCriteria = budgetSearchCriteria({
    title_keywords: [
      ...(normalized.title ? [normalized.title] : []),
      ...((research.researched_titles ?? []) as string[]),
    ],
    researched_companies: research.researched_companies ?? [],
    keywords: [...((normalized.keywords ?? []) as string[]), ...((research.researched_keywords ?? []) as string[])],
    seniorities: normalized.seniorities ?? [],
    industries: (normalized.industries ?? []) as string[],
    must_have_keywords: (normalized.must_have_keywords ?? []) as string[],
    technologies: (normalized.technologies ?? []) as string[],
    employer_hiring_titles: (normalized.employer_hiring_titles ?? []) as string[],
    strict_titles: normalized.strict_titles === true,
    locations:
      concreteCountries.length > 0
        ? concreteCountries
        : normalized.location
          ? [normalized.location]
          : [],
  });

  const { data: project, error: projErr } = await supabaseAdmin
    .from("sourcing_projects")
    .insert({
      user_id: userId,
      conversation_id: conversationId,
      title: normalized.title || jobBrief?.title || "Sourcing project",
      raw_prompt: brief,
      normalized: normalized as any,
      research: research as any,
      search_criteria: criteria as any,
    })
    .select("*")
    .single();
  if (projErr) throw new Error(projErr.message);

  // ── 3. Search Apollo + PDL ─────────────────────────────────────
  const tSearch = await insertTask(userId, conversationId, "search", "Searching candidate pool", messageId);
  onTask(tSearch);

  // Billing moved to per-candidate. Pre-check balance so we don't burn external
  // API quota when the user can't collect anything; actual debits happen per
  // successful insert below.
  const { data: balRow } = await supabaseAdmin
    .from("profiles")
    .select("credits_remaining")
    .eq("id", userId)
    .single();
  const startingBalance = balRow?.credits_remaining ?? 0;
  if (startingBalance < CANDIDATE_ADD_COST) {
    onTask(
      await finishTask(
        tSearch,
        "failed",
        `Not enough credits — at least ${CANDIDATE_ADD_COST} required, ${startingBalance} available`,
        {
          insufficient_credits: true,
          required: CANDIDATE_ADD_COST,
          balance: startingBalance,
        },
      ),
    );
    return {
      preview_total: 0,
      added: 0,
      skipped: 0,
      apollo_count: 0,
      pdl_count: 0,
      apollo_error: null,
      pdl_error: null,
      project_id: project.id,
      requested: limit,
      pool_limited: false,
      broadened: false,
      insufficient_credits: true,
      credits_required: CANDIDATE_ADD_COST,
      credits_balance: startingBalance,
    };
  }

  const [apolloRes, pdlRes] = await Promise.allSettled([
    searchApolloWithFallback(criteria),
    searchPdl(criteria),
  ]);
  const apolloOut = apolloRes.status === "fulfilled" ? apolloRes.value : { rows: [], broadened_to: 0, broadening_steps: [] };
  const apollo = apolloOut.rows;
  const pdl = pdlRes.status === "fulfilled" ? pdlRes.value : [];
  const apolloErr = apolloRes.status === "rejected" ? String(apolloRes.reason).slice(0, 300) : null;
  const poolLimited = pdlRes.status === "rejected" && pdlRes.reason instanceof PdlQuotaError;
  const pdlErr = pdlRes.status === "rejected" && !poolLimited ? String(pdlRes.reason).slice(0, 300) : null;
  const broadened = apolloOut.broadened_to > 0 && apollo.length > 0;

  const apolloSlugs = new Set(apollo.map((a) => a.linkedin_slug).filter(Boolean));
  const pdlDedup = pdl.filter((p) => !p.linkedin_slug || !apolloSlugs.has(p.linkedin_slug));
  const combined = [...apollo, ...pdlDedup];

  const searchSummary =
    combined.length > 0
      ? broadened
        ? `${combined.length} matches found (broadened search)`
        : `${combined.length} matches found`
      : poolLimited
        ? "Candidate pool partially limited — try broadening the brief"
        : "No matches — try broadening the brief";
  onTask(
    await finishTask(
      tSearch,
      combined.length > 0 ? "done" : "failed",
      searchSummary,
      {
        apollo: apollo.length,
        pdl: pdl.length,
        deduped: combined.length,
        apollo_error: apolloErr,
        pdl_error: pdlErr,
        pool_limited: poolLimited,
        broadened_to: apolloOut.broadened_to,
        broadening_steps: apolloOut.broadening_steps,
        criteria_sent: {
          titles: criteria.title_keywords ?? [],
          locations: criteria.locations ?? [],
          seniorities: criteria.seniorities ?? [],
          industries: criteria.industries ?? [],
          must_have_keywords: criteria.must_have_keywords ?? [],
          keywords: criteria.keywords ?? [],
          technologies: criteria.technologies ?? [],
          employer_hiring_titles: criteria.employer_hiring_titles ?? [],
          strict_titles: criteria.strict_titles === true,
          companies: [
            ...(criteria.user_company_names ?? []),
            ...(criteria.researched_companies ?? []),
          ],
        },
      },
    ),
  );

  // Persist previews (best-effort, ignore errors)
  if (combined.length > 0) {
    const rows = combined.map((c) => {
      const { keyword_score, raw: _raw, ...preview } = c as any;
      return {
        project_id: project.id,
        user_id: userId,
        source: c.source,
        external_id: c.external_id,
        linkedin_slug: c.linkedin_slug,
        preview: preview as any,
        keyword_score: keyword_score ?? 0,
        display_source: c.source,
      };
    });
    await supabaseAdmin.from("sourcing_preview_candidates").insert(rows);
    await supabaseAdmin
      .from("sourcing_projects")
      .update({ last_searched_at: new Date().toISOString() })
      .eq("id", project.id);
  }

  // ── 4. Collect top N ───────────────────────────────────────────
  const tCollect = await insertTask(userId, conversationId, "collect", `Collecting top ${limit}`, messageId);
  onTask(tCollect);

  // Merge top-N across both providers by score so we always fill the quota
  // even when one provider is degraded.
  const sorted = [...combined].sort((a: any, b: any) => (b.keyword_score ?? 0) - (a.keyword_score ?? 0));
  const top = sorted.slice(0, limit);
  const topApollo = top.filter((c) => c.source === "apollo");
  const topPdl = top.filter((c) => c.source === "pdl");

  let added = 0;
  let skipped = 0;
  let collectErr: string | null = null;
  let creditsExhausted = false;
  let creditsSpent = 0;

  // Dedupe against already-collected rows
  const apolloIds = topApollo.map((c: any) => c.external_id).filter(Boolean);
  const pdlIds = topPdl.map((c: any) => c.external_id).filter(Boolean);
  // Map Apollo preview external_id → has_direct_phone, so we can persist the flag
  // on the candidate row without a follow-up reveal call (which would cost credits).
  const apolloPhoneFlag = new Map<string, boolean>(
    topApollo.map((c: any) => [c.external_id, Boolean(c.has_direct_phone)]),
  );
  const [{ data: aRows }, { data: pRows }] = await Promise.all([
    supabaseAdmin.from("candidates").select("apollo_id").eq("user_id", userId)
      .in("apollo_id", apolloIds.length ? apolloIds : ["__none__"]),
    supabaseAdmin.from("candidates").select("pdl_id").eq("user_id", userId)
      .in("pdl_id", pdlIds.length ? pdlIds : ["__none__"]),
  ]);
  const apolloAlready = new Set((aRows ?? []).map((r: any) => r.apollo_id));
  const pdlAlready = new Set((pRows ?? []).map((r: any) => r.pdl_id));
  const apolloToFetch = apolloIds.filter((id) => !apolloAlready.has(id));
  const pdlToInsert = topPdl.filter((c: any) => c.external_id && !pdlAlready.has(c.external_id));
  skipped = (apolloIds.length - apolloToFetch.length) + (topPdl.length - pdlToInsert.length);

  // ── Apollo: enrich + insert ────────────────────────────────────
  if (apolloToFetch.length > 0) {
    try {
      const enriched = await enrichApolloProfiles(apolloToFetch);
      for (const e of enriched) {
        const slug = linkedinSlug(e.linkedin_url);
        const { data: ins, error: insErr } = await supabaseAdmin.from("candidates").insert({
          user_id: userId,
          conversation_id: conversationId,
          name: e.full_name || `${e.first_name} ${e.last_name}`.trim() || "Unknown",
          role: e.title,
          company: e.organization_name ?? "",
          stage: "Sourced",
          source: "Sourced",
          match: 80,
          tags: [],
          starred: false,
          avatar: (e.first_name?.[0] ?? "") + (e.last_name?.[0] ?? ""),
          email: e.email,
          phone: e.phone,
          linkedin: e.linkedin_url,
          location: [e.city, e.state, e.country].filter(Boolean).join(", ") || null,
          summary: e.title ? `${e.title}${e.organization_name ? ` at ${e.organization_name}` : ""}.` : null,
          experience: e.employment_history.map((h, idx) => ({
            id: idx + 1,
            role: h.title ?? "",
            company: h.organization_name ?? "",
            period: `${h.start_date ?? ""} — ${h.end_date ?? "Present"}`,
            desc: h.description ?? "",
          })) as any,
          education: [] as any,
          activity: [] as any,
          match_breakdown: [] as any,
          apollo_id: e.id,
          linkedin_slug: slug,
          has_direct_phone: apolloPhoneFlag.get(e.id) ?? false,
        }).select("id").single();
        if (insErr) {
          console.error("apollo candidate insert failed:", insErr.message);
          skipped++;
        } else {
          const spend = await spendCreditsAdmin({
            userId,
            amount: CANDIDATE_ADD_COST,
            type: "candidate_add",
            reason: "Candidate sourced (agent)",
            metadata: { project_id: project.id, source: "apollo", apollo_id: e.id, candidate_id: ins?.id },
          });
          if (spend.ok) creditsSpent += CANDIDATE_ADD_COST;
          else creditsExhausted = true;
          added++;
          if (creditsExhausted) break;
        }
      }
    } catch (e: any) {
      collectErr = e?.message ?? "Apollo enrichment failed";
    }
  }

  // ── PDL: insert directly from search payload ──────────────────
  for (const c of pdlToInsert) {
    if (creditsExhausted) break;
    const raw: any = (c as any).raw ?? {};
    const fn = raw.first_name ?? "";
    const ln = raw.last_name ?? "";
    const fullName = (raw.full_name ?? `${fn} ${ln}`).trim() || "Unknown";
    const slug = linkedinSlug(raw.linkedin_url);
    const exp = Array.isArray(raw.experience)
      ? raw.experience.slice(0, 10).map((h: any, idx: number) => ({
          id: idx + 1,
          role: h.title?.name ?? "",
          company: h.company?.name ?? "",
          period: `${h.start_date ?? ""} — ${h.end_date ?? "Present"}`,
          desc: h.summary ?? "",
        }))
      : [];
    const { data: ins, error: insErr } = await supabaseAdmin.from("candidates").insert({
      user_id: userId,
      conversation_id: conversationId,
      name: fullName,
      role: raw.job_title ?? c.title ?? "",
      company: raw.job_company_name ?? c.company ?? "",
      stage: "Sourced",
      source: "Sourced",
      match: 75,
      tags: [],
      starred: false,
      avatar: (fn[0] ?? "") + (ln[0] ?? ""),
      email: raw.work_email ?? raw.personal_emails?.[0] ?? null,
      phone: raw.mobile_phone ?? raw.phone_numbers?.[0] ?? null,
      linkedin: raw.linkedin_url ?? null,
      location: [raw.location_locality, raw.location_region, raw.location_country].filter(Boolean).join(", ") || null,
      summary: raw.job_title
        ? `${raw.job_title}${raw.job_company_name ? ` at ${raw.job_company_name}` : ""}.`
        : null,
      experience: exp as any,
      education: [] as any,
      activity: [] as any,
      match_breakdown: [] as any,
      pdl_id: c.external_id,
      linkedin_slug: slug,
      has_direct_phone: Boolean(raw.mobile_phone || raw.phone_numbers?.length),
    }).select("id").single();
    if (insErr) {
      console.error("pdl candidate insert failed:", insErr.message);
      skipped++;
    } else {
      const spend = await spendCreditsAdmin({
        userId,
        amount: CANDIDATE_ADD_COST,
        type: "candidate_add",
        reason: "Candidate sourced (agent)",
        metadata: { project_id: project.id, source: "pdl", pdl_id: c.external_id, candidate_id: ins?.id },
      });
      if (spend.ok) creditsSpent += CANDIDATE_ADD_COST;
      else creditsExhausted = true;
      added++;
    }
  }

  if (added > 0) {
    await supabaseAdmin.rpc("increment_sourcing_usage", { _user_id: userId, _count: added });
  }
  if (added === 0 && !collectErr && (apolloToFetch.length + pdlToInsert.length) === 0) {
    collectErr = combined.length === 0 ? "No matches — try broadening the brief" : null;
  }

  onTask(
    await finishTask(
      tCollect,
      collectErr ? "failed" : added > 0 ? "done" : "failed",
      collectErr ?? (added > 0 ? `${added} candidate${added === 1 ? "" : "s"} sourced` : "No new candidates"),
      { added, skipped, period: currentPeriod() },
    ),
  );

  return {
    preview_total: combined.length,
    added,
    skipped,
    apollo_count: apollo.length,
    pdl_count: pdl.length,
    apollo_error: apolloErr,
    pdl_error: pdlErr,
    project_id: project.id,
    requested: limit,
    pool_limited: poolLimited,
    broadened: broadened,
    credits_spent: creditsSpent,
    credits_exhausted: creditsExhausted,
  };
}
