
# Tighten Apollo search + clarify thresholds

The Apollo docs you pasted are for `POST /mixed_people/api_search`. Comparing
them to what we send today (`src/lib/sourcing/apollo.server.ts → buildBody`)
surfaces a few real issues. Refinement-threshold logic itself is already
"mandatory clarify on first sourcing turn" — what's worth tuning is **which
questions we ask** and **how those answers translate into the Apollo payload**.

## What's wrong today

1. **`q_organization_keyword_tags` is not in the documented endpoint.** We added
   it for `industries`. It works in Apollo's web app but is NOT in the public
   API contract — risk of silent ignore on this endpoint. We need a documented
   path for industry/vertical filtering.
2. **`q_organization_name` is not in the documented endpoint either.** We pass
   user company names through it. Same risk.
3. **`include_similar_titles` is documented and we never set it.** Default is
   `true`, meaning "marketing manager" also returns "content marketing
   manager". For senior recruiter searches that's often wrong (e.g. "BD
   Manager" should not return "Marketing Manager"). We should set it
   explicitly based on whether the recruiter wants strict-title or not.
4. **Several high-signal documented filters are unused:**
   - `q_organization_job_titles[]` — the candidate's employer is currently
     hiring for these titles (growth/adjacency signal).
   - `revenue_range[min|max]` — company maturity filter.
   - `currently_using_any_of_technology_uids[]` — tech-stack filter (huge for
     engineering/RevOps roles).
5. **Clarify card doesn't ask "strict title matching?"** so we can't drive
   `include_similar_titles` from user intent.
6. **Industries in clarify card seed adjacent verticals automatically** —
   good — but we lose them at the Apollo layer if `q_organization_keyword_tags`
   silently fails. Need a fallback that also injects industry terms into
   `q_keywords` (documented, AND-filter) so they at least bias results.

## Plan

### 1. Fix the Apollo payload (`src/lib/sourcing/apollo.server.ts`)

- Keep `q_organization_keyword_tags` (Apollo accepts it in practice), but
  **also** append industry terms to `q_keywords` so we have a documented
  fallback. Final `q_keywords` = `[...mustHaveKeywords, ...industries].join(" ")`.
- Add `include_similar_titles: false` when the recruiter chose "strict
  title" in the clarify card (default stays `true`).
- Add optional pass-through for two new documented filters when the clarify
  card surfaces them:
  - `revenue_range[min]` / `revenue_range[max]` from a comp/maturity question.
  - `currently_using_any_of_technology_uids[]` from a tech-stack question (only
    asked for technical roles).
- Add `q_organization_job_titles[]` when the clarify card captures "employer
  also hiring for…" — useful for finding teams that are scaling.
- Log the exact body sent (already partly done via `criteria_sent`) — extend
  to include the resolved Apollo body so the Candidates panel debug view shows
  what Apollo actually got, not just our internal criteria.

### 2. Clarify card additions (`chat.main` prompt)

Add two optional questions to the menu, only used when relevant:

- **Title match strictness** (single): "Strict — exact titles only" /
  "Loose — include related titles". Drives `include_similar_titles`. Ask
  when the user provided a precise title (e.g. "Head of Partnerships" vs
  generic "Manager").
- **Tech stack** (multi, allow_other=true): only for engineering / RevOps /
  data roles. Maps to `currently_using_any_of_technology_uids[]`.

Keep the mandatory "ask 2–4 questions on first sourcing turn" rule as-is.

### 3. Carry the new fields through

- `sourcing.agent_normalize` + `sourcing.normalize` prompts: add
  `strict_titles: boolean`, `technologies: string[]`,
  `employer_hiring_titles: string[]`.
- `SearchCriteria` type in `budget.ts`: add the three fields, cap
  `technologies` at 5 and `employer_hiring_titles` at 5.
- `agent.server.ts → tSearch`: include all of the above in `criteria_sent`.

### 4. Defensive: validate Apollo accepts our undocumented params

Add a one-time dev-only log when the response `total_entries` is suspiciously
identical with and without `q_organization_keyword_tags` / `q_organization_name`
— that tells us if Apollo is silently dropping them on this endpoint. Cheap to
add, easy to remove.

## Files

- DB (migration to update prompt bodies): `chat.main`,
  `sourcing.agent_normalize`, `sourcing.normalize`.
- `src/lib/sourcing/apollo.server.ts` — payload + relaxation ladder.
- `src/lib/sourcing/budget.ts` — `SearchCriteria` shape + caps.
- `src/lib/sourcing/normalize.functions.ts` — pass new fields through.
- `src/lib/sourcing/agent.server.ts` — include new fields in `criteria_sent`.

No schema changes, no auth changes, no new deps.

## Out of scope (flag for later if you want)

- Auto-resolving Apollo `organization_ids[]` for "Stripe-like companies" via
  the Organization Search endpoint (would let us replace fuzzy
  `q_organization_name` with the documented `organization_ids[]` filter).
- Pulling Apollo's technology UID CSV into a typeahead so the clarify card
  shows real tech tags instead of free text.
