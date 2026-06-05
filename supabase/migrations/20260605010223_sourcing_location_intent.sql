-- Make location handling intentional in the sourcing flow.
-- 1) Add a dedicated "Locations" item to the chat.main clarify menu and
--    tighten the pre-sourcing rule so a bare "remote" or region acronym
--    counts as MISSING location (must ask first).
-- 2) Update sourcing.agent_normalize so the model emits ONLY specific
--    places (country / city / state). Region acronyms, continents, or
--    bare "remote" must be left empty so the in-process ambiguous-region
--    guard triggers and we ask the user.

UPDATE public.prompts
SET body = replace(
  body,
  '1. Before sourcing, you MUST have at least: a role title, a location (or "remote"), and a seniority hint. If ANY of those three are missing from the conversation so far, call ask_clarifying_questions and STOP — do not call source_candidates in the same turn.',
  '1. Before sourcing, you MUST have at least: a role title, at least one SPECIFIC country or city (a bare "remote", "global", or region acronym like "LATAM"/"EMEA"/"APAC"/"Europe" does NOT count — it is treated as missing), and a seniority hint. If ANY of those three are missing or vague from the conversation so far, call ask_clarifying_questions and STOP — do not call source_candidates in the same turn. Never invent a country from a language hint or a job board; only use locations the user actually named.'
),
  version = version + 1,
  updated_at = now()
WHERE slug = 'chat.main';

UPDATE public.prompts
SET body = replace(
  body,
  '   - Work model (single): On-site, Hybrid, Remote-domestic, Remote-global. Ask only when the location is a city without a model stated.',
  '   - Locations (multi, allow_other=true): which SPECIFIC countries or cities to target. ALWAYS ask when the user gave only "remote", a continent ("Europe", "Asia"), or a region acronym ("LATAM", "EMEA", "APAC", "DACH", "Nordics", "MENA"). Seed sensible defaults for the region (e.g. for LATAM: Mexico, Brazil, Argentina, Colombia, Chile, Peru; for EMEA: United Kingdom, Germany, France, Spain, Netherlands; for APAC: India, Singapore, Australia, Japan; for remote: pick 4–6 countries you think the team would actually hire from). Also ask after a 0-result run when the brief lacks a concrete country.
   - Work model (single): On-site, Hybrid, Remote-domestic, Remote-global. Ask only when the location is a city without a model stated.'
),
  version = version + 1,
  updated_at = now()
WHERE slug = 'chat.main';

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
  "location": "<City, State/Region, Country — full names, empty parts allowed, or empty string when the user did NOT name a specific country or city>",
  "seniorities": ["<one of: entry, senior, manager, director, vp, head, c_suite>"],
  "keywords": ["<3-5 boost (nice-to-have) keywords>"]
}
Set "strict_titles" to true ONLY when the user explicitly asked for exact-title matches or used a precise title that should not be broadened (e.g. "Head of Partnerships", not "Manager").

Location intent (CRITICAL):
- Only emit a location when the user named a SPECIFIC country, state/region, or city. Use full names (e.g. "São Paulo, São Paulo, Brazil").
- If the user only said "remote", "global", "anywhere", or a region/continent acronym ("LATAM", "EMEA", "APAC", "DACH", "Nordics", "MENA", "Europe", "Asia", "North America"), leave "location" as an EMPTY string. The downstream agent will ask the recruiter which specific countries to target. Do NOT invent countries from language, currency, or industry hints.

{{partial:location.rules}}
Output JSON only.$body$,
    version = version + 1,
    updated_at = now()
WHERE slug = 'sourcing.agent_normalize';
