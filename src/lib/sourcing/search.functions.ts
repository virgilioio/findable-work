import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enrichApolloProfiles, searchApollo } from "./apollo.server";
import { searchPdl } from "./pdl.server";
import { currentPeriod, linkedinSlug, type SearchCriteria } from "./budget";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const SearchInput = z.object({
  project_id: z.string().uuid(),
  force: z.boolean().optional().default(false),
});

export const runSourcingSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SearchInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project, error } = await supabase
      .from("sourcing_projects")
      .select("*")
      .eq("id", data.project_id)
      .single();
    if (error) throw new Error(error.message);

    // 24h cache check
    if (!data.force && project.last_searched_at) {
      const age = Date.now() - new Date(project.last_searched_at).getTime();
      if (age < CACHE_TTL_MS) {
        const { data: cached } = await supabase
          .from("sourcing_preview_candidates")
          .select("*")
          .eq("project_id", data.project_id)
          .order("keyword_score", { ascending: false });
        if (cached && cached.length > 0) {
          return { from_cache: true, previews: cached };
        }
      }
    }

    const criteria = (project.search_criteria ?? {}) as SearchCriteria;

    // Stage 4: parallel Apollo + PDL
    const [apolloRes, pdlRes] = await Promise.allSettled([
      searchApollo(criteria),
      searchPdl(criteria),
    ]);
    const apollo = apolloRes.status === "fulfilled" ? apolloRes.value : [];
    const pdl = pdlRes.status === "fulfilled" ? pdlRes.value : [];

    // Dedupe PDL vs Apollo by linkedin slug
    const apolloSlugs = new Set(apollo.map((a) => a.linkedin_slug).filter(Boolean));
    const pdlDedup = pdl.filter(
      (p) => !p.linkedin_slug || !apolloSlugs.has(p.linkedin_slug),
    );
    const combined = [...apollo, ...pdlDedup];

    // Cross-reference existing candidates (uses admin to see across tenants for `gio` flag)
    const slugs = combined.map((c) => c.linkedin_slug).filter(Boolean) as string[];
    const apolloIds = apollo.map((a) => a.external_id);
    let existing: Array<{ user_id: string; apollo_id: string | null; linkedin_slug: string | null }> = [];
    if (slugs.length || apolloIds.length) {
      const { data: rows } = await supabaseAdmin
        .from("candidates")
        .select("user_id, apollo_id, linkedin_slug")
        .or(
          [
            slugs.length ? `linkedin_slug.in.(${slugs.map((s) => `"${s}"`).join(",")})` : "",
            apolloIds.length ? `apollo_id.in.(${apolloIds.map((id) => `"${id}"`).join(",")})` : "",
          ]
            .filter(Boolean)
            .join(","),
        );
      existing = (rows ?? []) as typeof existing;
    }

    const tenantOwnsByApollo = new Map<string, boolean>();
    const otherTenantByApollo = new Map<string, boolean>();
    const tenantOwnsBySlug = new Map<string, boolean>();
    const otherTenantBySlug = new Map<string, boolean>();
    for (const r of existing) {
      const sameTenant = r.user_id === userId;
      if (r.apollo_id) {
        if (sameTenant) tenantOwnsByApollo.set(r.apollo_id, true);
        else otherTenantByApollo.set(r.apollo_id, true);
      }
      if (r.linkedin_slug) {
        if (sameTenant) tenantOwnsBySlug.set(r.linkedin_slug, true);
        else otherTenantBySlug.set(r.linkedin_slug, true);
      }
    }

    function displaySource(row: { source: "apollo" | "pdl"; external_id: string; linkedin_slug: string | null }): string {
      const slug = row.linkedin_slug ?? "";
      const aid = row.source === "apollo" ? row.external_id : "";
      if ((aid && tenantOwnsByApollo.get(aid)) || (slug && tenantOwnsBySlug.get(slug))) return "internal";
      if ((aid && otherTenantByApollo.get(aid)) || (slug && otherTenantBySlug.get(slug))) return "gio";
      return row.source;
    }

    // Replace cache for this project
    await supabase.from("sourcing_preview_candidates").delete().eq("project_id", data.project_id);

    const rowsToInsert = combined.map((c) => {
      const { keyword_score, ...preview } = c as any;
      return {
        project_id: data.project_id,
        user_id: userId,
        source: c.source,
        external_id: c.external_id,
        linkedin_slug: c.linkedin_slug,
        preview: preview as any,
        keyword_score: keyword_score ?? 0,
        display_source: displaySource(c),
      };
    });

    let inserted: any[] = [];
    if (rowsToInsert.length > 0) {
      const { data: ins, error: insErr } = await supabase
        .from("sourcing_preview_candidates")
        .insert(rowsToInsert)
        .select("*");
      if (insErr) throw new Error(insErr.message);
      inserted = ins ?? [];
    }

    await supabase
      .from("sourcing_projects")
      .update({ last_searched_at: new Date().toISOString() })
      .eq("id", data.project_id);

    return {
      from_cache: false,
      previews: inserted.sort((a, b) => b.keyword_score - a.keyword_score),
      stats: {
        apollo_count: apollo.length,
        pdl_count: pdl.length,
        deduped: combined.length,
        apollo_error: apolloRes.status === "rejected" ? String(apolloRes.reason) : null,
        pdl_error: pdlRes.status === "rejected" ? String(pdlRes.reason) : null,
      },
    };
  });

