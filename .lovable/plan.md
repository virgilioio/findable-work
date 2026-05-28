# Public homepage chat (guest mode) with inline sign-up

## Behavior

- `/` becomes a real landing chat (no redirect). Signed-in users hitting `/` still go to `/app`.
- Guest agent **can**: brainstorm the role, ask clarifying questions, draft and refine a Job (inline read-only preview card).
- Guest agent **cannot**: source candidates, draft job posts, schedule interviews.
- Sign-up triggers (any one):
  1. User asks to source / post / save → agent stops and emits `signup_required`.
  2. **Soft nudge: after every 3–4 user↔assistant exchanges**, the `AuthDialog` auto-opens. The conversation is NOT paused or deleted; the dialog is dismissible and the user can keep chatting.
  3. Hard cap: ~12 user turns → dialog opens non-dismissible.
- Sign-up happens in a modal dialog **over** the homepage — the chat stays visible behind it.
- On successful sign-up / log-in, the **same guest conversation is claimed** into the new account (conversation + messages + draft Job written), dialog closes, navigate to `/app/c/<id>` with full tool set unlocked.
- **Page refresh wipes the guest conversation.** State lives in `sessionStorage` (not `localStorage`), so a reload or tab close starts fresh.

## Technical plan

### 1. Homepage (`src/routes/index.tsx`)
- Drop the unconditional `redirect`. `beforeLoad` redirects to `/app` only when `context.auth.isAuthenticated`.
- Hero + composer; transitions into transcript styled like `app.c.$id.tsx` (assistant bubbles, markdown, clarify cards, inline job preview card).
- Guest state in **`sessionStorage`** under `findable:guest:v1`:
  `{ guestId: uuid, title, messages: [{role, content, tool_calls?}], draftJob?, signupRequired?: bool, exchangeCount: number, lastNudgeAt: number }`.
- On mount, if no session entry exists (e.g. after refresh), start fresh. No restore from localStorage.

### 2. Nudge cadence
- Increment `exchangeCount` on every completed assistant turn.
- Open `AuthDialog` (dismissible) when `exchangeCount` hits 3, then again at 7, 11, … (every 4 turns after the first nudge), unless the dialog was opened in the last 2 turns.
- Dialog dismiss does NOT block the chat. Hard `signupRequired` (sourcing intent or 12-turn cap) opens it non-dismissible.

### 3. Public chat endpoint (`src/routes/api/public/guest-chat.ts`)
- TSS server route, POST, **no auth**.
- Input (Zod, strict caps): `{ guestId: uuid, messages, draftJob? }`, max 30 messages × 8k chars.
- Per-IP + per-guestId rate limit (in-memory token bucket, ~20 req / 10 min). Hard 12-turn cap → `signupRequired: true`.
- Calls OpenAI with a **restricted system prompt** and a **restricted tool set**:
  - `ask_clarifying_questions` (reuse schema)
  - `create_job_draft` — returns draft to client, **does NOT touch DB**
  - `request_signup` — model calls when the user wants to source/post/save
- `source_candidates` / `draft_job_posts` are **not exposed** here (defense in depth).
- Response: `{ assistant, toolEvents, draftJob?, signupRequired? }`. No streaming v1.

### 4. Restricted system prompt
- Fork of authenticated `SYSTEM_PROMPT`:
  - "Guest preview mode"
  - May draft/refine the Job and ask clarifying questions
  - MUST call `request_signup` (then stop) the moment the user wants candidates, sourcing, posts, interviews, or to save the project
  - Always closes with: "Ready to find candidates? Create a free account to continue — I'll keep this conversation."

### 5. Guest UI
- Inline `JobPreviewCard` (read-only) above the latest assistant turn when `draftJob` exists, with a small "Sign up to edit & source" pill.
- Reuse `ClarifyCard`.
- "Save this chat" button in the header → opens `AuthDialog` proactively.

### 6. `AuthDialog` (`src/components/auth/auth-dialog.tsx`)
- Built on shadcn `Dialog`. Tabs: **Sign up** / **Log in**. Google button (existing Lovable broker) + email/password (reuses `/login` logic).
- Props: `open`, `onOpenChange`, `dismissible: boolean`, `reason: 'nudge' | 'sourcing' | 'cap' | 'manual'` (controls headline copy).
- Accepts `onAuthenticated(session)` → calls `claimGuestConversation` (§7), closes, navigates.
- For Google OAuth: set `sessionStorage['findable:claim-pending'] = '1'` before redirect; on `/` mount after the OAuth round-trip, detect the flag, run the claim, navigate.

### 7. Claim flow
- New `claimGuestConversation` server fn in `src/lib/conversations.functions.ts`:
  - Input: `{ guestId, title, messages: [{role, content, tool_calls?}], draftJob? }`
  - Creates `conversations` row owned by `auth.uid()`, bulk-inserts `messages` preserving order + `tool_calls`, upserts `jobs` row if `draftJob` present. Returns `{ conversationId }`.
- On success: clear `findable:guest:v1` + `findable:claim-pending`, `navigate({ to: "/app/c/$id", params: { id } })`.
- First authenticated turn in `/app/c/<id>` sees the full transcript + Job; agent can immediately call `source_candidates`.

### 8. Safety / abuse
- Public endpoint validates length, message count, rate-limits per IP + guestId.
- Endpoint never reads or writes user-owned DB rows.
- `source_candidates` and `draft_job_posts` remain authenticated-only — no change.

## Out of scope (v1)
- Persisting guest chat across refresh (intentional — refresh wipes)
- Cross-device guest sessions
- Streaming responses on the public endpoint
- Password reset inside the dialog (link out to existing flow)
- Any UI for posts / candidates while guest
