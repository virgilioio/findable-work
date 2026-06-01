## Goal

Restore the intended guest experience: a real back-and-forth with findable that produces a drafted Job (the teaser), with signup only nudged gently and only forced when the user explicitly asks for a gated action (sourcing, posting, scheduling, saving).

## Changes

### 1. `src/routes/index.tsx` — stop the early forced signup

- Remove the auto-open dialog at `exchange === 3`.
- Soften the recurring nudge: only open the dialog (dismissible) once the user has had a meaningful preview — i.e. when `state.draftJob` exists AND `exchangeCount >= 6`, and never re-open it more than once per session unless the user clicks "Save this chat" / "Sign in".
- Stop making `signupRequired` sticky. Compute `signupRequired` strictly from the latest server response, so a stray earlier signal doesn't permanently lock the composer behind a modal.
- When `requireSignup` fires, still open the dialog but make it dismissible so the user can keep brainstorming. We already gate writes server-side, so dismissibility is safe.
- Keep the existing inline banner ("Sourcing, posts, and interviews are part of the free account · Create an account") — that's the right, non-blocking nudge.

### 2. `src/routes/api/public/guest-chat.ts` — keep draft visible even when the model misbehaves

- No behavior change to the tool set, but: if `nextDraft` ends up empty after the loop AND the user has sent ≥ 2 turns, do NOT downgrade the response. We don't fabricate a draft; we just make sure we always return `draftJob: nextDraft` (already true) and never set `signupRequired` unless the model called `request_signup` (also already true — the `|| next.signupRequired` lives on the client; removing it there fixes the stickiness).

### 3. `guest.main` prompt — proactive draft + less trigger-happy signup

Add a new migration that updates `prompts.guest.main` content:
- Require: "As soon as you have a title and one or two sentences of context, call `create_job_draft` to show the user an inline draft. Refine it on later turns." This makes the teaser appear reliably.
- Tighten `request_signup` guidance: only call it when the user *explicitly* asks to source candidates, publish a post, schedule interviews, or save the project. Hypothetical questions ("what would the post look like?", "what would you search for?") stay in brainstorming mode — answer in prose, do NOT call `request_signup`.
- Keep the existing "end with a next-step proposal" rule.

(Prompts live in DB via the registry; updating via migration is the established pattern in this repo — same approach as `20260528230627_…sql`.)

### 4. Quiet fix for the runtime error in passing

The current console shows `column profiles.display_name does not exist` from `getProfile`. Make `getProfile` resilient: select only existing columns, and fall back gracefully when `display_name` is missing, so the sidebar query stops 500-ing. (Unrelated to the guest flow but currently spamming the preview.)

## Out of scope

- No changes to `HARD_TURN_CAP` (12) or rate limits — those are correct safety nets.
- No new tools for guest mode. Sourcing/posting/scheduling remain account-only by design.
- No DB schema changes.

## Files touched

- `src/routes/index.tsx` (client nudge logic)
- `src/lib/profile.functions.ts` (defensive select)
- `supabase/migrations/<new>_guest_prompt_proactive_draft.sql` (update `guest.main` prompt)
