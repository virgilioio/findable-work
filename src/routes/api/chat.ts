import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { runSourcingAgent, type TaskEvent } from "@/lib/sourcing/agent.server";
import { buildJobPostArtifact } from "@/lib/job-posts/builder.server";
import { getPrompt } from "@/lib/prompts/registry.server";
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
      "Surface structured clarifying questions to the user as pill-shaped multi/single-select options (with optional free-text). Use to gather info needed for great sourcing, or to broaden the brief after empty results.",
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

const draftJobPostsTool = {
  type: "function" as const,
  function: {
    name: "draft_job_posts",
    description:
      "Draft 3 ready-to-publish job post variants (Punchy, Mission-led, Concise), pre-select channels (LinkedIn + regional boards), and set a default schedule. Requires that a Job already exists in the conversation.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        tone_focus: { type: "string", description: "Optional one-line steer, e.g. 'lean into mission' or 'emphasize comp'." },
      },
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
      model: "openai/gpt-5-mini",
      stream: true,
      messages,
      tools: [createJobTool, sourceCandidatesTool, askClarifyingQuestionsTool, draftJobPostsTool, draftOutreachTool],
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
          { role: "system", content: await getPrompt("chat.main") },
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
              const MAX_ITERS = 5;
              const allTaskIds: string[] = [];
              let candidatesAddedTotal = 0;
              let jobCreatedRow: any = null;
              let preText = "";
              let postText = "";
              let toolsRanAny = false;
              let markerSent = false;
              let firstToolCalls: StreamedToolCall[] = [];
              const convo: ChatMessage[] = [...baseMessages];

              for (let iter = 0; iter < MAX_ITERS; iter++) {
                const pass = await streamCompletion(convo);
                if (iter === 0) firstToolCalls = pass.toolCalls;
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
                  // Emit a "Job description drafted" task card so the
                  // chat timeline has a clickable artifact for it.
                  const { data: jobTask } = await supabaseAdmin
                    .from("agent_tasks")
                    .insert({
                      user_id: userId,
                      conversation_id: conversationId,
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
                } else if (call.name === "ask_clarifying_questions") {
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
                  }
                  toolResults.push({
                    role: "tool",
                    tool_call_id: call.id ?? "",
                    name: "ask_clarifying_questions",
                    content: JSON.stringify({ ok: true, asked: normalized.length }),
                  });
                } else if (call.name === "draft_job_posts") {
                  const { data: jobRow } = await supabaseAdmin
                    .from("jobs")
                    .select("title,description,location,requirements,salary_min,salary_max,currency")
                    .eq("conversation_id", conversationId)
                    .maybeSingle();
                  if (!jobRow) {
                    toolResults.push({
                      role: "tool",
                      tool_call_id: call.id ?? "",
                      name: "draft_job_posts",
                      content: JSON.stringify({ ok: false, error: "No Job exists yet — call create_job first." }),
                    });
                  } else {
                    const artifact = buildJobPostArtifact(jobRow);
                    const { data: jpRow } = await supabaseAdmin
                      .from("job_posts")
                      .upsert(
                        {
                          conversation_id: conversationId,
                          user_id: userId,
                          variants: artifact.variants,
                          channels: artifact.channels,
                          schedule: artifact.schedule,
                          est_reach: artifact.est_reach,
                          status: "draft",
                        },
                        { onConflict: "conversation_id" },
                      )
                      .select("*")
                      .single();
                    send("job_posts", jpRow);
                    const { data: jpTask } = await supabaseAdmin
                      .from("agent_tasks")
                      .insert({
                        user_id: userId,
                        conversation_id: conversationId,
                        kind: "create_job_posts",
                        label: `${artifact.variants.length} job post variants drafted`,
                        status: "done",
                        summary: "Open Job Posts tab to review",
                        data: { job_post_id: jpRow?.id },
                        finished_at: new Date().toISOString(),
                      })
                      .select("*")
                      .single();
                    if (jpTask) {
                      allTaskIds.push(jpTask.id);
                      send("task", jpTask);
                    }
                    const selectedCount = artifact.channels.filter((c) => c.selected).length;
                    toolResults.push({
                      role: "tool",
                      tool_call_id: call.id ?? "",
                      name: "draft_job_posts",
                      content: JSON.stringify({
                        ok: true,
                        variants: artifact.variants.length,
                        channels_selected: selectedCount,
                        est_reach: artifact.est_reach,
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
                // Tools just executed in this pass. Emit the splitter marker
                // once so the UI can render the "after tasks" text below the
                // task cards rather than above them.
                toolsRanAny = true;
                if (!markerSent) {
                  send("delta", { content: AFTER_TASKS_MARKER });
                  markerSent = true;
                } else {
                  send("delta", { content: "\n\n" });
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
