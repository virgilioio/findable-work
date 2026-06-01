import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("display_name, plan, credits_remaining, sourcing_projects_used")
      .eq("id", userId)
      .single();
    if (error) throw new Error(error.message);
    return {
      displayName: (data?.display_name as string | null) ?? "",
      plan: (data?.plan as string) ?? "free",
      creditsRemaining: (data?.credits_remaining as number) ?? 0,
      sourcingProjectsUsed: (data?.sourcing_projects_used as number) ?? 0,
    };
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
