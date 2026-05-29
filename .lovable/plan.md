# Plan

## 1. Add "Applied" as an allowed candidate stage

**Migration** — extend the `candidates_stage_check` CHECK constraint:
```sql
ALTER TABLE public.candidates DROP CONSTRAINT candidates_stage_check;
ALTER TABLE public.candidates ADD CONSTRAINT candidates_stage_check
  CHECK (stage IN ('Applied','Sourced','Contacted','Screening','Interview','Offer'));
```

**Apply endpoint** — already inserts `stage: "Applied"`. Remove the silent error swallow so future constraint violations surface in logs.

**UI** — surface the new stage everywhere stages are rendered:
- Kanban columns (add "Applied" as the leftmost column, before "Sourced")
- Stage filter chips/dropdowns
- Stage badge color map (assign a distinct color)
- Stage ordering helpers

Search points: `"Sourced"`, `STAGES`, `stageOrder`, `stageColors` across `src/components/candidates/**` and `src/lib/candidates/**`.

**Backfill** — update the existing `allan.rodriguez.90@gmail.com` candidate row back to `stage: "Applied"` once the constraint allows it.

## 2. Ask user for specific countries on region acronyms (belt + suspenders)

### A. Prompt-level instruction (primary)
Add a rule to the agent's sourcing system prompt:

> When the user specifies a multi-country region or acronym (LATAM, EMEA, APAC, DACH, Nordics, Benelux, MENA, SEA, Iberia, GCC, North/South/Central America, etc.) without naming specific countries, do NOT search yet. Ask which countries to target, suggest the typical country list for that region as options, and only call the sourcing tool once the user confirms an explicit country list.

Locate the sourcing/agent system prompt in `prompts` table (or `src/lib/prompts/**`) and append this rule.

### B. Code-level guard (safety net)
In `src/lib/sourcing/budget.ts`:
- Keep `REGION_ALIASES` as a *suggestion dictionary* (used to propose countries to the user), but **remove auto-expansion** from `normalizeLocationForApollo`.
- Add `detectAmbiguousRegion(location: string): { region: string; suggestedCountries: string[] } | null`.

In the sourcing server function (the one the agent's tool calls before Apollo):
- Before querying Apollo, if `locations.length <= 1` and `detectAmbiguousRegion(locations[0])` matches, short-circuit and return:
  ```ts
  { status: "needs_clarification", region, suggestedCountries }
  ```
- The agent receives this structured response and asks the user — guaranteed even if the LLM forgets the prompt rule.

### C. "Source more"
Same guard applies: if the conversation's stored `search_criteria.locations` contains only a region acronym (legacy projects), short-circuit with `needs_clarification` so the agent prompts the user before re-querying.

## Technical notes

- One migration (CHECK constraint) + one data update (backfill candidate).
- `REGION_ALIASES` repurposed from auto-expander → suggestion source.
- Apollo path unchanged otherwise; the earlier `country_only_location` stop still protects against cross-region leakage.
- No new dependencies.
