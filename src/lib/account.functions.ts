import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const deleteOwnAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { userId } = context;
    // Best-effort cleanup of user-owned rows in tables that aren't tied to
    // auth.users via ON DELETE CASCADE. RLS doesn't apply to supabaseAdmin
    // so we filter explicitly by userId.
    const tables = [
      "agent_tasks",
      "applications",
      "candidates",
      "conversations",
      "credit_ledger",
      "job_posts",
      "jobs",
      "messages",
      "outreach_drafts",
      "outreach_messages",
      "outreach_threads",
      "sourcing_credits_usage",
      "sourcing_preview_candidates",
      "sourcing_projects",
      "user_calendar_connections",
      "user_gmail_connections",
      "user_roles",
      "profiles",
    ];
    for (const t of tables) {
      try {
        const col = t === "profiles" ? "id" : "user_id";
        await (supabaseAdmin as any).from(t).delete().eq(col, userId);
      } catch (e) {
        console.error(`[deleteOwnAccount] cleanup of ${t} failed`, e);
      }
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });