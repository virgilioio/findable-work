import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PROFILE_COLS = [
  "display_name",
  "plan",
  "credits_remaining",
  "sourcing_projects_used",
  "company_name",
  "company_website",
  "company_one_liner",
  "company_description",
  "hiring_context",
  "user_role",
  "sourcing_regions",
] as const;

function pickProfileRow(data: Record<string, unknown> | null) {
  return {
    displayName: (data?.display_name as string | null) ?? "",
    plan: (data?.plan as string) ?? "free",
    creditsRemaining: (data?.credits_remaining as number) ?? 0,
    sourcingProjectsUsed: (data?.sourcing_projects_used as number) ?? 0,
    companyName: (data?.company_name as string | null) ?? "",
    companyWebsite: (data?.company_website as string | null) ?? "",
    companyOneLiner: (data?.company_one_liner as string | null) ?? "",
    companyDescription: (data?.company_description as string | null) ?? "",
    hiringContext: (data?.hiring_context as string | null) ?? "",
    userRole: (data?.user_role as string | null) ?? "",
    sourcingRegions: Array.isArray(data?.sourcing_regions)
      ? (data!.sourcing_regions as string[])
      : [],
  };
}

export const getProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Try the full select first; on column-missing errors, retry with a
    // minimal column set so the page doesn't crash if a migration hasn't
    // been applied yet on this environment.
    let res = await (supabase as any)
      .from("profiles")
      .select(PROFILE_COLS.join(", "))
      .eq("id", userId)
      .maybeSingle();
    if (res.error && /column .* does not exist|schema cache/i.test(res.error.message ?? "")) {
      res = await (supabase as any)
        .from("profiles")
        .select("plan, credits_remaining, sourcing_projects_used")
        .eq("id", userId)
        .maybeSingle();
    }
    if (res.error) throw new Error(res.error.message);
    return pickProfileRow(res.data ?? null);
  });

const UpdateNameInput = z.object({
  displayName: z.string().max(120),
});

export const updateDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateNameInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ display_name: data.displayName })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const PersonalizationInput = z.object({
  companyName: z.string().max(200).optional(),
  companyWebsite: z.string().max(500).optional(),
  companyOneLiner: z.string().max(280).optional(),
  companyDescription: z.string().max(4000).optional(),
  hiringContext: z.string().max(2000).optional(),
  userRole: z.string().max(200).optional(),
  sourcingRegions: z.array(z.string().max(40)).max(20).optional(),
});

export const updatePersonalization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PersonalizationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = {};
    if (data.companyName !== undefined) patch.company_name = data.companyName;
    if (data.companyWebsite !== undefined) patch.company_website = data.companyWebsite;
    if (data.companyOneLiner !== undefined) patch.company_one_liner = data.companyOneLiner;
    if (data.companyDescription !== undefined) patch.company_description = data.companyDescription;
    if (data.hiringContext !== undefined) patch.hiring_context = data.hiringContext;
    if (data.userRole !== undefined) patch.user_role = data.userRole;
    if (data.sourcingRegions !== undefined) patch.sourcing_regions = data.sourcingRegions;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await (supabase as any)
      .from("profiles")
      .update(patch)
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
