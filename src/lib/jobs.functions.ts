import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const jobUpdateSchema = z.object({
  conversationId: z.string().uuid(),
  title: z.string().max(200).optional(),
  description: z.string().max(20000).optional(),
  requirements: z.array(z.string().max(500)).max(50).optional(),
  location: z.string().max(200).optional(),
  employment_type: z.enum(["full_time", "part_time", "contract", "internship", "temporary"]).optional(),
  salary_min: z.number().int().nullable().optional(),
  salary_max: z.number().int().nullable().optional(),
  currency: z.string().max(8).optional(),
  status: z.enum(["draft", "open", "closed", "archived"]).optional(),
});

export const updateJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => jobUpdateSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { conversationId, ...patch } = data;
    const { data: row, error } = await supabase
      .from("jobs")
      .update(patch)
      .eq("conversation_id", conversationId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const duplicateJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: job, error: e1 } = await supabase
      .from("jobs")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .single();
    if (e1) throw new Error(e1.message);

    const { data: conv, error: e2 } = await supabase
      .from("conversations")
      .insert({ user_id: userId, title: `${job.title || "Untitled"} (copy)` })
      .select("id")
      .single();
    if (e2) throw new Error(e2.message);

    const { error: e3 } = await supabase.from("jobs").insert({
      user_id: userId,
      conversation_id: conv.id,
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      location: job.location,
      employment_type: job.employment_type,
      salary_min: job.salary_min,
      salary_max: job.salary_max,
      currency: job.currency,
      status: "draft",
    });
    if (e3) throw new Error(e3.message);
    return { conversationId: conv.id };
  });