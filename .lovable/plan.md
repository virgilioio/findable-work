# Admin Usage Dashboard

Add an internal, admin-only view to see real product activity per user — no new tracking infrastructure, just smart queries over the data already in your database.

## Where it lives

- New route: `/admin/usage`
- Gated by the existing `has_role(auth.uid(), 'admin')` check (same pattern used for `prompts` admin pages). Non-admins get redirected to `/`.
- Linked from the existing admin nav.

## What it shows

**1. Top summary cards (last 30 days, with deltas vs. previous 30):**
- Total users
- Active users (signed in or performed any write)
- New signups
- Jobs published
- Applications received
- Outreach messages sent
- Sourcing credits consumed
- Hiring-assistant chats (see note below)

**2. Per-user table** — one row per user in `profiles`, sortable/searchable, with:
- Name / email (joined from `auth.users` via a SECURITY DEFINER admin function — never expose `auth.users` directly to the client)
- Plan, credits remaining
- Signed up (created_at)
- Last activity (max of writes across their tables)
- Jobs created / published
- Applications received (on their jobs)
- Candidates sourced this month
- Outreach threads / messages sent
- Sourcing credits used (current month)
- Expandable row → per-user activity timeline (recent jobs, recent applications, recent outreach)

**3. Charts:**
- Signups per day (30/90 day toggle)
- Jobs published per day
- Applications per day
- Outreach sent per day

**4. Filters:** date range, plan, "active only".

## Hiring-assistant usage (small addition)

You don't currently log assistant chats, so we can't report on them yet. I'll add a lightweight `assistant_chat_events` table (job_id, slug, lang, question_length, had_form_context, created_at — no PII, no message content) and write one row per chat call. Then the dashboard shows: chats/day, top jobs by chat volume, % falling back to scripted answers.

## Security / data access

- All queries go through `createServerFn` + `requireSupabaseAuth`, with an early `has_role(userId, 'admin')` check inside the handler. Non-admins get a 403.
- One SECURITY DEFINER SQL function `public.admin_user_directory()` returns `(id, email, created_at, last_sign_in_at)` from `auth.users` joined with `profiles` — only callable when `has_role(auth.uid(),'admin')`. This avoids granting the client any direct `auth.users` access.
- No new RLS policies on existing tables; the admin server functions use the elevated/admin path only after the role check.
- Email and other PII shown only to admins; never logged.

## Technical sketch

```
src/routes/_authenticated/admin/usage.tsx   (route, guarded)
src/components/admin/usage/
  summary-cards.tsx
  activity-charts.tsx        (Recharts, already in deps)
  user-table.tsx             (TanStack Table)
  user-row-details.tsx
src/lib/admin-usage.functions.ts             (createServerFn handlers)
supabase/migrations/<ts>_admin_usage.sql     (admin_user_directory fn + assistant_chat_events table + grants/RLS)
```

Server functions (all admin-gated):
- `getUsageSummary({ from, to })`
- `getUsageTimeseries({ metric, from, to, bucket: 'day' })`
- `getUserUsageTable({ search, plan, from, to, sort, page })`
- `getUserUsageDetail({ userId })`

The hiring-assistant chat route gets one extra line that inserts into `assistant_chat_events` (best-effort, never blocks the response).

## Out of scope (call out so we're aligned)

- No event-level funnels / PostHog — can add later if you want click-through analysis.
- No per-user-facing "Your usage" panel in Settings (you chose admin-only).
- No billing/Stripe usage reporting beyond what's already in `credit_ledger`.

Approve and I'll build it.
