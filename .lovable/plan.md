# Show reasoning as a "Thinking…" ticker, keep it out of the reply

## The insight you nailed

You're right — that text *was* the model's reasoning. The bug isn't that it reasoned, it's that the reasoning landed in the user-facing reply. Other LLMs (ChatGPT, Claude, Gemini) do exactly what you're describing: stream a separate "thinking" / "reasoning" channel that the UI shows as a collapsible, fading ticker above the answer, then collapse it when the final response starts.

We can do the same thing — and our streaming pipeline is already 90% set up for it.

## How other LLMs do it (and what we get from gpt-5-mini)

OpenAI's reasoning-capable models (gpt-5 family, o-series) return two distinct streams in the chat-completions delta:
- `delta.content` → final answer tokens
- `delta.reasoning` (a.k.a. `reasoning_content` on some gateways) → chain-of-thought tokens

The Lovable AI Gateway proxies these through. So the model is already separating them; we just aren't routing `reasoning` anywhere — and when the model gets confused (long messy history), it sometimes dumps reasoning into `content` as a fallback. Capturing the proper `reasoning` channel and rendering it nicely solves both problems: it gives the model a "real" place to put thoughts, and gives us a UI surface to show them.

## Behavior

While streaming a turn:
- A pill appears above the in-progress assistant bubble: **`✦ Thinking`** with three animated dots.
- Below it: a single line of fading text that auto-rotates through the latest reasoning fragments (last sentence, fades to next as new chunks arrive). Subtle, low-contrast, slightly smaller than chat text.
- The instant the first real `content` token arrives, the pill shrinks to a small collapsed chip ("Thought for 4s • show reasoning"); clicking it expands the full reasoning trace below the answer (scrollable, dimmed).
- If the turn ran tools, the chip sits alongside the task cards in the same gap.

Final persisted message stores the answer only — reasoning is **not** saved to `messages.content`. (Optional follow-up: persist to a `reasoning` column if you want it visible on reload — call out below.)

## Implementation

### Server: `src/routes/api/chat.ts`

1. In `streamCompletion`, capture `delta.reasoning` (and the alt key `reasoning_content`) alongside `delta.content`.
2. Forward each reasoning chunk as a new SSE event: `event: reasoning` with `{ content: "…" }`.
3. **Safety net for leaks into `content`:** before forwarding `delta.content`, run a lightweight `looksLikeReasoning()` check on the accumulated text in the first ~200 chars (regex: starts with "(Mode [A-D]", "Let me…", "The user…", "We're in…", "Conversation shows…", or a `(` parenthetical containing 2+ trigger phrases). If it matches, redirect that chunk to the `reasoning` channel instead of `delta` — and once it switches, keep redirecting until we see a clear answer-shaped break (sentence-ending punctuation followed by a non-reasoning sentence). This is the "contain, don't force" part.
4. Strip any final leaked-reasoning prefix from `combinedText` before persisting to `messages`.

### Client: `src/routes/_authenticated/app.c.$id.tsx`

1. Add `reasoning` state alongside `streaming`. Append on `event: reasoning`.
2. New `<ThinkingTicker>` component:
   - Header pill: `✦ Thinking` with the existing `thinking-dot` animation.
   - Body: the last ~80 chars of `reasoning`, key'd on a "tick" derived from the latest sentence boundary so the line fades/slides up when it changes (Tailwind `transition-opacity duration-300` + a tiny translate-y).
   - When the answer starts streaming, animate the ticker into a collapsed chip: `✦ Thought for {Ns} · show reasoning ▾`. Click toggles a `<details>`-style panel with the full reasoning text, monospace-ish, dimmed.
3. Render it above the streaming bubble while `streaming === ""`, then in the bubble's header once answer tokens arrive, then attached to the persisted message as a non-persistent chip that disappears on the next user turn (it's session-only unless we persist it).
4. Once the stream ends, the chip stays attached to that turn until the user sends the next message, then disappears (matches Claude's behavior).

### Styling

Use existing tokens: `text-text-faint` for ticker text, a soft `bg-muted/40` rounded pill for the header, the existing `thinking-dot` keyframes. No new colors. The fade between fragments is a CSS opacity transition triggered by a React `key` change on sentence boundary.

## Prompt change

Tiny nudge in `chat.main` (new migration, bump version): one line letting the model know it has a dedicated reasoning channel.

> If you need to think, plan, classify the turn, or recap state, do that in your reasoning channel — never in the visible reply. The UI shows reasoning separately; the user sees only what you write to them.

No "Mode A/B/C" rewriting needed. Combined with the runtime redirect, this is enough.

## Optional follow-ups (call out if you want them now)

- **Persist reasoning per message** (new `messages.reasoning text` column) so the collapsed chip survives reload. Without this, the chip vanishes when the user navigates away and comes back. Easy to add but a schema change.
- **Show token/seconds count** in the chip (`Thought for 4.2s`). Trivial — we already know stream start time.
- **Localize the chip** ("Pensando…" when the user writes Spanish). Cheap; detect from last user message.

## Files touched

- `src/routes/api/chat.ts` — capture `delta.reasoning`, emit `event: reasoning`, runtime redirect for leaked CoT in `delta.content`.
- `src/routes/_authenticated/app.c.$id.tsx` — `reasoning` state, `<ThinkingTicker>`, render hooks in the streaming bubble.
- `src/components/chat/ThinkingTicker.tsx` (new) — the pill + ticker + collapsible panel.
- `src/styles.css` — small additions: fade-in keyframe, ticker line animation (reuse existing `thinking-dot`).
- `supabase/migrations/<new>.sql` — append the "use the reasoning channel" line to `chat.main`, bump version.
