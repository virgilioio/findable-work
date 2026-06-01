## What's wrong

Server logs show the hiring assistant is always hitting the scripted fallback:

```
[jobs-chat] FALLBACK { reason: "prompt_load_failed",
  message: 'prompt registry: missing prompt "jobs.candidate_assistant"' }
```

The prompt row doesn't exist in `public.prompts`. The earlier migration (`20260601063910_jobs_candidate_assistant_prompt.sql`) used `ON CONFLICT (slug) DO NOTHING`, so even if it ran against a DB where the row was partially present (or it failed to apply for any reason), there's no recovery path — and the chat silently degrades to the canned answers.

## Fix

Add a new migration that upserts the `jobs.candidate_assistant` prompt with the full body, marks it `is_active = true`, and bumps `updated_at`. Identical body/rules to the existing file, but with `ON CONFLICT (slug) DO UPDATE` so it lands deterministically.

That's the only change. The route, fallback logic, client component, and grounding builder are all working — once the prompt row exists, OpenAI gets called with the real system prompt and the assistant responds normally.

## Out of scope

- No changes to `src/routes/api/public/jobs/$slug/chat.ts`
- No changes to `src/components/jobs/hiring-assistant.tsx`
- No changes to the public job page
- Scripted fallback stays as a safety net for real OpenAI outages
