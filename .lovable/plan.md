# Diagnose Gmail / Calendar OAuth 500

## What's happening
- `startGmailConnect` / `startCalendarConnect` POST to `https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/authorize`.
- Gateway replies `500 {"type":"internal_server_error","message":"","details":""}`.
- Our request shape is identical to the Gmail flow that previously worked on the Outreach page, so code-wise nothing regressed.
- Env vars (`LOVABLE_API_KEY`, `GOOGLE_APP_USER_CONNECTOR_CLIENT_ID`) are confirmed present.

This is almost certainly an upstream/config issue on the connector gateway — the empty `message`/`details` mean the gateway swallowed whatever happened.

## Steps

1. **Add server-side logging in `authorizeAppUserOAuth`**
   In `src/integrations/lovable/appUserConnector.ts`, on non-2xx log the request payload (connector_id, app_user_id, return_url, scopes — never the API key) and the raw response text + status. This lands in `stack_modern--server-function-logs` so we can see what the gateway actually did.

2. **Test on the published site**
   The known pattern is that preview and published environments use different Lovable Cloud auth configs. Try Connect Gmail / Connect Calendar on `https://findable.work` (Settings → Connections). If published works, the demo recording uses published. If both fail, we have a real gateway-side bug to report.

3. **Pull gateway logs**
   After step 1 deploys, reproduce in preview, then `stack_modern--server-function-logs` filtered by `App User OAuth` to capture the upstream body. Use that to decide whether to file a Lovable Cloud support ticket or adjust scopes / connector_id.

4. **Improve the toast**
   In `settings-dialog.tsx`, when the error message contains `App User OAuth start failed (500)`, surface: "Connector gateway returned an error. Try again on the published site, or contact support if it persists." Avoids the raw JSON blob in the demo.

## Files touched
- `src/integrations/lovable/appUserConnector.ts` — log failure details
- `src/components/settings/settings-dialog.tsx` — friendlier 500 toast for Gmail + Calendar rows

No DB changes. No new server fns. No scope changes (yet — pending what step 3 reveals).
