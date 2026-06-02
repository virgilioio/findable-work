import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AuditAction =
  | "candidate.stage_changed"
  | "candidate.deleted"
  | "outreach.email_sent"
  | "outreach.reply_sent"
  | "job.published"
  | "job.unpublished";

export type AuditEntity = "candidate" | "outreach_thread" | "job";

/**
 * Append an immutable audit event. Best-effort: failures are logged but
 * never propagate, so audit logging cannot break the calling operation.
 */
export async function logAuditEvent(args: {
  userId: string;
  action: AuditAction;
  entityType: AuditEntity;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("audit_events").insert({
      user_id: args.userId,
      action: args.action,
      entity_type: args.entityType,
      entity_id: args.entityId ?? null,
      metadata: args.metadata ?? {},
    });
    if (error) console.error("[audit] insert failed", error.message);
  } catch (err) {
    console.error("[audit] insert threw", err);
  }
}