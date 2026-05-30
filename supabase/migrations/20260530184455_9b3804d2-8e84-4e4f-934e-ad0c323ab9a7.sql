-- Append a hard rule: never re-ask a clarification the user has already
-- answered (especially the LATAM/region country picker), to break the loop
-- where source_candidates -> normalize empties location -> agent asks again.
UPDATE prompts
SET body = body || E'\n\n## NEVER re-ask an answered clarification\n\n- If the conversation already contains a user reply to a clarifying card on the SAME topic (e.g. "Target countries in LATAM: Mexico, Colombia, Chile"), you MUST NOT call ask_clarifying_questions on that same topic again. Treat the user''s last answer as authoritative.\n- When you call source_candidates after a region-countries clarification, the `brief` you pass MUST list the concrete countries the user chose (e.g. "Marketing Director, B2B SaaS, in Mexico, Colombia, Chile"). Do NOT write "LATAM" alone in the brief — that re-triggers the region picker on the backend.\n- If a previous source_candidates call returned `needs_clarification` and the user has since answered with concrete countries, just call source_candidates again with the concrete countries in the brief. Do NOT call ask_clarifying_questions.\n',
    version = version + 1,
    updated_at = now()
WHERE slug = 'chat.main';