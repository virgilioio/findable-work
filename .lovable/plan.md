
## Goal

Add a floating "Questions about this role?" pill to the public job page (`/jobs/$slug`) that opens a clean "Hiring assistant" chat panel. The assistant answers candidate questions about the role, process, and their own profile — grounded strictly in the public job data + whatever the candidate has typed into the application form so far.

## Scope

Single page: `src/routes/jobs/$slug.tsx`. New public server route for the chat. New system prompt entry. No DB changes.

## Files

1. **New: `src/routes/api/public/jobs/$slug/chat.ts`** — TanStack server route, public (no auth).
   - `POST` handler validates body with Zod:
     - `slug: string`
     - `messages: [{role: 'user'|'assistant', content: string (≤2000)}]` (max 20)
     - `formContext?: { name?, email?, linkedin?, location?, resume_filename?, answers?: Record<string, string|string[]> }` — only non-sensitive snippets the candidate already typed; trimmed/length-capped server-side.
   - Loads job via `supabaseAdmin` using `SELECT` (only public fields: title, company, location, employment_type, salary_min/max, currency, summary, description, responsibilities, must_have, nice_to_have, requirements, screening) where `published = true`. 404 if not.
   - Per-IP + per-slug in-memory rate limit (20 req / 10 min), matching guest-chat style.
   - Builds grounding context (role, process if available, must-have, nice-to-have, screening questions + candidate-provided answers).
   - Loads system prompt via `getPrompt("jobs.candidate_assistant")` (new prompt, see below).
   - Calls OpenAI via `OPENAI_CHAT_COMPLETIONS_URL` + `getOpenAIModel()` / `getOpenAIKey()` (mirrors `screening.server.ts` pattern). No tools — plain chat completion.
   - On any failure (missing keys, 429, 5xx, exception), returns a scripted fallback answer keyed off the latest user message (process / timeline / remote / feedback / default) so the chat never dead-ends. Logs `[jobs-chat] FALLBACK` with reason.
   - Returns `{ assistant: string }`.

2. **New: `src/components/jobs/hiring-assistant.tsx`** — client component.
   - Floating pill bottom-right: "✨ Questions about this role?" → opens panel.
   - Panel: header ("Hiring assistant" + green dot "Answers about this role"), close X, scrollable message list (Markdown via `@/components/ui/markdown`), 4 suggested-question chips shown only on first open (Interview process / Total timeline / Remote vs in-person / Feedback on my profile), input + send button.
   - Footer microcopy: "AI assistant · answers may be approximate".
   - Replies in the candidate's language — handled by the system prompt ("reply in the same language as the user's last message").
   - POSTs to `/api/public/jobs/{slug}/chat` with messages + `formContext` snapshot.
   - On non-2xx or network error, surfaces the inline message returned by the route (which is the scripted fallback for known intents).
   - Styled with existing semantic tokens (`bg-bg-elev`, `border-border`, `text-text-mute`, etc.) to match the existing public page aesthetic. Mobile: panel becomes near-fullscreen.

3. **Edit: `src/routes/_authenticated/...` — none.** This is candidate-facing only.

4. **Edit: `src/routes/jobs/$slug.tsx`**
   - Lift `form` state high enough (already top-level in `ApplyPage`) and pass a slim `formContext` (name, email, linkedin, location, resume_filename, answers) + `job` into `<HiringAssistant />` mounted at the bottom of the page (outside the grid so it floats over everything).
   - Render only when `!submitted`.

5. **New prompt row: `jobs.candidate_assistant`** — inserted via a new timestamped migration in `supabase/migrations/`.
   - System prompt rules (matches your spec):
     - Warm, concise, 2–4 short sentences or tight bullets.
     - Answer ONLY from provided CONTEXT (role, process, requirements, candidate's form data).
     - If asked something not in context (exact comp beyond what's posted, visa specifics, interviewer names), say you don't have that detail and suggest they ask in the intro call.
     - Decline to discuss compensation specifics beyond what's posted; never make outcome promises ("you'll get the job", "you're a great fit guaranteed").
     - Steer off-topic questions back to the role.
     - For "feedback on my profile": compare candidate's typed answers + resume filename + linkedin against must-have / nice-to-have. Kind + constructive. Never a yes/no verdict.
     - Reply in the same language as the user's last message (English / Spanish).
     - Uses `{{var:grounding}}` placeholder filled by the server route.

## Technical notes

- **AI provider:** reuses the project's existing OpenAI server helpers (`@/lib/ai/openai-model.server`) so it works without new secrets and matches `generateScreeningQuestions` style.
- **Security:** public route — slug-scoped, only published jobs, no PII echoed back, no DB writes, formContext fields length-capped and trimmed, hard cap of 20 messages and ~2KB per message.
- **Fallback dispatcher** (server-side, when model unreachable): keyword match on user's last message → returns one of:
  - process → bulleted steps from `job` if present, else generic 3-step ("Intro call · Hiring manager interview · Practical exercise").
  - timeline → "Usually 1–3 weeks end to end."
  - remote/in-person → derived from `job.location` / `employment_type`.
  - feedback → "I can't reach the assistant right now — try again in a moment, or share your background in your application and the team will review it."
  - default → "I can't reach the assistant right now. Please try again in a moment."
- **No streaming** in v1 — single request/response keeps the route simple and matches the rest of the public surface. Easy upgrade later.

## Out of scope

- Persisting candidate chat transcripts.
- Showing the assistant to recruiters in the workspace view.
- Compensation negotiation, visa/legal advice, outcome promises.
- Streaming responses.
- The recruiter-side workspace UI on `app.c.$id.tsx` (untouched).
