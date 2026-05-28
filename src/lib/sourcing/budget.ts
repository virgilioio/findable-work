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
  // Only emit valid Apollo seniority enum values. Drop anything that
  // doesn't map cleanly to avoid zero-result queries.
  const valid = new Set([
    "intern", "entry", "senior", "manager", "director", "vp",
    "head", "c_suite", "owner", "founder", "partner",
  ]);
  return [...new Set(
    items
      .map((s) => SENIORITY_MAP[s.toLowerCase()])
      .filter((s): s is string => Boolean(s) && valid.has(s)),
  )];
}

// PDL level mapping
const PDL_LEVEL_MAP: Record<string, string> = {
  intern: "training",
  entry: "entry",
  senior: "senior",
  manager: "manager",
  director: "director",
  vp: "vp",
  head: "vp",
  c_suite: "cxo",
  owner: "owner",
  founder: "owner",
  partner: "partner",
};

export function mapPdlLevels(items: string[]): string[] {
  const valid = new Set([
    "cxo", "director", "entry", "manager", "owner", "partner", "senior", "training", "unpaid", "vp",
  ]);
  return [...new Set(
    items
      .map((s) => PDL_LEVEL_MAP[s.toLowerCase()] ?? s.toLowerCase())
      .filter((s) => valid.has(s)),
  )];
}

// ─── Country / state / city normalization (ported from GoGioATS) ─────────

const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  US: "United States", CA: "Canada", MX: "Mexico", BR: "Brazil", AR: "Argentina",
  CL: "Chile", CO: "Colombia", PE: "Peru", VE: "Venezuela", EC: "Ecuador",
  GT: "Guatemala", CR: "Costa Rica", PA: "Panama", UY: "Uruguay", BO: "Bolivia",
  PY: "Paraguay", HN: "Honduras", SV: "El Salvador", NI: "Nicaragua",
  DO: "Dominican Republic", JM: "Jamaica", PR: "Puerto Rico",
  GB: "United Kingdom", DE: "Germany", FR: "France", ES: "Spain", IT: "Italy",
  NL: "Netherlands", BE: "Belgium", SE: "Sweden", NO: "Norway", DK: "Denmark",
  FI: "Finland", PL: "Poland", PT: "Portugal", GR: "Greece", AT: "Austria",
  CH: "Switzerland", IE: "Ireland", CZ: "Czech Republic", RO: "Romania",
  HU: "Hungary", UA: "Ukraine", TR: "Turkey",
  IN: "India", CN: "China", JP: "Japan", SG: "Singapore", AU: "Australia",
  NZ: "New Zealand", KR: "South Korea", TH: "Thailand", VN: "Vietnam",
  PH: "Philippines", ID: "Indonesia", MY: "Malaysia", TW: "Taiwan", HK: "Hong Kong",
  AE: "United Arab Emirates", SA: "Saudi Arabia", IL: "Israel",
  EG: "Egypt", ZA: "South Africa", KE: "Kenya", NG: "Nigeria",
};

const COUNTRY_NAME_TO_CODE: Record<string, string> = Object.entries(COUNTRY_CODE_TO_NAME)
  .reduce((acc, [code, name]) => {
    acc[name.toLowerCase()] = code;
    return acc;
  }, {} as Record<string, string>);
// Common aliases
Object.assign(COUNTRY_NAME_TO_CODE, {
  "usa": "US", "u.s.": "US", "u.s.a.": "US", "america": "US",
  "uk": "GB", "england": "GB", "méxico": "MX", "brasil": "BR",
  "perú": "PE",
});

const US_STATE_ABBR_TO_NAME: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

// Small hand-curated city alias map. Lowercased keys.
const CITY_ALIASES: Record<string, string> = {
  cdmx: "Mexico City",
  "ciudad de méxico": "Mexico City",
  "ciudad de mexico": "Mexico City",
  df: "Mexico City",
  nyc: "New York",
  "new york city": "New York",
  sf: "San Francisco",
  la: "Los Angeles",
  bcn: "Barcelona",
  cph: "Copenhagen",
  ams: "Amsterdam",
};

function aliasCity(raw: string): string {
  const key = raw.trim().toLowerCase();
  return CITY_ALIASES[key] ?? raw.trim();
}

/**
 * Normalize a raw location string into Apollo-compatible variants.
 * Returns the city-level expression AND a country-only fallback so a single
 * `person_locations[]` array gives Apollo room to find matches.
 *
 * Accepts:
 *  - "Mexico City, Mexico"
 *  - "Mexico City, MX"
 *  - "San Francisco, CA, US"
 *  - "California, US"
 *  - "Mexico"
 *  - "CDMX"
 */
