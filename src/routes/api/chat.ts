import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { runSourcingAgent, type TaskEvent } from "@/lib/sourcing/agent.server";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().min(1).max(20000),
});

const SYSTEM_PROMPT = `You are Gio, a senior recruiting agent embedded in a workspace.

You progressively build a recruiting project by calling tools that produce real artifacts: a Job draft, a candidate pipeline, etc. The user can see each tool you call as a live "task" card in the chat.

Tools available:
- create_job: draft (or update) the Job artifact for this conversation. Call once you have at minimum a title + a basic description. Don't wait for perfection — the user can edit afterward.
- source_candidates: actually go out to Apollo + PDL, find matching candidates, and add the top N to the Candidates tab. Call this whenever the user asks to source / find / pull / get candidates. Don't ask 10 clarifying questions first — call it with what you know (title, location, seniority) and refine afterward. Default limit is 20.

Style:
- Concise, recruiter-grade, no fluff.
- When you call a tool, briefly say what you're about to do before the call (one short sentence).
- After tools complete, summarize the result in 1–2 lines and propose the next move.
- Markdown is encouraged for lists and emphasis.`;

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
    description: "Create or update the Job artifact for this conversation.",
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

const sourceCandidatesTool = {
  type: "function" as const,
  function: {
    name: "source_candidates",
    description:
      "Search Apollo + PDL and add the top matching candidates to the Candidates tab. Use whenever the user wants to find / source / pull candidates.",
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

async function getUserFromRequest(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

type StreamedToolCall = { id?: string; name?: string; args: string };

async function callGateway(messages: ChatMessage[], apiKey: string): Promise<Response> {
  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      stream: true,
      messages,
      tools: [createJobTool, sourceCandidatesTool],
    }),
  });
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
          { role: "system", content: SYSTEM_PROMPT },
          ...(history ?? [])
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content || "" })),
        ];

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (event: string, data: unknown) => {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            // Streams a gateway response and returns parsed { text, toolCalls }.
            async function streamCompletion(messages: ChatMessage[]): Promise<{ text: string; toolCalls: StreamedToolCall[] }> {
              const upstream = await callGateway(messages, apiKey!);
              if (!upstream.ok || !upstream.body) {
                const text = await upstream.text().catch(() => "");
                const errMsg =
                  upstream.status === 429
                    ? "Rate limit reached. Try again in a moment."
                    : upstream.status === 402
                    ? "AI credits exhausted."
                    : `AI gateway error (${upstream.status}). ${text.slice(0, 200)}`;
                throw new Error(errMsg);
              }
              const reader = upstream.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";
              let assistantText = "";
              const toolCalls: Record<number, StreamedToolCall> = {};

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
                  if (typeof delta.content === "string" && delta.content) {
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
              return { text: assistantText, toolCalls: Object.values(toolCalls) };
            }

            try {
              // First pass
              const first = await streamCompletion(baseMessages);
              let combinedText = first.text;
              const allTaskIds: string[] = [];
              let candidatesAddedTotal = 0;
              let jobCreatedRow: any = null;

              // Execute tool calls
              const toolResults: ChatMessage[] = [];
              for (const call of first.toolCalls) {
                if (!call.name) continue;
                let args: any = {};
                try {
                  args = JSON.parse(call.args || "{}");
                } catch {}

                if (call.name === "create_job") {
                  const jobPayload = {
                    conversation_id: conversationId,
                    user_id: userId,
                    title: String(args.title ?? "").slice(0, 200),
                    description: String(args.description ?? ""),
                    requirements: Array.isArray(args.requirements)
                      ? args.requirements.map((r: unknown) => String(r)).slice(0, 50)
                      : [],
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
                    toolResults.push({
                      role: "tool",
                      tool_call_id: call.id ?? "",
                      name: "source_candidates",
                      content: JSON.stringify({
                        ok: true,
                        added: result.added,
                        skipped: result.skipped,
                        preview_total: result.preview_total,
                        apollo_count: result.apollo_count,
                        pdl_count: result.pdl_count,
                        apollo_error: result.apollo_error,
                        pdl_error: result.pdl_error,
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
                }
              }

              // Second pass: let the model produce a natural summary using tool results
              if (toolResults.length > 0) {
                const assistantToolCallMsg: ChatMessage = {
                  role: "assistant",
                  content: first.text,
                  tool_calls: first.toolCalls.map((c) => ({
                    id: c.id,
                    type: "function",
                    function: { name: c.name, arguments: c.args },
                  })),
                };
                // Add a small separator delta so client visually splits
                if (first.text) send("delta", { content: "\n\n" });
                const second = await streamCompletion([...baseMessages, assistantToolCallMsg, ...toolResults]);
                combinedText = (first.text ? first.text + "\n\n" : "") + second.text;
              }

              // Persist assistant message
              const toolCallsForDb = first.toolCalls.length
                ? first.toolCalls.map((c) => ({
                    id: c.id,
                    type: "function",
                    function: { name: c.name, arguments: c.args },
                  }))
                : null;
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

              // Link all agent_tasks to this assistant message
              if (assistantMsg && allTaskIds.length > 0) {
                await supabaseAdmin
                  .from("agent_tasks")
                  .update({ message_id: assistantMsg.id })
                  .in("id", allTaskIds);
                send("tasks_linked", { message_id: assistantMsg.id, task_ids: allTaskIds });
              }

              send("done", { ok: true, candidates_added: candidatesAddedTotal, job: jobCreatedRow });
            } catch (err) {
              console.error("chat stream error", err);
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
