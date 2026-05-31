import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { runSourcingAgent, type TaskEvent } from "@/lib/sourcing/agent.server";
import { generateScreeningQuestions } from "@/lib/jobs/screening.server";
import { getPrompt } from "@/lib/prompts/registry.server";
import {
  OPENAI_CHAT_COMPLETIONS_URL,
  OPENAI_RATE_LIMIT_MESSAGE,
  getOpenAIKey,
  getOpenAIModel,
} from "@/lib/ai/openai-model.server";
import {
  DEFAULT_LINKEDIN,
  DEFAULT_EMAIL_SUBJECT,
  DEFAULT_EMAIL_BODY,
  DEFAULT_FOLLOWUPS,
} from "@/lib/outreach/outreach.functions";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().min(1).max(20000),
});

// Sentinel used to split an assistant message into "before tasks" and
// "after tasks" segments so the chat UI can render task cards in between.
// Must stay in sync with the constant in src/routes/app.c.$id.tsx.
const AFTER_TASKS_MARKER = "\n\n<<<AFTER_TASKS>>>\n\n";

type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: unknown;
  name?: string;
};

const createJobTool = {
  type: "function" as const,
  function: {
    name: "create_job",
    description:
      "Create or update the Job artifact for this conversation. The JD MUST follow this fixed professional structure: a short `summary` paragraph (2–4 sentences, plain prose, no markdown headings, no bullets), then bulleted lists for `responsibilities` (what they'll do), `must_have` (hard requirements), and optional `nice_to_have`. Each list item is a single short sentence — no paragraphs, no nested bullets, no markdown. Do NOT dump a free-form description; the structured fields are what render in the Job tab and on the public page.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        summary: {
          type: "string",
          description: "Short overview paragraph (2–4 sentences). Plain prose. No markdown, no bullets, no headings.",
        },
        responsibilities: {
          type: "array",
          items: { type: "string" },
          description: "What the person will do day-to-day. Each item is one short sentence. Aim for 4–8 items.",
        },
        must_have: {
          type: "array",
          items: { type: "string" },
          description: "Hard requirements (skills, experience, qualifications). Each item is one short sentence. Aim for 3–7 items.",
        },
        nice_to_have: {
          type: "array",
          items: { type: "string" },
          description: "Optional bonus qualifications. Each item is one short sentence.",
        },
        location: { type: "string" },
        employment_type: {
          type: "string",
          enum: ["full_time", "part_time", "contract", "internship", "temporary"],
        },
        salary_min: { type: ["number", "null"] },
        salary_max: { type: ["number", "null"] },
        currency: { type: "string" },
      },
      required: ["title", "summary", "responsibilities", "must_have"],
    },
  },
};

const sourceCandidatesTool = {
  type: "function" as const,
  function: {
    name: "source_candidates",
    description:
      "Search our candidate pool and add the top matching candidates to the Candidates tab. Use whenever the user wants to find / source / pull candidates.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        brief: {
          type: "string",
          description: "Plain-English brief of who we're looking for. Include title, seniority, location, must-have skills.",
        },
        limit: { type: "number", description: "How many candidates to add. Default 20, max 50." },
      },
      required: ["brief"],
    },
  },
};

const askClarifyingQuestionsTool = {
  type: "function" as const,
  function: {
    name: "ask_clarifying_questions",
    description:
      "Surface structured clarifying questions to the user as pill-shaped multi/single-select options (with optional free-text). ONLY call when (a) the user has asked for new sourcing or a new artifact and required info (role, location, seniority) is missing, OR (b) a previous search returned 0/limited results AND the user explicitly asked you to retry or broaden. NEVER call this in response to a follow-up question about results already on screen (e.g. 'why N candidates?', 'what's in the JD?', 'who is this person?') — answer those in prose using the conversation and tool history. Call AT MOST ONCE per turn: bundle every question you need into a single call. If you need follow-ups after the user answers, ask them in the next turn.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        intro: {
          type: "string",
          description: "One short sentence shown above the questions. E.g. 'A couple quick details to sharpen the search:'",
        },
        questions: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string", description: "Stable snake_case key, e.g. 'seniority'." },
              label: { type: "string", description: "The question text shown to the user." },
              type: { type: "string", enum: ["single", "multi", "text"] },
              options: {
                type: "array",
                items: { type: "string" },
                description: "Pill labels for single/multi. Omit for text-only.",
              },
              placeholder: { type: "string", description: "Placeholder for the free-text input." },
              allow_other: { type: "boolean", description: "If true, reveal a free-text input alongside pills." },
            },
            required: ["id", "label", "type"],
          },
        },
      },
      required: ["questions"],
    },
  },
};

const publishJobTool = {
  type: "function" as const,
  function: {
    name: "publish_job",
    description:
      "Publish the current Job as a LIVE public job post. Generates AI screening questions if missing, mints a public URL slug, flips published=true, and sets status='open'. The result is a real shareable page at /jobs/{slug} with a working application form. Requires that a Job already exists. Safe to call again — re-publish is idempotent.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
};

const draftOutreachTool = {
  type: "function" as const,
  function: {
    name: "draft_outreach",
    description:
      "Draft outreach templates (LinkedIn under 200 chars + email subject/body + 3-step follow-up sequence) for contacting sourced candidates. Call once a Job exists and candidates have been sourced.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        tone: { type: "string", enum: ["Warm", "Direct", "Casual"] },
      },
    },
  },
};

// ============================================================
// Read-only context tools — scoped to the current conversation.
// Safe to call any time; do not spend credits or create artifacts.
// ============================================================

const getConversationContextTool = {
  type: "function" as const,
  function: {
    name: "get_conversation_context",
    description:
      "Snapshot of what exists in THIS conversation: whether a job/outreach/job_post has been created, candidate count + stage breakdown, and the job's title/location/salary. Call this first when the user asks a general question about the chat's state.",
    parameters: { type: "object", additionalProperties: false, properties: {} },
  },
};

const getJobTool = {
  type: "function" as const,
  function: {
    name: "get_job",
    description:
      "Return the full Job for this conversation (title, description, requirements, must_have, nice_to_have, location, employment_type, salary, screening). Use when the user asks about the JD.",
    parameters: { type: "object", additionalProperties: false, properties: {} },
  },
};

