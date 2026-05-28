import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getPrompt } from "@/lib/prompts/registry.server";

/**
 * Public, unauthenticated chat endpoint used by the homepage guest
 * preview. Restricted tool set: the agent can ONLY draft a Job and ask
 * clarifying questions. Sourcing, job posts, interviews, and any DB
 * write are explicitly out of scope — the agent calls `request_signup`
 * when the user wants any of those, and the client opens the auth
 * dialog.
 */

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string().max(8000),
  tool_call_id: z.string().max(120).optional(),
  tool_calls: z.unknown().optional(),
  name: z.string().max(120).optional(),
});

const draftJobSchema = z
  .object({
    title: z.string().max(200).optional(),
    description: z.string().max(20000).optional(),
    requirements: z.array(z.string().max(500)).max(50).optional(),
    location: z.string().max(200).optional(),
    employment_type: z
      .enum(["full_time", "part_time", "contract", "internship", "temporary"])
      .optional(),
    salary_min: z.number().nullable().optional(),
    salary_max: z.number().nullable().optional(),
    currency: z.string().max(8).optional(),
  })
  .partial();

const bodySchema = z.object({
  guestId: z.string().uuid(),
  messages: z.array(messageSchema).max(40),
  draftJob: draftJobSchema.optional(),
  exchangeCount: z.number().int().min(0).max(100).optional(),
});

// ----- in-memory rate limit (best-effort per isolate) ----------------

type Bucket = { hits: number; resetAt: number };
const BUCKETS = new Map<string, Bucket>();
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 30; // requests / window / key
const HARD_TURN_CAP = 12;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const b = BUCKETS.get(key);
  if (!b || now > b.resetAt) {
    BUCKETS.set(key, { hits: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  b.hits += 1;
  return b.hits > RATE_LIMIT;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

// ----- restricted tool set -------------------------------------------

const createJobDraftTool = {
  type: "function" as const,
  function: {
    name: "create_job_draft",
    description:
      "Draft (or update) the Job for the conversation. Returns a draft the user sees inline. Does NOT save to any account. Call once you have at least a title + short description.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        description: { type: "string", description: "Markdown job description." },
        requirements: { type: "array", items: { type: "string" } },
        location: { type: "string" },
        employment_type: {
          type: "string",
          enum: ["full_time", "part_time", "contract", "internship", "temporary"],
        },
        salary_min: { type: ["number", "null"] },
        salary_max: { type: ["number", "null"] },
        currency: { type: "string" },
      },
      required: ["title", "description"],
    },
  },
};

const askClarifyingQuestionsTool = {
  type: "function" as const,
  function: {
    name: "ask_clarifying_questions",
    description:
      "Surface up to 4 structured clarifying questions to the user as pill-shaped options. Use to sharpen the brief.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        intro: { type: "string" },
        questions: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              type: { type: "string", enum: ["single", "multi", "text"] },
              options: { type: "array", items: { type: "string" } },
              placeholder: { type: "string" },
              allow_other: { type: "boolean" },
            },
            required: ["id", "label", "type"],
          },
        },
      },
      required: ["questions"],
    },
  },
};

const requestSignupTool = {
  type: "function" as const,
  function: {
    name: "request_signup",
    description:
      "Call this the MOMENT the user asks to source candidates, find people, run a search, publish a post, schedule interviews, or save the project. After calling it, end the turn with a single short line inviting the user to create a free account to continue.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        reason: {
          type: "string",
          description: "Short phrase: what the user wanted to do that requires an account.",
        },
      },
    },
  },
};

// ----- gateway call --------------------------------------------------

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: unknown;
  name?: string;
};

async function callGateway(messages: ChatMessage[], apiKey: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-5-mini",
      messages,
      tools: [createJobDraftTool, askClarifyingQuestionsTool, requestSignupTool],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      res.status === 429
        ? "Rate limit reached. Try again in a moment."
        : res.status === 402
        ? "AI credits exhausted."
        : `AI gateway error (${res.status}). ${text.slice(0, 200)}`,
    );
  }
  return res.json();
}

