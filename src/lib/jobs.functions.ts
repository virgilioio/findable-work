import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateScreeningQuestions, type ScreeningQuestion } from "@/lib/jobs/screening.server";

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
  company: z.string().max(200).optional(),
  summary: z.string().max(20000).optional(),
  responsibilities: z.array(z.string().max(500)).max(50).optional(),
  must_have: z.array(z.string().max(500)).max(50).optional(),
  nice_to_have: z.array(z.string().max(500)).max(50).optional(),
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

// ---------------------------------------------------------------------
// Publish / unpublish + screening questions

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function randSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

const screeningSchema = z.array(
  z.object({
    id: z.string().min(1).max(64),
    type: z.enum(["select", "multi", "textarea"]),
    question: z.string().min(1).max(500),
    options: z.array(z.string().max(120)).max(12).optional(),
    required: z.boolean(),
  }),
).max(12);

export const publishJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: job, error: loadErr } = await supabase
      .from("jobs")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .single();
    if (loadErr) throw new Error(loadErr.message);
    if (!job) throw new Error("Job not found");

    // Generate slug if missing — guarantee uniqueness with a short suffix.
    let slug: string = (job as any).slug ?? "";
    if (!slug) {
      const base = slugify(job.title || job.location || "job") || "job";
      for (let i = 0; i < 5; i++) {
        const candidate = `${base}-${randSuffix()}`;
        const { data: clash } = await supabase
          .from("jobs")
          .select("id")
          .eq("slug", candidate)
          .maybeSingle();
        if (!clash) {
          slug = candidate;
          break;
        }
      }
      if (!slug) slug = `${base}-${Date.now().toString(36)}`;
    }

    // Generate screening if empty.
    const existingScreening = Array.isArray((job as any).screening) ? (job as any).screening : [];
    let screening: ScreeningQuestion[] = existingScreening;
    if (screening.length === 0) {
      screening = await generateScreeningQuestions({
        title: job.title,
        company: (job as any).company,
        summary: (job as any).summary || job.description,
        description: job.description,
        must_have: (job as any).must_have ?? job.requirements,
        nice_to_have: (job as any).nice_to_have,
        location: job.location,
      });
    }

    const { data: updated, error: upErr } = await supabase
      .from("jobs")
      .update({
        slug,
        published: true,
        published_at: new Date().toISOString(),
        status: "open",
        screening: screening as any,
      })
      .eq("conversation_id", data.conversationId)
      .select("*")
      .single();
    if (upErr) throw new Error(upErr.message);
    return updated;
  });

export const unpublishJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("jobs")
      .update({ published: false, status: "draft" })
      .eq("conversation_id", data.conversationId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const regenerateScreening = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: job, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .single();
    if (error) throw new Error(error.message);
    const questions = await generateScreeningQuestions({
      title: job.title,
      company: (job as any).company,
      summary: (job as any).summary || job.description,
      description: job.description,
      must_have: (job as any).must_have ?? job.requirements,
      nice_to_have: (job as any).nice_to_have,
      location: job.location,
    });
    const { error: upErr } = await supabase
      .from("jobs")
      .update({ screening: questions as any })
      .eq("conversation_id", data.conversationId);
    if (upErr) throw new Error(upErr.message);
    return { screening: questions };
  });

export const updateScreening = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        screening: screeningSchema,
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("jobs")
      .update({ screening: data.screening as any })
      .eq("conversation_id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });