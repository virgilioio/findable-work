## Goal
Use the Alice serif font for the "findable" wordmark in all six email templates so the brand stays consistent with the app's logo fallback.

## Changes
For each file in `supabase/email-templates/` (confirm-signup, magic-link, reset-password, invite, email-change, reauthentication):

1. Add a Google Fonts `<link>` for Alice in the `<head>`:
   ```html
   <link href="https://fonts.googleapis.com/css2?family=Alice&display=swap" rel="stylesheet">
   ```
2. Update the wordmark `<div>` to use Alice with a serif fallback:
   ```html
   <div style="font-size:24px;font-weight:400;letter-spacing:-0.01em;color:#0a0a0a;font-family:'Alice',Georgia,'Times New Roman',serif;">findable</div>
   ```

## Notes
- Many email clients (notably Outlook) strip web fonts — the serif fallback (Georgia) keeps the wordmark on-brand even without Alice loading.
- After approval, re-paste each updated HTML file into the matching Supabase email template in the dashboard.
- Body text remains in the system sans-serif stack; only the wordmark uses Alice.