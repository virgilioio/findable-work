# Always refine, and actually use what we collect

You flagged two real problems in the same flow. The example prompt — *"BD Manager, New York, foodtech/adtech, partnerships experience"* — exposes both:

1. **The agent skipped clarifying questions** because the threshold is "title + location + seniority present → go". It had all three (BD Manager / NY / manager) and shipped to Apollo immediately.
2. **Even if it had asked, the industry signal would have been thrown away.** `budgetSearchCriteria` hardcodes `industries: []` (drop), the `agent_normalize` prompt has no `industries` field at all, and Apollo gets nothing about foodtech/adtech. "Partnerships experience" survives only as a low-priority free-text keyword (cap of 3).

## Changes

### 1. Always run one clarify round before the first sourcing call

Edit the `chat.main` prompt (DB-backed, in `prompts` table) so the mandatory mode-C flow becomes:

- On **the first sourcing intent in a conversation** (no `sourcing_projects` row yet), the agent MUST call `ask_clarifying_questions` first, even when title + location + seniority are already in the brief.
- The card should only ask for what's still ambiguous or under-specified. Pre-fill nothing; the user should see they're refining, not re-typing. Pick 2–4 of these based on what the brief is missing:
  - **Seniority band** (single-select) — even if "manager" is implied, confirm IC manager vs people manager vs senior IC.
  - **Years of experience** (single-select: 3–5, 5–8, 8–12, 12+).
  - **Industry / vertical focus** (multi-select, with the user's hints as preselected pills + adjacent options + "Other" free-text). For the BD example: FoodTech, AdTech, MarTech, B2B SaaS, Marketplaces, CPG, Other.
  - **Company size of current/recent employer** (multi-select: 1–10, 11–50, 51–200, 201–500, 501–1k, 1k–5k, 5k+).
  - **Must-have experience signals** (multi-select free-text-aware: e.g. "strategic partnerships", "channel sales", "BD with enterprise", "founder-led GTM").
  - **Work model** (single-select: On-site NY, Hybrid NY, Remote-US, Remote-global) — only when the location is a city without a model.
  - **Comp band** (single-select brackets) — skippable.
  - **Languages** when relevant by location/industry.
- After the user answers, proceed with `create_job` + `source_candidates` in the same turn (today's behavior for subsequent turns).
- Subsequent sourcing/broadening in the same conversation keeps today's behavior (no forced extra clarify; only re-ask on 0 results or explicit user retry).

### 2. Capture industries in the normalize step

Update the `sourcing.agent_normalize` prompt to add an `industries` field:

```json
{
  "title": "...",
  "skills": ["..."],
  "industries": ["foodtech", "adtech"],
  "location": "...",
  "seniorities": ["..."],
  "keywords": ["..."]
}
```

Same change for `sourcing.normalize` (the standalone normalize fn) for parity.

### 3. Pass industries through `budgetSearchCriteria` instead of dropping them

`src/lib/sourcing/budget.ts`:
- Remove the `industries: []` hardcode.
- Keep a small budget (max 5 industries).
- Add a `mustHaveKeywords` field on `SearchCriteria` distinct from boost `keywords`, so signals captured in the clarify card (e.g. "strategic partnerships") can be ANDed instead of competing for the 3-slot keyword budget.

### 4. Actually send them to Apollo

`src/lib/sourcing/apollo.server.ts`, `buildBody`:
- Add `q_organization_keyword_tags: industries.join(" OR ")` when industries are present — this is Apollo's free-text industry/company-tag filter and is the right field for "foodtech, adtech".
- Add `q_keywords: mustHaveKeywords.join(" ")` when present — this scopes person+org keyword match.
- Add a new fallback rung in `searchApolloWithFallback`: **drop industries before dropping companies**, so the relaxation ladder is:
  1. full (titles + companies + locations + seniorities + industries + must-have kw)
  2. drop seniorities
  3. drop must-have kw
  4. drop industries
  5. drop companies
  6. country-only location
  7. (existing) title-only when no location

Log the broadening step the same way we do today so the chat surfaces it ("broadened — dropped industry filter").

### 5. Surface industries in the search task summary

In `agent.server.ts` step 2/3, include industries in the `tSearch` data payload so the Candidates panel and the "search criteria" debug view show exactly what was asked of Apollo (today the user can't tell that foodtech/adtech was ignored).

## Out of scope

- Mapping textual industries to Apollo's numeric `organization_industry_tag_ids` (would need a maintained mapping table). Free-text `q_organization_keyword_tags` covers the BD example correctly without that.
- PDL parity for industries (PDL path doesn't currently use them; can follow once the Apollo side is validated).
- Any UI work on the clarify card — the existing pill picker already supports single/multi/text with `allow_other`.

## Files touched

- `prompts` table rows: `chat.main`, `sourcing.agent_normalize`, `sourcing.normalize` (via the prompts admin UI / migration)
- `src/lib/sourcing/budget.ts`
- `src/lib/sourcing/apollo.server.ts`
- `src/lib/sourcing/agent.server.ts` (wire `industries` + `mustHaveKeywords` from normalized → criteria; include in task data)
- `src/lib/sourcing/normalize.functions.ts` (extend returned shape with `industries`)
- `src/lib/sourcing/project.functions.ts` (accept `industries` in `CreateInput`/refine allow-list)

No DB schema changes — `sourcing_projects.search_criteria` and `normalized` are already `jsonb`.
