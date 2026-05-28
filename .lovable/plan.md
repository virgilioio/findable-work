## Plan: geo-correct locations end-to-end

Make city / state-or-province / country a first-class structured field so Apollo and PDL both filter on all three.

### 1. Capture state in the normalized brief

`src/lib/sourcing/normalize.functions.ts`
- Replace the single `location: string` with a structured object:
  ```ts
  location: { city: string; region: string; country: string }
  ```
  (all strings; empty when unknown).
- Update the LLM JSON schema/prompt to extract `city`, `region` (state/province/admin area), and `country` separately. Add few-shot examples covering: "Austin, TX, USA", "São Paulo, SP, Brasil", "Berlin, Germany", "remote EU", "Mexico City, Mexico".
- Keep a derived display string ("Austin, TX, United States") for UI compatibility.

### 2. Propagate the structured location

- `agent.server.ts`: pass `normalized.location` (the object) into the SearchCriteria instead of `[normalized.location]`.
- `budget.ts` `SearchCriteria.locations` type changes from `string[]` to `LocationInput[]` (object form), with a small adapter so any existing string usage still works.

### 3. Apollo: send city + state + country

`apollo.server.ts` + `normalizeLocationForApollo` in `budget.ts`:
- Build `person_locations` as a deduped list of progressively-broader strings:
  1. `"City, Region, Country"` (full)
  2. `"City, Country"`
  3. `"Region, Country"`
  4. `"Country"`
- Expand US/CA/AU/BR/MX/IN state abbreviations to full names (extend `US_STATE_ABBR_TO_NAME` map, or add per-country maps).
- Use the broader entries only in the broadening cascade (already structured in `apollo.server.ts:132-148`), instead of re-deriving "country only" by string split.

### 4. PDL: include `location_region`

`pdl.server.ts` `buildEsQuery`:
- For each location, add `term: { location_region: <region> }` to the `should` array alongside `location_locality` and `location_country`.
- Normalize region to PDL's lowercase convention (matches the existing `locality`/`country` casing in `splitLocationForPdl`).
- Optionally tighten with `bool.must` (`country` required, `region OR locality` should) when all three fields are present, to reduce noise.

### 5. Verification

- Unit-style sanity log: for a brief like "Senior data engineer, Austin, Texas, USA", log the final Apollo `person_locations` array and PDL `query` body once to confirm:
  - Apollo gets `["Austin, Texas, United States", "Austin, United States", "Texas, United States", "United States"]`.
  - PDL gets `should: [{location_locality:"austin"}, {location_region:"texas"}, {location_country:"united states"}]`.
- Re-run an existing conversation that previously over-matched to confirm tighter geo filtering.

### Out of scope (for now)
- Remote/timezone filtering ("remote EU", "remote AMER") — needs a separate field on `SearchCriteria` and a different Apollo/PDL strategy. Flag-only here; happy to plan it next.
