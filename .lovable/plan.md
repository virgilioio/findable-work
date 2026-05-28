## Problem

After the assistant creates the Job and sources Candidates, it just stops. It should always close a turn by proposing the natural next step — drafting the job post, then scheduling interviews — and explicitly ask the user whether to proceed.

## Fix

Single edit to `SYSTEM_PROMPT` in `src/routes/api/chat.ts`. Add a "Next-step proposal" rule after the existing Mandatory flow:

> **Next-step proposal (always close with one).** A complete recruiting project has four artifacts: Job → Candidates → Job Post → Interview Schedule. After every turn that finishes a stage, end your reply with a short, concrete proposal for the next missing artifact and ask for confirmation. Examples:
> - Job + Candidates just done → "Want me to draft a job post for this role next?"
> - Job Post just done → "Ready to set up the interview loop?"
> - Everything in place → suggest a refinement (broaden sourcing, tweak the JD, add screening questions).
>
> Never end a turn with just a summary. Always end with a question or a one-line proposed next move.

## Out of scope (per user)

- No new Job Posts tab/tool.
- No new Interviews schedule tab/tool.
- Those land in a follow-up plan; the prompt nudge already steers the assistant to *ask* about them so we know when the user wants them built.

## Verification

After a fresh "source candidates" flow, the assistant's final message should end with a question proposing the job post (and not just a recap).