const CollectInput = z.object({
  project_id: z.string().uuid(),
  preview_ids: z.array(z.string().uuid()).min(1).max(50),
  conversation_id: z.string().uuid().nullable().optional(),
});

export const collectCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CollectInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: previews, error } = await supabase
      .from("sourcing_preview_candidates")
      .select("*")
      .eq("project_id", data.project_id)
      .in("id", data.preview_ids);
    if (error) throw new Error(error.message);
    if (!previews || previews.length === 0) return { collected: 0, skipped: 0, results: [] };

    const apolloPreviews = previews.filter((p) => p.source === "apollo");

    // Skip already-collected in this tenant (apollo_id match)
    const apolloIds = apolloPreviews.map((p) => p.external_id);
    const { data: alreadyRows } = await supabase
      .from("candidates")
      .select("apollo_id")
      .eq("user_id", userId)
      .in("apollo_id", apolloIds.length ? apolloIds : ["__none__"]);
    const alreadyCollected = new Set((alreadyRows ?? []).map((r) => r.apollo_id));

    const toEnrich = apolloPreviews
      .filter((p) => !alreadyCollected.has(p.external_id))
      .map((p) => p.external_id);

    const enriched = await enrichApolloProfiles(toEnrich);

    if (!data.conversation_id) {
      throw new Error("conversation_id is required to attach collected candidates");
    }

    const insertedCandidates: any[] = [];
    for (const e of enriched) {
      const slug = linkedinSlug(e.linkedin_url);
      const { data: ins, error: insErr } = await supabase
        .from("candidates")
        .insert({
          user_id: userId,
          conversation_id: data.conversation_id,
          name: e.full_name || `${e.first_name} ${e.last_name}`.trim() || "Unknown",
          role: e.title,
          company: e.organization_name ?? "",
          stage: "Sourced",
          source: "Apollo",
          match: 80,
          tags: [],
          starred: false,
          avatar: "",
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
        })
        .select("*")
        .single();
      if (insErr) {
        console.error("candidate insert failed:", insErr.message);
        continue;
      }
      insertedCandidates.push(ins);
      // Mark preview as collected
      await supabase
        .from("sourcing_preview_candidates")
        .update({ collected_at: new Date().toISOString() })
        .eq("project_id", data.project_id)
        .eq("source", "apollo")
        .eq("external_id", e.id);
    }

    if (insertedCandidates.length > 0) {
      const { error: rpcErr } = await supabaseAdmin.rpc("increment_sourcing_usage", {
        _user_id: userId,
        _count: insertedCandidates.length,
      });
      if (rpcErr) console.error("increment_sourcing_usage failed:", rpcErr.message);
    }

    return {
      collected: insertedCandidates.length,
      skipped: previews.length - insertedCandidates.length,
      period: currentPeriod(),
      results: insertedCandidates,
    };
  });