import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().min(1).max(20000),
});

const SYSTEM_PROMPT = `You are a senior recruiting AI agent embedded in a recruiting workspace.

Your job is to help the user run a recruiting project end-to-end. You progressively build the project by creating workspace artifacts: a Job, a Pipeline, Job Posts, etc.

Right now, only the "create_job" tool is available. Other artifacts (pipeline, posts) will come later.

Conversational style:
- Ask focused, recruiter-grade scoping questions: role title, seniority, must-have skills, nice-to-haves, location/remote, employment type, salary band, hiring goals.
- Don't dump everything at once. Two or three pointed questions per turn.
- As soon as you have enough to draft a Job (at minimum: title and a basic description), call the create_job tool. Don't wait for perfection — the user can edit the Job tab afterward.
- After creating the job, briefly confirm what you drafted and ask what to refine.

Markdown formatting is encouraged.`;

type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: unknown;
};

const createJobTool = {
  type: "function" as const,
  function: {
    name: "create_job",
    description:
      "Create or update the Job artifact for this conversation. Call this once you have enough information to draft a job.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        description: { type: "string", description: "Markdown-formatted job description." },
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

async function getUserFromRequest(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
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

        // verify conversation belongs to user
        const { data: conv } = await supabaseAdmin
          .from("conversations")
          .select("id,user_id,title")
          .eq("id", conversationId)
          .maybeSingle();
        if (!conv || conv.user_id !== userId) {
          return new Response("Not found", { status: 404 });
        }

        // persist user message
        await supabaseAdmin.from("messages").insert({
          conversation_id: conversationId,
          user_id: userId,
          role: "user",
          content: message,
        });

        // auto-title from first user message
        if (conv.title === "New conversation") {
          const newTitle = message.slice(0, 60);
          await supabaseAdmin
            .from("conversations")
            .update({ title: newTitle })
            .eq("id", conversationId);
        }

        // load full message history
        const { data: history } = await supabaseAdmin
          .from("messages")
          .select("role,content,tool_calls")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

        const messages: ChatMessage[] = [
          { role: "system", content: SYSTEM_PROMPT },
          ...(history ?? [])
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content || "",
            })),
        ];

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            stream: true,
            messages,
            tools: [createJobTool],
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          const status = upstream.status === 429 || upstream.status === 402 ? upstream.status : 500;
          const errMsg =
            upstream.status === 429
              ? "Rate limit reached. Try again in a moment."
              : upstream.status === 402
              ? "AI credits exhausted. Add credits in Settings → Workspace → Usage."
              : `AI gateway error (${upstream.status}). ${text.slice(0, 200)}`;
          return new Response(JSON.stringify({ error: errMsg }), {
            status,
            headers: { "content-type": "application/json" },
          });
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const reader = upstream.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let assistantText = "";
            // toolCalls indexed by gateway-reported index
            const toolCalls: Record<number, { id?: string; name?: string; args: string }> = {};

            const send = (event: string, data: unknown) => {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            try {
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

              // Process tool calls (only create_job is supported)
              const calls = Object.values(toolCalls);
              const toolCallsForDb = calls.length
                ? calls.map((c) => ({
                    id: c.id,
                    type: "function",
                    function: { name: c.name, arguments: c.args },
                  }))
                : null;

              // persist assistant message
              await supabaseAdmin.from("messages").insert({
                conversation_id: conversationId,
                user_id: userId,
                role: "assistant",
                content: assistantText,
                tool_calls: toolCallsForDb,
              });

              for (const call of calls) {
                if (call.name !== "create_job") continue;
                let args: any = {};
                try {
                  args = JSON.parse(call.args || "{}");
                } catch {}
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
                send("job", jobRow);
              }

              send("done", { ok: true });
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