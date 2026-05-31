// Server-only. Single source of truth for OpenAI auth + model selection.
// No string fallbacks — missing secrets fail loudly so we never silently
// fall back to some hardcoded model.

export function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return key;
}

export function getOpenAIModel(): string {
  const model = process.env.OPENAI_MODEL;
  if (!model) {
    throw new Error("OPENAI_MODEL is not configured");
  }
  return model;
}

// Shared user-facing message for OpenAI 429s. Surfaced by every AI call
// site so the UX is identical across chat, guest chat, screening, and
// sourcing.
export const OPENAI_RATE_LIMIT_MESSAGE =
  "OpenAI is rate-limiting us right now. Please try again in a moment.";

export const OPENAI_CHAT_COMPLETIONS_URL =
  "https://api.openai.com/v1/chat/completions";