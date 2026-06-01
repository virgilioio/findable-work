## Add spark icon to email templates

Extract the 4-pointed spark/star from `src/assets/findable-wordmark.svg` and inline it as an SVG to the left of the "findable" wordmark in all 6 email templates.

### Templates to update
1. `supabase/email-templates/confirm-signup.html`
2. `supabase/email-templates/email-change.html`
3. `supabase/email-templates/invite.html`
4. `supabase/email-templates/magic-link.html`
5. `supabase/email-templates/reauthentication.html`
6. `supabase/email-templates/reset-password.html`

### Approach
- Extract the spark path data from the wordmark SVG and create a small standalone inline SVG (width: 20px, fill: #0a0a0a)
- Replace the current wordmark `<div>` in each template with a layout that places the spark SVG inline to the left of the "findable" text
- Use email-safe HTML: `vertical-align: middle` on both the SVG and a wrapping text span, avoiding flexbox (which breaks in Outlook)
- Keep the Alice font and all existing styling intact

### After implementation
The user will need to copy-paste each updated template HTML into the matching Supabase Auth email template settings (same process as before).