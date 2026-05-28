## Goal

When the user confirms "yes, draft the job post next" in chat, the agent should produce a real **Job Posts** artifact (a new tab next to Job/Candidates) with 3 copy variants, channel selection, and a schedule — matching the screen recording. After it's done, the chat should propose the interview loop as the next step.

This plan covers Job Posts only. Interviews stays scoped for a follow-up.

---

## 1. Database — new `job_posts` table

Single row per `conversation_id`. All structured content stays in JSONB so we can iterate without further migrations.

Columns:
- `id`, `conversation_id` (unique), `user_id`, `created_at`, `updated_at`
- `variants jsonb` — array of 3 objects: `{ key: "punchy"|"mission_led"|"concise", title, body }`
- `channels jsonb` — array of `{ key, name, audience, price, currency, duration_days, recommended, selected, kind: "job_board"|"social" }`
- `schedule jsonb` — `{ go_live: ISO|null, go_live_label, auto_close_days, ab_test: boolean }`
- `est_reach integer` (cached number, e.g. 152000)
- `status text` default `'draft'` (`draft` | `published`)

RLS: same 4-policy `auth.uid() = user_id` pattern as `jobs`; grant select/insert/update/delete to `authenticated`, all to `service_role`. Trigger `set_updated_at` on update.

---

## 2. Agent — new `draft_job_posts` tool

In `src/routes/api/chat.ts`:

- Add tool definition `draft_job_posts` with params `{ tone_focus?: string, language?: string, regions?: string[] }` — all optional; the agent uses the job row for context.
- Register in `tools: [...]`.
- Handler: load the `jobs` row for `conversation_id`. Synthesize 3 variants by asking the gateway with a short instruction (or, simpler for v1, derive deterministic variants from the job title/description). Build a default channel list:
  - LinkedIn (recommended), OCC Mundial (recommended if location in MX/LATAM), Bumeran (LATAM), We Work Remotely (if remote-friendly), Indeed (local).
  - Pre-select LinkedIn + top regional + Indeed.
- Default schedule: `go_live = tomorrow 9:00`, `auto_close_days = 30`, `ab_test = true`.
- `est_reach`: sum of channel audience sizes.
- Upsert into `job_posts`, emit `agent_tasks` row with `kind: "create_job_posts"`, `label: "Job post variants drafted"`, `summary: "Open Job Posts tab to review"`, and `send("task", ...)`.
- Send `send("job_posts", row)` so the client can mark the tab pulse.

Update `SYSTEM_PROMPT`:
- Add `draft_job_posts` to the tool list and to the mandatory flow.
- New rule: when the user confirms drafting the job post (after Job + Candidates exist), call `draft_job_posts` and then propose `"Ready to set up the interview loop?"` as the next step.
- Keep the existing "no echo / one short lead-in" rules.

---

## 3. UI — new Job Posts tab

### 3a. Tab plumbing — `src/routes/app.c.$id.tsx`

- Extend tab state union to `"chat" | "job" | "job_posts" | "candidates"`.
- Add `<TabButton>` for Job Posts using the existing `Megaphone` icon, only when `jobPost` exists. Add `jobPostsPulse` state set by the SSE `job_posts` event, mirroring the existing `pulse` behavior.
- Surface `job_posts` row from `getConversation` (add a join below).
- Render `<JobPostsPanel job={job} jobPost={jobPost} conversationId={id} onAskRevise={...} />` when tab is `"job_posts"`.

### 3b. Loader — `src/lib/conversations.functions.ts`

Add `job_posts` to the parallel `Promise.all` and return `jobPost: jobPost ?? null` from `getConversation`.

### 3c. Task card kind — `src/components/chat/task-card.tsx`

Extend `ARTIFACT_BY_KIND` with:
```ts
create_job_posts: { tab: "job_posts", icon: <Megaphone size={14} />, subtitle: "Open Job Posts tab to review" }
```
Extend the `onOpenTab` type to allow `"job_posts"`. Propagate the wider union through `ChatPanel` and `CandidatesPanel`'s `onOpenTab` prop.

### 3d. New component — `src/components/job-posts/job-posts-panel.tsx`

Layout (matches the recording):

```text
┌──────────────────────────────────────────────────────────────┐
│ 📣 Job Posts              [↻ Regenerate]  [Publish to N ▸]   │
│ 3 copy variants · N channels selected · est. reach ~152k     │
├──────────────────────────────────────────┬───────────────────┤
│ [Punchy] [Mission-led] [Concise]         │ CHANNELS          │
│   subline under each tab                 │ ☑ LinkedIn  RECOM │
│                                          │ ☑ OCC Mundial     │
│ <Title — editable, larger>               │ ☐ Bumeran         │
│ N chars · N words                        │ ☐ We Work Remotely│
│                                          │ ☑ Indeed MX       │
│ <Body textarea, full width>              │                   │
│                                          │ SCHEDULE          │
│                                          │ Go live  …        │
│ [📋] [✨]   [Preview as LinkedIn post]   │ Auto-close  …     │
│                                          │ A/B test  …       │
└──────────────────────────────────────────┴───────────────────┘
```

Behaviors:
- Three variant tabs at top; clicking one swaps which `{title, body}` is shown in the editable area below. Edits debounce-save to `job_posts.variants` via a new `updateJobPost` server fn.
- Channel checkboxes toggle `selected`; subhead recomputes "N channels selected · est. reach ~Xk" from selected channels' audience sums.
- Schedule rows are static-looking but read from `schedule` (no editor needed for v1 — labels only).
- `Regenerate` calls a new server fn that re-runs the variant generation (or, simpler for v1, opens the chat composer pre-filled with `"Regenerate the job post variants. Make them: "` similar to existing `onAskRevise`).
- `Publish to N channels` is a stub button that toasts "Publishing is coming soon" and flips `status = 'published'` (no real integration).
- `Preview as LinkedIn post` opens a small modal/drawer showing the active variant as a LinkedIn-styled card (simple presentation only).

### 3e. Server fn — `src/lib/job-posts.functions.ts`

- `updateJobPost({ conversationId, variants?, channels?, schedule?, status? })` — partial update with the same `requireSupabaseAuth` middleware pattern as `updateJob`.
- `regenerateJobPosts({ conversationId })` — re-runs the deterministic builder server-side and overwrites `variants` (and recomputes `est_reach`); used by the Regenerate button so the user doesn't have to round-trip through chat.

---

## 4. Verification

Open the existing SDR conversation that already has Job + Candidates and the "Want me to draft a job post for this role next?" nudge:

1. Reply "yes" → agent calls `draft_job_posts`; a new "Job post variants drafted" card appears below the chat tasks; a new **Job Posts** tab pulses.
2. Open the Job Posts tab → see header + subhead + 3 variant tabs + editable copy + right-column CHANNELS and SCHEDULE, matching the recording.
3. Toggle a channel checkbox → subhead and "Publish to N channels" button update.
4. Edit the title/body → reload page, edits persisted.
5. After the tool runs, the chat closes with "Ready to set up the interview loop?" (no Interviews tab built yet — that's the next plan).

---

## Out of scope (intentional)

- Interviews tab and `interview_loops` table — separate follow-up.
- Real publishing to LinkedIn/Indeed/etc. — UI only.
- Editing the schedule (date picker, A/B test toggle) — read-only for v1.
- Changing the logo/glyph or other visual polish.