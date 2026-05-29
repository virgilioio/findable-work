Three independent fixes — small, surgical, no schema changes.

## 1. Job status doesn't update to "Live" without refresh

**Cause:** `JobPanel` in `src/routes/_authenticated/app.c.$id.tsx` keeps an internal `form` state seeded from the `job` prop, but the resync effect runs only when `job.id` changes:

```ts
useEffect(() => setForm(job), [job.id]);
```

After `publishJob` succeeds, the conversation query is invalidated and `job` re-renders with `published: true` / `status: "open"` / `slug` set — but `form` stays stale, so the status pill keeps showing "Draft" until you navigate away and back.

**Fix:** Resync the fields that come from the server (and aren't actively being edited) whenever they change. Replace the `[job.id]` effect with one that mirrors server-managed fields:

```ts
useEffect(() => {
  setForm((prev) => ({
    ...prev,
    id: job.id,
    published: job.published,
    published_at: job.published_at,
    slug: job.slug,
    status: job.status,
  }));
}, [job.id, job.published, job.published_at, job.slug, job.status]);
```

`handlePublish` already invalidates `["conversation", conversationId]` and awaits it, so the next render will carry the new flags through and the pill will flip to "Live" with the public link revealed.

## 2. Public posting: "Couldn't load this posting — Invalid URL string"

**Cause:** `src/routes/jobs/$slug.tsx` loader builds the API URL like this:

```ts
const base =
  typeof window === "undefined"
    ? new URL(location.href).origin
    : window.location.origin;
const url = `${base}/api/public/jobs/${encodeURIComponent(slug)}`;
const res = await fetch(url);
```

In TanStack Router, `location.href` is a path (e.g. `/jobs/foo`), not a full URL. `new URL("/jobs/foo")` throws `Invalid URL string` during SSR, so the loader rejects and the `errorComponent` renders. (`/jobs/$slug` is a public route, so it's hit during prerender/SSR.)

**Fix:** Stop fetching the public job over HTTP from the loader. Move the read into a `createServerFn` that uses `supabaseAdmin` to query the published row directly — same data the `/api/public/jobs/$slug` route returns, no URL construction needed, isomorphic-safe.

- New file `src/lib/public-jobs.functions.ts`:
  - `getPublicJob = createServerFn({ method: "GET" }).inputValidator(z.object({ slug: z.string().min(1).max(80) }).parse).handler(...)`
  - Uses `supabaseAdmin.from("jobs").select(<safe public columns>).eq("slug", slug).eq("published", true).maybeSingle()`. Returns `null` for not-found.
  - Returns the same `PublicJob` shape the route already expects (id, slug, title, company, location, employment_type, salary_*, currency, summary, description, requirements, responsibilities, must_have, nice_to_have, screening, published, published_at).
- Update `src/routes/jobs/$slug.tsx` loader: `const job = await getPublicJob({ data: { slug: params.slug } }); if (!job) throw notFound();`. Drop the `location.href` / `fetch` block.
- Leave the existing `src/routes/api/public/jobs/$slug.ts` route in place for external/embed callers.

This also removes one network hop on the public page render.

## 3. Sourcing: previously-collected candidates trigger duplicate Apollo work

**Cause:** In `src/lib/sourcing/search.functions.ts` → `collectCandidates`, the "already collected" check only filters out candidates already present in the current tenant by `apollo_id`. But `runSourcingSearch` already tags each preview with `display_source` — `"internal"` means "this tenant already has a candidate row for this person." Those internal previews still flow through `enrichApolloProfiles(...)` and create a duplicate candidate row, paying Apollo for data we already own.

The user wants: internal previews should be **linked into the current conversation without an Apollo call**. Gio / fresh apollo previews keep enriching as today.

**Fix in `collectCandidates`:**

1. Split selected previews into three buckets up front:
   - `internalPreviews` — `display_source === "internal"`. Look up the existing candidate row in this tenant by `apollo_id` (preferred) or `linkedin_slug`. Re-insert a fresh row attached to `data.conversation_id`, copying the persisted fields (`name`, `role`, `company`, `email`, `phone`, `linkedin`, `location`, `summary`, `experience`, `education`, `apollo_id`, `linkedin_slug`, `has_direct_phone`, `avatar`) so it appears in the new project's list. No Apollo call, no `increment_sourcing_usage` charge for these.
   - `apolloPreviews` — everything else with `source === "apollo"` (including `display_source === "gio"`). Same path as today: `enrichApolloProfiles` + insert + count toward sourcing usage.
   - `pdlPreviews` — already not enriched today; leave behavior unchanged (skip / handled elsewhere).
2. Still mark the corresponding `sourcing_preview_candidates` row `collected_at = now()` for internal reuses, so the UI shows them as collected.
3. Update the returned `collected` count to include internal reuses; keep `increment_sourcing_usage` scoped to the Apollo-enriched subset only.
4. No schema change; this is purely server-fn logic.

Frontend already shows all previews regardless of `display_source`, so no panel changes are needed — internal ones will just collect instantly and for free.

## Verification

- **#1**: Open a job in `/app/c/$id`, click Publish. Status pill flips to "Live" and the public link block appears without refreshing. Click Unpublish — flips back to "Draft".
- **#2**: With the job published, open `/jobs/<slug>` in a new tab (cold SSR). Page renders the JD + form, no "Invalid URL string" error. Unknown slug renders the existing `NotLive` page.
- **#3**: Run a sourcing search that overlaps with prior collected candidates (display_source = internal). Select an internal preview and click Collect. The candidate appears under the current conversation immediately, no Apollo network call, and `sourcing_credits_usage` for the period is unchanged for those rows. A fresh `apollo` preview in the same batch still increments usage.

## Files touched

- `src/routes/_authenticated/app.c.$id.tsx` — broaden `JobPanel` resync effect.
- `src/routes/jobs/$slug.tsx` — switch loader to `getPublicJob` server fn.
- `src/lib/public-jobs.functions.ts` — new server fn using `supabaseAdmin`.
- `src/lib/sourcing/search.functions.ts` — split internal vs apollo paths in `collectCandidates`.

No DB migrations, no new dependencies.