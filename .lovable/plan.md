
## Goal

Right now the chat can talk about an "interview loop" but the **Interviews tab doesn't exist** in the conversation workspace. We'll add it, make it editable, and let the chat AI build/edit it via a tool — same pattern as `create_job` / `draft_outreach`. We'll also wire the **Schedule** view to Google Calendar (which already has OAuth + token refresh in `user_calendar_connections`).

## 1. Data model (one SQL migration, you run manually)

New table `interview_loops` (one per job/conversation):

```text
id uuid pk
user_id uuid
conversation_id uuid unique  -- one loop per project
job_id uuid nullable
stages jsonb default '[]'    -- ordered array (see shape below)
context text default ''      -- AI-written interview context / what to assess
prep_tips text default ''    -- AI-written prep tips
created_at, updated_at
```

`stages[]` shape:
```text
{ id, order, name, format: "video"|"async"|"onsite"|"phone",
  duration_min: number,
  interviewers: [{ name, role, email? }],
  description, focus_areas[], suggested_questions[] }
```

New table `interview_schedules` (the booked slots):
```text
id uuid pk, user_id, conversation_id, loop_id,
candidate_id uuid nullable, candidate_name text,
stage_id text, stage_name text,
start_at timestamptz nullable, end_at timestamptz nullable,
is_async bool default false,
google_event_id text nullable,
status text default 'pending'  -- pending|confirmed|sent|cancelled
```

Both tables: RLS scoped to `auth.uid() = user_id`, GRANTs to `authenticated` + `service_role`, `NOTIFY pgrst, 'reload schema'`.

## 2. Server functions (`src/lib/interviews/*.functions.ts`)

- `getInterviewLoop({ conversationId })` — loop + schedules.
- `upsertInterviewLoop({ conversationId, stages, context?, prep_tips? })` — used by both the UI (manual edits) and the chat tool. Validates with Zod, reorders by `order`.
- `updateStage`, `addStage`, `removeStage`, `reorderStages` — thin wrappers for the UI's edit affordances.
- `addInterviewSchedule({ candidateId|name, stageId, start_at })` — manual add (chat agent or user).
- `confirmSchedule({ scheduleId })` and `confirmAllSchedules({ loopId })` — see §4.
- `cancelSchedule({ scheduleId })` — deletes Google event if present.

## 3. AI agent integration (`src/routes/api/chat.ts`)

Add one tool that mirrors `create_job`:

- **`build_interview_loop`** — args: `stages[]` (name, format, duration_min, interviewers[]), optional `context`, `prep_tips`. Server-side: calls `upsertInterviewLoop`, then for stages missing `description`/`focus_areas`/`suggested_questions` runs a single OpenAI completion to fill them (using the existing `openaiChat` helper + job context). Returns `{ loop_id, stages }`. Chat result triggers a tab pulse + auto-open Interviews tab (same `onOpenTab` hook as Job/Outreach).

System-prompt rule (added as a new partial under `src/lib/prompts/`): whenever the user asks for an interview process / loop / "set up interviews", the agent **must** first ask via `ask_clarifying_questions`:
1. Stages (names, in order)
2. Who interviews each one (name + role; email optional)
3. Duration per stage

Once those are answered, call `build_interview_loop` and the AI fills in context, prep tips, focus areas, and suggested questions itself.

Also: extend `get_conversation_context` to include loop stages so follow-up turns can reference them in prose.

## 4. Google Calendar wiring

Reuse existing `googleFetch(userId, "calendar", url, init)` from `src/lib/outreach/google-oauth.server.ts`.

- New helper `src/lib/interviews/calendar.server.ts`:
  - `createCalendarEvent({ userId, schedule, stage, candidate })` → POST to `https://www.googleapis.com/calendar/v3/calendars/primary/events` with attendees (interviewers + candidate email if present), `conferenceData` for Google Meet auto-link, description = stage.description + prep tips. Stores returned `id` in `interview_schedules.google_event_id` and flips `status='confirmed'`.
  - `deleteCalendarEvent` for cancel.
  - `listBusyForWeek({ userId, weekStart })` — freebusy query, optional, used by a future "reshuffle" action (out of scope to fully implement; stub returns empty).

