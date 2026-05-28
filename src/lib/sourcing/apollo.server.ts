// Apollo API helpers. Server-only.
import {
  budgetSearchCriteria,
  linkedinSlug,
  mapSeniorities,
  normalizeLocationForApollo,
  normalizeTitles,
  deduplicateKeywords,
  dropLocationLikeCompanies,
  scoreKeywordsLocally,
  type SearchCriteria,
} from "./budget";

const APOLLO_BASE = "https://api.apollo.io/api/v1";
const MAX_PAGES = 20; // 20 * 100 = 2000 results cap

export type ApolloPreview = {
  source: "apollo";
  external_id: string;
  linkedin_slug: string | null;
  first_name: string;
  last_name_obfuscated: string;
  title: string;
  company: string;
  has_email: boolean;
  has_direct_phone: boolean;
  has_city: boolean;
  has_state: boolean;
  has_country: boolean;
  keyword_score?: number;
};

async function apolloFetch(path: string, body: unknown): Promise<any> {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY is not configured");
  const res = await fetch(`${APOLLO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      "X-Api-Key": key,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo error [${res.status}] ${path}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

type ApolloSearchBody = Record<string, unknown>;

function buildBody(opts: {
  titles: string[];
  companies: string[];
  locations: string[];
  seniorities: string[];
  companySizes: string[];
  companyDomains: string[];
}): ApolloSearchBody {
  return {
    per_page: 100,
    ...(opts.titles.length ? { person_titles: opts.titles.slice(0, 10) } : {}),
    ...(opts.companies.length ? { q_organization_name: opts.companies.join(" OR ") } : {}),
    ...(opts.locations.length ? { person_locations: opts.locations } : {}),
    ...(opts.seniorities.length ? { person_seniorities: opts.seniorities } : {}),
    ...(opts.companySizes.length ? { organization_num_employees_ranges: opts.companySizes } : {}),
    ...(opts.companyDomains.length ? { q_organization_domains_list: opts.companyDomains } : {}),
  };
}

async function runApolloSearch(body: ApolloSearchBody): Promise<ApolloPreview[]> {
  const collected: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await apolloFetch("/mixed_people/api_search", { ...body, page });
    const people: any[] = data.people ?? [];
    if (people.length === 0) break;
    collected.push(...people);
    const total = data.pagination?.total_entries ?? collected.length;
    if (collected.length >= total || people.length < 100) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  return collected.map((p) => ({
    source: "apollo" as const,
    external_id: String(p.id),
    linkedin_slug: linkedinSlug(p.linkedin_url),
    first_name: p.first_name ?? "",
    last_name_obfuscated: p.last_name ?? "",
    title: p.title ?? "",
    company: p.organization?.name ?? "",
    has_email: Boolean(p.email_status === "verified" || p.email),
    has_direct_phone: Boolean(p.phone_numbers?.length),
    has_city: Boolean(p.city),
    has_state: Boolean(p.state),
    has_country: Boolean(p.country),
  }));
}

export type ApolloSearchOutcome = {
  rows: ApolloPreview[];
  broadened_to: number; // 0 = full query, 1..N = which fallback succeeded
  broadening_steps: string[];
};

/**
 * Progressive relaxation ladder. Stops at the first attempt with ≥1 result.
 */
export async function searchApolloWithFallback(criteria: SearchCriteria): Promise<ApolloSearchOutcome> {
  const c = budgetSearchCriteria(criteria);

  const titles = normalizeTitles(c.title_keywords ?? []);
  const locationsArr = (c.locations ?? []).flatMap(normalizeLocationForApollo);
  // De-dupe while preserving order
  const locations = [...new Set(locationsArr)];
  // Country-only variants are the entries with no comma. `normalizeLocationForApollo`
  // always appends a bare country at the end of its output when one is resolved,
  // so this filter still reliably yields the country fallback.
  const countryOnly = [...new Set(
    locations.filter((l) => !l.includes(",")),
  )];
  const seniorities = mapSeniorities(c.seniorities ?? []);
  const rawCompanies = [
    ...(c.user_company_names ?? []),
    ...(c.researched_companies ?? []),
  ];
  const companies = dropLocationLikeCompanies(rawCompanies, c.locations ?? []);
  const keywords = deduplicateKeywords(c.keywords ?? [], titles);
  const companySizes = c.company_sizes ?? [];
  const companyDomains = c.company_domains ?? [];

  const attempts: Array<{ step: string; body: ApolloSearchBody }> = [
    {
      step: "full",
      body: buildBody({ titles, companies, locations, seniorities, companySizes, companyDomains }),
    },
    {
      step: "dropped_seniority",
      body: buildBody({ titles, companies, locations, seniorities: [], companySizes, companyDomains }),
    },
    {
      step: "dropped_companies",
      body: buildBody({ titles, companies: [], locations, seniorities: [], companySizes, companyDomains }),
    },
    {
      step: "country_only_location",
      body: buildBody({ titles, companies: [], locations: countryOnly, seniorities: [], companySizes, companyDomains }),
    },
    {
      step: "title_only",
      body: buildBody({ titles, companies: [], locations: [], seniorities: [], companySizes, companyDomains: [] }),
    },
  ];

  const broadeningSteps: string[] = [];
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    // Skip degenerate attempts (e.g. country_only when there is no country)
    if (i > 0 && JSON.stringify(attempt.body) === JSON.stringify(attempts[i - 1].body)) {
      continue;
    }
    const rows = await runApolloSearch(attempt.body);
    if (rows.length > 0) {
      return {
        rows: scoreKeywordsLocally(rows, keywords),
        broadened_to: i,
        broadening_steps: broadeningSteps,
      };
    }
    if (i > 0) broadeningSteps.push(attempt.step);
  }

  return { rows: [], broadened_to: attempts.length, broadening_steps: broadeningSteps };
}

// Legacy single-shot kept for any other callers (none today).
export async function searchApollo(criteria: SearchCriteria): Promise<ApolloPreview[]> {
  const out = await searchApolloWithFallback(criteria);
  return out.rows;
}

export type ApolloEnriched = {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  title: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  organization_name: string | null;
  employment_history: Array<{
    title: string | null;
    organization_name: string | null;
    start_date: string | null;
    end_date: string | null;
    description: string | null;
  }>;
};

export async function enrichApolloProfiles(
  ids: string[],
): Promise<ApolloEnriched[]> {
  if (ids.length === 0) return [];
  const out: ApolloEnriched[] = [];
  // bulk_match: max 10 per call
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const data = await apolloFetch("/people/bulk_match", {
      details: chunk.map((id) => ({ id })),
      reveal_phone_number: false,
    });
    const matches: any[] = data.matches ?? [];
    for (const m of matches) {
      if (!m) continue;
      out.push({
        id: String(m.id),
        first_name: m.first_name ?? "",
        last_name: m.last_name ?? "",
        full_name: m.name ?? `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim(),
        title: m.title ?? "",
        email: m.email ?? null,
        phone: m.phone_numbers?.[0]?.sanitized_number ?? null,
        linkedin_url: m.linkedin_url ?? null,
        city: m.city ?? null,
        state: m.state ?? null,
        country: m.country ?? null,
        organization_name: m.organization?.name ?? null,
        employment_history: (m.employment_history ?? []).map((e: any) => ({
          title: e.title ?? null,
          organization_name: e.organization_name ?? null,
          start_date: e.start_date ?? null,
          end_date: e.end_date ?? null,
          description: e.description ?? null,
        })),
      });
    }
  }
  return out;
}

/**
 * Reveal phone number for a single Apollo profile. This DOES consume
 * Apollo export credits — only call when the user explicitly opts in.
 */
export async function revealApolloPhone(apolloId: string): Promise<string | null> {
  if (!apolloId) return null;
  const data = await apolloFetch("/people/bulk_match", {
    details: [{ id: apolloId }],
    reveal_phone_number: true,
  });
  const m = data.matches?.[0];
  if (!m) return null;
  return m.phone_numbers?.[0]?.sanitized_number ?? m.phone_numbers?.[0]?.raw_number ?? null;
}