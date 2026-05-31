## The problem

Today there are two overlapping concepts:

- **Job** (`jobs` table) — the real, powerful thing. Has `slug`, `published`, AI-generated `screening` questions, a live public page at `/jobs/$slug`, and a working application form (`/api/public/jobs/$slug/apply`).
- **Job Post** (`job_posts` table) — a pretty mockup. Stores `variants`, `channels`, `schedule`, `est_reach`. Nothing is ever actually posted anywhere; clicking "Publish" just flips a status flag in the DB.

The "Draft the job posts for this role" suggestion pill currently runs `draft_job_posts`, which builds the mockup. That's wasted intent — when the user clicks it, they think they're publishing.

## The fix

Rewire that pill so it does what users expect: **publish the real, live public Job**, with AI-generated vetting questions. Remove the decorative Job Posts surface so it stops competing for attention.

### 1. Rewire the `draft_job_posts` tool in `src/routes/api/chat.ts`

- Rename the tool to `publish_job` (update tool name, description, and the dispatch branch around line 986). Keep `draft_job_posts` as a back-compat alias for one release so older streamed messages don't break.
- New behavior of the handler:
  1. Load the existing `jobs` row for this conversation (error out cleanly if none exists — the model should `create_job` first).
  2. If `screening` is empty, generate AI vetting questions using the existing `src/lib/jobs/screening.server.ts` helper.
  3. Ensure a unique `slug` (derive from `title`, dedupe if taken).
  4. Update the job: set `screening`, `slug`, `published = true`, `published_at = now()`.
  5. Emit an `agent_tasks` row of kind `publish_job` with a `done` status, summary "Live at /jobs/{slug}", and `data: { slug, public_url }`.
  6. Stream the updated `job` event so the Jobs panel updates in place.
- Update the suggestion-pill proposal around line 1336: change the title from "Draft the job posts" to **"Publish this job"** (or "Publish the public job post") and point its action at the new `publish_job` tool.
- Update the system prompt / tool descriptions wherever they reference job-post drafting so the model understands the new semantics.

### 2. Retire the decorative Job Posts surface

- Delete `src/components/job-posts/job-posts-panel.tsx` and remove its tab from the conversation page (`src/routes/_authenticated/app.c.$id.tsx`).
- Delete `src/lib/job-posts.functions.ts` (`updateJobPost`, `regenerateJobPosts`) and `src/lib/job-posts/builder.server.ts`.
- Remove the `job_posts` event branch from `src/routes/api/chat.ts` and any client subscriber.
- Add a migration that drops the `job_posts` table (with its policies). This is destructive; only do it after confirming with the user that no production data depends on it.

### 3. Surface the real publish state in the Jobs tab

- Make sure the existing Jobs panel clearly shows: `Published` badge, the public URL with copy button, and the screening questions list. If those affordances already exist, just confirm; if not, add them in the same edit.
- The task card the agent emits ("Live at /jobs/{slug}") should link directly to the public page.

### 4. Task-card label

The new proposal pill renders via the existing `task-card.tsx` "Recommended" treatment — no component changes needed. Just the title/action change in `chat.ts`.

## Open question for you

The Job Posts tab today has channel selection and scheduling UI (LinkedIn, Indeed, OCC Mundial, etc.). **Do you want to keep any of that?** Three options:

1. **Drop it entirely** (cleanest — what this plan currently proposes). The Job becomes the single source of truth; sharing happens via the public URL.
2. **Keep channel selection as a follow-up step** after publish, but as a real integration (LinkedIn posting via OAuth, etc.) — much bigger scope, separate plan.
3. **Keep the channels UI as a "share to" helper** that just deep-links to LinkedIn/Twitter share intents with the public URL prefilled — small scope, still useful.

If you don't pick, I'll go with option 1.
