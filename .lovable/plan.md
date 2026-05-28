
## 1. Job tab — header actions (top right)

In `src/routes/app.c.$id.tsx` `JobPanel`, replace the lone "Saving…" text on the right of the sub-header with a button group:

- `Duplicate` (icon: Copy) — calls a new `duplicateJob` server fn that creates a new `conversations` row + cloned `jobs` row owned by the user, then `navigate({ to: "/app/c/$id", params: { id: newConversationId } })`. Invalidate `conversations`.
- `Edit` (icon: Pencil) — toggles local `editing` state. When false, summary/requirements/details render as read-only typography (no inputs). When true, current input/textarea UI appears. Default to `false` for existing jobs, `true` if description is empty.
- `Publish` (icon: Upload) — calls existing `updateJob` with `status: "open"`, shows a toast ("Job published"). When status is already `open`, label becomes `Published` and the button is disabled with a green dot.

Small "Saved HH:MM" / "Saving…" indicator moves to a subtle line below the title.

## 2. "Ask Gio to revise" wiring

In `JobPanel`'s side card, change the button to call a prop `onAskRevise()` passed from `ConversationPage`. The handler switches `tab` to `"chat"` and pre-fills the chat composer with: `"Please revise this job: ${title}. Suggest improvements to summary, requirements, salary band, and sourcing plan."` (then user can hit send). Implement via lifting `text`/`setText` from `ChatPanel` to `ConversationPage` (or via a ref/imperative API).

## 3. Candidates — backend persistence

### Migration (new `candidates` table)

```sql
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  conversation_id uuid not null,
  name text not null,
  role text not null default '',
  company text not null default '',
  stage text not null default 'Sourced'
    check (stage in ('Sourced','Contacted','Screening','Interview','Offer')),
  source text not null default 'LinkedIn',
  match int not null default 75 check (match between 0 and 100),
  tags text[] not null default '{}',
  starred boolean not null default false,
  avatar text not null default '',
  email text, phone text, linkedin text, location text,
  summary text,
  experience jsonb not null default '[]'::jsonb,
  education  jsonb not null default '[]'::jsonb,
  match_breakdown jsonb not null default '[]'::jsonb,
  activity jsonb not null default '[]'::jsonb,
  stage_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.candidates to authenticated;
grant all on public.candidates to service_role;
alter table public.candidates enable row level security;
-- 4 standard policies scoped to auth.uid() = user_id
create index candidates_conversation_idx on public.candidates(conversation_id);
```

### Server fns — `src/lib/candidates.functions.ts`

- `listCandidates({ conversationId })` — returns rows ordered by `match desc`.
- `createCandidate({ conversationId, name, role, company, source, tags, match? })` — derives `avatar` from initials, generates the enrichment (email/phone/linkedin/location/summary/experience/education/matchBreakdown/activity) using the deterministic logic from `gio-candidate-profile.jsx` `enrich()` so profiles are immediately rich without an LLM call.
- `updateCandidate({ id, patch })` — partial update (stage, starred, etc). Sets `stage_changed_at = now()` when stage changes.
- `deleteCandidate({ id })` — for Reject.

All four use `requireSupabaseAuth` and scope writes via RLS (`user_id = auth.uid()`, set on insert).

## 4. UI — Candidates tab + drawer + Add modal

### Add a third tab to the workspace tab bar

`Chat` (existing) · `Job` (when job exists) · `Candidates` (always when conversation has a job). Tab uses the existing `Users` icon (add to `gio-icons` if missing).

### New components under `src/components/candidates/`

- `candidates-panel.tsx` — port of `GioCandidatesTab`: sub-header with `Add` / `Source more` (stub) / `Contact (N)` (stub), stage strip filter, search, sort menu, sticky-header table, toast. Pulls data via `useQuery(["candidates", id], listCandidates)`. Uses `useMutation` for stage/star/reject.
- `candidate-drawer.tsx` — slide-over with Overview / Resume / Activity tabs. Reads enrichment fields off the candidate row (no extra fetch). Stage chip with menu calls `updateCandidate`. Star/Reject wired. "Ask Gio about this candidate" jumps to chat with a prefilled prompt (same lift pattern as job revise).
- `add-candidate-modal.tsx` — segmented control: `Drop resume` (simulated 1.8s parse → preview card → `createCandidate`) and `Manual entry` (name/role/company/source/tags). On success, closes modal, opens drawer for the new candidate.

All styling uses existing design tokens (`bg`, `bg-elev`, `bg-input`, `bg-bubble`, `text`, `text-mute`, `text-faint`, `border`, `border-strong`, `shadow-md`, `radius`) — port inline styles from the reference to Tailwind classes consuming those tokens, no hex literals.

### Icon additions to `src/components/gio-icons.tsx`

Add (mirroring reference 20px viewBox, 1.5 stroke): `Users`, `Star`, `Linkedin`, `Folder`, `Check`, `ChevDown`, `ArrowRight`, `Copy`, `Pencil`, `Upload`, `Doc` (if missing).

## Out of scope

- Resume file upload to storage (the drop zone just simulates parse and inserts the seeded fields, as the reference does).
- Real "Source more" / outreach / interview scheduling actions.
- Splitting job description into responsibilities / must-have / nice-to-have.

## Files

- New migration `supabase/migrations/<ts>_candidates.sql`
- New `src/lib/candidates.functions.ts`
- New `src/components/candidates/{candidates-panel,candidate-drawer,add-candidate-modal}.tsx`
- Edit `src/components/gio-icons.tsx` (add icons)
- Edit `src/lib/jobs.functions.ts` (add `duplicateJob`)
- Edit `src/routes/app.c.$id.tsx` (header buttons, edit mode, Ask Gio wiring, Candidates tab)
