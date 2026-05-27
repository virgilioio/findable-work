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