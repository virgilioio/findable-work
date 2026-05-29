## Goal

Replace the "Resume filename" text input on the public apply page with a real drag-and-drop file upload (matching the mockup), store the file in a private bucket, and surface a working "View / Download resume" link in the recruiter's candidate drawer.

## 1. Storage bucket (migration)

Create a private `resumes` bucket with RLS:
- **Public uploads** (anon + authenticated) into `pending/<uuid>.<ext>`, capped to 10 MB and limited to `pdf / doc / docx` MIME types.
- **Read access** only via signed URL generated server-side (no public select policy). Recruiters never read the bucket directly from the browser.

Add `resume_size`, `resume_mime` columns on `applications` (nullable) so the drawer can show "PDF · 184 KB" accurately. `resume_url` already exists and will hold the storage path (e.g. `pending/<uuid>.pdf`), not a public URL.

## 2. Public apply page (`src/routes/jobs/$slug.tsx`)

Replace the "Resume filename" `<Field>` with a `<ResumeDrop>` component matching the mockup styling (dashed border, doc icon, "Drop your resume or browse", "PDF, DOC or DOCX" subtitle, hover/drag state, filled state with filename + X to clear).

Behavior:
- Browse button + drag-and-drop accepted (`accept=".pdf,.doc,.docx"`, max 10 MB).
- On file select: upload directly from the browser to `resumes/pending/<uuid>.<ext>` via the public `supabase` client (anon insert policy on bucket). Show a small spinner during upload; on success store `{ path, filename, size, mime }` in form state.
- On submit, send `resume_path`, `resume_filename`, `resume_size`, `resume_mime` (instead of just `resume_filename`) to the existing apply endpoint.
- Client-side validation: size + extension + MIME, friendly error toast.

## 3. Apply endpoint (`src/routes/api/public/jobs/$slug/apply.ts`)

- Extend the Zod schema with optional `resume_path` (string, max 300, must start with `pending/`), `resume_size` (number ≤ 10 MB), `resume_mime` (enum: pdf/doc/docx).
- On successful insert, persist `resume_url = resume_path`, plus the new `resume_size` / `resume_mime` columns.
- (Optional polish, in same change) move the file from `pending/<uuid>.<ext>` to `applications/<application_id>/<uuid>.<ext>` via `supabaseAdmin.storage.move` so orphan uploads are easy to GC later, and update `resume_url` to the new path.

## 4. Recruiter "View resume" wire-up

Add a tiny `createServerFn` `getResumeSignedUrl({ applicationId })` in `applications.functions.ts`:
- `requireSupabaseAuth`, load `applications` row, verify `recruiter_user_id === userId`, then `supabaseAdmin.storage.from("resumes").createSignedUrl(path, 300)`.

In `candidate-drawer.tsx`:
- In `Overview`'s "Application" section, when `app.resume_url` exists, show the filename + "Open" button that calls the server fn and opens the signed URL in a new tab.
- In the `Resume` tab, replace the hard-coded "Resume.pdf · 184 KB · Download" header with real values from `app` (filename, size, mime) and wire the Download button to the same signed URL. Keep the synthetic resume body below as a placeholder when no parsed resume content exists.

## 5. Out of scope

- Resume parsing / auto-fill (separate feature).
- Migrating older `applications` rows that only have `resume_filename`.
- Virus scanning (would need an external service).

## Technical notes

- Bucket creation lives in a new migration; storage policies are added in the same migration.
- Browser upload uses `supabase.storage.from("resumes").upload(...)` with the publishable key — works because of the anon insert policy on `pending/*`. No service role on the client.
- The apply endpoint never trusts client-provided size/mime alone; it re-reads `storage.objects` metadata for the uploaded path before inserting, and rejects if the path is missing or oversize.