- `confirmAllSchedules` loops over pending schedules and calls `createCalendarEvent`. Surfaces per-row errors instead of failing the whole batch.

If `user_calendar_connections` row missing → server fn throws structured `{ code: "calendar_not_connected" }`, UI shows connect CTA in Schedule view.

## 5. Public candidate-facing chat

`src/routes/api/public/jobs/$slug/chat.ts`: load the job's `interview_loops` row (via `conversation_id`) using `supabaseAdmin` (no auth). Inject a compact system message:

```text
Interview process for this role:
1) Recruiter screen — 30 min video with Ana Torres. Motivation, comp expectations, basic fit.
2) Sales challenge — 60 min async. …
```

So when a candidate asks "what's the interview process?" the public AI can answer.

## 6. UI — `src/components/interviews/interviews-panel.tsx`

Match the visual guidelines from the attached screenshots — same toolbar, same card/divider treatment as Job and Candidates panels (semantic tokens only).

**Subheader**: title + "{N}-stage loop · {M} interviews scheduled this week" + Loop/Schedule segmented control + "Send invites →" button.

**Loop view** (default, also the only view when calendar isn't connected):
- "Interview loop" heading, "{total} total · {count} stages" right-aligned.
- Numbered stage cards. Each row inline-editable:
  - Stage name (click-to-edit text input)
  - Format pill (select: Video / Async / Onsite / Phone)
  - Duration (number input + "min")
  - Interviewer avatar + name (combobox; suggestions from previously-used interviewers)
  - Description (expandable textarea)
  - `…` menu: Move up, Move down, Duplicate, Delete
- Drag handle on left for reordering (use `@dnd-kit/core` — already in deps if present, otherwise simple up/down buttons; check before adding).
- "+ Add stage" dashed button at bottom.
- All edits debounced-save via the upsert server fn; optimistic UI.

**Schedule view**:
- If `user_calendar_connections` missing → centered card: "Connect Google Calendar to schedule interviews" + button reusing `startCalendarConnect` from `src/lib/outreach/calendar.functions.ts`.
- Else: Week header with `<` `>` arrows, Mon–Fri columns, each cell shows scheduled `interview_schedules` rows (time, candidate, stage, "with {interviewer}"). Bottom action bar: "Findable has pre-blocked these slots…" + Reshuffle (stubbed) + Confirm all (calls `confirmAllSchedules`).

## 7. Tabbar integration

`src/routes/_authenticated/app.c.$id.tsx`:
- Add `"interviews"` to the `tab` union.
- Add `<TabButton label="Interviews" />` after Outreach.
- Render `<InterviewsPanel conversationId={...} />` when active.
- Add `interviewsPulse` (true when `build_interview_loop` tool ran in the last turn) — same mechanism as `outreachPulse`.

## Out of scope

- "Reshuffle" actually re-solving against free/busy (stubbed button).
- Per-candidate interview history / scorecards.
- Editing screening questions from this tab (already lives in Job tab).
- Migrating historical conversations that referenced loops in chat — they'll just need to be re-built once.

## Verification

1. Run the migration manually.
2. In a fresh conversation, ask the chat to "set up the interview process". Verify it asks the three required questions (stages, interviewers, durations) before doing anything.
3. Answer → confirm `build_interview_loop` runs, Interviews tab pulses, and the loop renders with AI-filled descriptions + focus areas.
4. Edit a stage name, reorder, add a stage, delete one — refresh, persists.
5. Without Google Calendar connected → Schedule view shows connect CTA.
6. Connect → manually add a schedule via chat ("book Roberto for the recruiter screen Monday 10am"), click Confirm all → Google Calendar event created with attendees + Meet link, schedule row flips to `confirmed`.
7. On the public job page (`/jobs/$slug`), ask the AI "what's the interview process?" → it lists the stages.
