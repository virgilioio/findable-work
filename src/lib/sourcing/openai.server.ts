// OpenAI client helper. Server-only.

type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string };

export type OpenAIChatOpts = {
  model?: string;
  messages: ChatMessage[];
  tools?: unknown[];
  tool_choice?: unknown;
  temperature?: number;
  response_format?: { type: "json_object" } | { type: "text" };
};

export async function openaiChat(opts: OpenAIChatOpts): Promise<any> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? "gpt-4o-mini",
      messages: opts.messages,
      temperature: opts.temperature ?? 0.2,
      ...(opts.tools ? { tools: opts.tools, tool_choice: opts.tool_choice } : {}),
      ...(opts.response_format ? { response_format: opts.response_format } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI error [${res.status}]: ${body.slice(0, 500)}`);
  }
  return res.json();
}

// Extract an embedded JSON object from free text (used in refine).
export function extractJsonBlock(text: string): Record<string, unknown> | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : text.match(/\{[\s\S]*\}/)?.[0];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}