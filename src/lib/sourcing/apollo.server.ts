// Apollo API helpers. Server-only.
import {
  budgetSearchCriteria,
  formatLocationForApollo,
  linkedinSlug,
  mapSeniorities,
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
  keyword_score: number;
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

export async function searchApollo(criteria: SearchCriteria): Promise<ApolloPreview[]> {
  const c = budgetSearchCriteria(criteria);
  const personTitles = c.title_keywords ?? [];
  const companies = [
    ...(c.user_company_names ?? []),
    ...(c.researched_companies ?? []),
  ];
  const personLocations = (c.locations ?? []).map(formatLocationForApollo);
  const personSeniorities = mapSeniorities(c.seniorities ?? []);

  const baseBody: Record<string, unknown> = {
    per_page: 100,
    ...(personTitles.length ? { person_titles: personTitles.slice(0, 10) } : {}),
    ...(companies.length ? { q_organization_name: companies.join(" OR ") } : {}),
    ...(personLocations.length ? { person_locations: personLocations } : {}),
    ...(personSeniorities.length ? { person_seniorities: personSeniorities } : {}),
    ...(c.company_sizes?.length
      ? { organization_num_employees_ranges: c.company_sizes }
      : {}),
    ...(c.company_domains?.length
      ? { q_organization_domains_list: c.company_domains }
      : {}),
  };

  const collected: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await apolloFetch("/mixed_people/api_search", { ...baseBody, page });
    const people: any[] = data.people ?? [];
    if (people.length === 0) break;
    collected.push(...people);
    const total = data.pagination?.total_entries ?? collected.length;
    if (collected.length >= total || people.length < 100) break;
    await new Promise((r) => setTimeout(r, 300));
  }

  const rows = collected.map((p) => ({
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

  return scoreKeywordsLocally(rows, c.keywords ?? []);
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