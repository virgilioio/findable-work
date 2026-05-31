## Switch Gmail/Calendar to direct Google OAuth (bypass Lovable broker)

Same pattern as GoGioATS, adapted to TanStack server functions. Stops depending on Lovable's App User Connector entirely.

### 1. Secrets

Add two secrets via `add_secret` — these are your own Google Cloud OAuth client credentials:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Once added, the existing `GOOGLE_APP_USER_CONNECTOR_CLIENT_ID` becomes unused (we can leave it or delete it later).

### 2. Google Cloud Console — authorized redirect URIs

For OAuth client `974778581937-...` (or whichever client you set up), add these to **Authorized redirect URIs**:

- `https://findable.work/oauth/google/return`
- `https://www.findable.work/oauth/google/return`
- `https://id-preview--5ab3d2d7-ec9c-41d4-81ad-06d14aa7d875.lovable.app/oauth/google/return` (for preview testing)

(Note: Google now redirects to *your* app, not Lovable's broker.)

### 3. DB migration — store tokens, not broker IDs

Currently `user_gmail_connections` / `user_calendar_connections` only carry `connection_id` + `email`. Direct OAuth needs the tokens themselves. New migration adds to both tables:

- `access_token text`
- `refresh_token text` (Google's refresh token; long-lived)
- `token_expires_at timestamptz`
- `scope text` (space-separated granted scopes, for validation)

Drop the `connection_id NOT NULL` constraint (make nullable, or remove the column — backward compat doesn't matter since nothing works today).

> Note: Supabase service-role writes bypass RLS, so refresh tokens are never exposed to the client. We do NOT add column-level encryption in this iteration — keeping parity simple. Can add pgsodium-based encryption later if you want it (GoGioATS uses an `encrypt_refresh_token` rpc; we'd replicate that as a follow-up).

### 4. Rewrite server functions

`src/lib/outreach/gmail.functions.ts` and `calendar.functions.ts`:

- **`startGmailConnect` / `startCalendarConnect`** — build a Google authorize URL directly:
  - `client_id` = `process.env.GOOGLE_CLIENT_ID`
  - `redirect_uri` = `returnUrl` from the client
  - `response_type=code`, `access_type=offline`, `prompt=consent` (always issue a refresh token), `include_granted_scopes=true`
  - PKCE: generate `code_verifier` + `code_challenge` (S256). Persist verifier server-side, keyed by a random `state` we stamp with `user_id` + timestamp + nonce (base64 JSON). Either:
    - Store the verifier in a short-lived `oauth_pkce_state` table (cleanest), OR
    - Return it to the client and have it pass back to the callback (GoGioATS pattern).
  - I'll use the **short-lived table** approach — avoids round-tripping the verifier through the browser and survives full-page Google redirects without sessionStorage gymnastics.
  - Return `{ authorizationUrl }` to the client (existing UI code keeps working — it already does `window.location.href = authorizationUrl`).

- **`completeGmailConnect` / `completeCalendarConnect`** — accept `{ code, state }` (not `connectionId` anymore):
  - Look up + delete the PKCE row by state; verify it belongs to `userId` and isn't older than 10 min.
  - POST to `https://oauth2.googleapis.com/token` with `client_id`, `client_secret`, `code`, `code_verifier`, `grant_type=authorization_code`, `redirect_uri`.
  - Validate granted scopes contain the required ones.
  - Fetch `https://www.googleapis.com/oauth2/v2/userinfo` for the email.
  - Upsert into `user_gmail_connections` / `user_calendar_connections` with tokens + expiry + scope.

- **New helper `getAccessTokenForUser(userId, kind)`** in a shared `src/lib/outreach/google-oauth.server.ts`:
  - Loads the row, returns `access_token` if not expired (with 60s buffer).
  - Otherwise POSTs to Google's token endpoint with `refresh_token` + `client_id` + `client_secret`, updates the row, returns the new token.

- **Replace `callAsAppUser(...)`** with a `googleFetch(userId, kind, path, init)` wrapper that gets a fresh access token, sets `Authorization: Bearer ...`, and calls Google directly (`https://gmail.googleapis.com/...` or `https://www.googleapis.com/calendar/v3/...`). One-line change at each of the 4 existing call sites.

### 5. OAuth return route

`src/routes/_authenticated/oauth.google.return.tsx`:

- Read `code` + `state` from query string (replaces `connection_id` + `success`).
- Call `completeGmailConnect({ code, state })` or `completeCalendarConnect`, dispatched by the `google_oauth_kind` sessionStorage key (unchanged).
- Same UI for success/error.

### 6. Cleanup

- Delete `src/integrations/lovable/appUserConnector.ts` (no longer used).
- Leave `GOOGLE_APP_USER_CONNECTOR_CLIENT_ID` secret in place for now; can delete after we verify the new flow.

### Files touched

- New SQL migration: add columns to `user_gmail_connections` + `user_calendar_connections`; new table `oauth_pkce_state(state pk, user_id, code_verifier, kind, created_at)` with RLS + a cleanup policy.
- `src/lib/outreach/google-oauth.server.ts` — NEW (token refresh helper + Google fetch wrapper).
- `src/lib/outreach/gmail.functions.ts` — rewrite start/complete; swap `callAsAppUser` → `googleFetch` at 3 call sites.
- `src/lib/outreach/calendar.functions.ts` — same.
- `src/routes/_authenticated/oauth.google.return.tsx` — new query-param contract.
- `src/integrations/lovable/appUserConnector.ts` — delete.
- `src/components/settings/settings-dialog.tsx` — no change (the start/return URL contract is unchanged from the UI's perspective).

### What I need from you to start

1. Approve the plan.
2. After approval I'll request the two secrets via the secrets prompt: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`. Have them ready from Google Cloud Console → Credentials → your OAuth 2.0 Client.
3. Add the three redirect URIs to that OAuth client in Google Cloud Console (listed in section 2).
