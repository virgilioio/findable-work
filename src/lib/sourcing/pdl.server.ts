// People Data Labs search. Server-only.
import {
  linkedinSlug,
  mapPdlLevels,
  mapSeniorities,
  scoreKeywordsLocally,
  splitLocationForPdl,
  type SearchCriteria,
} from "./budget";

const PDL_BASE = "https://api.peopledatalabs.com/v5";

export class PdlQuotaError extends Error {
  constructor(message = "PDL quota exhausted") {
    super(message);
    this.name = "PdlQuotaError";
  }
}

export type PdlPreview = {
  source: "pdl";
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
  // Full record kept server-side so the collect step can hydrate candidates
  // without a second API round-trip. Never sent to the browser.
  raw?: any;
};

function buildEsQuery(c: SearchCriteria): Record<string, unknown> {
  const must: any[] = [];
  if (c.title_keywords?.length) {
    must.push({
      bool: {
        should: c.title_keywords.map((t) => ({ match: { job_title: t } })),
        minimum_should_match: 1,
      },
    });
  }
  const companies = [
    ...(c.user_company_names ?? []),
    ...(c.researched_companies ?? []),
  ];
  if (companies.length) {
    must.push({
      bool: {
        should: companies.map((co) => ({ match: { job_company_name: co } })),
        minimum_should_match: 1,
      },
    });
  }
  if (c.locations?.length) {
    const localityShoulds: any[] = [];
    const regionShoulds: any[] = [];
    const countryShoulds: any[] = [];
    for (const loc of c.locations) {
      const { locality, region, country } = splitLocationForPdl(loc);
      if (locality) localityShoulds.push({ term: { location_locality: locality } });
      if (region) regionShoulds.push({ term: { location_region: region } });
      if (country) countryShoulds.push({ term: { location_country: country } });
    }
    const shoulds = [...localityShoulds, ...regionShoulds, ...countryShoulds];
    if (shoulds.length) {
      must.push({ bool: { should: shoulds, minimum_should_match: 1 } });
    }
  }
  const levels = mapPdlLevels(mapSeniorities(c.seniorities ?? []));
  if (levels.length) {
    must.push({
      bool: {
        should: levels.map((lv) => ({ term: { job_title_levels: lv } })),
        minimum_should_match: 1,
      },
    });
  }
  return must.length ? { bool: { must } } : { match_all: {} };
}

export async function searchPdl(criteria: SearchCriteria, size = 100): Promise<PdlPreview[]> {
  const key = process.env.PDL_API_KEY;
  if (!key) throw new Error("PDL_API_KEY is not configured");
  const body = { query: buildEsQuery(criteria), size: Math.min(size, 100) };
  const res = await fetch(`${PDL_BASE}/person/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": key },
    body: JSON.stringify(body),
  });
  if (res.status === 402) {
    throw new PdlQuotaError();
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PDL error [${res.status}]: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const records: any[] = data.data ?? [];
  const rows = records.map((p) => {
    const fn = p.first_name ?? "";
    const ln = p.last_name ?? "";
    return {
      source: "pdl" as const,
      external_id: String(p.id ?? p.pdl_id ?? p.linkedin_id ?? p.linkedin_url ?? ""),
      linkedin_slug: linkedinSlug(p.linkedin_url),
      first_name: fn,
      last_name_obfuscated: ln ? ln[0] + (ln.length > 1 ? "·" : "") : "",
      title: p.job_title ?? "",
      company: p.job_company_name ?? "",
      has_email: Boolean(p.work_email || p.personal_emails?.length),
      has_direct_phone: Boolean(p.mobile_phone || p.phone_numbers?.length),
      has_city: Boolean(p.location_locality),
      has_state: Boolean(p.location_region),
      has_country: Boolean(p.location_country),
      raw: p,
    };
  });
  return scoreKeywordsLocally(rows, criteria.keywords ?? []);
}