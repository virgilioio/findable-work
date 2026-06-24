# Admin Credit Refill

## 1. Immediate refill: +1000 credits for allan@virgilio.tech

Steps:
1. Look up the user id by email via `supabaseAdmin.auth.admin.listUsers` (paginated, match on `email`).
2. Call the new `admin_grant_credits` RPC with `_amount = 1000`, `_note = 'Admin refill'`, `_granted_by = <my admin uid>` — RPC updates `profiles.credits_remaining` and inserts a `credit_ledger` row atomically.
3. Confirm new balance back to you.

## 2. Admin UI: quick refill in `/admin/usage`

In `src/routes/_authenticated/admin.usage.tsx` (per-user table from `getUserUsageTable`):

- Surface current `credits_remaining` as a column (already fetched).
- Add an **"Add credits"** button per row → opens a small dialog:
  - Amount: presets **100 / 500 / 1000** + custom input (1–100000).
  - Optional note (defaults to "Admin refill").
  - Confirm → calls `adminGrantCredits({ userId, amount, note })`.
- On success: toast "+N credits granted to <email>" and refetch the table so the new balance is visible immediately.

## 3. Server pieces

**New file** `src/lib/admin-credits.functions.ts`:
- `adminGrantCredits` — `createServerFn({ method: 'POST' }).middleware([requireAdmin])`
  - Input (zod): `{ userId: uuid, amount: int 1..100000, note?: string ≤ 200 }`
  - Inside handler: dynamic-import `supabaseAdmin`, call the RPC, return `{ balanceAfter }`.
- `grantCreditsByEmail` — same middleware, used for the one-off Allan refill (and reusable later). Input: `{ email, amount, note? }`. Resolves the uid server-side, then calls the RPC.

**New migration** — `admin_grant_credits(_user_id uuid, _amount int, _note text, _granted_by uuid) returns int`:
- `SECURITY DEFINER`, `SET search_path = public`.
- Re-checks `has_role(_granted_by, 'admin')`; raises `exception 'forbidden'` otherwise.
- `UPDATE profiles SET credits_remaining = credits_remaining + _amount WHERE id = _user_id RETURNING credits_remaining INTO new_balance;`
- `INSERT INTO credit_ledger (user_id, delta, type, reason, balance_after, metadata) VALUES (_user_id, _amount, 'admin_grant', coalesce(_note,'Admin refill'), new_balance, jsonb_build_object('granted_by', _granted_by));`
- `GRANT EXECUTE ON FUNCTION public.admin_grant_credits(uuid,int,text,uuid) TO authenticated;`
- Returns `new_balance`.

Reuses existing `requireAdmin` middleware (`src/lib/prompts/require-admin.server.ts`).

## 4. Out of scope

- No changes to Stripe top-up, bundles, or billing UI.
- No deductions / negative grants from the UI.
- No bulk or scheduled refills.
