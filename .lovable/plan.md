
## Goal

Close the loop: **Job → Publish → Public apply page → Application → Candidate (Applied)**.

When a recruiter publishes a job, we generate a shareable URL (`findable.work/jobs/{slug}`). Anyone can open it, see the JD, fill a form with AI-generated screening questions, and submit. The submission lands as a candidate in the recruiter's pipeline at stage **Applied**, with all answers attached.

---

## 1. Data model (migration)

Extend `jobs`:
- `slug TEXT UNIQUE` (e.g. `sdr-saas-cdmx-3f9k`) — generated on publish
- `published BOOLEAN NOT NULL DEFAULT false`
- `published_at TIMESTAMPTZ`
- `company TEXT`
- `summary TEXT` (separate from raw `description`)
- `responsibilities TEXT[]`
- `must_have TEXT[]`
- `nice_to_have TEXT[]`
- `screening JSONB NOT NULL DEFAULT '[]'` — array of `{id, type:"select|multi|textarea", question, options?, required}`

New table `applications`:
- `id, created_at`
- `job_id UUID REFERENCES jobs(id) ON DELETE CASCADE`
- `recruiter_user_id UUID` (denormalized for RLS / fast inbox)
- `name, email, phone, linkedin, location` TEXT
- `resume_filename TEXT, resume_url TEXT`
- `answers JSONB` (`{[qid]: string | string[]}`)
- `status TEXT DEFAULT 'applied'`
- `candidate_id UUID` (filled after intake)

Extend `candidates`:
- Add `application_id UUID` (nullable) so the profile drawer can render answers.
- Stage `Applied` already a valid free-text value — no schema change, but UI now treats it as the first stage.

