## Remaining work

The backend (`candidates` table, server fns, `duplicateJob`) and the two candidate UI components (`candidate-drawer`, `add-candidate-modal`) are already in place. What's left is the wiring inside `src/routes/app.c.$id.tsx` and one new panel.

### 1. Job header actions (top-right of the Job tab)

In `JobPanel` (right side of the sub-header, replacing the "Saved …" line position), add three buttons:

- **Duplicate** (`Copy` icon) — calls `duplicateJob({ data: { conversationId } })`, invalidates `["conversations"]`, then `router.navigate({ to: "/app/c/$id", params: { id: newId } })`. Toast on success.
- **Edit** (`Pencil` icon) — toggles a local `editing` boolean. When `false`, Summary and Requirements render as read-only typography (prose paragraph + bullet list). When `true`, the existing textareas appear. Default: `editing = !job.description` (empty job opens in edit mode).
- **Publish** (`Upload` icon) — calls `save({ status: "open" })` and toasts "Published". When `form.status === "open"`, button label becomes "Published", disabled, with a green dot.

"Saving… / Saved HH:MM" indicator moves under the title.

### 2. "Ask Gio to revise" wiring

- Lift `text` / `setText` from `ChatPanel` up to `ConversationPage` and pass them down (also to `Composer` inside empty state).
- Pass `onAskRevise` to `JobPanel`. Handler: `setTab("chat")` + `setText("Please revise this job description. Specifically: ")` + focus composer on next tick.
- Side-card button calls `onAskRevise()`.

### 3. Candidates tab

- Add icons to `gio-icons.tsx`: `Users`, `Plus`, `Copy`, `Pencil`, `Upload`, `Search`, `Filter`. (Star, Linkedin, Doc already added.)
- New `src/components/candidates/candidates-panel.tsx`:
  - Sub-header: title "Candidates" + count, right side `Add candidate` button (opens `AddCandidateModal`).
  - Stage filter strip (All / Sourced / Contacted / Screening / Interview / Offer) with counts.
  - Search input (filters by name/role/company), sort dropdown (Match desc / Recent / Name).
  - Table with sticky header: avatar+name, role @ company, stage chip, match bar, source, tags, star. Row click opens `CandidateDrawer`.
  - Empty state: "No candidates yet" + Add button.
  - Uses `useQuery({ queryKey: ["candidates", id], queryFn: () => listCandidates({ data: { conversationId: id } }) })`.
  - Mutations: `updateCandidate` (stage, starred), `deleteCandidate` (Reject in drawer) — invalidate `["candidates", id]`.
- In `app.c.$id.tsx` tab bar, when `job` exists, render a third `TabButton` (`Users` icon, "Candidates"). Add `"candidates"` to the `tab` union and render `<CandidatesPanel conversationId={id} onAskGio={(prompt) => { setTab("chat"); setText(prompt); }} />`.

### 4. Candidate drawer "Ask Gio about this candidate"

Already implemented in `candidate-drawer.tsx`; ensure the panel passes `onAskGio` through. Prompt: `"Tell me about ${candidate.name} — strengths, gaps, and next step for this role."`.

### Files

- **Edit**: `src/routes/app.c.$id.tsx` (header buttons, edit mode, lifted composer state, Candidates tab + panel wiring), `src/components/gio-icons.tsx` (missing icons).
- **Create**: `src/components/candidates/candidates-panel.tsx`.

### Out of scope

Real resume parsing (still simulated), real "Source more" outreach, splitting description into responsibilities/must-have/nice-to-have, persisting stage/star with optimistic updates (will invalidate instead).
