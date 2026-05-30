The connector gateway is returning a 500 before redirecting to Google, even on the published domain. That means the app never reaches Google's consent screen, so there is nothing recordable yet.

Plan:

1. Add a temporary “Preview Google permissions” action in Settings → Connections
   - This will open Google's OAuth consent URL directly using the existing Google OAuth client ID.
   - It is only for recording the permissions screen.
   - It will request the same Gmail and Calendar scopes we intend to use.
   - It will not store tokens or mark the account connected.

2. Keep the real Connect Gmail / Connect Calendar buttons intact
   - Those will continue using the Lovable app-user connector flow.
   - Once the upstream connector issue is fixed, the real integration path remains ready.

3. Improve the visible failure state
   - If the real connector returns the current 500, show a clear message that the connector failed before Google opened.
   - Avoid exposing the raw JSON error during the demo.

4. After recording, remove or hide the demo-only action
   - We can either remove it completely or keep it behind a small “demo permissions only” affordance until the connector gateway is healthy.

Technical details:

- Use the existing `GOOGLE_APP_USER_CONNECTOR_CLIENT_ID` server-side value to generate a Google OAuth authorization URL.
- Use response type `code`, access type `offline`, prompt `consent`, and scopes:
  - Gmail send
  - Gmail modify
  - Gmail readonly
  - Calendar readonly
  - Calendar events
- Redirect back to the existing `/oauth/google/return` route, but label this as a demo/preview flow so it does not attempt to complete a real connection.
- No database migration is needed.