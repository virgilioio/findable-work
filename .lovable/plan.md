## Goal

Replace the bottom-left ellipsis button in the sidebar with a real dropdown menu, and wire three of its entries into a single ChatGPT-style Settings dialog with a left rail of sections and a content pane. Move Gmail (and add Google Calendar) integration setup into the dialog.

## 1. Sidebar dropdown (`src/routes/_authenticated/app.tsx`)

Replace the inline Sun/Moon + LogOut + Dots buttons in the footer with a single `DropdownMenu` triggered by the ellipsis button next to the user name. Opens **upward** (`side="top"`, `align="end"`).

Items, in order:
- ✨ **Personalization** → opens Settings dialog at `personalization`
- ⚙ **Configuration** → opens Settings dialog at `general`
- 🛟 **Help** → opens Settings dialog at `help`
- — divider —
- ↳ **Sign out** → existing `supabase.auth.signOut()` flow

Admin link stays. Theme toggle moves into Settings → General.

Local state: `const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null)`.

## 2. Settings dialog (new `src/components/settings/settings-dialog.tsx`)

Built on existing shadcn `Dialog` (Esc + click-outside come for free). `DialogContent` widened (`max-w-4xl`, `h-[560px]`, `p-0`); internal flex row: rail (`w-56 border-r bg-bg-side`) + content (`flex-1 overflow-y-auto p-6`).

Props: `{ open: boolean; section: SettingsSection | null; onOpenChange(open) }`. Internal `section` state seeded from prop; rail clicks update local state without closing.

### Rail sections

1. **General** — Appearance (Light/Dark via existing `useTheme`), Accent (Monochrome, read-only chip), Show sidebar (toggle persisted to `localStorage`), Language (English / Español select), Default workspace (display-only).
2. **Notifications** — toggles: New applicants, Replies, Interview reminders, Daily digest, Mentions. Persist to `localStorage` under `findable:notifications`.
3. **Personalization** — Assistant name, Outreach tone (Friendly / Professional / Direct), Auto-personalize, Sourcing-region chips (LATAM/US/EU/APAC), Email signature. Persist to `localStorage` under `findable:personalization`.
4. **Connections** *(new — houses Gmail + Calendar)* — see §3 below.
5. **Data controls** — Export data (disabled, no "coming soon" label), Delete workspace data (red button → AlertDialog → stub "Contact support"). *(Clear applications / Clear outreach removed.)*
6. **Security** — 2FA toggle (stub), Active sessions (placeholder), Change password (button), Log out all devices (`supabase.auth.signOut({ scope: "global" })`).
7. **Account** — Avatar initials, name (editable, local-only for now), email (read-only), Role, Seats, Delete account (red, stub).
8. **Help** — Searchable hard-coded article list (~6 entries) + "Contact support" → `mailto:support@findable.work`.

(No Density section.)

## 3. Connections section (Gmail + Google Calendar)

A single "Connections" pane that lists each integration as a card with status + primary action. Reuses existing wiring rather than reinventing it.

### Gmail card
- Reuse logic from `src/components/outreach/connect-gmail-card.tsx` and `src/lib/outreach/gmail.functions.ts` (existing `startGmailConnect`, status query). 
- Card shows: name, connected email (when connected), status pill (Connected / Not connected), and a button — "Connect Gmail" / "Reconnect" / "Disconnect".
- I'll refactor the existing card into a smaller `GmailConnectionRow` consumed both by the outreach panel and the Connections pane, so behavior stays identical.

### Google Calendar card
- New server fn `startCalendarConnect` in `src/lib/outreach/calendar.functions.ts` modeled exactly on `startGmailConnect`: calls `authorizeAppUserOAuth` with `connectorId: "google"` and `credentialsConfiguration.scopes` = `["https://www.googleapis.com/auth/calendar.readonly"]` (read-only is enough for any "view availability" feature; we can widen later).
- Status query: new server fn `getCalendarConnection` that looks up the user's stored `connection_id` for the calendar scope (same table the Gmail flow uses, with a `provider`/`scope` discriminator — confirm table shape during implementation).
- Card UX mirrors Gmail: Connect / Reconnect / Disconnect, shows the connected Google account email.
- The OAuth return route (`src/routes/_authenticated/oauth.google.return.tsx`) already parses `parseAppUserOAuthReturn`; extend it (or branch on a `state` param) to persist either Gmail or Calendar connection IDs to the right column.

**Open question:** does the existing `gmail_connections` (or equivalent) table already discriminate by scope/connector, or do we need a new table / column for Calendar? I'll confirm by reading `gmail.functions.ts` + the relevant migration before writing the Calendar fn. If a new column is needed, that's a single additive migration (`provider text not null default 'gmail'`).

## 4. Icons

Reuse `@/components/findable-icons` (`Sparkle`, `LogOut`, `Dots`, `Sun`, `Moon`). Add per-icon lucide imports for `Settings`, `LifeBuoy`, `Bell`, `Database`, `Shield`, `User`, `Plug` (Connections), `Mail`, `Calendar`.

## Files touched

- `src/routes/_authenticated/app.tsx` — replace footer buttons with dropdown; mount `<SettingsDialog />`.
- `src/components/settings/settings-dialog.tsx` — new (rail + content shell + per-section panes; may split into `src/components/settings/panes/*.tsx` if it grows past ~400 lines).
- `src/components/outreach/connect-gmail-card.tsx` — extract reusable `GmailConnectionRow`.
- `src/lib/outreach/calendar.functions.ts` — new server fns (`startCalendarConnect`, `getCalendarConnection`, `disconnectCalendar`).
- `src/routes/_authenticated/oauth.google.return.tsx` — branch on connector to persist Gmail vs Calendar.
- *(Maybe)* one migration if the connection table needs a `provider` column.

No new npm dependencies.
