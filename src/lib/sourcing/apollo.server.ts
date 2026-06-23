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
  industries: string[];
  mustHaveKeywords: string[];
  technologies: string[];
  employerHiringTitles: string[];
  strictTitles: boolean;
}): ApolloSearchBody {
  // Documented `q_keywords` is an AND-friendly free-text filter. We feed it
  // both must-have signals AND industry terms so industry filtering still
  // works even if Apollo silently ignores the (undocumented but observed)
  // `q_organization_keyword_tags` on this endpoint.
  const qKeywordsParts = [...opts.mustHaveKeywords, ...opts.industries].filter(Boolean);
  return {
    per_page: 100,
    // Quality default: only verified or likely-to-engage contacts.
    // We're a distillery of data — never return guessed/unavailable emails.
    contact_email_status: ["verified", "likely to engage"],
    ...(opts.titles.length ? { person_titles: opts.titles.slice(0, 10) } : {}),
    // Apollo default is `true` (returns related titles). Only set explicitly
    // when the recruiter asked for strict matching during the clarify card.
    ...(opts.strictTitles ? { include_similar_titles: false } : {}),
    ...(opts.companies.length ? { q_organization_name: opts.companies.join(" OR ") } : {}),
    ...(opts.locations.length ? { person_locations: opts.locations } : {}),
    ...(opts.seniorities.length ? { person_seniorities: opts.seniorities } : {}),
    ...(opts.companySizes.length ? { organization_num_employees_ranges: opts.companySizes } : {}),
    ...(opts.companyDomains.length ? { q_organization_domains_list: opts.companyDomains } : {}),
    // Free-text industry/vertical tags on the candidate's current org.
    // Apollo requires this as an array of strings (OR between entries).
    ...(opts.industries.length
      ? { q_organization_keyword_tags: opts.industries }
      : {}),
    // Documented free-text AND-filter. Combines must-have signals with
    // industry terms so we have a documented fallback path for vertical
    // filtering.
    ...(qKeywordsParts.length ? { q_keywords: qKeywordsParts.join(" ") } : {}),
    // OR-filter on the candidate's current employer tech stack (documented).
    ...(opts.technologies.length
      ? { currently_using_any_of_technology_uids: opts.technologies }
      : {}),
    // Titles the employer is currently hiring for — growth/adjacency signal.
    ...(opts.employerHiringTitles.length
      ? { q_organization_job_titles: opts.employerHiringTitles }
      : {}),
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
  // Be intentional: only send the MOST SPECIFIC variant the user asked for
  // to Apollo's `person_locations` in the base query. Apollo treats the
  // array as OR, so including ["City, Country", "Country"] silently
  // expands a city search to the whole country. The country-only fallback
  // lives in the broadening ladder below, gated on user intent.
  const userGaveCityOrRegion = (c.locations ?? []).some((l) => l.includes(","));
  const locations = [
    ...new Set(
      (c.locations ?? [])
        .flatMap((l) => normalizeLocationForApollo(l).slice(0, 1)),
    ),
  ];
  // Country fallback (only used by the country_only step in the ladder).
  const countryOnly = [
    ...new Set(
      (c.locations ?? []).flatMap((l) => {
        const variants = normalizeLocationForApollo(l);
        // The country-only entry is always the last with no comma.
        const country = variants.filter((v) => !v.includes(",")).pop();
        return country ? [country] : [];
      }),
    ),
  ];
  const seniorities = mapSeniorities(c.seniorities ?? []);
  const rawCompanies = [
    ...(c.user_company_names ?? []),
    ...(c.researched_companies ?? []),
  ];
  const companies = dropLocationLikeCompanies(rawCompanies, c.locations ?? []);
  const keywords = deduplicateKeywords(c.keywords ?? [], titles);
  const companySizes = c.company_sizes ?? [];
  const companyDomains = c.company_domains ?? [];
  const industries = c.industries ?? [];
  const mustHaveKeywords = c.must_have_keywords ?? [];
  const technologies = c.technologies ?? [];
  const employerHiringTitles = c.employer_hiring_titles ?? [];
  const strictTitles = c.strict_titles === true;

  const baseOpts = {
    titles,
    companies,
    locations,
    seniorities,
    companySizes,
    companyDomains,
    industries,
    mustHaveKeywords,
    technologies,
    employerHiringTitles,
    strictTitles,
  };

  const attempts: Array<{ step: string; body: ApolloSearchBody }> = [
    {
      step: "full",
      body: buildBody(baseOpts),
    },
    {
      step: "dropped_seniority",
      body: buildBody({ ...baseOpts, seniorities: [] }),
    },
    {
      step: "dropped_technologies",
      body: buildBody({ ...baseOpts, seniorities: [], technologies: [] }),
    },
    {
      step: "dropped_employer_hiring_titles",
      body: buildBody({ ...baseOpts, seniorities: [], technologies: [], employerHiringTitles: [] }),
    },
    {
      step: "dropped_must_have_keywords",
      body: buildBody({ ...baseOpts, seniorities: [], technologies: [], employerHiringTitles: [], mustHaveKeywords: [] }),
    },
    {
      step: "dropped_industries",
      body: buildBody({ ...baseOpts, seniorities: [], technologies: [], employerHiringTitles: [], mustHaveKeywords: [], industries: [] }),
    },
    {
      step: "dropped_companies",
      body: buildBody({ ...baseOpts, seniorities: [], technologies: [], employerHiringTitles: [], mustHaveKeywords: [], industries: [], companies: [] }),
    },
  ];

  // Country-only broadening is only safe when the user did NOT scope to a
  // specific city/region. If they asked for "São Paulo", we don't silently
  // expand to all of Brazil — we'd rather return zero and let the chat ask.
  if (!userGaveCityOrRegion && countryOnly.length > 0) {
    attempts.push({
      step: "country_only_location",
      body: buildBody({ ...baseOpts, seniorities: [], technologies: [], employerHiringTitles: [], mustHaveKeywords: [], industries: [], companies: [], locations: countryOnly }),
    });
  }

  // Only allow the global title-only fallback when the user did NOT specify a
  // location. Otherwise we'd silently return e.g. US candidates for a
  // "SDRs in LATAM" search — much worse UX than returning zero results and
  // asking the user to broaden.
  if (locations.length === 0) {
    attempts.push({
      step: "title_only",
      body: buildBody({ ...baseOpts, seniorities: [], technologies: [], employerHiringTitles: [], mustHaveKeywords: [], industries: [], companies: [], locations: [], companyDomains: [] }),
    });
  }

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
 * Request a phone-number reveal for a single Apollo profile.
 *
 * Apollo's /people/bulk_match with `reveal_phone_number: true` returns the
 * person's phone numbers SYNCHRONOUSLY in `matches[0].phone_numbers` when it
 * has them. The `webhook_url` is a fallback path for late-arriving numbers
 * delivered by Apollo's data waterfall — handled by /api/public/apollo/phone.
 *
 * Returns a discriminated outcome so callers can charge credits only on
 * success and surface accurate UI states.
 */
export type RevealPhoneOutcome =
  | { ok: true; phone: string; person: Record<string, unknown> } // sync hit
  | { ok: true; phone: null; queued: true }                       // accepted, awaiting webhook
  | {
      ok: false;
      reason: "not_matched" | "waterfall_failed" | "no_permission" | "unknown";
      message: string;
    };

export async function requestApolloPhoneReveal(
  apolloId: string,
): Promise<RevealPhoneOutcome> {
  if (!apolloId) throw new Error("Missing Apollo person id");
  const webhookUrl = process.env.APOLLO_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error(
      "APOLLO_WEBHOOK_URL is not configured. Set it to the public phone-reveal webhook URL (including the ?token=... secret).",
    );
  }

  let json: any;
  try {
    json = await apolloFetch("/people/bulk_match", {
      details: [{ id: apolloId }],
      reveal_phone_number: true,
      webhook_url: webhookUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[apollo phone reveal] HTTP error", { apolloId, msg });
    return { ok: false, reason: "unknown", message: msg };
  }

  const person = json?.matches?.[0] ?? json?.people?.[0] ?? null;
  const waterfall = json?.waterfall ?? null;
  const nums: any[] = person?.phone_numbers ?? [];
  const mobile =
    nums.find(
      (n) =>
        String(n?.type ?? "").toLowerCase().includes("mobile") ||
        String(n?.type_cd ?? "").toLowerCase().includes("mobile"),
    ) ?? nums[0];
  const phone = mobile?.sanitized_number ?? mobile?.raw_number ?? null;

  console.log("[apollo phone reveal]", {
    apolloId,
    waterfall_status: waterfall?.status ?? null,
    waterfall_message: waterfall?.message ?? null,
    has_match: !!person,
    has_phone: !!phone,
    phone_count: person?.phone_numbers?.length ?? 0,
  });

  // Permission / plan failures from Apollo's waterfall.
  if (waterfall?.status === "failed") {
    const message: string = waterfall?.message ?? "Apollo waterfall failed";
    if (/permission|plan|not enabled/i.test(message)) {
      return { ok: false, reason: "no_permission", message };
    }
    return { ok: false, reason: "waterfall_failed", message };
  }

  // No match at all from Apollo (id not found or filtered out).
  if (!person) {
    return {
      ok: false,
      reason: "not_matched",
      message: "Apollo couldn't match this profile.",
    };
  }

  // Synchronous hit — phone is already in the response.
  if (phone) {
    return { ok: true, phone, person };
  }

  // Matched but no phone in the sync payload. Apollo may still deliver via
  // webhook (waterfall continues asynchronously). If `phone_numbers` is an
  // empty array AND no waterfall is pending, treat it as "no mobile on file"
  // — but we can't reliably tell those apart from the response, so we queue
  // and let the webhook + drawer polling resolve it. If nothing arrives
  // within the drawer's pending window, the UI will surface "Stuck".
  return { ok: true, phone: null, queued: true };
}