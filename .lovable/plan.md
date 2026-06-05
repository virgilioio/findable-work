# Be intentional about location

Today the agent treats location as optional context: the clarify menu has no dedicated "Where" question, the normalizer accepts vague inputs ("LATAM", a language hint, empty), and the collect step inserts whatever Apollo/PDL return without verifying the candidate is actually in the requested geography. Result: we sometimes push candidates from countries the user never asked for.

This plan fixes three places — what the agent asks, what it sends to providers, and what it accepts back.

## 1. Ask for location explicitly (prompt change)

Add a dedicated **Locations** question to the `chat.main` clarify menu, and tighten the rule that gates sourcing:

- New menu item: `Locations (multi, allow_other=true)`. The agent must call it when:
  - location is missing, OR
  - the user gave only a region acronym (LATAM, EMEA, APAC, DACH, Nordics, …), OR
  - the user gave only a continent / country group ("Europe", "Asia"), OR
  - sourcing returned 0 results and the brief lacks a concrete country/city.
  Default options should be sensible per context (e.g. for "LATAM" → Mexico, Brazil, Argentina, Colombia, Chile, Peru, + Other; for "remote" → ask which countries are in-scope for remote).
- Tighten the pre-sourcing rule to: "At least one **specific country, city, or remote-with-named-countries** must be known before calling `source_candidates`." A bare "remote" or region acronym counts as missing.
- Update `sourcing.agent_normalize` to emit `locations: string[]` (specific places only), and to leave it empty when the user only gave a region/continent/"remote" with no countries — so the existing `detectAmbiguousRegion` guard triggers and the chat asks instead of guessing.

These changes ship as a new `supabase/migrations/<ts>_sourcing_location_intent.sql` that `UPDATE`s `chat.main` and `sourcing.agent_normalize` (additive — no schema changes).

## 2. Don't silently broaden the location filter (Apollo)

In `src/lib/sourcing/apollo.server.ts`:

- The progressive-relaxation ladder already keeps `locations` in every step except `title_only`, and `title_only` is already gated by `locations.length === 0`. Keep that — but also drop the `country_only_location` step when the user explicitly gave **only cities** in a country where they didn't also mention the country at the brief level. Rationale: today a "São Paulo" search will silently expand to all of Brazil on the broadening fallback. Instead, fail to zero results and let the clarify card ask "Open to other Brazilian cities?".
- `normalizeLocationForApollo` currently emits all of `[City+State+Country, City+Country, State+Country, Country]` in a single `person_locations[]` array, which Apollo OR's together. Trim it to only the most specific variant the user actually provided (keep the country fallback only inside the broadening ladder, not in the base query).

## 3. Enforce location scope on the way back (post-filter)

In `src/lib/sourcing/agent.server.ts`, between the search step and the collect inserts, add an in-scope check before any row is written to `candidates`:

- Build a `requestedScope` from `criteria.locations` using the existing `splitLocationForPdl` helper — a set of `{ countries, regions, cities }` (lowercased).
- For each Apollo `enriched` row (`e.city`, `e.state`, `e.country`) and each PDL `raw` row (`raw.location_locality`, `raw.location_region`, `raw.location_country`):
  - If `requestedScope.cities` is non-empty → keep only rows whose `city` is in the set, OR (when city is unknown on the record) whose `region` matches.
  - Else if `requestedScope.regions` is non-empty → keep only rows whose `region` is in the set.
  - Else if `requestedScope.countries` is non-empty → keep only rows whose `country` is in the set.
  - If the candidate record has **no** location fields at all (neither city/state/country) → drop it. We don't push unknown-geography candidates when a scope was given.
- Drops are counted as `out_of_scope` (separate from `skipped` duplicates) and surfaced:
  - In the `collect` task `data` as `out_of_scope_dropped: number`.
  - In the `SourceResult` and the `source_candidates` tool result so chat can say e.g. "Filtered out 7 profiles outside Mexico/Argentina."

No credit is charged for dropped rows (the existing per-insert `spendCreditsAdmin` only runs after a successful insert, so this is already the case — just keep it that way).

## 4. Out of scope

- No UI / visual changes — chat surfaces the out-of-scope count via the existing task card summary.
- No changes to the include-duplicates flow, billing bundles, or the public job pages.
- No changes to `splitLocationForPdl` / `normalizeLocationForApollo` signatures — only call sites.

## Technical notes

Files touched:
- `supabase/migrations/<new>_sourcing_location_intent.sql` — `UPDATE` `chat.main` clarify menu + tighten pre-sourcing rule; `UPDATE` `sourcing.agent_normalize` to require specific places.
- `src/lib/sourcing/apollo.server.ts` — trim `normalizeLocationForApollo` output to the most-specific variant in the base query; gate `country_only_location` broadening step on user-provided country.
- `src/lib/sourcing/agent.server.ts` — add `requestedScope` + post-fetch in-scope filter for Apollo and PDL, count drops as `out_of_scope`, thread the count through the `collect` task and `SourceResult`.
- `src/routes/api/chat.ts` — pass `out_of_scope_dropped` from `runSourcingAgent` into the `source_candidates` tool result so the model can mention it.

Existing safety nets we keep:
- `detectAmbiguousRegion` (region acronym → clarify card) — still triggers first.
- `dropLocationLikeCompanies` — unchanged.
- The "title_only fallback is forbidden when locations are set" rule in the Apollo ladder — unchanged, this plan reinforces it.
