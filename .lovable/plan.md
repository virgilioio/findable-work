
# Why the chat goes silent after clarify answers

After you submit the clarify card, the server runs the tools (sourcing, etc.) and the task cards arrive — but nothing lands in the bubble. That's a regression from the reasoning/leak-routing layer we just added, plus a missing "always close the turn with prose" guard.

Three concrete causes, all in `src/routes/api/chat.ts`:

1. **Leak detector swallows the real reply.** `looksLikeLeakedReasoning` is fired on the first ~80 chars of each pass. When the second pass (after tools) starts with a short Spanish wrap-up like "Listo — añadí 20 candidatos. ¿Quieres que…", any 2 matches against its keyword list (or a `(` opener) flip `leakMode` to `"leak"` and route the entire bubble text into the reasoning channel. The user sees task cards + a blank message.
2. **`leak` mode never recovers, and the buffered tail is never flushed.** Once in `"leak"`, recovery requires a `)\n` or `\n\n<capital letter>` break. Short single-sentence replies don't hit that, so `assistantText` stays `""`. The end-of-stream flush at line 587 only handles `leakMode === "unknown"` — not `"leak"`. So even legitimately-buffered text is lost.
3. **No "must end with a prose turn" guard.** Even without the leak bug, the model sometimes emits only `tool_calls` and an empty `content` on the closing pass. We persist `combinedText = ""` and the UI renders a card-only message with no closing line.

# Plan (server-only, surgical)

All edits live in `src/routes/api/chat.ts`. No UI changes, no prompt changes, no migration.

## 1. Make the leak detector first-pass-only and much narrower

- Only run `looksLikeLeakedReasoning` on the very first pass of the turn (iter === 0) AND only before any tool call has executed. Post-tool passes are short summaries — they should never be routed to reasoning.
- Raise the trigger threshold from `2 hits` → `3 hits`, and require the head to start with `(` or with a clearly-internal English phrase. Spanish text never matches.
- When in doubt, default to `"answer"` (fail-open), not `"leak"`.

## 2. Always flush buffered text at end of stream, in every leak mode

Replace the end-of-stream flush so that whatever sits in `leakedSoFar` is appended to `assistantText` and sent as a `delta` unless we are 100% sure it was reasoning. This guarantees short replies survive.

## 3. Guarantee a closing prose turn

After the iteration loop ends, if `toolsRanAny === true` AND `postText.trim() === ""`, run one more **forced-no-tools** completion pass using `convo` (which already contains the assistant tool calls + tool results). Stream its text as `delta` after the marker and append to `postText`. This is the same pattern OpenAI cookbook uses to close a tool loop. Cap at 1 extra pass so we never loop.

Localize the fallback: if even that pass returns empty (rare), emit a one-line acknowledgement in the user's language (detect from the latest user message — Spanish if it contains `ñ`/accents or common stopwords, else English): `"Listo — revisa los resultados arriba."` / `"Done — check the results above."` Persist it so reload shows the same line.

## 4. Small correctness fix

When `text_replace` fires (leaked-clarify hoist), we currently send the cleaned text but never update `pass.text` before it gets appended to `preText`/`postText`. That's already handled (`pass.text = leak.cleaned`), so no change — flagging only to confirm it stays correct after the above edits.

# Files touched

- `src/routes/api/chat.ts` — narrow the leak detector, fix the end-of-stream flush, add the "force a closing prose pass" guard.

# Out of scope

- UI changes to the thinking ticker or clarify card.
- Prompt edits (no new migration).
- Any change to how tools execute or how task cards stream.