**RLS / GRANTs:**
- `applications`: `authenticated` can SELECT/UPDATE/DELETE WHERE `recruiter_user_id = auth.uid()`. **No anon access** — inserts go through a public TSS route using `supabaseAdmin`.
- `jobs`: keep current owner-only RLS for the app. Public reads happen through a public TSS route using `supabaseAdmin` that projects only safe columns and filters `published = true`.

Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.applications;` so the recruiter's Candidates tab can subscribe.

## 2. Server functions (`createServerFn`, auth-protected)

`src/lib/jobs.functions.ts` additions:
- `publishJob({ conversationId })` — generates slug if missing, sets `published=true`, `published_at=now()`, `status='open'`. If `screening` is empty, calls `generateScreeningQuestions` (Lovable AI Gateway, `google/gemini-2.5-flash`) from JD content to fill it. Returns `{ slug, publicUrl }`.
- `unpublishJob({ conversationId })` — `published=false`, `status='draft'`.
- `regenerateScreening({ conversationId })` — re-runs the AI generator and saves.
- `updateScreening({ conversationId, screening })` — manual edits.

New `src/lib/applications.functions.ts`:
- `listApplications({ conversationId })` — recruiter inbox.
- `convertApplicationToCandidate({ applicationId })` — used internally by the public submit route; idempotent.

## 3. Public TSS routes (no auth, under `/api/public/*`)

`src/routes/api/public/jobs/$slug.ts` — `GET`: returns the published job (safe columns only: title, company, location, type, comp, summary, responsibilities, mustHave, niceToHave, screening). 404 if not found or `published=false`.

`src/routes/api/public/jobs/$slug/apply.ts` — `POST`:
- Zod-validate input (name 1–200, email valid, phone/linkedin/location optional + length caps, answers required-fields per the job's `screening`).
- Basic rate limit: reject if same email submitted to same job within last 60s.
- Insert into `applications` with `supabaseAdmin`, then create a `candidates` row at stage `Applied`, source `Application`, linked via `application_id`. Compute initial match score from heuristics in spec (+12 exceeded quota, +8 if 3–5/5+ yrs).
- Return `{ ok: true }`.

Resume upload (v1): accept a filename string only (no file storage yet). Add a TODO note for a follow-up that wires Supabase Storage with a signed upload URL.

## 4. UI

### A. Job tab (`app.c.$id.tsx` — job section)
- Replace the single "Publish" button with a status pill that, when **Live**, becomes a dropdown: *View posting*, *Copy public link*, *Unpublish*.
- Add a "Published" banner: `Live at findable.work/jobs/{slug}` + Copy + Open buttons.
- Add an **applicant count** chip in the meta row (subscribes to realtime on `applications`).
- New card **"Application questions"** listing screening questions (badge: "✨ Generated from job description"), with *Regenerate* + per-question edit (text, options, required toggle).

### B. Public apply page (new route)
`src/routes/jobs/$slug.tsx` — public, no app chrome.
- Loader fetches `/api/public/jobs/{slug}` (so SSR works without auth).
- Layout: top bar wordmark, two columns. Left = JD render. Right = sticky application form.
- Form fields: resume filename (drag/drop UI, stored as filename only in v1), name*, email*, phone, linkedin, location, then one field per screening question. Chips for select, multi-select chips for multi, textarea for free text. Client-side validation matches server-side Zod.
- Submit → POST to `/api/public/jobs/{slug}/apply` → success screen.
- If 404 / unpublished → "This posting isn't live yet" empty state.
- Each page sets `head()` with role title, company, og:title, og:description so links share well.

### C. Candidates tab (`candidates-panel.tsx`)
- Add `Applied` as the first stage chip; treat it as an entry stage alongside `Sourced`.
- Subscribe to `applications` realtime channel filtered by `recruiter_user_id`. On insert: invalidate candidates query + toast `New applicant: {name}`.
- New rows show globe icon (source = Application).

### D. Candidate drawer (`candidate-drawer.tsx`)
- If candidate has `application_id`, fetch the application and render a new **"Application responses"** section: which job + timestamp, then each question with its answer (multi rendered as chips).
- Contact info uses real submitted email/phone/linkedin/location.
- First activity event: "Applied via public job post — {jobTitle}".

## 5. AI screening generation

Add `src/lib/jobs/screening.server.ts`:
- Prompt stored in `prompts` table as `jobs.screening` (editable via `/admin/prompts`).
- Input: title + summary + must-have + nice-to-have.
- Output via OpenAI tool-call (structured JSON) → 4–6 questions, mix of select/multi/textarea, all with stable `id` slugs.
- Called from `publishJob` if `screening` is empty, and from `regenerateScreening`.

## 6. Acceptance checks

- Publishing flips status to Live, creates slug, exposes `/jobs/{slug}`.
- Live pill dropdown: View posting / Copy link / Unpublish all work.
- Unpublishing returns "not live yet" on the public page.
- Public page renders JD + screening; required-field validation blocks submit and highlights fields.
- Submitting shows success screen, creates `applications` row + `candidates` row at `Applied`.
- Recruiter's Candidates tab shows the new applicant within ~2s without manual refresh; toast fires.
- Candidate drawer shows answers, real contact data, and the "Applied via public job post" activity event.
- Job applicant count increments live.

## Files touched

- `supabase/migrations/<new>.sql` — slug/publish/screening cols on `jobs`, new `applications` table + RLS + GRANTs + realtime publication.
- `src/lib/jobs.functions.ts` — `publishJob`, `unpublishJob`, `regenerateScreening`, `updateScreening`.
- `src/lib/jobs/screening.server.ts` (new) — AI generator.
- `src/lib/applications.functions.ts` (new) — recruiter-side reads.
- `src/routes/api/public/jobs/$slug.ts` (new) — GET public job.
- `src/routes/api/public/jobs/$slug/apply.ts` (new) — POST application.
- `src/routes/jobs/$slug.tsx` (new) — public apply page (public route, no `_authenticated`).
- `src/routes/_authenticated/app.c.$id.tsx` — Job tab: status dropdown, published banner, applicant count, screening card.
- `src/components/candidates/candidates-panel.tsx` — Applied stage + realtime subscription + toast.
- `src/components/candidates/candidate-drawer.tsx` — Application responses section.
- `prompts` table — new row `jobs.screening` (DB migration insert).

No new npm deps.
