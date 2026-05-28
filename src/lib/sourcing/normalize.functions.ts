import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { openaiChat } from "./openai.server";

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

const SYSTEM = `You normalize raw recruiter prompts into structured job specs.
Return strict JSON with shape:
{
  "title": "<single canonical job title>",
  "skills": ["<skill1>", "<skill2>"],
  "location": "<City, Country or empty string>",
  "ai_variations": {
    "titles": ["3 to 5 alternative titles or synonyms"],
    "skills": ["3 to 5 skill abbreviations or synonyms"]
  }
}
Do not include any prose. Output JSON only.`;

export const normalizeJobSpecs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data }): Promise<NormalizedSpecs> => {
    const completion = await openaiChat({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
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