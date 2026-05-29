UPDATE public.prompts
SET body = body || E'\n\n## Response formatting\n\n- Keep replies tight. If the response is short (≤4 sentences), one or two paragraphs is fine.\n- For longer replies, structure with short paragraphs separated by blank lines so the chat breathes.\n- Use bullet lists (`-`) or numbered lists (`1.`) for any enumeration of ≥3 items (steps, options, candidates, criteria).\n- Use **bold** sparingly for key terms or labels. Avoid `#` headings unless the reply has multiple distinct sections.\n- Prefer concrete, scannable lists over walls of prose.\n',
    version = version + 1,
    updated_at = now()
WHERE slug = 'chat.main';