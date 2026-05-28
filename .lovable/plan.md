## Goal
Add the findable wordmark logo to the login-page card and increase the logo size in the auth dialog and all top-left corners.

## Changes
1. **Login page (`src/routes/login.tsx`)**
   - Add `<Wordmark height={28} />` inside the login card, above the headline (matching the auth-dialog layout).
   - Increase the top-left corner wordmark from `height={22}` to `height={28}`.

2. **Auth dialog (`src/components/auth/auth-dialog.tsx`)**
   - Increase the wordmark inside the dialog from `height={22}` to `height={28}`.

3. **App layout (`src/routes/app.tsx`)**
   - Increase the top-left sidebar wordmark from `height={22}` to `height={28}`.

All three locations currently use `height={22}`; we are bumping them to `height={28}` for better visibility.