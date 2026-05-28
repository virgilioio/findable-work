# What's actually wrong right now

From `agent_tasks` for this conversation:

- **PDL** → `402 — account out of search credits`.
- **Apollo** → 0 results, no error. Query was over-constrained AND the location string was in the wrong shape ("Mexico City, Mexico" with no country-code expansion path, no city-alias).
- **Research step hallucinated** `researched_companies: ["Mexico City"]` (a location masquerading as a company), which then got AND-ed into the search.
- **Job** never drafted — the model jumped straight to `source_candidates`.

We need three things: (1) ask before sourcing when info is thin (Claude-style structured card), (2) port the proven GoGioATS Apollo guardrails, (3) add the progressive relaxation that GoGioATS itself admits it's missing.

# Plan

## 1. Claude-style clarifying-question card (pills + free text)

### New tool

`ask_clarifying_questions` in `src/routes/api/chat.ts`:

```ts
ask_clarifying_questions({
  reason: string,                  // "Need a few details before I source"
  questions: Array<{
    id: string,                    // "seniority" | "vertical" | …
    label: string,
    type: "single" | "multi" | "text",
    options?: string[],            // pill labels
    placeholder?: string,
    allowOther?: boolean
  }>
})
```

Server-side handler: persists a row in `agent_tasks` with `kind: "clarify"`, payload in `data`, and emits SSE `task`.

### Chat rendering

New `src/components/chat/clarify-card.tsx`:

- Header: magnifying-glass + `reason`.
- One block per question: label, then pills (rounded-full, semantic-token borders) for single/multi, or `Input`/`Textarea` for text.
- `allowOther`: extra "Other…" pill that reveals an inline text input.
- "Send answers" button disabled until each question has at least one answer.
- On submit: format as markdown (`**Seniority:** Senior\n**Vertical:** Fintech, B2B SaaS\n…`) and POST through the existing chat send path. Card collapses to read-only summary.

`task-card.tsx`: when `kind === "clarify"`, render `<ClarifyCard />` instead of the standard pill.

### Gate rules in `SYSTEM_PROMPT`

Before `source_candidates`, the agent must have:
1. Specific job title
2. Location (city+country, or "remote+region")
3. Seniority (entry/mid/senior/manager/director/vp)
4. ≥1 of: vertical, must-have skill, target companies, product sold

Rules:
- Missing any of 1-3 → call `ask_clarifying_questions`, stop.
- 1-3 present, 4 missing → call `create_job` first, then `ask_clarifying_questions`.
- After failed/empty search → call `ask_clarifying_questions` with **broadening** suggestions (e.g. "Open to LATAM-remote?", "Consider SDR-to-AE candidates?", "Drop seniority filter?"). Never silently retry the same query.

Tighten `source_candidates` description: *"Only call after `create_job` has been called this conversation AND the checklist is satisfied."*

## 2. Port GoGioATS Apollo guardrails into `src/lib/sourcing/`

Bring over the proven patterns from `aba41743-9dfe-4b0e-88f2-0c24aeb910c4` (GoGioATS):

### `budget.ts` additions

- **Country-code / state expansion maps** (subset of GoGioATS): `COUNTRY_CODE_TO_NAME` and `US_STATE_ABBR_TO_NAME`, plus a reverse `COUNTRY_NAME_TO_CODE` for "Mexico" → `MX`.
- **City alias map**: `{ "cdmx": "mexico city", "ciudad de méxico": "mexico city", "df": "mexico city", "nyc": "new york", "sf": "san francisco", … }`. Small, hand-curated list.
- `normalizeLocationForApollo(loc)` returning `string[]` (city-level + country-level fallback in the same array).
- `deduplicateKeywords(keywords, titles)` — drop keywords whose words are all covered by title tokens (GoGioATS verbatim).
- `dropLocationLikeCompanies(companies, locations)` — strip "Mexico City", "United States", etc. from `researched_companies` by checking against the location tokens, country names, and state names. Fixes the hallucinated "Mexico City" company we saw today.
- `SENIORITY_MAPPING` — verbatim from GoGioATS (junior→entry, mid→senior, executive→c_suite, …), drop anything that doesn't map cleanly.

### `apollo.server.ts` rewrite of `searchApollo`

