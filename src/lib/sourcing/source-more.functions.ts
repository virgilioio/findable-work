import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enrichApolloProfiles } from "./apollo.server";
import { linkedinSlug } from "./budget";
import { spendCreditsAdmin } from "@/lib/billing/credits.functions";
import { CANDIDATE_ADD_COST } from "@/lib/billing/bundles";

const Input = z.object({
  conversationId: z.string().uuid(),
  limit: z.number().int().min(1).max(25).optional().default(10),
});

export const sourceMore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, conversationId, limit } = { ...data, userId: context.userId };

    // Find latest sourcing project for this conversation
    const { data: project, error: pErr } = await supabaseAdmin
      .from("sourcing_projects")
      .select("id")
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!project) {
      throw new Error("Run sourcing in chat first to enable Source more.");
    }

    // Pull previews ordered by score
    const { data: previews, error: prevErr } = await supabaseAdmin
      .from("sourcing_preview_candidates")
      .select("*")
      .eq("project_id", project.id)
      .eq("user_id", userId)
      .order("keyword_score", { ascending: false });
    if (prevErr) throw new Error(prevErr.message);

    const apolloPrev = (previews ?? []).filter((p: any) => p.source === "apollo");
    const pdlPrev = (previews ?? []).filter((p: any) => p.source === "pdl");
    const apolloIds = apolloPrev.map((p: any) => p.external_id);
    const pdlIds = pdlPrev.map((p: any) => p.external_id);

    // Same-tenant existing candidates: we keyed off these to detect repeats.
    // Pull the full row so we can clone for "internal" reuse without paying
    // Apollo / PDL for enrichment. Already-in-THIS-conversation rows still
    // count as duplicates and must be skipped.
    const [{ data: aRows }, { data: pRows }] = await Promise.all([
      supabaseAdmin.from("candidates").select("*").eq("user_id", userId)
        .in("apollo_id", apolloIds.length ? apolloIds : ["__none__"]),
      supabaseAdmin.from("candidates").select("*").eq("user_id", userId)
        .in("pdl_id", pdlIds.length ? pdlIds : ["__none__"]),
    ]);
    const apolloByIdAll = new Map<string, any>();
    const pdlByIdAll = new Map<string, any>();
    for (const r of aRows ?? []) if (r.apollo_id) apolloByIdAll.set(r.apollo_id, r);
    for (const r of pRows ?? []) if (r.pdl_id) pdlByIdAll.set(r.pdl_id, r);

    // "Already collected in THIS conversation" → skip entirely.
    const apolloInThisConv = new Set(
      (aRows ?? []).filter((r: any) => r.conversation_id === conversationId).map((r: any) => r.apollo_id),
    );
    const pdlInThisConv = new Set(
      (pRows ?? []).filter((r: any) => r.conversation_id === conversationId).map((r: any) => r.pdl_id),
    );

    // Keep previews that aren't already in this conversation. Internal repeats
    // (in another project of the same tenant) STAY in the list and will be
    // cloned for free, marked as Internal.
    const remaining = (previews ?? []).filter((p: any) => {
      if (p.source === "apollo") return !apolloInThisConv.has(p.external_id);
      if (p.source === "pdl") return !pdlInThisConv.has(p.external_id);
      return false;
    });

    const next = remaining.slice(0, limit);
    if (next.length === 0) {
      return { added: 0, skipped: 0, remaining: 0, exhausted: true };
    }

    // Split into internal-reuse vs fresh (needs enrichment / cost).
    const apolloInternal = next.filter(
      (p: any) => p.source === "apollo" && apolloByIdAll.has(p.external_id),
    );
    const apolloFresh = next.filter(
      (p: any) => p.source === "apollo" && !apolloByIdAll.has(p.external_id),
    );
    const pdlInternal = next.filter(
      (p: any) => p.source === "pdl" && pdlByIdAll.has(p.external_id),
    );
    const pdlFresh = next.filter(
      (p: any) => p.source === "pdl" && !pdlByIdAll.has(p.external_id),
    );

    let added = 0;
    let skipped = 0;
    let creditsExhausted = false;
    let creditsSpent = 0;

    // Pre-check balance so we don't burn external API quota on a zero-balance run.
    const { data: balRow } = await supabaseAdmin
      .from("profiles")
      .select("credits_remaining")
      .eq("id", userId)
      .single();
    const startingBalance = balRow?.credits_remaining ?? 0;
    if (apolloFresh.length + pdlFresh.length > 0 && startingBalance < CANDIDATE_ADD_COST) {
      return {
        added: 0,
        skipped: 0,
        remaining: remaining.length,
        exhausted: false,
        insufficient_credits: true,
        credits_required: CANDIDATE_ADD_COST,
        credits_balance: startingBalance,
      };
    }

    // --- Internal reuse: clone existing candidate row into this conversation. ---
    async function cloneInternal(src: any) {
      const { error: insErr } = await supabaseAdmin.from("candidates").insert({
        user_id: userId,
        conversation_id: conversationId,
        name: src.name,
        role: src.role,
        company: src.company,
        stage: "Sourced",
        source: "Internal",
        match: src.match ?? 80,
        tags: [],
        starred: false,
        avatar: src.avatar ?? "",
        email: src.email,
        phone: src.phone,
        linkedin: src.linkedin,
        location: src.location,
        summary: src.summary,
        experience: src.experience ?? [],
        education: src.education ?? [],
        activity: [] as any,
        match_breakdown: [] as any,
        apollo_id: src.apollo_id,
        pdl_id: src.pdl_id,
        linkedin_slug: src.linkedin_slug,
        has_direct_phone: src.has_direct_phone ?? false,
      });
      if (insErr) {
        console.error("source-more internal reuse failed:", insErr.message);
        skipped++;
      } else added++;
    }

    for (const p of apolloInternal) {
      const src = apolloByIdAll.get((p as any).external_id);
      if (src) await cloneInternal(src);
    }
    for (const p of pdlInternal) {
      const src = pdlByIdAll.get((p as any).external_id);
      if (src) await cloneInternal(src);
    }

    let creditedAdds = 0;

    // Apollo fresh: enrich + insert (1 credit each).
    if (apolloFresh.length > 0) {
      const apolloPhoneFlag = new Map<string, boolean>(
        apolloFresh.map((p: any) => [p.external_id, Boolean(p.preview?.has_direct_phone)]),
      );
      try {
        const enriched = await enrichApolloProfiles(apolloFresh.map((p: any) => p.external_id));
        for (const e of enriched) {
          if (creditsExhausted) break;
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
            console.error("source-more apollo insert failed:", insErr.message);
            skipped++;
          } else {
            added++;
            creditedAdds++;
            const spend = await spendCreditsAdmin({
              userId,
              amount: CANDIDATE_ADD_COST,
              type: "candidate_add",
              reason: "Candidate sourced (source more)",
              metadata: { project_id: project.id, source: "apollo", apollo_id: e.id, candidate_id: ins?.id },
            });
            if (spend.ok) creditsSpent += CANDIDATE_ADD_COST;
            else creditsExhausted = true;
          }
        }
      } catch (e: any) {
        console.error("source-more apollo enrichment failed:", e?.message);
      }
    }

    // PDL fresh: insert from preview payload.
    for (const p of pdlFresh) {
      if (creditsExhausted) break;
      const raw: any = (p as any).preview?.raw ?? {};
      const prev: any = (p as any).preview ?? {};
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
        role: raw.job_title ?? prev.title ?? "",
        company: raw.job_company_name ?? prev.company ?? "",
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
        pdl_id: (p as any).external_id,
        linkedin_slug: slug,
        has_direct_phone: Boolean(raw.mobile_phone || raw.phone_numbers?.length),
      }).select("id").single();
      if (insErr) {
        console.error("source-more pdl insert failed:", insErr.message);
        skipped++;
      } else {
        added++;
        creditedAdds++;
        const spend = await spendCreditsAdmin({
          userId,
          amount: CANDIDATE_ADD_COST,
          type: "candidate_add",
          reason: "Candidate sourced (source more)",
          metadata: { project_id: project.id, source: "pdl", pdl_id: (p as any).external_id, candidate_id: ins?.id },
        });
        if (spend.ok) creditsSpent += CANDIDATE_ADD_COST;
        else creditsExhausted = true;
      }
    }

    // Only fresh Apollo/PDL adds consume credits. Internal reuse is free.
    if (creditedAdds > 0) {
      await supabaseAdmin.rpc("increment_sourcing_usage", { _user_id: userId, _count: creditedAdds });
    }

    return {
      added,
      skipped,
      remaining: Math.max(0, remaining.length - next.length),
      exhausted: remaining.length - next.length === 0,
    };
  });