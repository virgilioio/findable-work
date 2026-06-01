## Goal

Three email workstreams, all wired to recruiter-controlled toggles in **Settings → Notifications**:

1. **Applicant confirmation** — applicant gets a branded "we got your application" email when they submit. (Always on — applicant-facing, no recruiter toggle.)
2. **Recruiter new-applicant notifications** — instant per-applicant and/or daily digest, controlled by two toggles in Settings → Notifications.
3. **Outreach verification** — confirm the existing Gmail OAuth send path works end-to-end. No code changes unless bugs surface.

All transactional emails: `From: Findable <no-reply@findable.work>` via Resend HTTP API (reuses `RESEND_API_KEY`).

---

## 1. Shared transactional sender

- `src/lib/email/send.server.ts` — `sendBrandedEmail({ to, subject, html, text, replyTo? })` POSTs to `https://api.resend.com/emails`.
- `src/lib/email/templates.server.ts` — branded HTML matching the auth templates (white bg, Alice + spark wordmark header, same footer). Three templates:
  - `applicationConfirmationHtml({ candidateName, jobTitle, company })`
  - `newApplicantInstantHtml({ recruiterFirstName, applicantName, jobTitle, appUrl })`
  - `newApplicantDigestHtml({ recruiterFirstName, groups: [{ jobTitle, applicants: [{ name, appUrl }] }] })`

## 2. Applicant confirmation (always on)

In `src/routes/api/public/jobs/$slug/apply.ts`, after the application row is inserted:
- Send confirmation to the applicant.
- Wrap in try/catch + console.error — never fail the apply request if email send fails.

## 3. Settings → Notifications (toggles)

Schema migration adds to `profiles`:
- `notify_on_new_applicant boolean not null default true`
- `notify_daily_digest boolean not null default false`
- `last_digest_sent_at timestamptz`

Server fns in `src/lib/notifications.functions.ts`:
- `getNotificationPrefs()` — returns the three fields for `auth.uid()`.
- `updateNotificationPrefs({ notifyOnNewApplicant, notifyDailyDigest })`.

UI in `src/components/settings/settings-dialog.tsx`:
- Add a **Notifications** tab/section (matching existing settings style).
- Two `Switch` rows wired via `useQuery` + `useMutation`:
  - **"Email me when I get a new applicant"** → `notifyOnNewApplicant` (default ON)
  - **"Send me a daily digest of new applicants"** → `notifyDailyDigest` (default OFF)
- Helper copy: "Sent each morning if there's at least one new applicant in the last 24h."
- Optimistic toggle with `toast.success("Notification preferences saved")` / error rollback.
- Both toggles operate independently — a recruiter can have both on, one on, or neither.

## 4. Instant recruiter notification (gated by toggle)

In the apply route, after applicant confirmation:
- `supabaseAdmin` lookup: recruiter's `auth.users.email` + `profiles.notify_on_new_applicant`.
- If `true`, send `newApplicantInstantHtml` linking to `/app/c/{conversationId}`.
- Else skip silently.

## 5. Daily digest (cron, gated by toggle)

New public server route `src/routes/api/public/hooks/send-application-digests.ts`:
- Auth: `apikey` header = Supabase anon key.
- Logic (using `supabaseAdmin`):
  1. Select profiles where `notify_daily_digest = true`.
  2. For each, find applications created since `coalesce(last_digest_sent_at, now() - interval '24h')`, joined to `jobs` for title.
  3. If ≥1 new applicant, send one digest email grouped by job.
  4. `update profiles set last_digest_sent_at = now()`.

pg_cron entry via Supabase insert tool (not migration):
- `0 14 * * *` (≈ 9 AM CDMX year-round average / 14:00 UTC).
- Calls `https://findable-work.lovable.app/api/public/hooks/send-application-digests` with `apikey` header.

## 6. Outreach verification (no code changes expected)

Manual walk-through during build:
1. Confirm `getGmailConnection` returns the connected account.
2. Trigger `ContactAutomation` with one test candidate that has an email; confirm `outreach_threads` + `outreach_messages` rows appear and the email arrives.
3. Check `server-function-logs` filtered by `gmail` for 401/403/scope errors.
4. If a 403 `insufficient authentication scopes` surfaces, trigger Gmail reconnect with `gmail.send`.

Report findings before closing — no code edits unless something fails.

## Technical details

- **Resend send shape**: `POST https://api.resend.com/emails`, `Authorization: Bearer ${RESEND_API_KEY}`, body `{ from: "Findable <no-reply@findable.work>", to, subject, html, text, reply_to? }`.
- **Header/footer**: extract the Alice wordmark + spark SVG block from the auth templates into one shared builder so all 3 templates stay visually identical to auth emails.
- **Existing rows**: defaults make every current recruiter opted into instant notifications and opted out of digest — matches expected behavior for already-engaged users.
- **No new secrets** — `RESEND_API_KEY` already configured.
- **Auth-email SMTP** stays untouched.

## Out of scope

- Per-job notification toggles (global per recruiter for v1).
- Open/click tracking, custom unsubscribe (Resend dashboard handles bounces; transactional notifications to your own users don't legally require unsubscribe).
- Per-recruiter digest timezone (single 14:00 UTC slot for v1).
