// Deterministic job-post artifact builder. Lives in a .server file so it
// never accidentally ends up in the client bundle.

type JobLike = {
  title?: string | null;
  description?: string | null;
  location?: string | null;
  requirements?: string[] | null;
  salary_min?: number | null;
  salary_max?: number | null;
  currency?: string | null;
};

export type Variant = { key: string; label: string; sublabel: string; title: string; body: string };
export type Channel = {
  key: string;
  name: string;
  kind: "job_board" | "social";
  audience: number;          // approximate reach
  audience_label: string;    // shown under the name
  price: number;             // numeric price
  price_label: string;       // e.g. "$199" or "Pay per click"
  duration_days: number;
  recommended: boolean;
  selected: boolean;
};
export type Schedule = {
  go_live: string | null;
  go_live_label: string;
  auto_close_days: number;
  auto_close_label: string;
  ab_test: boolean;
  ab_test_label: string;
};

function firstSentence(text: string, max = 160): string {
  const t = (text || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  const s = m ? m[1] : t;
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function compactList(items: string[] | null | undefined, max = 3): string[] {
  if (!items) return [];
  return items.map((s) => String(s).trim()).filter(Boolean).slice(0, max);
}

function compLine(job: JobLike): string {
  const cur = (job.currency || "USD").toUpperCase();
  if (job.salary_min && job.salary_max) return `${cur} ${job.salary_min}–${job.salary_max}`;
  if (job.salary_min) return `${cur} ${job.salary_min}+`;
  return "";
}

export function buildVariants(job: JobLike): Variant[] {
  const title = (job.title || "Open role").trim();
  const loc = (job.location || "").trim();
  const summary = firstSentence(job.description || "");
  const reqs = compactList(job.requirements, 4);
  const niceReqs = reqs.length ? reqs.join(", ") : "the right experience";
  const comp = compLine(job);

  const punchyBody = [
    summary || `We're hiring a ${title}.`,
    reqs.length ? `You bring: ${niceReqs}.` : "",
    [loc && `Based ${loc}.`, comp && `${comp}.`].filter(Boolean).join(" "),
    `Apply in 60 seconds — no cover letter needed.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const missionBody = [
    `We're looking for a ${title} who wants to do the best work of their career.`,
    summary ? summary : "",
    reqs.length
      ? `You'll thrive here if you have ${niceReqs} — and care about the craft as much as the outcome.`
      : "",
    [loc && `Based ${loc}.`, comp && `${comp}.`].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join("\n\n");

  const conciseBody = [
    `Role: ${title}`,
    loc ? `Location: ${loc}` : "",
    comp ? `Comp: ${comp}` : "",
    "",
    reqs.length ? `What we need: ${reqs.join(", ")}` : "",
    summary ? `About: ${summary}` : "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  return [
    {
      key: "punchy",
      label: "Punchy",
      sublabel: "Direct, results-focused",
      title: `${title}${loc ? ` — ${loc}` : ""}`,
      body: punchyBody,
    },
    {
      key: "mission_led",
      label: "Mission-led",
      sublabel: "Why-driven, story-led",
      title: summary
        ? `Help us build what's next — join us as a ${title}`
        : `Join us as a ${title}`,
      body: missionBody,
    },
    {
      key: "concise",
      label: "Concise",
      sublabel: "Short, scannable, mobile-first",
      title: [title, loc, comp].filter(Boolean).join(" · "),
      body: conciseBody,
    },
  ];
}

const LATAM_RE = /\b(mx|mex|mexico|cdmx|gdl|monterrey|latam|latin|colombia|bog|chile|argentin|peru|brasil|brazil)\b/i;
const REMOTE_RE = /\b(remote|remoto|distributed|anywhere)\b/i;
const EU_RE = /\b(berlin|london|paris|madrid|barcelona|amsterdam|lisbon|dublin|eu|europe)\b/i;
const US_RE = /\b(nyc|new york|sf|san francisco|usa|us|united states|boston|austin|chicago|seattle|la\b)\b/i;

export function buildChannels(job: JobLike): Channel[] {
  const loc = (job.location || "").toLowerCase();
  const isLatam = LATAM_RE.test(loc);
  const isRemote = REMOTE_RE.test(loc);
  const isEu = EU_RE.test(loc);
  const isUs = US_RE.test(loc);

  const list: Channel[] = [
    {
      key: "linkedin",
      name: "LinkedIn",
      kind: "social",
      audience: 120_000,
      audience_label: "~120k pros in market",
      price: 199,
      price_label: "$199",
      duration_days: 30,
      recommended: true,
      selected: true,
    },
  ];

  if (isLatam) {
    list.push({
      key: "occ_mundial",
      name: "OCC Mundial",
      kind: "job_board",
      audience: 18_000,
      audience_label: "Mexico's #1 job board",
      price: 89,
      price_label: "$89",
      duration_days: 30,
      recommended: true,
      selected: true,
    });
    list.push({
      key: "bumeran",
      name: "Bumeran",
      kind: "job_board",
      audience: 9_000,
      audience_label: "Strong in MX, AR, CL",
      price: 70,
      price_label: "$70",
      duration_days: 30,
      recommended: false,
      selected: false,
    });
  }

  if (isRemote || isLatam || isEu || isUs) {
    list.push({
      key: "we_work_remotely",
      name: "We Work Remotely",
      kind: "job_board",
      audience: 5_000,
      audience_label: isRemote ? "Top remote audience" : "If you switch to remote",
      price: 299,
      price_label: "$299",
      duration_days: 30,
      recommended: isRemote,
      selected: isRemote,
    });
  }

  // Local Indeed flavor
  const indeed = isLatam
    ? { name: "Indeed MX", label: "Wide reach, lower intent" }
    : isEu
      ? { name: "Indeed EU", label: "Wide reach across EU" }
      : { name: "Indeed", label: "Wide reach, lower intent" };

  list.push({
    key: "indeed",
    name: indeed.name,
    kind: "job_board",
    audience: 25_000,
    audience_label: indeed.label,
    price: 0,
    price_label: "Pay per click",
    duration_days: 30,
    recommended: false,
    selected: true,
  });

  return list;
}

export function buildSchedule(): Schedule {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return {
    go_live: tomorrow.toISOString(),
    go_live_label: "Tomorrow, 9:00 AM",
    auto_close_days: 30,
    auto_close_label: "After 30 days",
    ab_test: true,
    ab_test_label: "Yes — split evenly",
  };
}

export function estReach(channels: Channel[]): number {
  return channels.filter((c) => c.selected).reduce((sum, c) => sum + (c.audience || 0), 0);
}

export function buildJobPostArtifact(job: JobLike) {
  const variants = buildVariants(job);
  const channels = buildChannels(job);
  const schedule = buildSchedule();
  return { variants, channels, schedule, est_reach: estReach(channels) };
}