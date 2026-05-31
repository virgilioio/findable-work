// Server-only: generate role-specific screening questions from a job
// description by calling OpenAI directly (tool-calling shape).
//
// The function NEVER throws — on any failure it logs loudly and returns
// `defaultScreening()` so the public job page keeps rendering. The
// `[screening] FALLBACK` log line is the signal to look for in worker
// logs when questions look generic.

import { getPrompt } from "@/lib/prompts/registry.server";
import {
  OPENAI_CHAT_COMPLETIONS_URL,
  getOpenAIKey,
  getOpenAIModel,
} from "@/lib/ai/openai-model.server";

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

function logFallback(reason: string, extra: Record<string, unknown> = {}): void {
  // Single grep target across all fallback paths.
  console.error("[screening] FALLBACK to defaults", { reason, ...extra });
}

export async function generateScreeningQuestions(job: JobBrief): Promise<ScreeningQuestion[]> {
  let apiKey: string;
  let model: string;
  try {
    apiKey = getOpenAIKey();
    model = getOpenAIModel();
  } catch (e: any) {
    logFallback("missing_env", { message: e?.message });
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
    const res = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg || "Generate generic role screening questions." },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "provide_screening_questions" } },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const reason =
        res.status === 429
          ? "openai_429"
          : res.status >= 500
            ? "openai_5xx"
            : "openai_other";
      logFallback(reason, { status: res.status, body: body.slice(0, 500) });
      return defaultScreening();
    }
    const json: any = await res.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    let args: any = {};
    try {
      args = call?.function?.arguments ? JSON.parse(call.function.arguments) : {};
    } catch (e: any) {
      logFallback("parse_failed", { message: e?.message });
      return defaultScreening();
    }
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
    if (out.length < 3) {
      logFallback("too_few_questions", { generated: out.length });
      return defaultScreening();
    }
    return out;
  } catch (e: any) {
    logFallback("exception", { message: e?.message });
    return defaultScreening();
  }
}