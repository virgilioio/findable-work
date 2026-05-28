# Outreach: templates + Contact automation

Builds the missing link between Candidates and Interviews. Three pieces: a new **Outreach** tab (templates + preview), an agent flow that drafts outreach right after sourcing candidates, and a **Contact (N)** full-screen automation that marks candidates as Contacted.

## 1. Database

New migration:

- `outreach_drafts` table (one row per conversation, like `job_posts`):
  - `id`, `user_id`, `conversation_id` (unique), `created_at`, `updated_at`
  - `channel` text default `'linkedin'`
  - `linkedin_template` text — default copy with `{{first_name}}`, `{{company}}`
  - `email_subject` text, `email_body` text
  - `tone` text default `'Warm'` (Warm/Direct/Casual)
  - `personalize_ai` bool default true, `local_time_send` bool default true, `pause_if_reply` bool default true, `skip_if_recent` bool default true
  - `followups` jsonb default 3-step sequence (Day 0 LI → Day 3 Email → Day 7 Email)
  - GRANTs + RLS scoped to `auth.uid() = user_id`, `updated_at` trigger.

- Extend `candidates`: add nullable `contacted_at timestamptz`, `contact_channel text` (LinkedIn/Email). No schema break; existing rows stay null. Stage transitions still use the existing `stage` column ("Contacted").

## 2. Server functions (`src/lib/outreach/*.functions.ts`)

- `getOutreach({ conversationId })` — fetch row (returns null if none).
- `upsertOutreach({ conversationId, patch })` — partial update of editable fields.
- `contactCandidates({ conversationId, candidateIds })` — sets each candidate's `stage='Contacted'`, `stage_changed_at=now()`, `contacted_at=now()`, `contact_channel` (round-robins LinkedIn/Email like the mock). Returns updated rows. All guarded by `requireSupabaseAuth`.

Extend `getConversation` to also load and return `outreach` (the row).

## 3. Outreach tab UI (`src/components/outreach/outreach-panel.tsx`)

Two-column layout, matches Candidates/JobPosts panel styling using existing tokens.

Left column — editor:
- Channel segmented control: **LinkedIn** ↔ **Email**.
- Tone segmented control: Warm / Direct / Casual.
- **LinkedIn** view: single `<Textarea>` with live counter pill `XXX / 200` (turns inverted black when over) and a warning bar "Trim N chars" when over.
- **Email** view: subject `<Input>`, body `<Textarea>`, plus a 3-card timeline for the followup sequence (Day 0 LI / Day +3 Email / Day +7 Email) showing channel pill + subject + preview line. Edits to sequence stored in `followups` jsonb (initial version: read-only display + a checkbox to enable each step — full per-step editor out of scope).
- Variable insert dropdown (`{{first_name}}`, `{{company}}`, `{{role}}`, `{{recruiter_name}}`) inserts at end of focused field.
- Personalization toggle row (4 switches).
- Estimated performance strip (static benchmark deltas for now — open/reply/meeting rates).

Right column — preview:
- Preview-candidate selector (first 3 starred candidates of the conversation; fallback to first 3).
- LinkedIn channel → renders as a fake LinkedIn message card (avatar + name + char-counted note).
- Email channel → renders as a fake email client (from/to/subject/body).
- All `{{vars}}` replaced from the selected preview candidate.

Saving: debounced `upsertOutreach` on edit; toast on first save.

## 4. Contact automation overlay (`src/components/outreach/contact-automation.tsx`)

Full-screen modal triggered from Candidates panel's Contact (N) button. Replaces the current "coming soon" toast.

- Header: "Findable is sending outreach" + progress bar fed by per-candidate state.
- Body: one row per selected candidate (avatar, name, role @ company). Each row:
  1. Status: **Personalizing** — streams the personalized message char-by-char (caret animation, reuses streaming style from chat).
  2. **Sending via LinkedIn…/Email…** (channel pill flips).
  3. **Sent · moved to Contacted** with check icon.
- Rows stagger (250ms + i*600ms) like the mock.
- When all rows reach `Sent`, primary **Done** button appears; click → calls `contactCandidates` server fn, invalidates `["candidates", id]`, closes overlay, toasts "N candidates contacted".
- Cancel (X) before completion aborts timers; no DB writes.

Wire-up in `candidates-panel.tsx`: replace the existing `toast("Contacting flow coming soon.")` onClick with `setContactOverlayOpen(true)` and pass the selected `Candidate[]` to the overlay. After success, clear `selectedIds`.

## 5. Chat / agent integration

- Add tab type: in `src/components/chat/task-card.tsx` extend `ArtifactTab = "job" | "candidates" | "job_posts" | "outreach"` and add an `ARTIFACT_BY_KIND` entry for `create_outreach` (icon: Send).
- Add the **Outreach** tab button in `app.c.$id.tsx` (after Candidates), gated on `outreach` row existing in `data`. Pulses when a new draft event arrives. Renders `<OutreachPanel conversationId={id} />`.
- New agent tool in `src/routes/api/chat.ts`: `draft_outreach` (no required params; optional `tone_focus`). Tool handler:
  - Requires a Job to exist (same guard as `draft_job_posts`).
  - Generates default LinkedIn copy + email subject/body from the job's title/company-ish context (template literals — no extra AI call needed for v1).
  - Upserts `outreach_drafts` row (unique on `conversation_id`).
  - Emits SSE `event: outreach` with the row + creates an `agent_tasks` row of kind `create_outreach` ("Outreach templates drafted").
- Append `draftOutreachTool` to the gateway tool list and mention it in the system prompt's flow ordering (after job_posts/candidates, before interviews) so the agent calls it automatically.
- Conversation page reacts to the `outreach` SSE event by setting an `outreachPulse` flag (mirrors `jobPostsPulse`).

## 6. Files to add / touch

Add:
- `supabase/migrations/<ts>_outreach.sql`
- `src/lib/outreach/outreach.functions.ts`
- `src/components/outreach/outreach-panel.tsx`
- `src/components/outreach/contact-automation.tsx`

Edit:
- `src/lib/conversations.functions.ts` — also return `outreach`.
- `src/routes/api/chat.ts` — add `draftOutreachTool`, handler, SSE emit, system prompt mention.
- `src/components/chat/task-card.tsx` — extend `ArtifactTab` + kind map.
- `src/routes/_authenticated/app.c.$id.tsx` — Outreach tab button + panel + pulse + SSE handler.
- `src/components/candidates/candidates-panel.tsx` — replace Contact toast with overlay; refresh on completion.

## Out of scope (v1)

- Real send via LinkedIn/email providers (overlay is animated; status persists via stage change + `contacted_at`).
- Per-followup-step editor (initial sequence is shown as 3 cards, stored as jsonb, only on/off toggle).
- Reply detection, throttling, time-zone scheduling logic (toggles persisted but not enforced).