export function normalizeLocationForApollo(raw: string): string[] {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return [];

  // Single token: could be city alias, country code, country name, or city
  if (parts.length === 1) {
    const tok = parts[0];
    const upper = tok.toUpperCase();
    if (COUNTRY_CODE_TO_NAME[upper]) return [COUNTRY_CODE_TO_NAME[upper]];
    const lower = tok.toLowerCase();
    if (COUNTRY_NAME_TO_CODE[lower]) {
      return [COUNTRY_CODE_TO_NAME[COUNTRY_NAME_TO_CODE[lower]]];
    }
    return [aliasCity(tok)];
  }

  // 2 parts: "City, Country" | "State, Country"
  if (parts.length === 2) {
    const [first, second] = parts;
    const countryName = resolveCountry(second);
    const cityOrState = US_STATE_ABBR_TO_NAME[first.toUpperCase()] ?? aliasCity(first);
    if (countryName) return [`${cityOrState}, ${countryName}`, countryName];
    return [`${cityOrState}, ${second}`];
  }

  // 3+ parts: "City, State, Country"
  const city = aliasCity(parts[0]);
  const countryName = resolveCountry(parts[parts.length - 1]);
  if (countryName) return [`${city}, ${countryName}`, countryName];
  return [`${city}, ${parts[parts.length - 1]}`];
}

function resolveCountry(tok: string): string | null {
  const upper = tok.toUpperCase();
  if (COUNTRY_CODE_TO_NAME[upper]) return COUNTRY_CODE_TO_NAME[upper];
  const lower = tok.toLowerCase();
  if (COUNTRY_NAME_TO_CODE[lower]) {
    return COUNTRY_CODE_TO_NAME[COUNTRY_NAME_TO_CODE[lower]];
  }
  // Already a recognizable country word, leave as-is
  return tok;
}

/**
 * Split a location into PDL `location_locality` and `location_country` (both lowercased).
 */
export function splitLocationForPdl(raw: string): { locality: string | null; country: string | null } {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { locality: null, country: null };
  if (parts.length === 1) {
    const upper = parts[0].toUpperCase();
    if (COUNTRY_CODE_TO_NAME[upper]) {
      return { locality: null, country: COUNTRY_CODE_TO_NAME[upper].toLowerCase() };
    }
    const lower = parts[0].toLowerCase();
    if (COUNTRY_NAME_TO_CODE[lower]) {
      return { locality: null, country: COUNTRY_CODE_TO_NAME[COUNTRY_NAME_TO_CODE[lower]].toLowerCase() };
    }
    return { locality: aliasCity(parts[0]).toLowerCase(), country: null };
  }
  const last = parts[parts.length - 1];
  const country = resolveCountry(last);
  const locality = aliasCity(parts[0]).toLowerCase();
  return { locality, country: country ? country.toLowerCase() : null };
}

/**
 * Drop "researched_companies" entries that are actually location names
 * (a frequent LLM hallucination, e.g. "Mexico City" as a company).
 */
export function dropLocationLikeCompanies(companies: string[], locations: string[]): string[] {
  const tokens = new Set<string>();
  for (const loc of locations) {
    for (const part of loc.split(",")) {
      const t = part.trim().toLowerCase();
      if (t.length > 1) tokens.add(t);
    }
  }
  // Add all known country/state names too
  for (const name of Object.values(COUNTRY_CODE_TO_NAME)) tokens.add(name.toLowerCase());
  for (const name of Object.values(US_STATE_ABBR_TO_NAME)) tokens.add(name.toLowerCase());
  return companies.filter((c) => {
    const lower = c.trim().toLowerCase();
    if (tokens.has(lower)) return false;
    // Also catch single-word matches against city aliases
    if (CITY_ALIASES[lower]) return false;
    return true;
  });
}

/**
 * Drop keywords whose tokens are all already covered by title keywords.
 * Prevents AND-stack redundancy.
 */
export function deduplicateKeywords(keywords: string[], titles: string[]): string[] {
  if (!keywords.length || !titles.length) return keywords;
  const titleWords = new Set<string>();
  for (const t of titles) {
    for (const w of t.toLowerCase().split(/[\s,]+/)) {
      if (w.length > 2) titleWords.add(w);
    }
  }
  return keywords.filter((kw) => {
    const words = kw.toLowerCase().split(/\s+/);
    return !words.every((w) => w.length <= 2 || titleWords.has(w));
  });
}

/**
 * Expand a title into Apollo-friendly variants (lowercased + common abbrev/forms).
 */
export function normalizeTitles(titles: string[]): string[] {
  const out = new Set<string>();
  for (const t of titles) {
    const base = t.trim().toLowerCase();
    if (!base) continue;
    out.add(base);
    // Common abbrev expansions
    if (/\bae\b/.test(base)) out.add(base.replace(/\bae\b/, "account executive"));
    if (/\bsdr\b/.test(base)) out.add(base.replace(/\bsdr\b/, "sales development representative"));
    if (/\bbdr\b/.test(base)) out.add(base.replace(/\bbdr\b/, "business development representative"));
    if (/\bvp\b/.test(base)) {
      out.add(base.replace(/\bvp\b/, "vice president"));
      out.add(base.replace(/\bvp\b/, "vp of"));
    }
    if (/\bpm\b/.test(base)) out.add(base.replace(/\bpm\b/, "product manager"));
    if (/\beng\b/.test(base)) out.add(base.replace(/\beng\b/, "engineer"));
    // Reverse contractions
    if (/account executive/.test(base)) out.add(base.replace(/account executive/, "ae"));
  }
  return [...out].slice(0, 10);
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