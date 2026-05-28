import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const DEFAULT_LINKEDIN = `Hi {{first_name}}, I'm helping a team hire for {{role}} and your work at {{company}} caught my eye — open to a quick chat this week?`;
export const DEFAULT_EMAIL_SUBJECT = `{{role}} opportunity — {{first_name}}`;
export const DEFAULT_EMAIL_BODY = `Hi {{first_name}},

I came across your profile and your work at {{company}} stood out.

We're hiring a {{role}} and I'd love to share more in a 15-min call this week if the timing's right.

Best,
{{recruiter_name}}`;
export const DEFAULT_FOLLOWUPS = [
  { day: 0, channel: "LinkedIn", subject: "Initial outreach", enabled: true },
  { day: 3, channel: "Email", subject: "Following up", enabled: true },
  { day: 7, channel: "Email", subject: "Last note", enabled: false },
];

export const getOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("outreach_drafts")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

const patchSchema = z.object({
  channel: z.enum(["linkedin", "email"]).optional(),
  linkedin_template: z.string().max(2000).optional(),
  email_subject: z.string().max(500).optional(),
  email_body: z.string().max(10000).optional(),
  tone: z.enum(["Warm", "Direct", "Casual"]).optional(),
  personalize_ai: z.boolean().optional(),
  local_time_send: z.boolean().optional(),
  pause_if_reply: z.boolean().optional(),
  skip_if_recent: z.boolean().optional(),
  followups: z.array(z.object({
    day: z.number(),
    channel: z.string(),
    subject: z.string(),
    enabled: z.boolean(),
  })).optional(),
});

export const upsertOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      conversationId: z.string().uuid(),
      patch: patchSchema,
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("outreach_drafts")
      .select("id")
      .eq("conversation_id", data.conversationId)
      .maybeSingle();

    if (existing) {
      const { data: row, error } = await supabase
        .from("outreach_drafts")
        .update(data.patch)
        .eq("conversation_id", data.conversationId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await supabase
      .from("outreach_drafts")
      .insert({
        user_id: userId,
        conversation_id: data.conversationId,
        linkedin_template: DEFAULT_LINKEDIN,
        email_subject: DEFAULT_EMAIL_SUBJECT,
        email_body: DEFAULT_EMAIL_BODY,
        followups: DEFAULT_FOLLOWUPS,
        ...data.patch,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const contactCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      conversationId: z.string().uuid(),
      candidateIds: z.array(z.string().uuid()).min(1).max(200),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const now = new Date().toISOString();
    const updates = await Promise.all(
      data.candidateIds.map((id, i) =>
        supabase
          .from("candidates")
          .update({
            stage: "Contacted",
            stage_changed_at: now,
            contacted_at: now,
            contact_channel: i % 3 === 0 ? "Email" : "LinkedIn",
          })
          .eq("id", id)
          .eq("conversation_id", data.conversationId),
      ),
    );
    const failed = updates.find((u) => u.error);
    if (failed?.error) throw new Error(failed.error.message);
    return { updated: data.candidateIds.length };
  });