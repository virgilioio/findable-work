Add a Help sub-menu to the authenticated app's footer dropup and reorder items per the user's spec.

## Changes

### 1. Reorder dropup menu (`src/routes/_authenticated/app.tsx`)
New order:
- Configuration (opens General settings)
- Personalization
- Usage & billing
- `<DropdownMenuSeparator />`
- Help (sub-menu trigger)
- Sign out

### 2. Help sub-menu items
Inside a `<DropdownMenuSub>`:
- **Help center** — opens SettingsDialog at Help section
- `<DropdownMenuSeparator />`
- **Terms** — navigates to `/terms`
- **Privacy** — navigates to `/privacy`
- **Report a bug** — opens a bug-report dialog

### 3. Bug report dialog (`src/components/settings/bug-report-dialog.tsx`)
- Textarea for bug description (1–2000 chars)
- Submit button with loading state
- On submit, calls server function
- Success toast: "Bug report sent"

### 4. Bug report server function (`src/lib/bug-report.functions.ts`)
- `sendBugReport` — createsServerFn POST, requires auth
- Reads user's email from context
- Calls `sendBrandedEmail` (existing Resend helper) to `support@findable.work`
- Subject: `Bug report from findable` — includes user email + timestamp
- Body: user's description
- Returns `{ sent: true }`

### 5. No new secrets needed
`RESEND_API_KEY` is already configured.