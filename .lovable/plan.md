## Goal

As a user creates more sourcing projects, the same tenant accumulates revealed candidates and `sourceMore` / collect flows silently filter them out — so results shrink over time. Instead, surface those repeats, clone them into the new project for free, and mark them clearly as **Internal** in the candidate list's Source column.

## Behavior changes

### 1. `sourceMore` (Candidates panel → "Source more" button)
Today: filters out any preview whose `apollo_id` / `pdl_id` already exists for this user → skipped entirely.

New: split previews into:
- **Internal repeats** (already-revealed Apollo profile in another project of the same tenant) → clone the existing candidate row into this conversation, no Apollo enrichment call, no credit increment, `source: "Internal"`.
- **Fresh / cross-tenant (gio)** → enrich via Apollo as today, `source: "Sourced"`.
- **Already in THIS conversation** → still skip (avoid duplicates inside one project).

Apply the same split for PDL: if `pdl_id` exists on another candidate of the same tenant, clone it as Internal.

### 2. `collectCandidates` (manual preview → Collect)
Internal reuse path already exists and avoids the Apollo charge. Change the insert to set `source: "Internal"` (today it copies the original row's source, which loses the signal).

### 3. Source column UI
`candidates-panel.tsx` already renders `c.source` in the Source column. The new `"Internal"` value will display as text. Add a subtle styled pill when `source === "Internal"` (muted background, "Internal" label) so it's visually distinct from "Apollo" / "LinkedIn" / "Sourced".

Optional small affordance: tooltip on the pill — "Previously revealed in another project. No credits used."

### 4. Credits / metering
- Internal reuse → no `increment_sourcing_usage` call (already true for `collectCandidates`; ensure same for `sourceMore`).
- Fresh/gio → unchanged (1 credit per Apollo enrichment).

## Out of scope
- No schema change. `display_source` on previews stays; `source` on `candidates` is the surfaced label.
- No change to the search step itself (`runSourcingSearch` already labels previews `internal` / `gio` / `apollo` / `pdl`).
- Outreach / Inbox / Gmail unchanged.

## Files to edit
- `src/lib/sourcing/source-more.functions.ts` — new internal-reuse branch (Apollo + PDL), don't filter out internal repeats, no credit increment for internal.
- `src/lib/sourcing/search.functions.ts` — in the internal-reuse branch of `collectCandidates`, set `source: "Internal"` on the cloned row.
- `src/components/candidates/candidates-panel.tsx` — render an "Internal" pill in the Source column when `source === "Internal"`.
