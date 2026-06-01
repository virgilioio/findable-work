## Plan

1. **Stop depending on the missing prompt row for this public assistant**
   - Move the candidate-assistant system prompt into the `/api/public/jobs/$slug/chat` route as a local constant.
   - Keep the same rules and grounding behavior, but inject the real job/candidate context directly.
   - This makes the assistant work even if the `prompts` admin table/migration state is out of sync.

2. **Keep the scripted fallback only for true AI failures**
   - If OpenAI/model configuration or the OpenAI request fails, continue returning the scripted fallback.
   - Update the generic fallback so it’s still helpful instead of the dead-end “I can't reach the assistant…” message for common candidate questions.

3. **Add clearer server logging**
   - Log whether failures are configuration, OpenAI response, empty completion, or unexpected exception.
   - Avoid logging candidate PII or full form answers.

4. **Verify after implementation**
   - Call the public chat endpoint against the existing live slug (`marketing-manager-dqyq`) and confirm it returns a real assistant answer instead of the unreachable fallback.

## Technical details

The current production logs show the exact blocker:

```text
[jobs-chat] FALLBACK {"reason":"prompt_load_failed","message":"prompt registry: missing prompt \"jobs.candidate_assistant\""}
```

So the route is reachable and returning `200`, but it exits before calling OpenAI because `getPrompt("jobs.candidate_assistant")` cannot find the prompt row. The most reliable fix is to make this public endpoint self-contained rather than relying on a database prompt migration for a user-facing public feature.