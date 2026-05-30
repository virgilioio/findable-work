## Why the search returned 0 candidates

The recent LATAM fix in `agent.server.ts` did not cause this. The `search` task for the latest conversation recorded:

```
Apollo error [422] /mixed_people/api_search:
  {"error":"q_organization_keyword_tags requires an array. You are passing in String"}
```

In `src/lib/sourcing/apollo.server.ts → buildBody`, we currently send:

```ts
q_organization_keyword_tags: opts.industries.join(" OR ")
```

Apollo now requires an array for that field, so every attempt in the fallback ladder that still includes `industries` (the user's brief had `b2b`) hard-fails with 422 and returns 0 rows. Even the later steps that drop industries still don't help here because PDL was simultaneously quota-limited (`PdlQuotaError`), so the combined pool was empty and `collect` reported "No matches".

## Fix

1. In `src/lib/sourcing/apollo.server.ts`:
   - Change `q_organization_keyword_tags` to send the array directly: `opts.industries` (after trimming/dedup), not a joined string.
   - Keep the documented `q_keywords` AND-filter as-is (it's a real string field), but make sure the industry terms inside it are also passed when sensible.
2. No prompt or schema changes needed. The broadening ladder already drops `industries` later, so this fix restores the full query plus every fallback step.

## Validation

- Re-run the same Marketing Director / LATAM brief in a new conversation in preview and confirm Apollo returns rows on the first attempt (no 422 in the `search` task `data.apollo_error`).
- Spot-check one other recent failing conversation if available.
