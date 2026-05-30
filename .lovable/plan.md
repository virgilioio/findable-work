## Plan

### 1. Stop the LATAM country loop
- Add a deterministic server-side guard in `/api/chat` before letting the model decide tools.
- Detect when the latest user message is an answer to a prior LATAM/region clarification card, e.g. `Target countries in LATAM: Mexico, Colombia, Chile`.
- Convert that answer into explicit sourcing context for the next model turn, so the agent sees `location = Mexico, Colombia, Chile` instead of seeing old `LATAM` again.
- Add a rule that the same region-specific clarification cannot be asked again once the user has answered it in this conversation.

### 2. Make the sourcing agent accept answered country lists
- Update the region ambiguity guard in `runSourcingAgent` so it only blocks when the active location is still a bare region acronym like `LATAM`.
- If the user’s latest answer includes concrete countries, ignore the older bare region token in previous context and proceed with those countries.
- Ensure normalization/search criteria receive explicit country locations, not an empty location.

### 3. Improve the prompt safety rails
- Tighten the `chat.main` prompt so after a clarification card answer, the assistant must proceed to `create_job` + `source_candidates` and must not ask the same clarification again.
- Tighten the sourcing normalization prompt/partial so explicit country answers after a region question are preserved as concrete locations.

### 4. Add immediate “working” feedback
- Show a visible assistant-side working row as soon as `sending=true`, even before reasoning tokens or task events arrive.
- Use staged labels like “Thinking”, then “Working on it”, then the current running task label once tool tasks start.
- Keep the composer disabled while the turn is active, and keep auto-scroll tied to sending/live task changes so the indicator is visible.

### 5. Validate the reported conversation path
- Re-test with the same flow: initial LATAM selection → country clarification → country answer.
- Confirm the app does not ask for LATAM countries again and instead moves into job drafting/sourcing.
- Confirm a thinking/working indicator appears immediately during the long response.