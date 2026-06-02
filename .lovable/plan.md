## Enhance "Report a bug" dialog

Update the dialog to match the mockups with structured fields, and pass them through to the support email.

### UI — `src/components/settings/bug-report-dialog.tsx`

Replace the single-textarea form with:

1. **Area** — `Select` (shadcn) with options:
   - General (default)
   - Chat
   - Job & posts
   - Sourcing
   - Candidates
   - Outreach
   - Interviews
   - Billing & credits
2. **Summary** — short `Input`, placeholder "A short title for the issue", max 140 chars.
3. **What happened?** — `Textarea`, placeholder "What did you do, what did you expect, and what happened instead?", max 4000 chars.
4. **Include technical details (page, browser, timestamp)** — `Checkbox`, default checked.
5. Footer: left-aligned helper text "Goes to support@findable.work", right-aligned Cancel + Send report buttons.
6. Submit disabled until Summary and What happened are both non-empty.
7. On success: toast, reset fields, close.

### Server fn — `src/lib/bug-report.functions.ts`

Extend Zod schema and email template:

- Schema adds `area` (enum of the 8 values above), `summary` (1–140), and `includeTech` (boolean). Keep existing `description` + `pageUrl`. Add optional `userAgent` (≤500) and `clientTimestamp` (≤40).
- Subject becomes `[Bug][{area}] {summary} — {email}`.
- HTML/text body includes Area, Summary, Description, and — only when `includeTech` is true — Page URL, User Agent, Client timestamp, User ID, Server timestamp.

### Client wiring

The dialog sends `userAgent` (`navigator.userAgent`) and `clientTimestamp` (`new Date().toISOString()`) only when the checkbox is checked; otherwise omits them and `pageUrl`.

No changes to `app.tsx` menu or routing — the trigger already opens this dialog.
