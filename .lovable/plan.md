# Share dropdown: Reddit, X, and Findable preset messages

## What gets added

Two new share targets (Reddit and X) and a unified Findable-branded preset message applied to every platform that supports pre-filled text. Single file: `src/routes/_authenticated/app.c.$id.tsx`.

## Preset copy (Findable marketing-driven)

Single source of truth at the top of the share helpers:

```ts
const SHARE_TEXT = `We're hiring for our ${form.title} role.\n\nSee if this role is right for you on Findable.`;
```

Applied per platform:

- **X (Twitter)** — text param: `${SHARE_TEXT}\n\n${publicUrl}`
  Opens `https://twitter.com/intent/tweet?text=${encodeURIComponent(xText)}`

- **WhatsApp** — text param: `${SHARE_TEXT}\n\n${publicUrl}`
  Opens `https://wa.me/?text=${encodeURIComponent(whatsappText)}`

- **Reddit** — title param = `We're hiring for our ${form.title} role` (shortened for Reddit's title field); url param = `publicUrl`.
  Opens `https://www.reddit.com/submit?url=${encodeURIComponent(publicUrl)}&title=${encodeURIComponent(redditTitle)}`

- **Email** — subject = `We're hiring for our ${form.title} role`; body = `${SHARE_TEXT}\n\n${publicUrl}`

- **LinkedIn** — URL only (platform limitation; LinkedIn fetches OG tags from the public job page).

- **More… (native share)** — `navigator.share({ title: "We're hiring", text: SHARE_TEXT, url: publicUrl })`

## New share targets in the dropdown

Inserted after Email, before More…:

- **X** — inline SVG X logo (monochrome stroke style). Opens tweet intent in new tab.
- **Reddit** — inline SVG Snoo / Reddit logo (monochrome). Opens Reddit submit in new tab.

Both reuse the existing `ShareRow` component.

## Icons

Add two inline SVGs alongside existing share icons (`XIcon`, `RedditIcon`) using `stroke="currentColor"` / `strokeWidth={1.5}` to match the monochrome icon style.

## Out of scope

- LinkedIn API posting / OAuth connector
- Changes to `Duplicate`, `Edit`, `Live▼`, Publish flow, public job page OG tags
