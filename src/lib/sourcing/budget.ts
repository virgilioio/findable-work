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

// Multi-country regions. When a user types one of these as a "location",
// expand it into the constituent countries so Apollo's `person_locations`
// filter actually narrows results to the region instead of collapsing to
// a global title-only search.
const REGION_ALIASES: Record<string, string[]> = {
  latam: [
    "Mexico", "Brazil", "Argentina", "Chile", "Colombia", "Peru",
    "Venezuela", "Ecuador", "Guatemala", "Costa Rica", "Panama",
    "Uruguay", "Bolivia", "Paraguay", "Honduras", "El Salvador",
    "Nicaragua", "Dominican Republic",
  ],
  "latin america": [],
  "south america": [
    "Brazil", "Argentina", "Chile", "Colombia", "Peru",
    "Venezuela", "Ecuador", "Uruguay", "Bolivia", "Paraguay",
  ],
  "central america": [
    "Guatemala", "Costa Rica", "Panama", "Honduras", "El Salvador", "Nicaragua",
  ],
  emea: [
    "United Kingdom", "Germany", "France", "Spain", "Italy", "Netherlands",
    "Belgium", "Sweden", "Norway", "Denmark", "Finland", "Poland", "Portugal",
    "Greece", "Austria", "Switzerland", "Ireland", "Czech Republic", "Romania",
    "Hungary", "Ukraine", "Turkey", "United Arab Emirates", "Saudi Arabia",
    "Israel", "Egypt", "South Africa", "Kenya", "Nigeria",
  ],
  europe: [
    "United Kingdom", "Germany", "France", "Spain", "Italy", "Netherlands",
    "Belgium", "Sweden", "Norway", "Denmark", "Finland", "Poland", "Portugal",
    "Greece", "Austria", "Switzerland", "Ireland", "Czech Republic", "Romania",
    "Hungary", "Ukraine",
  ],
  "western europe": [
    "United Kingdom", "Germany", "France", "Spain", "Italy", "Netherlands",
    "Belgium", "Ireland", "Portugal", "Austria", "Switzerland",
  ],
  nordics: ["Sweden", "Norway", "Denmark", "Finland"],
  scandinavia: ["Sweden", "Norway", "Denmark"],
  dach: ["Germany", "Austria", "Switzerland"],
  benelux: ["Netherlands", "Belgium"],
  apac: [
    "India", "China", "Japan", "Singapore", "Australia", "New Zealand",
    "South Korea", "Thailand", "Vietnam", "Philippines", "Indonesia",
    "Malaysia", "Taiwan", "Hong Kong",
  ],
  "asia pacific": [
    "India", "China", "Japan", "Singapore", "Australia", "New Zealand",
    "South Korea", "Thailand", "Vietnam", "Philippines", "Indonesia",
    "Malaysia", "Taiwan", "Hong Kong",
  ],
  sea: [
    "Singapore", "Thailand", "Vietnam", "Philippines",
    "Indonesia", "Malaysia",
  ],
  "southeast asia": [
    "Singapore", "Thailand", "Vietnam", "Philippines",
    "Indonesia", "Malaysia",
  ],
  mena: [
    "United Arab Emirates", "Saudi Arabia", "Israel", "Egypt", "Turkey",
  ],
  "north america": ["United States", "Canada", "Mexico"],
};
// Backfill aliases that reference others
REGION_ALIASES["latin america"] = REGION_ALIASES.latam;

/**
 * If `raw` is a multi-country region acronym (LATAM, EMEA, APAC, ...), return
 * the canonical region label + the typical country list to suggest to the
 * user. Returns null for single-country / city / state inputs. The app must
 * ask the user to pick countries instead of silently expanding — different
 * countries inside a region have very different talent pools.
 */
export function detectAmbiguousRegion(
  raw: string,
): { region: string; suggestedCountries: string[] } | null {
  const key = raw.trim().toLowerCase();
  const hit = REGION_ALIASES[key];
  if (!hit || hit.length === 0) return null;
  // Canonical label = the input as the user wrote it, trimmed.
  return { region: raw.trim(), suggestedCountries: hit };
}

/**
 * Normalize a raw location string into Apollo-compatible variants.
 * Returns progressively-broader variants so a single `person_locations[]`
 * array gives Apollo room to find matches:
 *   ["City, Region, Country", "City, Country", "Region, Country", "Country"]
 *
 * Accepts:
 *  - "Mexico City, Mexico"
 *  - "Mexico City, MX"
 *  - "San Francisco, CA, US"
 *  - "California, US"
 *  - "Austin, Texas, United States"
 *  - "Berlin, , Germany"   (empty middle part = unknown state)
 *  - "Mexico"
 *  - "CDMX"
 */
