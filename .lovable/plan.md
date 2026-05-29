# Real Gmail outreach + Inbox

Two pieces:
1. Each recruiter connects their own Gmail once. Findable sends and reads replies through their inbox via Gmail API (per-user OAuth, not the workspace connector).
2. Add an Inbox view next to Templates in the Outreach tab, backed by real Gmail threads.

LinkedIn stays "send-only" and is excluded from the Inbox for v1.

## How Gmail OAuth works (what the recruiter sees)

- New empty state in Outreach: **"Connect your Gmail to send for real"** → button opens Google consent.
- After consent, Findable stores a `connection_id` against the recruiter. From then on, every email send goes out **from their address** and replies land in **their inbox**.
- A small "Connected as ana@findable.work · Disconnect" pill replaces the empty state.
- If the user hasn't connected Gmail and clicks "Contact selected" on email candidates, we show a one-click "Connect Gmail to send" inline prompt instead of failing.

## Architecture (technical)

Uses Lovable's **App User Connector** flow (`callAsAppUser`, `authorizeAppUserOAuth`) — this is the supported path for per-end-user OAuth, distinct from the builder-only Gmail connector.

### Secret
Add `GOOGLE_APP_USER_CONNECTOR_CLIENT_ID` via `add_secret` (the Google OAuth client ID configured for app-user mode in Lovable).

### New table `user_gmail_connections`
- `user_id` (uuid, pk, references auth.users)
- `connection_id` (text) — handle for `callAsAppUser`
- `email` (text) — connected address, for display
- `created_at`, `updated_at`
- RLS: user can read/delete their own row only; inserts via service role from the OAuth return route.

### New table `outreach_threads`
Persists every sent outreach + reply so the Inbox survives reloads and we don't re-fetch Gmail on every render.
- `id`, `user_id`, `conversation_id`, `candidate_id`
- `gmail_thread_id` (text, unique per user)
- `subject`, `last_snippet`, `last_message_at`
- `status` (`sent` | `opened` | `replied`)
- `unread` (boolean) — drives the badge count
- RLS: user-scoped.

### New table `outreach_messages`
- `id`, `thread_id`, `user_id`
- `gmail_message_id` (text, unique), `direction` (`out` | `in`)
- `from`, `to`, `subject`, `body_text`, `sent_at`
- RLS: user-scoped.

### Server functions (`src/lib/outreach/gmail.functions.ts`, server-only helpers in `*.server.ts`)
- `startGmailConnect()` → calls `authorizeAppUserOAuth({ connectorId: "google", scopes: ["gmail.send","gmail.modify","gmail.readonly"] })`, returns `authorizationUrl`.
- `sendOutreachEmail({ candidateId, subject, body })` → builds RFC2822, base64url-encodes, POSTs to `gmail/v1/users/me/messages/send` via `callAsAppUser`, then inserts a row in `outreach_threads` + `outreach_messages`.
- `listThreads({ conversationId, filter })` → reads from `outreach_threads` (DB, not Gmail) for fast list rendering.
- `getThread({ threadId })` → returns messages from `outreach_messages`.
- `replyInThread({ threadId, body })` → sends via Gmail with proper `In-Reply-To`/`References` headers so it threads correctly in the candidate's inbox.
- `syncReplies()` → calls `gmail/v1/users/me/messages?q=in:inbox newer_than:7d` for each known `gmail_thread_id`, fetches new messages, marks threads `replied` + `unread:true`.

### Public OAuth return route
`src/routes/oauth/google/return.tsx` — parses `connection_id` from query, calls a server fn that:
1. Reads the connected email via `gmail/v1/users/me/profile` (`callAsAppUser`).
2. Upserts `user_gmail_connections` for the current user.
3. Redirects to `/app` (or back to the originating conversation).

### Reply polling
On the Inbox view, a `useQuery` with a 30s `refetchInterval` calls `syncReplies()` then `listThreads()`. No webhooks/cron in v1 — good enough for a demo and trivial to upgrade later to Gmail push notifications.

## Inbox UI (Outreach tab)

New `view: "templates" | "inbox"` segmented control in the Outreach sub-header next to the channel/tone toggles. Inbox shows a numeric badge with `unread` count.

### Layout — two-pane, full height
```text
┌────────────────────────────┬───────────────────────────────────────────┐
│ Threads (320px)            │ Conversation                              │
│ ┌────────────────────────┐ │ ┌───────────────────────────────────────┐ │
│ │ [All|Replied|Awaiting] │ │ │ María F · Senior SDR · Email  [Sent]  │ │
│ ├────────────────────────┤ │ ├───────────────────────────────────────┤ │
│ │ • MF María Fernández  ✉│ │ │                                       │ │
│ │   "Sounds great, can…" │ │ │           ┌────────────────────────┐  │ │
│ │   2h · ● Replied       │ │ │           │ Hi María, I'm helping… │  │ │
│ │ ─────────────────────  │ │ │           └────────────────────────┘  │ │
│ │ • CR Carlos Ramírez   ✉│ │ │  ┌───────────────────────┐            │ │
│ │   "Initial outreach"   │ │ │  │ Sounds great, can we… │            │ │
│ │   1d · ○ Awaiting      │ │ │  └───────────────────────┘            │ │
│ └────────────────────────┘ │ ├───────────────────────────────────────┤ │
│                            │ │ [reply composer · Enter to send]      │ │
└────────────────────────────┴───────────────────────────────────────────┘
```

- **Left pane**: thread list. Avatar, name, channel icon (envelope), last snippet, relative time, status dot (filled = replied, hollow = awaiting). Filter chips: `All | Replied | Awaiting`. Click to select.
- **Right pane**: header with candidate name/role, channel pill, status badge (`Sent → Opened → Replied`). Message bubbles: outbound right-aligned dark (matches existing chat bubble), inbound left-aligned light. Below: composer textarea with Enter-to-send (Shift+Enter newline), Send button.
- Empty inbox state: "No outreach yet. Send your first email from a candidate to start a conversation."
- Not-connected state: prompt to connect Gmail.

### Wiring into Candidates
When the user clicks "Contact selected" on email candidates in `candidates-panel.tsx`, we now call `sendOutreachEmail` per candidate (no loop UI change — it already iterates). If Gmail isn't connected, surface the connect prompt instead of marking them Contacted.

## Out of scope (v1)

- LinkedIn replies (no API) — LinkedIn rows still mark as Contacted but don't appear in Inbox.
- Open tracking (would need a tracking pixel route; status stays at `Sent`/`Replied` only — drop "Opened" from the badge or label it "not tracked yet").
- Microsoft 365.
- Background cron for reply sync — polled on Inbox open.

## Files

**New**
- `supabase/migrations/<ts>_outreach_inbox.sql` — 3 tables + RLS + grants
- `src/integrations/lovable/appUserConnector.ts` — per the TanStack app-user knowledge
- `src/lib/outreach/gmail.functions.ts` + `gmail.server.ts`
- `src/lib/outreach/threads.functions.ts`
- `src/routes/oauth/google/return.tsx`
- `src/components/outreach/inbox-panel.tsx`
- `src/components/outreach/connect-gmail-card.tsx`

**Modified**
- `src/components/outreach/outreach-panel.tsx` — add Templates/Inbox switch + connection pill
- `src/components/candidates/candidates-panel.tsx` — route "Contact" through `sendOutreachEmail`
- `src/lib/outreach/outreach.functions.ts` — keep template CRUD; `contactCandidates` now delegates to gmail sender when channel=email and Gmail connected

## Secret to request
`GOOGLE_APP_USER_CONNECTOR_CLIENT_ID` — added via `add_secret` before implementation.
