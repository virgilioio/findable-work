import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// User-data tables (excluding profile, billing, role, and connection tables).
// Order matters where FKs exist: children before parents.
const TABLES_IN_ORDER = [
  "audit_events",
  "agent_tasks",
  "outreach_messages",
  "outreach_threads",
  "outreach_drafts",
  "interview_schedules",
  "interview_loops",
  "applications",
  "candidates",
  "job_posts",
  "jobs",
  "sourcing_preview_candidates",
  "sourcing_projects",
  "messages",
  "conversations",
] as const;

/**
 * Wipes ALL of the calling user's working data (conversations, jobs,
 * candidates, outreach, interviews, audit events, agent tasks, sourcing).
 *
 * Does NOT delete: profile, role, credit ledger, billing connections,
 * Gmail/Calendar OAuth connections. Use deleteOwnAccount for that.
 *
 * Requires the caller to send `confirm: "WIPE"` to reduce accidents.
 */
export const wipeOwnTestData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ confirm: z.literal("WIPE") }).parse(input),
  )
  .handler(async ({ context }) => {
    const { userId } = context;
    const results: Array<{ table: string; deleted: number | null; error?: string }> = [];
    const admin = supabaseAdmin as any;
    for (const table of TABLES_IN_ORDER) {
      try {
        const { error, count } = await admin
          .from(table)
          .delete({ count: "exact" })
          .eq("user_id", userId);
        if (error) {
          results.push({ table, deleted: null, error: error.message });
        } else {
          results.push({ table, deleted: count ?? null });
        }
      } catch (err) {
        results.push({
          table,
          deleted: null,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }
    const totalDeleted = results.reduce(
      (sum, r) => sum + (r.deleted ?? 0),
      0,
    );
    return { ok: true, totalDeleted, results };
  });