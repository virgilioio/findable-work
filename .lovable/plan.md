
# Apollo + PDL Sourcing Pipeline (backend-only)

**Golden rule honored**: No UI changes. No edits to existing components, routes, or styles. All existing flows (jobs, candidates, drawer, chat) remain untouched. This adds a parallel set of server functions + tables that a future UI task can wire up.

## What gets built

A 5-stage pipeline behind `createServerFn` handlers, mirroring your other app:

```text
prompt → normalize → research → save project → search (Apollo + PDL) → collect
```

## Secrets to add (via `add_secret`)

- `APOLLO_API_KEY` — Apollo search + bulk_match
- `PDL_API_KEY` — People Data Labs search
- `OPENAI_API_KEY` — gpt-4o-mini for normalize / research / refine

I will request these before writing the server functions.

## Database (new tables only — existing tables untouched)

All RLS-scoped to `auth.uid() = user_id`. New tables only — `candidates` table left alone (collect will write into it but only via additive columns we already have plus a new nullable `apollo_id` + `pdl_id` for dedup).

1. **`sourcing_projects`**
   - `id`, `user_id`, `conversation_id` (nullable, links to existing conversation/job), `title`, `raw_prompt`, `normalized` jsonb, `search_criteria` jsonb, `research` jsonb, `created_at`, `updated_at`

2. **`sourcing_preview_candidates`** (24h cache of search results)
   - `id`, `project_id`, `user_id`, `source` text (`apollo`|`pdl`|`gio`|`internal`), `external_id`, `linkedin_slug`, `preview` jsonb (first_name, last_name_obfuscated, title, company, has_email, has_phone, location flags, keyword_score, etc.), `collected_at`, `created_at`
   - unique `(project_id, source, external_id)`

3. **`sourcing_credits_usage`** (tracked but not enforced — per user/month)
   - `id`, `user_id`, `period` (YYYY-MM), `collect_credits_used` int default 0, unique `(user_id, period)`

4. **`candidates` additive columns** (nullable, non-breaking)
   - `apollo_id text`, `pdl_id text`, `linkedin_slug text` (for cross-tenant dedup)

5. **`increment_sourcing_usage(_user_id uuid, _count int)`** RPC (security definer)

## Server functions (new files only)

All in `src/lib/sourcing/`. Each is a `createServerFn` with `requireSupabaseAuth`.

| File | Function | Purpose |
|---|---|---|
| `normalize.functions.ts` | `normalizeJobSpecs` | OpenAI gpt-4o-mini → `{ title, skills[], location, ai_variations }` |
| `research.functions.ts` | `researchSourcingCriteria` | OpenAI function-calling → titles/companies/keywords/reasoning (capped) |
| `project.functions.ts` | `createSourcingProject`, `getSourcingProject`, `refineSourcingProject` | Orchestration + `budgetSearchCriteria` (the AND-stack caps), refine via OpenAI |
| `apollo.server.ts` | `searchApollo`, `enrichApolloProfiles` | Direct `https://api.apollo.io/api/v1/mixed_people/api_search` + `/people/bulk_match`. Pagination 100/page up to 2000. Keywords scored locally (+25/match). |
| `pdl.server.ts` | `searchPdl` | PDL person search, returns normalized rows |
| `sourcing.functions.ts` | `runSourcingSearch` | Parallel Apollo + PDL → dedupe by linkedin_slug → cross-ref existing `candidates` (same tenant → `internal`, other tenant → `gio`, none → `apollo`/`pdl`) → upsert into `sourcing_preview_candidates` |
| `collect.functions.ts` | `collectCandidates` | Bulk-match up to 10 ids/call, skip already-in-tenant, write `candidates` + `apollo_id`, increment usage, mark `collected_at` |

Server-only helpers use the `.server.ts` suffix; client-facing entry points use `.functions.ts`. Admin writes (cross-tenant lookups) use `supabaseAdmin`; user-scoped reads/writes use `requireSupabaseAuth`'s `supabase` client.

## Apollo/PDL mapping (unchanged from your spec)

- Apollo: `person_titles[]`, `q_organization_name` (OR-joined), `person_locations[]` ("City, Country" only), `person_seniorities[]`, `organization_num_employees_ranges[]`, `q_organization_domains_list[]`. **Keywords and industries NOT sent.** Keywords scored locally.
- Caps enforced in `budgetSearchCriteria`: titles 4, user companies 5, researched companies 3 (0 if user provided), keywords 3, seniorities 2, industries always emptied.
- 24h preview cache lookup keyed by `project_id`.

## What is explicitly NOT done

- No UI components, no routes, no buttons, no nav. Future task wires this into a "Source" surface.
- No phone webhook endpoint (phones arrive async via Apollo webhook — out of scope for this round; collect returns email + LinkedIn + employment history immediately).
- No standard_job_titles / standard_skills lookup tables (you opted out).
- No credit enforcement (tracking only).
- No edits to existing `candidates-panel.tsx`, `candidate-drawer.tsx`, `app.c.$id.tsx`, etc.

## Order of execution (after approval)

1. `add_secret` for `APOLLO_API_KEY`, `PDL_API_KEY`, `OPENAI_API_KEY` — wait for user to fill.
2. Migration: create 3 tables + additive `candidates` columns + RPC + RLS + GRANTs.
3. Create all server function files under `src/lib/sourcing/`.
4. Smoke-test each stage with `invoke-server-function` (normalize → research → search returns rows; collect deferred until UI exists).

Nothing in `src/routes/` or `src/components/` is modified.
