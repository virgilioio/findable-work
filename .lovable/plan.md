## Candidates header: Add, Source more, Contact (N)

Update `src/components/candidates/candidates-panel.tsx` and add a new server function so the sub-header matches the screenshot and supports bulk selection.

### Header buttons (right side, in order)
1. **Add** — existing "Add candidate" relabeled to "Add" with `+` icon (ghost-style: transparent bg, border).
2. **Source more** — new ghost button with Sparkle icon. Calls a new `sourceMore` server fn that pulls the next 10 unused preview candidates for this conversation's project and inserts them as `candidates` rows (same shape as agent's collect step). Shows spinner while running, toast on result ("10 added", "No more matches — refine the brief"), invalidates the candidates query.
3. **Contact (N)** — black primary button (current "Add candidate" style). **Hidden when 0 selected**; visible only when `selectedIds.size > 0`. Label reads `Contact ( N ) →`. Click = no-op stub for now (console.log + toast "Contacting flow coming soon"), since the contact workflow isn't in scope.

When nothing is selected, only **Add** and **Source more** show. When ≥1 row is selected, **Contact (N)** appears to the right of them.

### Row selection
- The table already shows checkboxes in the screenshot but not in code. Add:
  - Header checkbox column (select-all-visible toggle).
  - Per-row checkbox column (leftmost), `onClick` stops propagation so it doesn't open the drawer.
  - `selectedIds: Set<string>` state, cleared when `conversationId` changes.
  - Select-all is tri-state based on `filtered` rows only.

### "Source more" server function
New file `src/lib/sourcing/source-more.functions.ts`:

```text
sourceMore({ conversationId, limit=10 })
  1. Find latest sourcing_projects row for this conversation+user. If none → error "Run sourcing first".
  2. Load preview_candidates for that project, ordered by keyword_score desc.
  3. Filter out ones whose external_id is already in candidates for this user (apollo_id / pdl_id).
  4. Take next `limit`.
  5. Re-use the same insert logic as agent.server.ts collect step:
       - Apollo rows → enrichApolloProfiles + insert
       - PDL rows → insert from preview.raw
  6. increment_sourcing_usage by `added`.
  7. Return { added, skipped, remaining_preview }.
```

To keep agent.server.ts as the single source of truth for insert shape, I'll extract the per-row insert into small helpers (`insertApolloCandidates`, `insertPdlCandidates`) exported from `agent.server.ts` and reused by both the agent and `sourceMore`.

### Out of scope
- The actual outbound contact flow behind the Contact button (stub only).
- No schema changes — uses existing `sourcing_preview_candidates`, `candidates`, `sourcing_projects`.
- No changes to the Flagged chip / search / sort row.

### Files touched
- `src/components/candidates/candidates-panel.tsx` — header layout, selection state, checkboxes, Source-more mutation, Contact-N conditional button.
- `src/lib/sourcing/agent.server.ts` — extract reusable insert helpers (no behavior change).
- `src/lib/sourcing/source-more.functions.ts` — new server fn.
