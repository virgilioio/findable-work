## Add `unpublish_job` tool

Right now the agent can publish a job but has no way to take it down. Add a symmetric `unpublish_job` tool so the user can say "unpublish the job" / "take it offline" / "close applications" in chat.

### Behavior

- Loads the current conversation's `jobs` row.
- If no job, or `published = false`: return a clear no-op result so the agent can tell the user honestly.
- Otherwise update the row:
  - `published = false`
  - `status = 'closed'`
  - Keep `slug`, `published_at`, and `screening` intact so a future `publish_job` re-uses the same URL and questions (idempotent republish).
- Emit a `job` SSE event with the updated row so the Job tab updates live.
- Insert an `agent_tasks` row of kind `unpublish_job` (status `done`, label "Job unpublished", summary "Public page is offline").
- Return `{ ok: true, slug, public_path }` to the model so it can phrase a confirmation.

### Public page behavior

The public job page at `/jobs/$slug` and the apply endpoint at `/api/public/jobs/$slug/apply` should refuse traffic when `published = false`. I'll check both and, if either currently only checks the slug existing, add a `published` guard that returns 404 (page) / 410 Gone (apply). This prevents stale links from accepting new applications after unpublish.

### Files touched

- `src/routes/api/chat.ts`
  - New `unpublishJobTool` definition next to `publishJobTool`.
  - Register it in the `tools: [...]` array (~line 351).
  - New `else if (call.name === "unpublish_job")` branch next to the publish handler.
- `src/routes/jobs.$slug.tsx` (or equivalent public page) — add `published` guard if missing.
- `src/routes/api/public/jobs/$slug/apply.ts` (or equivalent) — reject submissions when `published = false`.

### Out of scope

- No DB migration — `jobs.published` and `jobs.status` already exist.
- No UI changes to the Job tab beyond what the existing `job` SSE event already drives.
- No suggestion pill for unpublish — it's a destructive action the user should initiate explicitly via chat, not via a recommended next step.
