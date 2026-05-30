Add a dedicated **"Google user data"** section to the privacy policy (src/routes/privacy.tsx) so it meets Google's OAuth verification requirements.

## What to add

Insert a new numbered section titled **"Google user data"** (after the existing "AI processing" section, renumbering subsequent sections) that covers:

1. **Which Google services and scopes we request:**
   - `gmail.send` — send recruiting outreach emails on the user's behalf from their connected Gmail account.
   - `gmail.modify` — manage labels, mark threads read, and update outreach threads created by findable.
   - `gmail.readonly` — read replies to outreach threads so the user can see candidate responses inside findable.
   - `calendar.readonly` — read free/busy and existing events to suggest interview times.
   - `calendar.events` — create, update, and cancel interview events the user schedules through findable.

2. **How we access Google user data:** only after the signed-in user explicitly connects Gmail and/or Google Calendar through OAuth. The user can disconnect at any time from Settings → Connections.

3. **How we use Google user data:** solely for user-facing recruiting features (sending outreach, surfacing replies, scheduling interviews). We do not use it to train AI/ML models, show it to other users outside the workspace, or for advertising.

4. **How we store Google user data:**
   - OAuth tokens are stored encrypted and used only to call Google APIs on the user's behalf.
   - Message metadata and reply content needed to display the inbox are stored in our database under the user's account.
   - Calendar events are stored only as needed to display them in the product.

5. **How we share Google user data:** we do not sell or share Google user data with third parties for their own purposes. It is processed only by our infrastructure subprocessors (hosting, database, AI providers for drafting outreach) to deliver the features the user requested.

6. **Retention and deletion:** Google data is retained while the connection is active. Disconnecting in Settings → Connections revokes findable's access and deletes stored OAuth tokens. Users can also revoke access at myaccount.google.com/permissions. Deleting the findable account removes associated Google data within a reasonable period.

7. **Limited Use disclosure (required verbatim):**
   "findable.work's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements."

Also:
- Bump LAST_UPDATED to today.
- Add a short "What changed" note at the top of the policy referencing the new Google user data section.
- Tighten the existing "Account and login information" bullet about Google OAuth to reference the new section.

No other files change. No database or server changes needed.