import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NotificationPrefs = {
  notifyOnNewApplicant: boolean;
  notifyDailyDigest: boolean;
};

export const getNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationPrefs> => {
    const { supabase, userId } = context;
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("notify_on_new_applicant, notify_daily_digest")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      // Defensive fallback when columns/schema cache aren't in sync yet.
      if (/column .* does not exist|schema cache/i.test(error.message ?? "")) {
        return { notifyOnNewApplicant: true, notifyDailyDigest: false };
      }
      throw new Error(error.message);
    }
    return {
      notifyOnNewApplicant: data?.notify_on_new_applicant ?? true,
      notifyDailyDigest: data?.notify_daily_digest ?? false,
    };
  });

export const updateNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        notifyOnNewApplicant: z.boolean(),
        notifyDailyDigest: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<NotificationPrefs> => {
    const { supabase, userId } = context;
    const { error } = await (supabase as any)
      .from("profiles")
      .update({
        notify_on_new_applicant: data.notifyOnNewApplicant,
        notify_daily_digest: data.notifyDailyDigest,
      })
      .eq("id", userId);
    if (error) {
      if (/column .* does not exist|schema cache/i.test(error.message ?? "")) {
        // Treat as a no-op so the UI stays usable until the migration applies.
        return {
          notifyOnNewApplicant: data.notifyOnNewApplicant,
          notifyDailyDigest: data.notifyDailyDigest,
        };
      }
      throw new Error(error.message);
    }
    return {
      notifyOnNewApplicant: data.notifyOnNewApplicant,
      notifyDailyDigest: data.notifyDailyDigest,
    };
  });