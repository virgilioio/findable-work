## Goal
Let users press Enter to submit answers in the clarifying-questions card (in both the in-app conversation and the guest landing flow), instead of having to click "Send answers".

## Change
Edit `src/components/chat/clarify-card.tsx`:

1. Wrap the question content + Send button in a `<form>` element with an `onSubmit` handler that calls the existing `submit()` (and `preventDefault`s), guarded by the existing `complete` check.
2. Change the Send button to `type="submit"` so Enter inside any text input naturally triggers form submission.
3. For the "Other…"/text inputs, no extra handler is needed — being inside the form gives Enter-to-submit for free. Submission stays blocked while `complete` is false.

No other files change. Pill-only questions (no text input) still require clicking, since there's no focused input to press Enter in — which matches user expectation.