import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { openaiChat } from "./openai.server";
import { getPrompt } from "@/lib/prompts/registry.server";

export type NormalizedSpecs = {
  title: string;
  skills: string[];
  location: string;
  ai_variations: {
    titles: string[];
    skills: string[];
  };
};

const Input = z.object({ prompt: z.string().min(2).max(4000) });

export const normalizeJobSpecs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data }): Promise<NormalizedSpecs> => {
    const system = await getPrompt("sourcing.normalize");
    const completion = await openaiChat({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: data.prompt },
      ],
    });
    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
    return {
      title: String(parsed.title ?? "").trim(),
      skills: Array.isArray(parsed.skills) ? parsed.skills.map(String) : [],
      location: String(parsed.location ?? "").trim(),
      ai_variations: {
        titles: Array.isArray(parsed.ai_variations?.titles)
          ? parsed.ai_variations.titles.map(String).slice(0, 5)
          : [],
        skills: Array.isArray(parsed.ai_variations?.skills)
          ? parsed.ai_variations.skills.map(String).slice(0, 5)
          : [],
      },
    };
  });