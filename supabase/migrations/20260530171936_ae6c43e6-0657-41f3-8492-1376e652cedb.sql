
-- Extend the clarify menu in chat.main with two more questions (strict-title + tech stack).
UPDATE public.prompts
SET body = replace(
  body,
  '   - Languages (multi, allow_other=true): only when relevant by location/industry.',
  '   - Languages (multi, allow_other=true): only when relevant by location/industry.
   - Title match strictness (single): "Strict — exact titles only" / "Loose — include related titles". Ask ONLY when the user gave a precise title (e.g. "Head of Partnerships", "Staff ML Engineer") where a loose match would dilute results. Drives the search''s include_similar_titles flag.
   - Tech stack (multi, allow_other=true): only for engineering / data / DevOps / RevOps roles. Seed with 4–6 technologies the role obviously needs (e.g. for a Senior Backend Engineer: Postgres, Kubernetes, AWS, Go, Python, TypeScript). Becomes an OR-filter on the candidate''s current employer tech stack.
   - Employer also hiring for (multi, allow_other=true): titles the candidate''s current company is actively recruiting (signal of team scaling). Ask only when the user explicitly cares about joining a growing team.'),
    version = version + 1,
    updated_at = now()
WHERE slug = 'chat.main';

-- Extend sourcing.agent_normalize to emit the three new fields.
UPDATE public.prompts
SET body = $body$You normalize a recruiter request into a sourcing brief.
Return strict JSON:
{
  "title": "<single canonical job title>",
  "skills": ["..."],
  "industries": ["<short industry/vertical labels mentioned or strongly implied, e.g. 'foodtech', 'adtech', 'b2b saas'>"],
  "must_have_keywords": ["<short phrases the candidate's history MUST show, e.g. 'strategic partnerships', 'channel sales'>"],
  "technologies": ["<technologies the candidate's current employer uses, lowercased with underscores for spaces/dots, e.g. 'postgres', 'kubernetes', 'google_analytics' — only when the user explicitly named them>"],
  "employer_hiring_titles": ["<titles the candidate's current employer is actively hiring for — only when the user mentioned wanting a growing team>"],
  "strict_titles": false,
  "location": "<City, State/Region, Country — full names, empty parts allowed, or empty>",
  "seniorities": ["<one of: entry, senior, manager, director, vp, head, c_suite>"],
  "keywords": ["<3-5 boost (nice-to-have) keywords>"]
}
Set "strict_titles" to true ONLY when the user explicitly asked for exact-title matches or used a precise title that should not be broadened (e.g. "Head of Partnerships", not "Manager").
{{partial:location.rules}}
Output JSON only.$body$,
    version = version + 1,
    updated_at = now()
WHERE slug = 'sourcing.agent_normalize';
