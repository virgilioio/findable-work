UPDATE public.prompts
SET
  body = body || E'\n\n## STRICT: any sharpening / narrowing question MUST use the tool\n\n'
    || E'In mode C, if your reply would ask the user ANY of the following — even casually, even as a single sentence — you MUST call the `ask_clarifying_questions` tool instead of asking in prose:\n'
    || E'- which countries, regions, cities, or locations to target\n'
    || E'- which seniority level(s), years of experience, or career stage\n'
    || E'- which languages (spoken/written) are required\n'
    || E'- which adjacent titles, specializations, or industries to include\n'
    || E'- which channels, boards, or platforms to post on\n'
    || E'- which skills, tools, or stack to require vs nice-to-have\n'
    || E'- which budget range, salary band, or compensation model\n'
    || E'- full-time vs part-time vs contract, in-office vs remote vs hybrid\n'
    || E'- any "to sharpen / narrow / refine / broaden the search" follow-ups\n\n'
    || E'Asking those questions in prose is FORBIDDEN. The tool renders pill-shaped multi-select cards which the user expects. A prose question for any of the above is a bug.\n\n'
    || E'When in doubt between calling the tool and asking in prose: call the tool. The only allowed prose around the tool is ONE short lead-in sentence (e.g. "A couple quick details to sharpen the search:").',
  version = version + 1,
  updated_at = now()
WHERE slug = 'chat.main';