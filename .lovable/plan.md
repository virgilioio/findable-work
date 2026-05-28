## Add "Flagged" filter chip to Candidates panel

Add a togglable "Flagged" chip in the same row as the stage tabs / search / sort in `src/components/candidates/candidates-panel.tsx`, placed to the right of the Sort dropdown (matching the screenshot's right-aligned position).

### Behavior
- New state `flaggedOnly: boolean` (default `false`).
- When active, filter `candidates` to only those with `c.starred === true` (this is the existing "flagged" signal — the star icon on each row).
- Combines with existing stage tab + search query (AND).
- Toggle on click; visually "active" when on.
- Count badge next to label shows total starred candidates (computed from `candidates`, not from the currently filtered list — matches mockup showing "Flagged 6" regardless of stage).

### Visuals
- Same chip dimensions / radius as stage tabs but using the Star icon + label + count.
- Inactive: subtle border, muted text, outline star.
- Active: filled background (`bg-bg-bubble` like selected stage), filled star.
- Place it inside the existing `ml-auto` right-side cluster, AFTER the Sort dropdown so the order left→right becomes: Search · Sort · Flagged.

### Out of scope
- No backend/schema change (uses existing `candidates.starred`).
- No change to stage tabs, search, sort, or table rendering beyond the filter result.
