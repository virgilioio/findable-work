# Enforce a standard JD structure in the Job tab

Today the Job tab renders a free-form "Summary" markdown blob plus a single "Requirements" list. The database, the public job page, and the screening generator already support a proper JD structure (`summary`, `responsibilities`, `must_have`, `nice_to_have`), but the agent tool and the internal editor never use it — so every JD ends up as a wall of markdown. This plan makes the structure mandatory everywhere the JD is produced, stored, and edited internally.

## Target JD structure (fixed sections)

Every Job tab and every agent-generated JD must have:

1. **About the role** — one short paragraph (2–4 sentences), plain prose.
2. **Responsibilities** — bulleted list ("What you'll do").
3. **Must-have requirements** — bulleted list (hard requirements).
4. **Nice to have** — bulleted list (optional).
5. **Details** (right rail, unchanged) — location, employment type, compensation.
6. **Application questions** (unchanged) — existing screening section.

No free-form markdown body. No mixed prose-and-bullets blob.

## Changes

### 1. `src/routes/api/chat.ts` — `create_job` tool

- Replace the tool schema so the model is forced to emit the structured shape:
  - `title` (required)
  - `summary` (required, short paragraph)
  - `responsibilities: string[]` (required, ≥3)
  - `must_have: string[]` (required, ≥3)
  - `nice_to_have: string[]` (optional)
  - `location`, `employment_type`, `salary_min`, `salary_max`, `currency` (unchanged)
- Drop the free-form `description` from the tool's required surface. Compose it server-side from the structured parts (markdown with `## What you'll do` / `## Must have` / `## Nice to have`) so downstream consumers (public `/jobs/$slug`, exports, anything reading `jobs.description`) keep working.
- Persist all structured fields on the upsert (currently only `description` + `requirements` are written). Mirror `must_have` into `requirements` for back-compat with existing screening callers that still read `requirements`.
- Update the agent system prompt section that documents `create_job` to spell out the required structure and forbid prose dumps in `summary`/`responsibilities` items.

### 2. `src/routes/_authenticated/app.c.$id.tsx` — `JobPanel`

Rebuild the main column to render the fixed sections in order. Each section has the same view/edit pattern already used for Requirements (read = bulleted list, edit = textarea with one item per line; the paragraph sections use a single textarea).

- **About the role** — bind to `form.summary`. View = paragraph. Edit = `<Textarea rows={4}>`. Autosave via existing `save({ summary })`. Remove the current Markdown render of `description`.
- **Responsibilities** — bind to `form.responsibilities`. Same pattern as Requirements.
- **Must-have requirements** — bind to `form.must_have`. Rename the existing "Requirements" section to this; keep the underlying list logic. On save, also mirror to `requirements` so legacy reads stay populated.
- **Nice to have** — bind to `form.nice_to_have`. New section, identical pattern, hidden in view mode when empty (with a subtle "Add nice-to-haves" affordance in edit mode).
- Empty-state copy for each section ("No responsibilities yet — ask the assistant to draft them, or click Edit to add your own.").
- Keep the sub-header, right rail, publish controls, and Application Questions section exactly as they are.

### 3. `src/lib/jobs.functions.ts`

Already accepts `summary`, `responsibilities`, `must_have`, `nice_to_have` in the update schema — no schema change needed. Just confirm the `save()` calls from the new editor land cleanly (they will, since the zod schema is already permissive).

## Backward compatibility

- Existing jobs that only have `description` + `requirements` populated: the new editor falls back to showing `description` as the **About the role** paragraph if `summary` is empty, and treats `requirements` as **Must-have** if `must_have` is empty. Once the user edits and saves, the structured fields take over.
- Public job page (`src/routes/jobs/$slug.tsx`) already prefers `must_have` over `requirements` and renders `responsibilities` / `nice_to_have` — no change needed.

## Out of scope

- DB migrations (all columns already exist).
- Public job page redesign.
- Screening question generation (already reads `must_have` / `nice_to_have`).
- ThinkingTicker / WorkingPill / task-card persistence (untouched).
