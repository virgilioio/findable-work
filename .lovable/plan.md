## Goal

Add a primary dark **Share** button to the Job tab header, placed at the end of the existing `Duplicate · Edit · Live▼` cluster. Only visible when the job is Live. The rest of the header is untouched.

## Scope

Single file: `src/routes/_authenticated/app.c.$id.tsx` — `JobPanel` header, around lines 976–1029. No backend changes. The "Public application page" strip below the header and the `Live▼` dropdown (with View public page / Copy link / Unpublish) stay exactly as today.

## Change

After the existing `Live▼` block (and only when `published && publicUrl`), render a new primary `HeaderBtn` with an upload/share icon labelled **Share**. Clicking it toggles a dropdown anchored under the button.

```
[ Duplicate ]  [ Edit ]  [ ● Live ▾ ]  [ ⬆ Share ▾ ]   ← new, primary dark
```

While the job is a Draft: header stays exactly as today (`Duplicate · Edit · Publish`), no Share button.

## Share dropdown contents

~280px wide, same styling as the existing status menu (`bg-bg-elev / border-border-strong / shadow-md`, `right-0 top-[calc(100%+4px)]`):

1. **Public URL row** — globe icon + truncated `publicUrl` (mono, `text-text`) + inline **Copy** button on the right. Reuses the existing `copyLink` handler and `copied` state ("Copied" for 1.8s).
2. Divider + uppercase label **"Share to"** (`text-[11px] text-text-faint`).
3. Share targets, full-width rows with a 16px monochrome icon + label, `hover:bg-bg-hover`:
   - **LinkedIn** → `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`
   - **WhatsApp** → `https://wa.me/?text=${encodedText}%20${encodedUrl}`
   - **Email** → `mailto:?subject=${encodedText}&body=${encodedText}%0A%0A${publicUrl}`
   - **More…** — rendered only when `typeof navigator !== "undefined" && typeof navigator.share === "function"`. Calls `navigator.share({ title, text, url })`; on rejection, falls back to copy.
4. Divider + **Open posting** → opens `publicUrl` in a new tab.

Share text: `` `We're hiring — ${form.title}` ``. All external targets open via `window.open(url, "_blank", "noopener")` and close the dropdown.

## Behaviour details

- New state: `const [shareOpen, setShareOpen] = useState(false)`, plus a ref on the share container.
- Outside-click + Escape closes the dropdown (one small effect with `mousedown` + `keydown` listeners).
- If `publicUrl` is missing for any reason, Share is hidden.
- Icons: reuse lucide icons already imported in this file (`Globe`, `Copy`, `Mail`, `Upload`/`Share2`, `MoreHorizontal`, `ExternalLink`). For LinkedIn and WhatsApp, add small inline SVGs using `currentColor` so they match the monochrome style (lucide ships no brand marks).

## Out of scope

- No changes to `Duplicate`, `Edit`, the `Live▼` menu, the "Public application page" strip, the Publish flow, or the tab-bar Share button.
- No changes to `publishJob` / `unpublishJob` or the public job page.
