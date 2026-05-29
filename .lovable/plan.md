## Add the new findable app icon

Use the uploaded `findable_work (6).svg` (a designed rounded-square tile with the glyph inside) as the "app icon" shown above the chat empty-state and on the landing hero.

### Files

1. **New asset** — `src/assets/findable-app-icon.svg`
   - Copy from `user-uploads://findable_work_6.svg`.

2. **`src/components/findable-icons.tsx`**
   - Add a new `AppIcon` component that renders the SVG as an `<img>` (same pattern as `Wordmark`), sized via a `size` prop.
   - Keep the existing `Logo` (monochrome magnifying-glass glyph) — still used as the small marker in chat assistant rows.

3. **`src/routes/_authenticated/app.index.tsx`** (line 21–22)
   Replace:
   ```tsx
   <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-bubble text-text">
     <Logo size={26} />
   </div>
   ```
   with `<AppIcon size={48} className="mx-auto mb-5" />`. Drop the rounded-tile wrapper since the new artwork already has its own rounded background.

4. **`src/routes/_authenticated/app.c.$id.tsx`** (line 435–437)
   Same swap as above — empty-state "What hire can I help with?" inside a conversation.
   Leave the small `<Logo size={14}/>` at line 606 untouched (assistant-row marker).

5. **`src/routes/index.tsx`** (line 367–369)
   Same swap — landing hero empty-state.
   Leave the small `<Logo size={14}/>` at line 537 untouched.

### Out of scope
- Wordmark (already updated last turn).
- Small inline chat-row glyph — that's the future "chat glyph" you mentioned you'll send next.
- Favicon / og:image.
