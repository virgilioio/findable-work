## Plan: Default to verified + likely-to-engage emails only

Apollo's `/mixed_people/api_search` accepts a `contact_email_status` array filter. Today we don't send it, so results mix verified, guessed, and unavailable emails. We'll always request only high-quality contacts.

### Change

**`src/lib/sourcing/apollo.server.ts`**

1. In `buildBody()`, always include:
   ```ts
   contact_email_status: ["verified", "likely to engage"]
   ```
   No conditional, no UI toggle — it's a hard default for every Apollo search.

2. Apply it to **every attempt** in the broadening ladder (`full`, `dropped_seniority`, `dropped_companies`, `country_only_location`, `title_only`) so we never silently fall back to unverified contacts when broadening for geo/title.

### Out of scope

- No UI changes.
- No new `SearchCriteria` field — this is a constant baked into `buildBody()`.
- PDL (`pdl.server.ts`) is unaffected; it has its own email-quality signal handled separately.

### Verification

After the change, log the outgoing Apollo body once for a sample search and confirm `contact_email_status: ["verified","likely to engage"]` is present on every attempt, then re-run a known query and confirm the result count drops (expected) and all returned previews have `has_email: true` for the verified tier.
