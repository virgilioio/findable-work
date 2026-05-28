// Pure helpers shared by sourcing server fns. No server-only imports.

export type SearchCriteria = {
  title_keywords?: string[];
  user_company_names?: string[];
  researched_companies?: string[];
  keywords?: string[];
  seniorities?: string[];
  industries?: string[];
  locations?: string[];
  company_sizes?: string[];
  company_domains?: string[];
};

// Mirrors the other app: caps to avoid Apollo AND-stack overload.
export function budgetSearchCriteria(input: SearchCriteria): SearchCriteria {
  const userCompanies = (input.user_company_names ?? []).slice(0, 5);
  let titles = (input.title_keywords ?? []).slice(0, 4);
  let researchedCompanies =
    userCompanies.length > 0 ? [] : (input.researched_companies ?? []).slice(0, 3);
  let keywords = (input.keywords ?? []).slice(0, 3);
  let seniorities = (input.seniorities ?? []).slice(0, 2);

  // Tighten further when many dense dimensions
  if (titles.length >= 3 && keywords.length >= 2) researchedCompanies = [];
  if (titles.length >= 3 && seniorities.length >= 2) keywords = keywords.slice(0, 1);

  return {
    title_keywords: titles,
    user_company_names: userCompanies,
    researched_companies: researchedCompanies,
    keywords,
    seniorities,
    industries: [], // Apollo wants numeric tag IDs; always drop text industries
    locations: input.locations ?? [],
    company_sizes: input.company_sizes ?? [],
    company_domains: input.company_domains ?? [],
  };
}

const SENIORITY_MAP: Record<string, string> = {
  intern: "intern",
  entry: "entry",
  junior: "entry",
  mid: "senior",
  senior: "senior",
  manager: "manager",
  director: "director",
  vp: "vp",
  head: "head",
  executive: "c_suite",
  c_suite: "c_suite",
  csuite: "c_suite",
  cxo: "c_suite",
  owner: "owner",
  founder: "founder",
  partner: "partner",
};

export function mapSeniorities(items: string[]): string[] {
  return [...new Set(items.map((s) => SENIORITY_MAP[s.toLowerCase()] ?? s.toLowerCase()))];
}

// Apollo prefers "City, Country" — drop state.
export function formatLocationForApollo(loc: string): string {
  const parts = loc.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return loc;
  if (parts.length === 2) return `${parts[0]}, ${parts[1]}`;
  return `${parts[0]}, ${parts[parts.length - 1]}`;
}

export function scoreKeywordsLocally<T extends { title?: string; company?: string }>(
  rows: T[],
  keywords: string[],
): (T & { keyword_score: number })[] {
  const kws = keywords.map((k) => k.toLowerCase()).filter(Boolean);
  return rows.map((row) => {
    const hay = `${row.title ?? ""} ${row.company ?? ""}`.toLowerCase();
    let score = 0;
    for (const k of kws) if (hay.includes(k)) score += 25;
    return { ...row, keyword_score: score };
  });
}

export function linkedinSlug(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? m[1].toLowerCase().replace(/\/+$/, "") : null;
}

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}