const listCandidatesTool = {
  type: "function" as const,
  function: {
    name: "list_candidates",
    description:
      "List candidates sourced in this conversation. Use to answer 'how many', 'who's starred', 'who haven't we contacted', breakdowns by stage/location, etc.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        stage: { type: "string", description: "Filter by stage (e.g. 'Sourced', 'Contacted', 'Replied')." },
        starred: { type: "boolean", description: "Only starred candidates." },
        contacted: { type: "boolean", description: "true = only contacted, false = only not contacted." },
        min_match: { type: "number", description: "Minimum match score (0-100)." },
        limit: { type: "number", description: "Default 25, max 100." },
      },
    },
  },
};

const getCandidateTool = {
  type: "function" as const,
  function: {
    name: "get_candidate",
    description:
      "Return one candidate's full profile (experience, education, match_breakdown, activity, contact info) by id OR fuzzy name match. Use when the user asks about a specific person.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        candidate_id: { type: "string", description: "UUID of the candidate, if known." },
        name: { type: "string", description: "Full or partial name; case-insensitive substring match." },
      },
    },
  },
};

const getOutreachDraftTool = {
  type: "function" as const,
  function: {
    name: "get_outreach_draft",
    description:
      "Return the outreach draft for this conversation (LinkedIn template, email subject/body, follow-ups, tone, send settings).",
    parameters: { type: "object", additionalProperties: false, properties: {} },
  },
};

const READ_TOOL_NAMES = new Set([
  "get_conversation_context",
  "get_job",
  "list_candidates",
  "get_candidate",
  "get_outreach_draft",
]);

async function getUserFromRequest(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

type StreamedToolCall = { id?: string; name?: string; args: string };

// Detect an `ask_clarifying_questions`-shaped JSON blob that the model
// occasionally writes as plain assistant text instead of emitting as a
// tool call. Returns the parsed payload + the surrounding text with the
// blob removed, or null if nothing matches.
function extractLeakedClarify(
  text: string,
): { payload: { intro?: string; questions: any[] }; cleaned: string } | null {
  const marker = text.indexOf('"questions"');
  if (marker === -1) return null;
  // Walk backward to find the enclosing `{`.
  let start = -1;
  let close = 0;
  for (let i = marker; i >= 0; i--) {
    const ch = text[i];
    if (ch === "}") close++;
    else if (ch === "{") {
      if (close === 0) {
        start = i;
        break;
      }
      close--;
    }
  }
  if (start === -1) return null;
  // Walk forward to the matching `}` (respect strings + escapes).
  let depth = 0;
  let end = -1;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  const raw = text.slice(start, end + 1);
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) return null;
  const ok = parsed.questions.every(
    (q: any) => q && typeof q.id === "string" && typeof q.label === "string",
  );
  if (!ok) return null;
  const cleaned = (text.slice(0, start) + text.slice(end + 1))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { payload: parsed, cleaned };
}

async function callOpenAI(
  messages: ChatMessage[],
  apiKey: string,
  mode?: "all" | "read_only",
): Promise<Response> {
  const tools =
    mode === "read_only"
      ? [
          getConversationContextTool,
          getJobTool,
          listCandidatesTool,
          getCandidateTool,
          getOutreachDraftTool,
        ]
      : [
          createJobTool,
          sourceCandidatesTool,
          askClarifyingQuestionsTool,
          publishJobTool,
          draftOutreachTool,
          getConversationContextTool,
          getJobTool,
          listCandidatesTool,
          getCandidateTool,
          getOutreachDraftTool,
        ];
  return fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: getOpenAIModel(),
      stream: true,
      messages,
      tools,
    }),
  });
}

// Heuristic: looks like a follow-up question about existing results rather
// than a request to do/produce something new. When true, we steer the model
// away from tool-calling (especially the destructive/expensive sourcing and
// clarifying-question tools) so it answers in prose using prior context.
function looksLikeFollowUpQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length === 0 || t.length > 280) return false;
  if (!/[?]/.test(t) && !/^(why|what|how|when|who|where|which|can you (explain|tell|show)|tell me)\b/.test(t))
    return false;
  // Requests to do/refine sourcing must keep tools enabled so clarify cards can render.
  if (/\b(find|source|pull|search|sourcing|candidate|candidates|add|create|draft|post|publish|schedule|send|reach out|outreach|generate|build|make|broaden|refine|sharpen|narrow|redo|retry|try again|do it|go ahead)\b/.test(t))
    return false;
  if (/\b(buscar|busqueda|búsqueda|encontrar|conseguir|candidatos?|refinar|afinar|precisar|acotar|ampliar|reintentar|otra vez|hazlo|adelante)\b/.test(t))
    return false;
  // Only suppress tools for actual questions about existing results/artifacts.
  return /\b(why|what|how|when|who|where|which|explain|tell me|por que|por qué|que|qué|como|cómo|cuando|cuándo|quien|quién|donde|dónde)\b/.test(t)
    && /\b(this|that|these|those|result|results|candidate|candidates|job|post|profile|person|message|email|outreach|esto|eso|estos|esas|resultado|resultados|candidato|candidatos|vacante|puesto|perfil|persona|mensaje|correo)\b/.test(t);
}

