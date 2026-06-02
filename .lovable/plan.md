# Security hardening pass

Five workstreams, each independent and shippable on its own.

## 1. Audit logs

New immutable table + helper + write hooks at key actions.

**Schema** (`audit_events`):
- `id uuid pk`
- `user_id uuid` (actor)
- `created_at timestamptz default now()`
- `action text` — enum-ish: `candidate.stage_changed`, `candidate.deleted`, `outreach.sent`, `outreach.replied`, `job.published`, `job.unpublished`
- `entity_type text`, `entity_id uuid`
- `metadata jsonb` (before/after, channel, recipient, etc.)
- RLS: users SELECT own rows; INSERT via `service_role` only (writes go through server fns with `supabaseAdmin`).

**Write hooks** (server-side only, via `supabaseAdmin`):
- `candidates.functions.ts` — stage update + delete paths.
- `outreach/*.functions.ts` — after Gmail send + on reply ingestion.
- `jobs.functions.ts` — on `published` toggle.

**UI**: deferred. Logs are queryable from the backend; no admin viewer in this pass.

## 2. Error monitoring (Sentry)

- Add `@sentry/react` + `@sentry/node` (Worker-compatible build).
- Init in `src/router.tsx` (client) and `src/start.ts` (server, inside `errorMiddleware`).
- Requires one secret: `SENTRY_DSN` (server) + `VITE_SENTRY_DSN` (client). I'll request both via `add_secret` before installing.
- Strip PII: scrub `email`, `phone`, resume URLs, auth headers via `beforeSend`.

## 3. Input validation sweep

Audit every `createServerFn` lacking `.inputValidator()` and add Zod schemas. Targets identified:
- `lib/outreach/*.functions.ts` — several handlers accept untyped args.
- `lib/sourcing/*.functions.ts` — partial coverage.
- `lib/candidates.functions.ts`, `lib/jobs.functions.ts`, `lib/applications.functions.ts` — verify all paths.
- Standard constraints: bounded string lengths (1–10k for body, 1–255 for names), UUID format on IDs, enum unions on status fields.

## 4. Ad-hoc rate limiting

Lightweight DB-backed throttler. New table `rate_limits(user_id, bucket, window_start, count, primary key(user_id, bucket, window_start))`. Helper `assertWithinLimit(userId, bucket, max, windowSeconds)` increments + throws if exceeded.

Applied to:
- `/api/chat` — 60 req/min per user.
- `/api/public/jobs/$slug/apply` — 5 req/hour per IP (hashed) since unauthenticated.
- `build_interview_loop`, outreach send — 30/hour per user.

Caveat surfaced to user: best-effort, race-prone, not bulletproof — proper edge throttling will come when Lovable ships primitives.

## 5. Test data cleanup script

Server fn `wipeOwnTestData` (admin-only via `requireAdmin`) that deletes the calling user's rows from `candidates`, `applications`, `jobs`, `conversations`, `messages`, `agent_tasks`, `outreach_*`, `sourcing_*`, `interview_*`. Triggered from the admin page with a typed-confirmation modal.

---

## Order of execution

1. **Audit logs migration + write hooks** (biggest surface, want it before launch traffic).
2. **Input validation sweep** (pure code, no secrets).
3. **Rate limiting** (migration + helper + 3 call sites).
4. **Sentry** (needs secret — I'll prompt before installing).
5. **Test data cleanup** (small, last).

## Out of scope (already covered or platform-managed)

- HTTPS, password reset, RLS, role separation, secrets handling, DB backups (Supabase-managed), no-public-candidate-pages.

## Notes / open questions

- Sentry pricing tier is on you — free tier (5k events/month) is fine to start.
- Backups: confirm your Supabase plan tier supports daily backups / PITR. If you're on Free, upgrading is the only fix.