export const Route = createFileRoute("/api/public/guest-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = await request.json().catch(() => null);
        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
          return Response.json({ error: "Invalid body" }, { status: 400 });
        }
        const { guestId, messages, draftJob } = parsed.data;

        if (rateLimited(`ip:${clientIp(request)}`) || rateLimited(`g:${guestId}`)) {
          return Response.json({ error: "Too many requests" }, { status: 429 });
        }

        const userTurns = messages.filter((m) => m.role === "user").length;
        if (userTurns > HARD_TURN_CAP) {
          return Response.json(
            {
              assistant:
                "We've covered a lot here. Create a free account to keep this conversation, find candidates, and post the role.",
              toolEvents: [],
              signupRequired: true,
              signupReason: "cap",
            },
            { status: 200 },
          );
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "AI not configured" }, { status: 500 });
        }

        const convo: ChatMessage[] = [
          { role: "system", content: await getPrompt("guest.main") },
          ...(draftJob && Object.keys(draftJob).length
            ? [
                {
                  role: "system" as const,
                  content: `Current draft Job (in-memory, not yet saved):\n${JSON.stringify(draftJob)}`,
                },
              ]
            : []),
          ...messages.map((m) => ({
            role: m.role,
            content: m.content,
            tool_call_id: m.tool_call_id,
            tool_calls: m.tool_calls,
            name: m.name,
          })),
        ];

        const toolEvents: Array<{ kind: string; data: unknown }> = [];
        let nextDraft: z.infer<typeof draftJobSchema> | undefined = draftJob;
        let signupRequired = false;
        let signupReason: string | undefined;
        let assistantText = "";

        const MAX_ITERS = 4;
        for (let iter = 0; iter < MAX_ITERS; iter++) {
          const completion = await callGateway(convo, apiKey).catch((err: Error) => {
            return { error: err.message };
          });
          if ("error" in completion) {
            return Response.json({ error: completion.error }, { status: 502 });
          }
          const choice = completion.choices?.[0];
          const msg = choice?.message;
          if (!msg) break;

          const txt: string = msg.content ?? "";
          if (txt) assistantText += (assistantText ? "\n\n" : "") + txt;

          const toolCalls: Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }> = msg.tool_calls ?? [];

          if (!toolCalls.length) break;

          const toolResults: ChatMessage[] = [];
          for (const call of toolCalls) {
            const name = call.function?.name;
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(call.function?.arguments || "{}");
            } catch {
              /* ignore */
            }

            if (name === "create_job_draft") {
              const parsedDraft = draftJobSchema.safeParse(args);
              if (parsedDraft.success) {
                nextDraft = { ...(nextDraft ?? {}), ...parsedDraft.data };
                toolEvents.push({ kind: "draft_job", data: nextDraft });
                toolResults.push({
                  role: "tool",
                  tool_call_id: call.id ?? "",
                  name,
                  content: JSON.stringify({ ok: true, title: nextDraft.title }),
                });
              } else {
                toolResults.push({
                  role: "tool",
                  tool_call_id: call.id ?? "",
                  name,
                  content: JSON.stringify({ ok: false, error: "Invalid draft" }),
                });
              }
            } else if (name === "ask_clarifying_questions") {
              const questions = Array.isArray((args as { questions?: unknown[] }).questions)
                ? ((args as { questions: Array<Record<string, unknown>> }).questions).slice(0, 4)
                : [];
              const intro =
                typeof (args as { intro?: unknown }).intro === "string"
                  ? String((args as { intro: string }).intro).slice(0, 240)
                  : "";
              const normalized = questions.map((q, i) => ({
                id: String(q.id ?? `q${i}`).slice(0, 64),
                label: String(q.label ?? "").slice(0, 240),
                type: ["single", "multi", "text"].includes(q.type as string)
                  ? (q.type as "single" | "multi" | "text")
                  : "single",
                options: Array.isArray(q.options)
                  ? (q.options as unknown[]).map((o) => String(o)).slice(0, 12)
                  : [],
                placeholder:
                  typeof q.placeholder === "string" ? String(q.placeholder).slice(0, 120) : "",
                allow_other: Boolean(q.allow_other),
              }));
              toolEvents.push({ kind: "clarify", data: { intro, questions: normalized } });
              toolResults.push({
                role: "tool",
                tool_call_id: call.id ?? "",
                name,
                content: JSON.stringify({ ok: true, asked: normalized.length }),
              });
            } else if (name === "request_signup") {
              signupRequired = true;
              signupReason = String((args as { reason?: string }).reason ?? "").slice(0, 200);
              toolEvents.push({ kind: "request_signup", data: { reason: signupReason } });
              toolResults.push({
                role: "tool",
                tool_call_id: call.id ?? "",
                name,
                content: JSON.stringify({ ok: true }),
              });
            } else {
              toolResults.push({
                role: "tool",
                tool_call_id: call.id ?? "",
                name: name ?? "unknown",
                content: JSON.stringify({ ok: false, error: "Tool not available in guest mode." }),
              });
            }
          }

          convo.push(
            {
              role: "assistant",
              content: txt,
              tool_calls: toolCalls as unknown,
            },
            ...toolResults,
          );
        }

        return Response.json({
          assistant: assistantText.trim() || "…",
          toolEvents,
          draftJob: nextDraft,
          signupRequired,
          signupReason,
        });
      },
    },
  },
});
