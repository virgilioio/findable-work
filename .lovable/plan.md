## Plan: Adopt the Gio AI design system

Port the visual language from the 12 reference files into our existing TanStack app. Functionality (auth, conversations, streaming chat, Job tab, DB schema) stays as-is — this is purely presentation.

### 1. Design tokens & global styles (`src/styles.css`)
- Replace current tokens with the Gio palette: cool grays for light (`--bg #ffffff`, `--bg-side #f7f7f8`, `--text #0f0f0f`…) and dark (`--bg #212121`, `--bg-side #171717`…), plus `--border`, `--bg-bubble`, `--bg-pulse`, `--ring`, `--shadow-sm/md`, `--radius/-sm/-lg`, `--side-w`, `--tabbar-h`, `--dens-*`.
- Map these to Tailwind / shadcn semantic tokens (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--card`…) so existing components keep working.
- Add keyframes/utilities: `fade-up`, `tab-pulse`, `caret-blink`, `dot-bounce`, custom scrollbar.

### 2. Typography
- Load Geist + Geist Mono from Google Fonts in `__root.tsx` `<head>`.
- Set `font-family` defaults on body; expose `.mono` utility.

### 3. Brand & icons
- Rebrand the app as **Gio AI** (title, login, sidebar header). Diamond logo SVG inline.
- Create `src/components/icons.tsx` mirroring the `I.*` set (Logo, Plus, Search, Folder, Pin, Chat, Briefcase, Megaphone, Users, Calendar, Sparkle, Send, Attach, ArrowRight, ChevRight, Dots, Side, Sun, Moon, X/XSm, etc.) — 20px viewBox, 1.5 stroke.

### 4. Login page (`/login`)
- Replace current login with the Gio layout: top-left brand, centered card (380px, `--radius-lg`), "Welcome back" / "Create your account" toggle, Google + Apple SSO buttons + "or" divider, email/password fields, dark filled submit button, footer links.
- Keep current Supabase email/password logic.

### 5. App shell (`/app` layout)
- Replace shadcn `Sidebar` usage with a custom `GioSidebar` matching the reference: 264px rail, brand header with collapse button, "New project" button (⌘N kbd hint), search input, sections for Pinned / Folders (static for now: Q2 Hires, Engineering, Sales) / date-grouped conversations (Today / Yesterday / Previous 7 days / Previous 30 days). Row hover + active states, three-dot menu on hover. Collapsed mini-rail (52px) with icon-only buttons. Footer with user avatar + email + dots.
- Date grouping derived client-side from `updated_at`.

### 6. Workspace (`/app/c/$id`)
- Add a browser-style tab bar at the top: Chat (non-closable) + Job + (future) Job Posts/Candidates/Interviews. Active tab uses `--bg`, inactive `--bg-side` with top/side borders curving up; pulse animation on freshly spawned tabs.
- Right side of tab bar: project title + share/notification/dots icon buttons.

### 7. Chat tab
- Empty state: centered logo, "What hire can I help with?" headline, descriptive sub, large composer (textarea + Attach + "Hiring mode" pill + dark Send button), suggestion chips below.
- Threaded state: max-width 760px column, user bubbles right-aligned in `--bg-bubble`, AI rows with small avatar + bubble, `fade-up` on entry, thinking bubble (3 bouncing dots) while streaming, blinking caret while text streams, minimal markdown (bold + line breaks) via the existing renderer.
- When a Job is created, render an inline "tab card" message: "Job description drafted → Open Job tab" with icon + arrow, clicking switches tab.
- Compact bottom composer with disclaimer line.

### 8. Job tab
- Two-column layout (main + 320px side), max-width 1200px.
- Sub-header: briefcase icon + title + status pill + location · type + Duplicate / Edit / Publish buttons.
- Main column cards: Summary, Responsibilities, Must have / Nice to have (2-col grid).
  - Note: DB currently stores `description` + `requirements[]`. To stay in v1 scope I'll map: Summary → `description`, Responsibilities/Must have → existing `requirements[]` (rendered as one list for now). Splitting into responsibilities/must-have/nice-to-have requires a schema change — I'll flag it but skip it unless you want it now.
- Side column: Details KV card (Comp, Experience, Team, Hiring manager, Languages, Location — using existing job fields), "Suggested by Gio" card (static suggestions for now), dashed "Ask Gio to revise" button.
- Edit mode toggles `EditableText` / `EditableList` inputs; autosave on blur preserved.

### 9. Out of scope (defer)
- Job Posts / Candidates / Interviews tabs (visual references kept for later phases).
- Tweaks panel (it's a prototype tool, not needed in the real app).
- Schema split of job description into responsibilities/must-have/nice-to-have.
- Folder CRUD, pin CRUD, conversation rename/delete menus (static UI only).

### Files I'll touch
- `src/styles.css` (tokens, fonts, keyframes)
- `src/routes/__root.tsx` (font preconnect/link)
- `src/routes/login.tsx` (full redesign)
- `src/routes/app.tsx` (replace shadcn sidebar with `GioSidebar`)
- `src/routes/app.c.$id.tsx` (tab bar + new chat + new job layouts)
- New: `src/components/icons.tsx`, `src/components/gio-sidebar.tsx`, `src/components/gio-tab-bar.tsx`, `src/components/chat/*`, `src/components/job/*`.

### Quality bar
Visuals should match the reference: pixel-level spacing/radii from the source styles, both light + dark themes working, fade-up on message entry, pulse on new tab, caret blink during streaming, hover states on sidebar rows. I'll verify in the preview after each major surface.