export function normalizeLocationForApollo(raw: string): string[] {
  // Preserve empty middle parts ("Berlin, , Germany") so we can detect
  // missing region without losing the country.
  const rawParts = raw.split(",").map((s) => s.trim());
  const parts = rawParts.filter(Boolean);
  if (parts.length === 0) return [];

  // Multi-country region (LATAM, EMEA, APAC, Nordics, DACH, ...).
  // We deliberately do NOT auto-expand here. Region acronyms are ambiguous
  // (LATAM = 18 countries with very different markets) and silently expanding
  // them led to wrong-region results. The sourcing entry points call
  // `detectAmbiguousRegion` upfront and ask the user to pick countries
  // instead. If a raw acronym still reaches Apollo it returns no matches —
  // which is the right failure mode (better than wrong-country results).

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
  // (Only when the original string actually had 2 parts — a 3-part string
  // with an empty middle, like "Berlin, , Germany", is handled below.)
  if (parts.length === 2 && rawParts.length === 2) {
    const [first, second] = parts;
    const countryName = resolveCountry(second);
    const cityOrState = US_STATE_ABBR_TO_NAME[first.toUpperCase()] ?? aliasCity(first);
    if (countryName) return [`${cityOrState}, ${countryName}`, countryName];
    return [`${cityOrState}, ${second}`];
  }

  // 3+ parts: "City, Region, Country" (with possibly-empty City or Region).
  const cityRaw = rawParts[0] ?? "";
  const regionRaw = rawParts[1] ?? "";
  const countryRaw = rawParts[rawParts.length - 1] ?? "";
  const city = cityRaw ? aliasCity(cityRaw) : "";
  const region = regionRaw
    ? US_STATE_ABBR_TO_NAME[regionRaw.toUpperCase()] ?? regionRaw
    : "";
  const countryName = countryRaw ? resolveCountry(countryRaw) : null;
  const countryDisplay = countryName ?? countryRaw;
  const out: string[] = [];
  if (city && region && countryDisplay) out.push(`${city}, ${region}, ${countryDisplay}`);
  if (city && countryDisplay) out.push(`${city}, ${countryDisplay}`);
  if (region && countryDisplay) out.push(`${region}, ${countryDisplay}`);
  if (countryDisplay) out.push(countryDisplay);
  if (out.length === 0 && city) out.push(city);
  return [...new Set(out)];
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
 * Split a location into PDL `location_locality`, `location_region`, and
 * `location_country` (all lowercased). Any field may be `null` when not
 * present in the input.
 */
export function splitLocationForPdl(raw: string): {
  locality: string | null;
  region: string | null;
  country: string | null;
} {
  const rawParts = raw.split(",").map((s) => s.trim());
  const parts = rawParts.filter(Boolean);
  if (parts.length === 0) return { locality: null, region: null, country: null };

  // Single token: country code/name or city alias.
  if (parts.length === 1) {
    const upper = parts[0].toUpperCase();
    if (COUNTRY_CODE_TO_NAME[upper]) {
      return { locality: null, region: null, country: COUNTRY_CODE_TO_NAME[upper].toLowerCase() };
    }
    const lower = parts[0].toLowerCase();
    if (COUNTRY_NAME_TO_CODE[lower]) {
      return {
        locality: null,
        region: null,
        country: COUNTRY_CODE_TO_NAME[COUNTRY_NAME_TO_CODE[lower]].toLowerCase(),
      };
    }
    return { locality: aliasCity(parts[0]).toLowerCase(), region: null, country: null };
  }

  // 2 parts (and original had only 2): "City, Country" or "Region, Country".
  // We can't reliably tell city from region with 2 tokens; treat first as locality.
  if (parts.length === 2 && rawParts.length === 2) {
    const country = resolveCountry(parts[1]);
    return {
      locality: aliasCity(parts[0]).toLowerCase(),
      region: null,
      country: country ? country.toLowerCase() : null,
    };
  }

  // 3+ parts (possibly with empty middle): "City, Region, Country".
  const cityRaw = rawParts[0] ?? "";
  const regionRaw = rawParts[1] ?? "";
  const countryRaw = rawParts[rawParts.length - 1] ?? "";
  const country = countryRaw ? resolveCountry(countryRaw) : null;
  const regionExpanded = regionRaw
    ? US_STATE_ABBR_TO_NAME[regionRaw.toUpperCase()] ?? regionRaw
    : "";
  return {
    locality: cityRaw ? aliasCity(cityRaw).toLowerCase() : null,
    region: regionExpanded ? regionExpanded.toLowerCase() : null,
    country: country ? country.toLowerCase() : null,
  };
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