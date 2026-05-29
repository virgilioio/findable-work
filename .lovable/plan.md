## Add footer to the `/` (homepage) route

### Problem
Google OAuth verification requires the homepage to include a visible link to the privacy policy. The current `/` page (guest preview) has no footer.

### Solution
Add a minimal single-line footer at the bottom of the `HomePage` component in `src/routes/index.tsx`.

### Changes
1. **Import `Link`** from `@tanstack/react-router` (already imported for privacy/terms pages).
2. **Add a `<Footer />` component** inside `src/routes/index.tsx` placed right before the closing `</div>` of the main container (after `<AuthDialog>`).
3. **Footer content** (centered, minimal):
   - `Wordmark` logo (height 20px)
   - Separator dot
   - `Link to="/privacy"` — Privacy Policy
   - `Link to="/terms"` — Terms of Service
   - Separator dot  
   - `mailto:support@findable.work` — Contact
   - Separator dot
   - `© 2026 Virgilio Technologies LLC`
4. **Styling** using existing design tokens:
   - `border-t border-border`
   - `bg-bg`
   - `text-[12px] text-text-faint`
   - `py-4 px-5`
   - centered flex row with `gap-3` and `items-center`
   - links hover to `text-text-mute`

### No other files changed.