// Heuristic for chain-of-thought that the model leaked into the visible
// `content` channel (e.g. "(Mode C: We're in a sourcing flow...", "Let me
// classify…", parentheticals stuffed with meta-analysis). Used to redirect
// those tokens to the reasoning stream instead of the reply bubble.
function looksLikeLeakedReasoning(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // Very strong opener — almost always leaked CoT.
  if (/^\(\s*Mode\s+[A-D]\b/i.test(t)) return true;
  if (/^\((?:we|let me|i need|i should|the user|conversation shows|we (?:must|need|should))\b/i.test(t))
    return true;
  // Otherwise require the head to START with an internal-monologue phrase
  // AND accumulate 3+ trigger hits. Fail-open: Spanish/short prose, normal
  // wrap-ups ("Listo — añadí 20 candidatos…"), and post-tool summaries
  // never match.
  const head = t.slice(0, 240).toLowerCase();
  const opensInternal =
    /^(mode [a-d]:|we're in|we are in|let me classify|classify this|the user is asking|the user hasn't|the user has not|conversation shows|internal:)/.test(
      head,
    );
  if (!opensInternal) return false;
  const triggers = [
    "mode a:", "mode b:", "mode c:", "mode d:",
    "we're in", "we are in", "let me classify", "classify this",
    "the user is asking", "the user hasn't", "the user has not",
    "conversation shows", "we must respond", "we need to respond",
    "we should respond", "we should reply", "internal:", "(the assistant)",
  ];
  let hits = 0;
  for (const k of triggers) if (head.includes(k)) hits++;
  return hits >= 3;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await getUserFromRequest(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const json = await request.json().catch(() => null);
        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "Invalid body" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const { conversationId, message } = parsed.data;

        const { data: conv } = await supabaseAdmin
          .from("conversations")
          .select("id,user_id,title")
          .eq("id", conversationId)
          .maybeSingle();
        if (!conv || conv.user_id !== userId) {
          return new Response("Not found", { status: 404 });
        }

        await supabaseAdmin.from("messages").insert({
          conversation_id: conversationId,
          user_id: userId,
          role: "user",
          content: message,
        });

        if (conv.title === "New conversation") {
          await supabaseAdmin
            .from("conversations")
            .update({ title: message.slice(0, 60) })
            .eq("id", conversationId);
        }

        const { data: history } = await supabaseAdmin
          .from("messages")
          .select("role,content,tool_calls")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

        const baseMessages: ChatMessage[] = [
          { role: "system", content: await getPrompt("chat.main") },
          ...(history ?? [])
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content || "" })),
        ];

        const apiKey = process.env.OPENAI_API_KEY;
        const model = process.env.OPENAI_MODEL;
        if (!apiKey || !model) {
          return new Response(
            JSON.stringify({
              error:
                "AI not configured: set OPENAI_API_KEY and OPENAI_MODEL secrets.",
            }),
            {
            status: 500,
            headers: { "content-type": "application/json" },
            },
          );
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (event: string, data: unknown) => {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            // Streams a gateway response and returns parsed { text, toolCalls }.
            async function streamCompletion(
              messages: ChatMessage[],
              mode?: "all" | "read_only",
              allowLeakRedirect: boolean = false,
            ): Promise<{ text: string; toolCalls: StreamedToolCall[] }> {
              const upstream = await callOpenAI(messages, apiKey!, mode);
              if (!upstream.ok || !upstream.body) {
                const text = await upstream.text().catch(() => "");
                const errMsg =
                  upstream.status === 429
                    ? OPENAI_RATE_LIMIT_MESSAGE
                    : upstream.status === 402
                    ? "AI credits exhausted."
                    : `OpenAI error (${upstream.status}). ${text.slice(0, 200)}`;
                throw new Error(errMsg);
              }
              const reader = upstream.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";
              let assistantText = "";
              const toolCalls: Record<number, StreamedToolCall> = {};
              // Defensive: some models leak chain-of-thought into the
              // visible `content` channel instead of `reasoning`. If the
              // very first content tokens look like leaked reasoning,
              // we re-route them to the reasoning stream so the user
              // never sees them in the reply bubble.
              let leakMode: "unknown" | "answer" | "leak" = "unknown";
              let leakedSoFar = "";

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let nl: number;
                while ((nl = buffer.indexOf("\n")) !== -1) {
                  let line = buffer.slice(0, nl);
                  buffer = buffer.slice(nl + 1);
                  if (line.endsWith("\r")) line = line.slice(0, -1);
                  if (!line.startsWith("data: ")) continue;
                  const payload = line.slice(6).trim();
                  if (payload === "[DONE]") continue;
                  let parsed: any;
                  try {
                    parsed = JSON.parse(payload);
                  } catch {
                    buffer = line + "\n" + buffer;
                    break;
                  }
                  const delta = parsed.choices?.[0]?.delta;
                  if (!delta) continue;
                  // Forward true reasoning tokens to the UI's thinking ticker.
                  const reasoningChunk =
                    (typeof delta.reasoning === "string" && delta.reasoning) ||
                    (typeof delta.reasoning_content === "string" && delta.reasoning_content) ||
                    "";
                  if (reasoningChunk) {
                    send("reasoning", { content: reasoningChunk });
                  }
                  if (typeof delta.content === "string" && delta.content) {
                    if (!allowLeakRedirect) {
                      assistantText += delta.content;
                      send("delta", { content: delta.content });
                      continue;
                    }
                    // Decide once whether the visible content is actually
                    // a leaked CoT block.
                    if (leakMode === "unknown") {
                      leakedSoFar += delta.content;
                      if (looksLikeLeakedReasoning(leakedSoFar)) {
                        leakMode = "leak";
                        send("reasoning", { content: leakedSoFar });
                        leakedSoFar = "";
                        continue;
                      }
                      // Wait until we have enough to judge, or commit.
                      if (leakedSoFar.length < 80 && !/[.!?]\s/.test(leakedSoFar)) {
                        continue;
                      }
                      leakMode = "answer";
                      assistantText += leakedSoFar;
                      send("delta", { content: leakedSoFar });
                      leakedSoFar = "";
                      continue;
                    }
                    if (leakMode === "leak") {
                      // Keep redirecting until we see a clean break out of
                      // the parenthetical / reasoning block.
                      send("reasoning", { content: delta.content });
                      // Detect end-of-leak: closing paren + newline OR a
                      // short crisp final sentence after the dump.
                      leakedSoFar += delta.content;
                      if (/\)\s*\n/.test(leakedSoFar) || /\n\n[A-ZÁÉÍÓÚÑa-záéíóúñ"¡¿]/.test(leakedSoFar)) {
                        const tailMatch = leakedSoFar.match(/\n\n([\s\S]+)$/);
                        if (tailMatch && tailMatch[1] && !looksLikeLeakedReasoning(tailMatch[1])) {
                          assistantText += tailMatch[1];
                          send("delta", { content: tailMatch[1] });
                          leakMode = "answer";
                          leakedSoFar = "";
                        }
                      }
                      continue;
                    }
                    assistantText += delta.content;
                    send("delta", { content: delta.content });
                  }
                  if (Array.isArray(delta.tool_calls)) {
                    for (const tc of delta.tool_calls) {
                      const idx = tc.index ?? 0;
                      const slot = (toolCalls[idx] ||= { args: "" });
                      if (tc.id) slot.id = tc.id;
                      if (tc.function?.name) slot.name = tc.function.name;
                      if (tc.function?.arguments) slot.args += tc.function.arguments;
                    }
                  }
                }
              }
              // Flush any buffered text — never lose a short reply.
              if (leakedSoFar) {
                if (leakMode === "leak" && looksLikeLeakedReasoning(leakedSoFar)) {
                  send("reasoning", { content: leakedSoFar });
                } else {
                  assistantText += leakedSoFar;
                  send("delta", { content: leakedSoFar });
                }
              }
              return { text: assistantText, toolCalls: Object.values(toolCalls) };
            }

            // Hoisted so the catch block can flush partial state on error.
            let preText = "";
            let postText = "";
            let assistantMessageId: string | null = null;
            try {
              const MAX_ITERS = 5;
              const allTaskIds: string[] = [];
              let candidatesAddedTotal = 0;
              let jobCreatedRow: any = null;
              let toolsRanAny = false;
              let markerSent = false;
              let firstToolCalls: StreamedToolCall[] = [];
              const convo: ChatMessage[] = [...baseMessages];
              // Hard cap: at most one clarify card per assistant turn.
              let clarifyEmittedThisTurn = false;

              // Pre-create the assistant message row so every agent_task we
              // insert during this turn can be linked to it from the start.
              // This eliminates the orphan window where tasks would have
              // message_id=null if the post-stream linkage step failed.
              const { data: assistantRowPre, error: assistantPreErr } = await supabaseAdmin
                .from("messages")
                .insert({
                  conversation_id: conversationId,
                  user_id: userId,
                  role: "assistant",
                  content: "",
                  tool_calls: null,
                })
                .select("id")
                .single();
              if (assistantPreErr) {
                console.error("pre-create assistant message failed", assistantPreErr);
              }
              assistantMessageId = assistantRowPre?.id ?? null;

              for (let iter = 0; iter < MAX_ITERS; iter++) {
                // First pass only: if the user's latest turn looks like a
                // follow-up question about existing results, disable tools so
                // the model is forced to answer in prose from history.
                const mode: "all" | "read_only" =
                  iter === 0 && looksLikeFollowUpQuestion(message) ? "read_only" : "all";
                // Only run the CoT-leak redirect on the very first pass and
                // only before tools have run — post-tool wrap-ups are short
                // prose that should never be re-routed to the reasoning channel.
                const pass = await streamCompletion(convo, mode, iter === 0 && !toolsRanAny);
                if (iter === 0) firstToolCalls = pass.toolCalls;

                // Safety net: if the model wrote the clarify payload as text
                // instead of calling the tool, hoist it into a real clarify
                // task and strip the JSON from what the user sees.
                if (pass.toolCalls.length === 0) {
                  const leak = extractLeakedClarify(pass.text);
                  if (leak) {
                    // Always strip the leaked JSON from what the user sees,
                    // even if we suppress the duplicate card below.
                    if (clarifyEmittedThisTurn) {
                      pass.text = leak.cleaned;
                      send("text_replace", {
                        text: leak.cleaned,
                      });
                    } else {
                    const questions = Array.isArray(leak.payload.questions)
                      ? leak.payload.questions.slice(0, 4)
                      : [];
                    const intro =
                      typeof leak.payload.intro === "string"
                        ? leak.payload.intro.slice(0, 240)
                        : "";
                    const normalized = questions.map((q: any, i: number) => ({
                      id: String(q?.id ?? `q${i}`).slice(0, 64),
                      label: String(q?.label ?? "").slice(0, 240),
                      type: ["single", "multi", "text"].includes(q?.type) ? q.type : "single",
                      options: Array.isArray(q?.options)
                        ? q.options.map((o: unknown) => String(o)).slice(0, 12)
                        : [],
                      placeholder:
                        typeof q?.placeholder === "string" ? q.placeholder.slice(0, 120) : "",
                      allow_other: Boolean(q?.allow_other),
                    }));
                    const { data: clarifyTask } = await supabaseAdmin
                      .from("agent_tasks")
                      .insert({
                        user_id: userId,
                        conversation_id: conversationId,
                        message_id: assistantMessageId,
                        kind: "clarify",
                        label: intro || "A couple quick details to sharpen the search:",
                        status: "done",
                        summary: null,
                        data: { intro, questions: normalized },
                        finished_at: new Date().toISOString(),
                      })
                      .select("*")
                      .single();
                    if (clarifyTask) {
                      allTaskIds.push(clarifyTask.id);
                      send("task", clarifyTask);
                      clarifyEmittedThisTurn = true;
                    }
                    // Replace what the user sees with the cleaned text.
                    pass.text = leak.cleaned;
                    send("text_replace", {
                      content: (toolsRanAny ? preText + AFTER_TASKS_MARKER : "") + leak.cleaned,
                    });
                    }
                  }
                }

                if (!toolsRanAny) {
                  preText += (preText && pass.text ? "\n\n" : "") + pass.text;
                } else {
                  postText += (postText && pass.text ? "\n\n" : "") + pass.text;
                }

                if (pass.toolCalls.length === 0) break;

                // Execute tool calls for this pass
                const toolResults: ChatMessage[] = [];
                for (const call of pass.toolCalls) {
                if (!call.name) continue;
                let args: any = {};
                try {
                  args = JSON.parse(call.args || "{}");
                } catch {}

                if (call.name === "create_job") {
                  const summary = String(args.summary ?? "").trim();
                  const responsibilities = Array.isArray(args.responsibilities)
                    ? args.responsibilities.map((r: unknown) => String(r).trim()).filter(Boolean).slice(0, 50)
                    : [];
                  const mustHave = Array.isArray(args.must_have)
                    ? args.must_have.map((r: unknown) => String(r).trim()).filter(Boolean).slice(0, 50)
                    : Array.isArray(args.requirements)
                      ? args.requirements.map((r: unknown) => String(r).trim()).filter(Boolean).slice(0, 50)
                      : [];
                  const niceToHave = Array.isArray(args.nice_to_have)
                    ? args.nice_to_have.map((r: unknown) => String(r).trim()).filter(Boolean).slice(0, 50)
                    : [];
                  // Compose markdown description from the structured parts so
                  // legacy consumers (public job page fallback, exports) still
                  // have a renderable body. The Job tab itself renders the
                  // structured fields directly.
                  const composedDescription = [
                    summary,
                    responsibilities.length ? `## What you'll do\n${responsibilities.map((r: string) => `- ${r}`).join("\n")}` : "",
                    mustHave.length ? `## Must have\n${mustHave.map((r: string) => `- ${r}`).join("\n")}` : "",
                    niceToHave.length ? `## Nice to have\n${niceToHave.map((r: string) => `- ${r}`).join("\n")}` : "",
                  ].filter(Boolean).join("\n\n");
                  const jobPayload = {
                    conversation_id: conversationId,
                    user_id: userId,
                    title: String(args.title ?? "").slice(0, 200),
                    description: composedDescription,
                    summary,
                    responsibilities,
                    must_have: mustHave,
                    nice_to_have: niceToHave,
                    // Mirror must_have into legacy `requirements` so screening
                    // generation and other callers that still read it stay populated.
                    requirements: mustHave,
                    location: String(args.location ?? ""),
                    employment_type: ["full_time", "part_time", "contract", "internship", "temporary"].includes(
                      args.employment_type,
                    )
                      ? args.employment_type
                      : "full_time",
                    salary_min: typeof args.salary_min === "number" ? Math.round(args.salary_min) : null,
                    salary_max: typeof args.salary_max === "number" ? Math.round(args.salary_max) : null,
                    currency: String(args.currency ?? "USD").slice(0, 8),
                    status: "draft" as const,
                  };
                  const { data: jobRow } = await supabaseAdmin
                    .from("jobs")
                    .upsert(jobPayload, { onConflict: "conversation_id" })
                    .select("*")
                    .single();
                  jobCreatedRow = jobRow;
                  send("job", jobRow);
                  // Emit a "Job description drafted" task card so the
                  // chat timeline has a clickable artifact for it.
                  const { data: jobTask } = await supabaseAdmin
                    .from("agent_tasks")
                    .insert({
                      user_id: userId,
                      conversation_id: conversationId,
                      message_id: assistantMessageId,
                      kind: "create_job",
                      label: "Job description drafted",
                      status: "done",
                      summary: "Open Job tab to review",
                      data: { job_id: jobRow?.id },
                      finished_at: new Date().toISOString(),
                    })
                    .select("*")
                    .single();
                  if (jobTask) {
                    allTaskIds.push(jobTask.id);
                    send("task", jobTask);
                  }
                  toolResults.push({
                    role: "tool",
                    tool_call_id: call.id ?? "",
                    name: "create_job",
                    content: JSON.stringify({ ok: true, title: jobPayload.title }),
                  });
                } else if (call.name === "source_candidates") {
                  const brief = String(args.brief ?? message).slice(0, 4000);
                  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);

                  // Pull job context if present
                  const { data: jobRow } = await supabaseAdmin
                    .from("jobs")
                    .select("title,description,location,requirements")
                    .eq("conversation_id", conversationId)
                    .maybeSingle();

                  try {
                    const result = await runSourcingAgent({
                      userId,
                      conversationId,
                      messageId: assistantMessageId,
                      brief,
                      jobBrief: jobRow ?? undefined,
                      limit,
                      onTask: (t: TaskEvent) => {
                        allTaskIds.push(t.id);
                        send("task", t);
                      },
                    });
                    if (result.added > 0) {
                      candidatesAddedTotal += result.added;
                      send("candidates_added", { count: result.added });
                    }
                    if (result.needs_clarification) {
                      toolResults.push({
                        role: "tool",
                        tool_call_id: call.id ?? "",
                        name: "source_candidates",
                        content: JSON.stringify({
                          ok: false,
                          needs_clarification: result.needs_clarification,
                          summary:
                            `Region "${result.needs_clarification.region}" is ambiguous — ` +
                            `it spans many countries. Ask the user which specific countries to target ` +
                            `via ask_clarifying_questions (suggest the typical countries for this region as a multi-select). ` +
                            `Do not retry source_candidates until they answer.`,
                        }),
                      });
                      continue;
                    }
                    toolResults.push({
                      role: "tool",
                      tool_call_id: call.id ?? "",
                      name: "source_candidates",
                      content: JSON.stringify({
                        ok: true,
                        requested: limit,
                        added: result.added,
                        skipped_duplicates: result.skipped,
                        preview_total: result.preview_total,
                        apollo_count: result.apollo_count,
                        pdl_count: result.pdl_count,
                        apollo_error: result.apollo_error,
                        pdl_error: result.pdl_error,
                        pool_limited: result.pool_limited,
                        broadened: result.broadened,
                        summary:
                          result.added === 0
                            ? result.pool_limited
                              ? "Candidate pool was rate-limited; no new candidates added this run."
                              : "No matches for this brief — try broadening it."
                            : result.added < limit
                              ? `Requested ${limit}, added ${result.added}. ${
                                  result.skipped > 0
                                    ? `${result.skipped} matching profile${result.skipped === 1 ? " was" : "s were"} already in your pipeline and skipped. `
                                    : ""
                                }${
                                  result.preview_total < limit
                                    ? `The pool only returned ${result.preview_total} unique matches for this brief${result.broadened ? " (search was broadened to find these)" : ""}.`
                                    : ""
                                }`.trim()
                              : `Added ${result.added} candidates as requested.`,
                      }),
                    });
                  } catch (err: any) {
                    toolResults.push({
                      role: "tool",
                      tool_call_id: call.id ?? "",
                      name: "source_candidates",
                      content: JSON.stringify({ ok: false, error: err?.message ?? "Sourcing failed" }),
                    });
                  }
                } else if (call.name === "ask_clarifying_questions") {
                  if (clarifyEmittedThisTurn) {
                    toolResults.push({
                      role: "tool",
                      tool_call_id: call.id ?? "",
                      name: "ask_clarifying_questions",
                      content: JSON.stringify({
                        ok: false,
                        reason: "already_asked",
                        message:
                          "A clarify card was already shown this turn. Do not ask again — wait for the user's answers, then ask any follow-ups in the next turn.",
                      }),
                    });
                    continue;
                  }
                  const questions = Array.isArray(args.questions) ? args.questions.slice(0, 4) : [];
                  const intro = typeof args.intro === "string" ? args.intro.slice(0, 240) : "";
                  const normalized = questions.map((q: any, i: number) => ({
                    id: String(q?.id ?? `q${i}`).slice(0, 64),
                    label: String(q?.label ?? "").slice(0, 240),
                    type: ["single", "multi", "text"].includes(q?.type) ? q.type : "single",
                    options: Array.isArray(q?.options) ? q.options.map((o: unknown) => String(o)).slice(0, 12) : [],
                    placeholder: typeof q?.placeholder === "string" ? q.placeholder.slice(0, 120) : "",
                    allow_other: Boolean(q?.allow_other),
                  }));
                  const { data: clarifyTask } = await supabaseAdmin
                    .from("agent_tasks")
                    .insert({
                      user_id: userId,
                      conversation_id: conversationId,
                      message_id: assistantMessageId,
                      kind: "clarify",
                      label: intro || "A couple quick details to sharpen the search:",
                      status: "done",
                      summary: null,
                      data: { intro, questions: normalized },
                      finished_at: new Date().toISOString(),
                    })
                    .select("*")
                    .single();
                  if (clarifyTask) {
                    allTaskIds.push(clarifyTask.id);
                    send("task", clarifyTask);
                    clarifyEmittedThisTurn = true;
                  }
                  toolResults.push({
                    role: "tool",
                    tool_call_id: call.id ?? "",
                    name: "ask_clarifying_questions",
                    content: JSON.stringify({ ok: true, asked: normalized.length }),
                  });
                } else if (call.name === "publish_job" || call.name === "draft_job_posts") {
                  // Note: draft_job_posts is kept as a back-compat alias so older
                  // streamed proposal pills continue to work.
                  const { data: jobRow } = await supabaseAdmin
                    .from("jobs")
                    .select("*")
                    .eq("conversation_id", conversationId)
                    .eq("user_id", userId)
                    .maybeSingle();
                  if (!jobRow) {
                    toolResults.push({
                      role: "tool",
                      tool_call_id: call.id ?? "",
                      name: "publish_job",
                      content: JSON.stringify({ ok: false, error: "No Job exists yet — call create_job first." }),
                    });
                  } else {
                    // 1. Slug — derive from title if missing, dedupe.
                    let slug: string = (jobRow as any).slug ?? "";
                    if (!slug) {
                      const base =
                        String(jobRow.title || jobRow.location || "job")
                          .toLowerCase()
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "")
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-+|-+$/g, "")
                          .slice(0, 48) || "job";
                      for (let i = 0; i < 5; i++) {
                        const candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
                        const { data: clash } = await supabaseAdmin
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

                    // 2. Screening questions — generate if missing.
                    const existingScreening = Array.isArray((jobRow as any).screening)
                      ? ((jobRow as any).screening as unknown[])
                      : [];
                    let screening = existingScreening;
                    if (screening.length === 0) {
                      screening = await generateScreeningQuestions({
                        title: jobRow.title,
                        company: (jobRow as any).company,
                        summary: (jobRow as any).summary || jobRow.description,
                        description: jobRow.description,
                        must_have: (jobRow as any).must_have ?? jobRow.requirements,
                        nice_to_have: (jobRow as any).nice_to_have,
                        location: jobRow.location,
                      });
                    }

                    // 3. Flip published + persist.
                    const { data: updated } = await supabaseAdmin
                      .from("jobs")
                      .update({
                        slug,
                        published: true,
                        published_at: new Date().toISOString(),
                        status: "open",
                        screening: screening as any,
                      })
                      .eq("conversation_id", conversationId)
                      .eq("user_id", userId)
                      .select("*")
                      .single();
                    send("job", updated);

                    const publicPath = `/jobs/${slug}`;
                    const { data: pubTask } = await supabaseAdmin
                      .from("agent_tasks")
                      .insert({
                        user_id: userId,
                        conversation_id: conversationId,
                        message_id: assistantMessageId,
                        kind: "publish_job",
                        label: "Job published",
                        status: "done",
                        summary: `Live at ${publicPath}`,
                        data: { slug, public_path: publicPath, screening_count: screening.length },
                        finished_at: new Date().toISOString(),
                      })
                      .select("*")
                      .single();
                    if (pubTask) {
                      allTaskIds.push(pubTask.id);
                      send("task", pubTask);
                    }
                    toolResults.push({
                      role: "tool",
                      tool_call_id: call.id ?? "",
                      name: "publish_job",
                      content: JSON.stringify({
                        ok: true,
                        slug,
                        public_path: publicPath,
                        screening_questions: screening.length,
                      }),
                    });
                  }
                } else if (call.name === "draft_outreach") {
                  const args = call.args ? JSON.parse(call.args) : {};
                  const { data: jobRow } = await supabaseAdmin
                    .from("jobs")
                    .select("id")
                    .eq("conversation_id", conversationId)
                    .maybeSingle();
                  if (!jobRow) {
                    toolResults.push({
                      role: "tool",
                      tool_call_id: call.id ?? "",
                      name: "draft_outreach",
                      content: JSON.stringify({ ok: false, error: "No Job exists yet — call create_job first." }),
                    });
                  } else {
                    const { data: orRow } = await supabaseAdmin
                      .from("outreach_drafts")
                      .upsert(
                        {
                          conversation_id: conversationId,
                          user_id: userId,
                          channel: "linkedin",
                          tone: args.tone ?? "Warm",
                          linkedin_template: DEFAULT_LINKEDIN,
                          email_subject: DEFAULT_EMAIL_SUBJECT,
                          email_body: DEFAULT_EMAIL_BODY,
                          followups: DEFAULT_FOLLOWUPS,
                        },
                        { onConflict: "conversation_id" },
                      )
                      .select("*")
                      .single();
                    send("outreach", orRow);
                    const { data: orTask } = await supabaseAdmin
                      .from("agent_tasks")
                      .insert({
                        user_id: userId,
                        conversation_id: conversationId,
                        message_id: assistantMessageId,
                        kind: "create_outreach",
                        label: "Outreach templates drafted",
                        status: "done",
                        summary: "Open Outreach tab to review",
                        data: { outreach_id: orRow?.id },
                        finished_at: new Date().toISOString(),
                      })
                      .select("*")
                      .single();
                    if (orTask) {
                      allTaskIds.push(orTask.id);
                      send("task", orTask);
                    }
                    toolResults.push({
                      role: "tool",
                      tool_call_id: call.id ?? "",
                      name: "draft_outreach",
                      content: JSON.stringify({ ok: true }),
                    });
                  }
                } else if (call.name === "get_conversation_context") {
                  const [{ data: job }, { data: outreach }, { data: cands }] =
                    await Promise.all([
                      supabaseAdmin
                        .from("jobs")
                        .select("id,title,location,employment_type,salary_min,salary_max,currency,status,slug,published,published_at")
                        .eq("conversation_id", conversationId)
                        .eq("user_id", userId)
                        .maybeSingle(),
                      supabaseAdmin
                        .from("outreach_drafts")
                        .select("id,channel,tone")
                        .eq("conversation_id", conversationId)
                        .eq("user_id", userId)
                        .maybeSingle(),
                      supabaseAdmin
                        .from("candidates")
                        .select("stage,starred,contacted_at,location,match")
                        .eq("conversation_id", conversationId)
                        .eq("user_id", userId),
                    ]);
                  const stageBreakdown: Record<string, number> = {};
                  let starredCount = 0;
                  let contactedCount = 0;
                  for (const c of cands ?? []) {
                    stageBreakdown[c.stage] = (stageBreakdown[c.stage] ?? 0) + 1;
                    if (c.starred) starredCount++;
                    if (c.contacted_at) contactedCount++;
                  }
                  toolResults.push({
                    role: "tool",
                    tool_call_id: call.id ?? "",
                    name: "get_conversation_context",
                    content: JSON.stringify({
                      ok: true,
                      job: job ?? null,
                      outreach_draft: outreach ?? null,
                      job_published: Boolean(job?.published),
                      candidates: {
                        total: cands?.length ?? 0,
                        starred: starredCount,
                        contacted: contactedCount,
                        not_contacted: (cands?.length ?? 0) - contactedCount,
                        by_stage: stageBreakdown,
                      },
                    }),
                  });
                } else if (call.name === "get_job") {
                  const { data: job } = await supabaseAdmin
                    .from("jobs")
                    .select("*")
                    .eq("conversation_id", conversationId)
                    .eq("user_id", userId)
                    .maybeSingle();
                  toolResults.push({
                    role: "tool",
                    tool_call_id: call.id ?? "",
                    name: "get_job",
                    content: JSON.stringify(
                      job ? { ok: true, job } : { ok: true, job: null, note: "No Job created in this conversation yet." },
                    ),
                  });
                } else if (call.name === "list_candidates") {
                  const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);
                  let q = supabaseAdmin
                    .from("candidates")
                    .select(
                      "id,name,company,role,location,match,stage,starred,tags,source,contacted_at,contact_channel,email,phone,linkedin",
                    )
                    .eq("conversation_id", conversationId)
                    .eq("user_id", userId)
                    .order("match", { ascending: false })
                    .limit(limit);
                  if (typeof args.stage === "string") q = q.eq("stage", args.stage);
                  if (typeof args.starred === "boolean") q = q.eq("starred", args.starred);
                  if (typeof args.min_match === "number") q = q.gte("match", Math.round(args.min_match));
                  if (args.contacted === true) q = q.not("contacted_at", "is", null);
                  if (args.contacted === false) q = q.is("contacted_at", null);
                  const { data: rows } = await q;
                  toolResults.push({
                    role: "tool",
                    tool_call_id: call.id ?? "",
                    name: "list_candidates",
                    content: JSON.stringify({
                      ok: true,
                      count: rows?.length ?? 0,
                      candidates: rows ?? [],
                    }),
                  });
                } else if (call.name === "get_candidate") {
                  let row: any = null;
                  if (typeof args.candidate_id === "string" && args.candidate_id) {
                    const { data } = await supabaseAdmin
                      .from("candidates")
                      .select("*")
                      .eq("id", args.candidate_id)
                      .eq("conversation_id", conversationId)
                      .eq("user_id", userId)
                      .maybeSingle();
                    row = data;
                  } else if (typeof args.name === "string" && args.name.trim()) {
                    const { data } = await supabaseAdmin
                      .from("candidates")
                      .select("*")
                      .eq("conversation_id", conversationId)
                      .eq("user_id", userId)
                      .ilike("name", `%${args.name.trim()}%`)
                      .limit(1);
                    row = data?.[0] ?? null;
                  }
                  toolResults.push({
                    role: "tool",
                    tool_call_id: call.id ?? "",
                    name: "get_candidate",
                    content: JSON.stringify(
                      row
                        ? { ok: true, candidate: row }
                        : { ok: true, candidate: null, note: "No candidate matched." },
                    ),
                  });
                } else if (call.name === "get_outreach_draft") {
                  const { data: row } = await supabaseAdmin
                    .from("outreach_drafts")
                    .select("*")
                    .eq("conversation_id", conversationId)
                    .eq("user_id", userId)
                    .maybeSingle();
                  toolResults.push({
                    role: "tool",
                    tool_call_id: call.id ?? "",
                    name: "get_outreach_draft",
                    content: JSON.stringify(
                      row
                        ? { ok: true, outreach: row }
                        : { ok: true, outreach: null, note: "No outreach draft on this chat yet." },
                    ),
                  });
                }
                }

                // Append this pass + tool results to convo, then loop
                const assistantToolCallMsg: ChatMessage = {
                  role: "assistant",
                  content: pass.text,
                  tool_calls: pass.toolCalls.map((c) => ({
                    id: c.id,
                    type: "function",
                    function: { name: c.name, arguments: c.args },
                  })),
                };
                convo.push(assistantToolCallMsg, ...toolResults);
                // Read-only tools don't emit task cards, so don't split the
                // assistant message around them — only emit the marker when
                // an action tool (one that produced a task card) ran.
                const onlyReadTools = pass.toolCalls.every((c) =>
                  c.name ? READ_TOOL_NAMES.has(c.name) : false,
                );
                if (onlyReadTools) {
                  continue;
                }
                toolsRanAny = true;
                if (!markerSent) {
                  send("delta", { content: AFTER_TASKS_MARKER });
                  markerSent = true;
                } else {
                  send("delta", { content: "\n\n" });
                }
              }

              // --- Suggested next steps proposal ---------------------------
              // After any turn that produced real artifact work, propose the
              // remaining optional steps (Job Posts, Outreach) as clickable
              // pills in chat. Skip if nothing actionable happened this turn.
              if (toolsRanAny) {
                try {
                  const [{ data: existingOutreach }, { data: existingJob }] =
                    await Promise.all([
                      supabaseAdmin
                        .from("outreach_drafts")
                        .select("id")
                        .eq("conversation_id", conversationId)
                        .maybeSingle(),
                      supabaseAdmin
                        .from("jobs")
                        .select("id,published")
                        .eq("conversation_id", conversationId)
                        .maybeSingle(),
                    ]);
                  // Only propose once we have a Job to anchor the next steps on.
                  if (existingJob) {
                    const steps: Array<{
                      key: "publish_job" | "outreach";
                      title: string;
                      subtitle: string;
                      recommended?: boolean;
                    }> = [];
                    if (!existingJob.published) {
                      steps.push({
                        key: "publish_job",
                        title: "Publish this job",
                        subtitle: "Generate vetting questions and go live at a public URL",
                      });
                    }
                    if (!existingOutreach) {
                      steps.push({
                        key: "outreach",
                        title: "Set up outreach",
                        subtitle: "LinkedIn note + 3-step email sequence",
                      });
                    }
                    if (steps.length > 0) {
                      steps[0].recommended = true;
                    }
                    const { data: proposalTask } = await supabaseAdmin
                      .from("agent_tasks")
                      .insert({
                        user_id: userId,
                        conversation_id: conversationId,
                        message_id: assistantMessageId,
                        kind: "proposal",
                        label: "Suggested next steps",
                        status: "done",
                        summary: null,
                        data: { steps },
                        finished_at: new Date().toISOString(),
                      })
                      .select("*")
                      .single();
                    if (proposalTask) {
                      allTaskIds.push(proposalTask.id);
                      send("task", proposalTask);
                    }
                  }
                } catch (e) {
                  console.error("emit proposal failed", e);
                }
              }
              // If tools ran but the model never produced a closing prose
              // turn, force one more no-tools pass so the user always sees
              // a wrap-up under the task cards.
              if (toolsRanAny && !postText.trim()) {
                const closingConvo: ChatMessage[] = [
                  ...convo,
                  {
                    role: "system",
                    content:
                      "Write a single short closing message (1–2 sentences) summarizing what just happened and a natural next step. Reply in the SAME language the user wrote in. Do NOT call any tools.",
                  },
                ];
                try {
                  const closing = await streamCompletion(closingConvo, "read_only", false);
                  if (closing.text.trim()) {
                    postText += closing.text;
                  }
                } catch (e) {
                  console.error("closing pass failed", e);
                }
                if (!postText.trim()) {
                  const isSpanish = /[ñáéíóú¿¡]|\b(que|qué|para|por|con|los|las|una|esto|esta|cómo|hola|gracias)\b/i.test(
                    message,
                  );
                  const fallback = isSpanish
                    ? "Listo — revisa los resultados arriba."
                    : "Done — check the results above.";
                  postText += fallback;
                  send("delta", { content: fallback });
                }
              }

              // Persist assistant message
              const toolCallsForDb = firstToolCalls.length
                ? firstToolCalls.map((c) => ({
                    id: c.id,
                    type: "function",
                    function: { name: c.name, arguments: c.args },
                  }))
                : null;
              const combinedText = postText
                ? `${preText}${AFTER_TASKS_MARKER}${postText}`
                : preText;
              if (assistantMessageId) {
                const { error: updErr } = await supabaseAdmin
                  .from("messages")
                  .update({ content: combinedText, tool_calls: toolCallsForDb })
                  .eq("id", assistantMessageId);
                if (updErr) console.error("update assistant message failed", updErr);
              } else {
                // Fallback: pre-create failed earlier — insert now so the
                // user still sees a reply, and best-effort link tasks.
                const { data: assistantMsg } = await supabaseAdmin
                  .from("messages")
                  .insert({
                    conversation_id: conversationId,
                    user_id: userId,
                    role: "assistant",
                    content: combinedText,
                    tool_calls: toolCallsForDb,
                  })
                  .select("id")
                  .single();
                if (assistantMsg && allTaskIds.length > 0) {
                  await supabaseAdmin
                    .from("agent_tasks")
                    .update({ message_id: assistantMsg.id })
                    .in("id", allTaskIds);
                }
              }

              send("done", { ok: true, candidates_added: candidatesAddedTotal, job: jobCreatedRow });
            } catch (err) {
              console.error("chat stream error", err);
              // Best-effort: flush whatever prose we accumulated so the user
              // sees a partial reply instead of a blank assistant bubble.
              if (assistantMessageId) {
                const partial = postText
                  ? `${preText}${AFTER_TASKS_MARKER}${postText}`
                  : preText;
                if (partial.trim()) {
                  await supabaseAdmin
                    .from("messages")
                    .update({ content: partial })
                    .eq("id", assistantMessageId)
                    .then(undefined, (e) => console.error("partial flush failed", e));
                }
              }
              send("error", { message: err instanceof Error ? err.message : "stream error" });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache, no-transform",
            connection: "keep-alive",
          },
        });
      },
    },
  },
});