- **Use URL params** (`URLSearchParams`) instead of JSON body, matching Apollo's `api_search` contract that GoGioATS uses (avoids the occasional 400 on body shape).
- **Mutual exclusion**: never send `q_organization_name` AND keyword-like filters together — company list wins. Today we don't send `q_keywords`, but enforce the rule.
- **Keywords stay local-only**: drop `q_keywords` entirely; score post-hoc with `scoreKeywordsLocally` (already exists). Apply `deduplicateKeywords` first.
- **Drop industries** silently (Apollo needs numeric tag IDs).
- **Locations**: expand each via `normalizeLocationForApollo` → flatten to `person_locations[]`.
- **Companies**: filter via `dropLocationLikeCompanies` before send.

### **Progressive relaxation ladder** (the gap GoGioATS admits)

`searchApolloWithFallback(criteria)` tries:
1. Full query.
2. Drop `person_seniorities`.
3. Drop `q_organization_name`.
4. Country-only locations (drop city).
5. Title-only (drop locations).

Stops at the first attempt with ≥1 candidate. Records `task.data.broadened_to = N` and `task.data.broadening_steps = ["dropped_seniority", "dropped_companies"]` so the search task summary can read **"X matches found (broadened search)"** and the post-failure clarify card knows which dimensions were already relaxed.

## 3. PDL improvements + graceful degrade

In `pdl.server.ts`:
- Use `term` filters for `location_country`, `location_locality`, `job_title_levels`; keep `match` for free-text `job_title`.
- Map our seniority set → PDL `job_title_levels` enum (`cxo, director, entry, manager, owner, partner, senior, training, unpaid, vp`).
- Split "Mexico City, Mexico" → `location_locality: "mexico city"` + `location_country: "mexico"`.
- Detect 402 → throw typed `PdlQuotaError`. In `agent.server.ts`, set `task.data.pool_limited = true` and continue Apollo-only without throwing.

## 4. Friendlier failure messaging

In `agent.server.ts`, search-task summaries (never name vendors):
- Both empty + quota → **"Candidate pool partially limited — try broadening the brief"**, then agent immediately follows with `ask_clarifying_questions`.
- Apollo broadened → **"X matches found (broadened search)"**.
- Normal → **"X matches found"**.

## 5. Files

- `src/lib/sourcing/budget.ts` — country/state/alias maps, `normalizeLocationForApollo` (array), `deduplicateKeywords`, `dropLocationLikeCompanies`, stricter `SENIORITY_MAPPING`, PDL helpers.
- `src/lib/sourcing/apollo.server.ts` — URLSearchParams build, mutual exclusion, `searchApolloWithFallback` ladder.
- `src/lib/sourcing/pdl.server.ts` — `term` filters, `job_title_levels`, typed `PdlQuotaError`.
- `src/lib/sourcing/agent.server.ts` — call `searchApolloWithFallback`, `pool_limited` / `broadened_to` flags, friendlier summaries, never throw on PDL quota.
- `src/routes/api/chat.ts` — `ask_clarifying_questions` tool + system-prompt gate + post-failure follow-up.
- `src/components/chat/clarify-card.tsx` — new component.
- `src/components/chat/task-card.tsx` — render `ClarifyCard` for `kind: "clarify"`.
- `src/routes/app.c.$id.tsx` — pass `sendMessage(text)` callback through.

## 6. Out of scope

- Topping up / rotating the PDL key (Settings → Secrets action).
- Visual chat redesign — already shipped.
- Multi-variant job posts artifact.

## 7. Verification

1. New conversation: "Find AEs in Mexico City".
   → Agent renders clarify card: Seniority (single pills) · Vertical (multi pills) · Comp range (text). No sourcing yet.
2. Reply via pills: Senior + Fintech, B2B SaaS + "$80-110k USD" → Send answers.
   → Agent calls `create_job`, then `source_candidates`. Timeline: Normalize → Research → Job description drafted → Searching pool → Collecting top 20 → "X candidates sourced".
3. Candidates tab populates from Apollo (after broadening if needed), even with PDL on 402.
4. If Apollo still 0 after the full ladder, agent comes back with a *broadening* clarify card pre-filled based on which dimensions were already relaxed.
