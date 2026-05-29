// Server-only: generate role-specific screening questions from a job description
// using the Lovable AI Gateway (OpenAI tool-calling shape).

import { getPrompt } from "@/lib/prompts/registry.server";

export type ScreeningQuestion = {
  id: string;
  type: "select" | "multi" | "textarea";
  question: string;
  options?: string[];
  required: boolean;
};

type JobBrief = {
  title?: string | null;
  company?: string | null;
  summary?: string | null;
  description?: string | null;
  must_have?: string[] | null;
  nice_to_have?: string[] | null;
  requirements?: string[] | null;
  location?: string | null;
};

const TOOL = {
  type: "function",
  function: {
    name: "provide_screening_questions",
    description: "Return 4–6 screening questions for a public job application page.",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          minItems: 4,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Short lowercase slug, e.g. 'exp' or 'lang_en'." },
              type: { type: "string", enum: ["select", "multi", "textarea"] },
              question: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              required: { type: "boolean" },
            },
            required: ["id", "type", "question", "required"],
          },
        },
      },
      required: ["questions"],
    },
  },
} as const;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "q";
}

export function defaultScreening(): ScreeningQuestion[] {
  return [
    {
      id: "exp",
      type: "select",
      question: "How many years of relevant experience do you have?",
      options: ["Less than 1", "1–2 years", "3–5 years", "5+ years"],
      required: true,
    },
    {
      id: "location",
      type: "select",
      question: "Are you able to work from the role's location (on-site or hybrid as required)?",
      options: ["Yes, on-site", "Yes, hybrid", "Remote only", "No"],
      required: true,
    },
    {
      id: "english",
      type: "select",
      question: "English proficiency",
      options: ["Native", "Fluent (C1+)", "Business (B2)", "Basic"],
      required: true,
    },
    {
      id: "pitch",
      type: "textarea",
      question: "In 2–3 lines, tell us why you're a great fit for this role.",
      required: true,
    },
  ];
}

export async function generateScreeningQuestions(job: JobBrief): Promise<ScreeningQuestion[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.warn("[screening] LOVABLE_API_KEY missing — using defaults");
    return defaultScreening();
  }

  const system = await getPrompt("jobs.screening").catch(() => "Generate 4–6 screening questions.");
  const must = (job.must_have ?? job.requirements ?? []).filter(Boolean);
  const nice = (job.nice_to_have ?? []).filter(Boolean);

  const userMsg = [
    `Title: ${job.title ?? ""}`,
    job.company ? `Company: ${job.company}` : "",
    job.location ? `Location: ${job.location}` : "",
    job.summary ? `Summary: ${job.summary}` : job.description ? `Description: ${job.description.slice(0, 1500)}` : "",
    must.length ? `Must have:\n- ${must.slice(0, 10).join("\n- ")}` : "",
    nice.length ? `Nice to have:\n- ${nice.slice(0, 10).join("\n- ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg || "Generate generic role screening questions." },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "provide_screening_questions" } },
      }),
    });
    if (!res.ok) {
      console.error("[screening] gateway error", res.status, await res.text().catch(() => ""));
      return defaultScreening();
    }
    const json: any = await res.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    const args = call?.function?.arguments ? JSON.parse(call.function.arguments) : {};
    const raw = Array.isArray(args.questions) ? args.questions : [];
    const seen = new Set<string>();
    const out: ScreeningQuestion[] = [];
    for (const q of raw) {
      if (!q?.question || !q?.type) continue;
      let id = slugify(String(q.id || q.question));
      let n = 2;
      while (seen.has(id)) id = `${slugify(String(q.id || q.question))}_${n++}`;
      seen.add(id);
      const type = ["select", "multi", "textarea"].includes(q.type) ? q.type : "textarea";
      const options = type === "textarea" ? undefined : Array.isArray(q.options) ? q.options.slice(0, 8).map(String) : [];
      out.push({
        id,
        type,
        question: String(q.question).slice(0, 240),
        options,
        required: Boolean(q.required),
      });
      if (out.length >= 6) break;
    }
    return out.length >= 3 ? out : defaultScreening();
  } catch (e: any) {
    console.error("[screening] generation failed:", e?.message);
    return defaultScreening();
  }
}