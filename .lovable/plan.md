## Plan: Switch to OpenAI Model + Fix Language Drift

### What we change
1. **Model swap** — in `src/routes/api/chat.ts`, change the Lovable AI Gateway model from `google/gemini-3-flash-preview` to `openai/gpt-5-mini` (best cost/quality balance for this agentic workload). One-line change inside the `callGateway` function.
2. **Language guardrail** — append a high-priority rule to the `SYSTEM_PROMPT` instructing the assistant to always reply in the same language as the user's input, defaulting to English when the input is ambiguous or very short (e.g. "ok", "go").

### Outcome
- Responses will come from OpenAI instead of Gemini, leveraging the existing Lovable AI Gateway (no extra keys needed).
- Short/ambiguous prompts will no longer drift into Chinese or Japanese.
