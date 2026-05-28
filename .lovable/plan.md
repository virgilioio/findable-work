# Fix sourcing + redesign chat to a clickable agent timeline

Two problems to solve in one pass:

1. **Sourcing is broken**: PDL credits get burned, but 0 candidates land in the Candidates tab.
2. **Chat looks crowded** vs. the airy "magnifying-glass timeline" in your reference, and task cards aren't clickable.

---

## Part 1 — Sourcing: collect from BOTH providers + hide source names

### Root cause of "0 candidates"

In `src/lib/sourcing/agent.server.ts`, the collect step only enriches **Apollo** results:

```text
const apolloTop = sorted.filter((c) => c.source === "apollo").slice(0, limit);
const apolloIds = apolloTop.map((c) => c.external_id);
// ...enrichApolloProfiles(toEnrich)
```

If Apollo returns 0 (key missing, 401, rate-limited) but PDL returns 80, we burn PDL credits during search, then insert nothing because PDL rows are filtered out. That's exactly what you saw.

### Fixes (in `agent.server.ts`)

- **Insert PDL candidates directly** from the search payload (no enrichment endpoint — PDL `person/search` already returns full profile JSON we can map to `candidates`). Add a `pdl_id` column (migration below) and dedupe against it.
- Keep Apollo enrichment path as-is for Apollo rows.
- Merge top-N across both sources by `keyword_score` so we always fill the quota even when one provider is down.
- If both providers return 0 or both error, mark the `collect` task `failed` with a clean message ("No matches found — try broadening the brief"). Never silently return 0.

### Hide provider names from users

Speak in product terms, not vendor names. Affects:

- `agent.server.ts` task labels: `"Searching Apollo + PDL"` → `"Searching candidate pool"`; summary `"12 Apollo · 80 PDL · 90 after dedupe"` → `"90 matches found"`.
- `source` / `display_source` column values stored on `candidates`: `"Apollo"` / `"pdl"` → `"Sourced"` (or keep raw provider in a private `provider` field, surface `"Sourced"` in UI).
- System prompt in `src/routes/api/chat.ts`: drop "Apollo + PDL" → `"search our candidate pool"`.
- Tool description for `source_candidates`: same wording change.
- Any toast / error strings.

### Migration

```sql
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS pdl_id text;
CREATE INDEX IF NOT EXISTS candidates_pdl_id_idx ON public.candidates(user_id, pdl_id);
```

---

## Part 2 — Chat redesign: timeline with clickable task cards

### What changes visually

Match the reference exactly:

- **No bubbles** for assistant messages. Assistant text renders as plain prose on the page background, left-aligned, with a small magnifying-glass glyph in a left gutter (~32px). User messages stay as the soft grey rounded bubble, right-aligned.
- **Each agent step is its own row** in the same transcript flow (not nested inside the message), with the same gutter icon. Steps appear in chronological order interleaved with prose.
- Generous vertical rhythm (`space-y-6`), max width ~`720px`, no card borders on assistant prose.
- The thinking dots become a single faint pulsing magnifying glass while a step is running.

### Task cards become artifact links

A completed task is a card with: icon · title (e.g. "Job description drafted") · subtitle ("Open Job tab to review") · right-side arrow. Clicking it switches the workspace tab.

Mapping:

| Task kind        | Card title                  | onClick action              |
| ---------------- | --------------------------- | --------------------------- |
| `create_job`     | "Job description drafted"   | switch tab → `job`          |
| `collect` (done) | "N candidates sourced"      | switch tab → `candidates`   |
| `normalize`      | "Brief normalized"          | no-op (or expand inline)    |
| `research`       | "Researched titles & co."   | no-op                       |
| `search`         | "Search complete"           | no-op                       |

Running / failed states keep the existing shimmer / red border but are not clickable.

### Wiring

- `TaskCard` gains an `onOpenTab?: (tab: "job" | "candidates") => void` prop. Pure presentation, parent decides routing.
- `ChatPanel` already receives `messages`, `persistedTasks`, `liveTasks`. It flattens both into a single ordered timeline of `{kind: "message" | "task", ...}` sorted by `created_at`, then renders rows. Drops the current "tasks nested under message" grouping.
- The page passes `setTab` down so cards can switch tabs.
- Add a `create_job` task emission in `api/chat.ts` so the "Job description drafted" card actually exists in the timeline (today only the sourcing pipeline emits tasks; `create_job` does not). One row inserted into `agent_tasks` with `kind='create_job'`, `status='done'`, label `"Job description drafted"`.

### Out of scope (not changing)

- No changes to the Job / Candidates panels themselves.
- No changes to auth, conversations list, or composer behaviour.
- No model/provider swap (still using the gateway already wired).
- No new icons beyond what `findable-icons.tsx` already exports.

---

## Files touched

- `supabase/migrations/<new>.sql` — add `pdl_id` column + index.
- `src/lib/sourcing/agent.server.ts` — insert PDL directly, merge providers in collect, rename labels.
- `src/lib/sourcing/pdl.server.ts` — return the extra fields we need to map into `candidates` (email/phone/location/experience if available in `person/search`).
- `src/routes/api/chat.ts` — system prompt wording; emit `create_job` task into `agent_tasks` + SSE.
- `src/components/chat/task-card.tsx` — clickable variant, refined typography, no bubble.
- `src/routes/app.c.$id.tsx` — flatten messages+tasks into one timeline, render gutter-icon rows, pass `setTab` to cards, restyle user/assistant rows.
