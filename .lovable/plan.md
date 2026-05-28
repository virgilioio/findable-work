## Plan

Replace the hover-only "X" delete button on each sidebar conversation with an ellipsis (`Dots`) icon that opens a dropdown menu with **Rename**, **Pin conversation**, and **Delete**. Add pin persistence so pinned conversations float to the top of the list.

### 1. Database

New migration adds pin support to `conversations`:

- `pinned_at timestamptz null` (null = unpinned; timestamp = when it was pinned)
- Index `conversations_user_pinned_idx` on `(user_id, pinned_at desc nulls last, updated_at desc)` for ordering

### 2. Server functions (`src/lib/conversations.functions.ts`)

- `listConversations`: select `pinned_at` too; order by `pinned_at desc nulls last, updated_at desc`.
- New `setConversationPinned({ id, pinned: boolean })` — sets `pinned_at = now()` or `null`.
- `renameConversation` already exists — reuse it.

### 3. Sidebar UI (`src/routes/app.tsx`)

- Add `Conv.pinned_at?: string | null` to the type.
- Grouping: split list into a **Pinned** group (any `pinned_at != null`, kept in pinned-time order) shown first, then the existing date buckets for the rest.
- Replace the hover `XSm` button with a `Dots` icon button wrapped in `DropdownMenu` (`@/components/ui/dropdown-menu`) with three items:
  - **Rename** — opens a small inline rename state (controlled input replaces the title in-row; Enter saves via `renameConversation`, Esc cancels).
  - **Pin conversation** / **Unpin** — toggles via `setConversationPinned`; label and icon switch based on current `pinned_at`.
  - **Delete** — existing confirm + `deleteConversation`.
- The trigger button stays hidden until row hover (or menu open) to keep the list clean. Clicking the trigger must `preventDefault`/`stopPropagation` so the row `<Link>` doesn't navigate.
- All three mutations `invalidateQueries(["conversations"])` on success; rename also invalidates `["conversation", id]`.

### 4. Icons

Use existing `Dots` from `@/components/findable-icons` for the trigger. For menu item glyphs use small lucide icons (`Pencil`, `Pin`, `PinOff`, `Trash2`) — keeps the menu visually consistent with the rest of the app.

### Technical notes

- Pin ordering is done server-side in the query so the sidebar reflects it without client sorting.
- `pinned_at` (vs a boolean) lets us preserve pin order if multiple are pinned, and keeps the schema cheap to extend later.
- Dropdown uses the existing shadcn `dropdown-menu` component — no new deps.
