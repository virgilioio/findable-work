import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  conversationId: z.string().uuid(),
  candidateIds: z.array(z.string().uuid()).min(1).max(50),
});

/**
 * Clone existing candidate rows (owned by the same user, living in other
 * conversations) into the given conversation. Free — no credits consumed,
 * since the data was already paid for at original sourcing time.
 */
export const includeExistingCandidatesInConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: sources, error } = await supabase
      .from("candidates")
      .select("*")
      .eq("user_id", userId)
      .in("id", data.candidateIds);
    if (error) throw new Error(error.message);
    if (!sources || sources.length === 0) return { added: 0, skipped: 0 };

    // Skip any source already in the target conversation, or any whose
    // apollo_id / pdl_id is already present there.
    const apolloIds = sources.map((s: any) => s.apollo_id).filter(Boolean) as string[];
    const pdlIds = sources.map((s: any) => s.pdl_id).filter(Boolean) as string[];
    const { data: existing } = await supabase
      .from("candidates")
      .select("apollo_id, pdl_id")
      .eq("user_id", userId)
      .eq("conversation_id", data.conversationId);
    const apolloAlready = new Set(
      (existing ?? []).map((r: any) => r.apollo_id).filter(Boolean),
    );
    const pdlAlready = new Set(
      (existing ?? []).map((r: any) => r.pdl_id).filter(Boolean),
    );

    let added = 0;
    let skipped = 0;
    for (const src of sources as any[]) {
      if (src.apollo_id && apolloAlready.has(src.apollo_id)) {
        skipped++;
        continue;
      }
      if (src.pdl_id && pdlAlready.has(src.pdl_id)) {
        skipped++;
        continue;
      }
      const { error: insErr } = await supabase.from("candidates").insert({
        user_id: userId,
        conversation_id: data.conversationId,
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
        experience: (src.experience ?? []) as any,
        education: (src.education ?? []) as any,
        activity: [] as any,
        match_breakdown: [] as any,
        apollo_id: src.apollo_id,
        pdl_id: src.pdl_id,
        linkedin_slug: src.linkedin_slug,
        has_direct_phone: src.has_direct_phone ?? false,
      });
      if (insErr) {
        console.error("include-duplicates insert failed:", insErr.message);
        skipped++;
      } else {
        added++;
        // Remember in case the same apollo_id/pdl_id appears twice in input.
        if (src.apollo_id) apolloAlready.add(src.apollo_id);
        if (src.pdl_id) pdlAlready.add(src.pdl_id);
      }
    }

    return { added, skipped };
  });