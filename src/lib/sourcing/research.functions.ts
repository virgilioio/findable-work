import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { openaiChat } from "./openai.server";
import { getPrompt } from "@/lib/prompts/registry.server";

export type Research = {
  researched_titles: string[];
  researched_companies: string[];
  researched_keywords: string[];
  research_reasoning: string;
};

const Input = z.object({
  title: z.string(),
  location: z.string().optional().default(""),
  skills: z.array(z.string()).optional().default([]),
  user_company_names: z.array(z.string()).optional().default([]),
});

const TOOL = {
  type: "function",
  function: {
    name: "provide_research_results",
    description: "Provide enriched sourcing criteria for a recruiter.",
    parameters: {
      type: "object",
      properties: {
        researched_titles: {
          type: "array",
          items: { type: "string" },
          description: "Up to 3 alternative job titles.",
        },
        researched_companies: {
          type: "array",
          items: { type: "string" },
          description: "Up to 3 target companies. Empty if user already provided companies.",
        },
        researched_keywords: {
          type: "array",
          items: { type: "string" },
          description: "Up to 5 keyword boosters.",
        },
        research_reasoning: { type: "string" },
      },
      required: [
        "researched_titles",
        "researched_companies",
        "researched_keywords",
        "research_reasoning",
      ],
    },
  },
} as const;

export const researchSourcingCriteria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data }): Promise<Research> => {
    const userPicked = data.user_company_names.length > 0;
    const userMsg =
      `Title: ${data.title}\nLocation: ${data.location}\nSkills: ${data.skills.join(", ")}\n` +
      `Recruiter target companies: ${userPicked ? data.user_company_names.join(", ") : "(none — please suggest)"}\n` +
      `Return at most 3 titles, ${userPicked ? "0 companies (recruiter already picked)" : "3 companies"}, 5 keywords.`;

    const completion = await openaiChat({
      messages: [
        { role: "system", content: await getPrompt("sourcing.research") },
        { role: "user", content: userMsg },
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "provide_research_results" } },
    });
    const call = completion.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = {};
    try {
      parsed = JSON.parse(call?.function?.arguments ?? "{}");
    } catch {
      parsed = {};
    }
    return {
      researched_titles: (parsed.researched_titles ?? []).slice(0, 3).map(String),
      researched_companies: userPicked
        ? []
        : (parsed.researched_companies ?? []).slice(0, 3).map(String),
      researched_keywords: (parsed.researched_keywords ?? []).slice(0, 5).map(String),
      research_reasoning: String(parsed.research_reasoning ?? ""),
    };
  });