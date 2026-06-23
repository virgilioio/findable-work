I found the actual current failure: Apollo did return Brenda's phone by webhook, but our webhook parser only accepts `person`, top-level `id`, or top-level `phone_numbers`. Apollo is sending the successful result as `people: [{ id, phone_numbers: [...] }]`, exactly like Gio ATS handles. Our handler logs "missing person id" and exits, so the candidate remains Pending forever.

Plan:

1. Update `src/routes/api/public/apollo/phone.ts` to mirror Gio ATS' payload handling:
   - Accept `payload.people[]` in addition to the existing `payload.person` and top-level shape.
   - Process every person in the payload, not just one.
   - Extract phone from `person.phone_numbers`, including Apollo's `type_cd: "mobile"` format as well as the existing `type` format.
   - Write `phone_revealed` + `phone` when a number exists.
   - Write `phone_reveal_attempted` when Apollo explicitly returns a person with no phone.

2. Fix the missed Brenda-style webhook case:
   - The logged payload for Apollo ID `666b4a7aa6b43a0001ff128c` contains `+525544493151`.
   - After the parser fix, this shape will update correctly instead of staying pending.

3. Tighten the synchronous reveal parser in `src/lib/sourcing/apollo.server.ts`:
   - Check both `matches[0]` and `people[0]` because Apollo uses both shapes across sync responses/webhooks.
   - Extract phone using the same shared logic as the webhook path.

4. Optional safety improvement in the drawer:
   - Reduce the "stuck" threshold from 30 minutes to 10-15 minutes so users are not left wondering as long if Apollo never sends a terminal result.

No schema changes, no Apollo endpoint changes, and no billing redesign. The core bug is just that our webhook handler doesn't understand Apollo's actual `people[]` success payload.