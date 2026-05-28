import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildJobPostArtifact } from "@/lib/job-posts/builder.server";

const variantSchema = z.object({
  key: z.string().max(64),
  label: z.string().max(64),
  sublabel: z.string().max(160),
  title: z.string().max(300),
  body: z.string().max(8000),
});

const channelSchema = z.object({
  key: z.string().max(64),
  name: z.string().max(120),
  kind: z.enum(["job_board", "social"]),
  audience: z.number().int().min(0),
  audience_label: z.string().max(160),
  price: z.number().min(0),
  price_label: z.string().max(64),
  duration_days: z.number().int().min(0).max(365),
  recommended: z.boolean(),
  selected: z.boolean(),
});

const scheduleSchema = z.object({
  go_live: z.string().nullable(),
  go_live_label: z.string().max(120),
  auto_close_days: z.number().int().min(0).max(365),
  auto_close_label: z.string().max(120),
  ab_test: z.boolean(),
  ab_test_label: z.string().max(120),
});

const updateSchema = z.object({
  conversationId: z.string().uuid(),
  variants: z.array(variantSchema).max(8).optional(),
  channels: z.array(channelSchema).max(20).optional(),
  schedule: scheduleSchema.optional(),
  status: z.enum(["draft", "published"]).optional(),
});

function reach(channels: Array<{ audience: number; selected: boolean }>): number {
  return channels.filter((c) => c.selected).reduce((s, c) => s + (c.audience || 0), 0);
}

export const updateJobPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { conversationId, ...patch } = data;
    const update: {
      variants?: typeof patch.variants;
      channels?: typeof patch.channels;
      schedule?: typeof patch.schedule;
      status?: typeof patch.status;
      est_reach?: number;
    } = { ...patch };
    if (patch.channels) update.est_reach = reach(patch.channels);
    const { data: row, error } = await supabase
      .from("job_posts")
      .update(update as never)
      .eq("conversation_id", conversationId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const regenerateJobPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("title,description,location,requirements,salary_min,salary_max,currency")
      .eq("conversation_id", data.conversationId)
      .maybeSingle();
    if (jobErr) throw new Error(jobErr.message);
    if (!job) throw new Error("No job to base post on");

    const artifact = buildJobPostArtifact(job);
    // Keep existing channel selections if a row already exists.
    const { data: existing } = await supabase
      .from("job_posts")
      .select("channels")
      .eq("conversation_id", data.conversationId)
      .maybeSingle();
    if (existing?.channels && Array.isArray(existing.channels)) {
      const prevSel = new Map(
        (existing.channels as Array<{ key: string; selected: boolean }>).map((c) => [c.key, c.selected]),
      );
      artifact.channels = artifact.channels.map((c) =>
        prevSel.has(c.key) ? { ...c, selected: Boolean(prevSel.get(c.key)) } : c,
      );
      artifact.est_reach = artifact.channels
        .filter((c) => c.selected)
        .reduce((s, c) => s + c.audience, 0);
    }

    const { data: row, error } = await supabase
      .from("job_posts")
      .update({
        variants: artifact.variants,
        channels: artifact.channels,
        schedule: artifact.schedule,
        est_reach: artifact.est_reach,
      })
      .eq("conversation_id", data.conversationId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });