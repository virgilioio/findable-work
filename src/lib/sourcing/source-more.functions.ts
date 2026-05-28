import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enrichApolloProfiles } from "./apollo.server";
import { linkedinSlug } from "./budget";

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

    const [{ data: aRows }, { data: pRows }] = await Promise.all([
      supabaseAdmin.from("candidates").select("apollo_id").eq("user_id", userId)
        .in("apollo_id", apolloIds.length ? apolloIds : ["__none__"]),
      supabaseAdmin.from("candidates").select("pdl_id").eq("user_id", userId)
        .in("pdl_id", pdlIds.length ? pdlIds : ["__none__"]),
    ]);
    const apolloAlready = new Set((aRows ?? []).map((r: any) => r.apollo_id));
    const pdlAlready = new Set((pRows ?? []).map((r: any) => r.pdl_id));

    // Interleave by overall preview ordering, take next N not yet collected
    const remaining = (previews ?? []).filter((p: any) => {
      if (p.source === "apollo") return !apolloAlready.has(p.external_id);
      if (p.source === "pdl") return !pdlAlready.has(p.external_id);
      return false;
    });

    const next = remaining.slice(0, limit);
    if (next.length === 0) {
      return { added: 0, skipped: 0, remaining: 0, exhausted: true };
    }

    const apolloNext = next.filter((p: any) => p.source === "apollo");
    const pdlNext = next.filter((p: any) => p.source === "pdl");

    let added = 0;
    let skipped = 0;

    // Apollo: enrich + insert
    if (apolloNext.length > 0) {
      const apolloPhoneFlag = new Map<string, boolean>(
        apolloNext.map((p: any) => [p.external_id, Boolean(p.preview?.has_direct_phone)]),
      );
      try {
        const enriched = await enrichApolloProfiles(apolloNext.map((p: any) => p.external_id));
        for (const e of enriched) {
          const slug = linkedinSlug(e.linkedin_url);
          const { error: insErr } = await supabaseAdmin.from("candidates").insert({
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
          });
          if (insErr) {
            console.error("source-more apollo insert failed:", insErr.message);
            skipped++;
          } else added++;
        }
      } catch (e: any) {
        console.error("source-more apollo enrichment failed:", e?.message);
      }
    }

    // PDL: insert from preview payload
    for (const p of pdlNext) {
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
      const { error: insErr } = await supabaseAdmin.from("candidates").insert({
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
      });
      if (insErr) {
        console.error("source-more pdl insert failed:", insErr.message);
        skipped++;
      } else added++;
    }

    if (added > 0) {
      await supabaseAdmin.rpc("increment_sourcing_usage", { _user_id: userId, _count: added });
    }

    return {
      added,
      skipped,
      remaining: Math.max(0, remaining.length - next.length),
      exhausted: remaining.length - next.length === 0,
    };
  });