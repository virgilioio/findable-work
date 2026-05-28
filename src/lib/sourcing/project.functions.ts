import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { budgetSearchCriteria, type SearchCriteria } from "./budget";
import { extractJsonBlock, openaiChat } from "./openai.server";

const CreateInput = z.object({
  title: z.string().min(1).max(200),
  raw_prompt: z.string().min(2).max(4000),
  conversation_id: z.string().uuid().nullable().optional(),
  normalized: z.record(z.unknown()).optional(),
  research: z.record(z.unknown()).optional(),
  criteria: z.record(z.unknown()).optional(),
});

export const createSourcingProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const budgeted = budgetSearchCriteria((data.criteria ?? {}) as SearchCriteria);
    const { data: row, error } = await supabase
      .from("sourcing_projects")
      .insert({
        user_id: userId,
        conversation_id: data.conversation_id ?? null,
        title: data.title,
        raw_prompt: data.raw_prompt,
        normalized: (data.normalized ?? {}) as any,
        research: (data.research ?? {}) as any,
        search_criteria: budgeted as any,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const GetInput = z.object({ id: z.string().uuid() });

export const getSourcingProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GetInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: project, error } = await supabase
      .from("sourcing_projects")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: previews, error: pErr } = await supabase
      .from("sourcing_preview_candidates")
      .select("*")
      .eq("project_id", data.id)
      .order("keyword_score", { ascending: false });
    if (pErr) throw new Error(pErr.message);
    return { project, previews: previews ?? [] };
  });

const RefineInput = z.object({
  project_id: z.string().uuid(),
  user_message: z.string().min(1).max(2000),
  conversation_history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .optional()
    .default([]),
});

const REFINE_SYSTEM = `You are Gio, a sourcing assistant. Reply naturally to the recruiter, then append a single fenced JSON block with any criteria updates. JSON keys: skills, locations, title_keywords, experience_years, education_level. Only include keys that change. Example:
\`\`\`json
{ "title_keywords": ["Senior React Developer"], "locations": ["São Paulo, Brazil"] }
\`\`\``;

export const refineSourcingProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RefineInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: project, error } = await supabase
      .from("sourcing_projects")
      .select("*")
      .eq("id", data.project_id)
      .single();
    if (error) throw new Error(error.message);

    const completion = await openaiChat({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: REFINE_SYSTEM },
        {
          role: "system",
          content: `Current criteria: ${JSON.stringify(project.search_criteria)}`,
        },
        ...data.conversation_history,
        { role: "user", content: data.user_message },
      ],
    });
    const reply = completion.choices?.[0]?.message?.content ?? "";
    const update = extractJsonBlock(reply) ?? {};

    const allowed = ["skills", "locations", "title_keywords", "experience_years", "education_level"];
    const merged = { ...(project.search_criteria as Record<string, unknown>) };
    for (const k of allowed) {
      if (k in update) (merged as any)[k] = (update as any)[k];
    }
    const budgeted = budgetSearchCriteria(merged as SearchCriteria);
    const { error: uErr } = await supabase
      .from("sourcing_projects")
      .update({ search_criteria: budgeted as any })
      .eq("id", data.project_id);
    if (uErr) throw new Error(uErr.message);

    return { reply, criteria: budgeted };
  });