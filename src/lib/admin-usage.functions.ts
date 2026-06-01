import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/prompts/require-admin.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------- helpers ----------

const rangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function range(input: { from?: string; to?: string }) {
  const to = input.to ? new Date(input.to) : new Date();
  const from = input.from
    ? new Date(input.from)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

async function countRows(
  table: string,
  col: string,
  from: Date,
  to: Date,
  extra?: (q: any) => any,
) {
  let q = supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true })
    .gte(col, from.toISOString())
    .lte(col, to.toISOString());
  if (extra) q = extra(q);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

// ---------- summary ----------

export const getUsageSummary = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d) => rangeSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const { from, to } = range(data);
    const span = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - span);
    const prevTo = from;

    const [
      signups,
      prevSignups,
      jobsCreated,
      jobsPublished,
      applications,
      candidates,
      outreachSent,
      assistantChats,
      assistantFallbacks,
    ] = await Promise.all([
      countRows("profiles", "created_at", from, to),
      countRows("profiles", "created_at", prevFrom, prevTo),
      countRows("jobs", "created_at", from, to),
      countRows("jobs", "published_at", from, to, (q) => q.eq("published", true)),
      countRows("applications", "created_at", from, to),
      countRows("candidates", "created_at", from, to),
      countRows("outreach_messages", "sent_at", from, to, (q) => q.eq("direction", "out")),
      countRows("assistant_chat_events", "created_at", from, to),
      countRows("assistant_chat_events", "created_at", from, to, (q) =>
        q.eq("used_fallback", true),
      ),
    ]);

    // Total users + active users
    const { count: totalUsers } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true });

    // Active = had any job/application/candidate/outreach/message activity in range
    const activeIds = new Set<string>();
    for (const table of ["jobs", "candidates", "outreach_threads", "messages"]) {
      const { data: rows } = await supabaseAdmin
        .from(table)
        .select("user_id")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .limit(5000);
      (rows ?? []).forEach((r: any) => r.user_id && activeIds.add(r.user_id));
    }

    // Sourcing credits used in current month (sum)
    const period = new Date().toISOString().slice(0, 7);
    const { data: usageRows } = await supabaseAdmin
      .from("sourcing_credits_usage")
      .select("collect_credits_used")
      .eq("period", period);
    const sourcingCreditsThisMonth = (usageRows ?? []).reduce(
      (acc: number, r: any) => acc + (r.collect_credits_used ?? 0),
      0,
    );

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      totalUsers: totalUsers ?? 0,
      activeUsers: activeIds.size,
      signups,
      prevSignups,
      jobsCreated,
      jobsPublished,
      applications,
      candidatesSourced: candidates,
      outreachSent,
      assistantChats,
      assistantFallbacks,
      sourcingCreditsThisMonth,
    };
  });

// ---------- timeseries ----------

const metricSchema = z.enum([
  "signups",
  "jobs_published",
  "applications",
  "outreach",
  "assistant_chats",
]);

export const getUsageTimeseries = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d) =>
    rangeSchema.extend({ metric: metricSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const { from, to } = range(data);
    const cfg: Record<
      z.infer<typeof metricSchema>,
      { table: string; col: string; filter?: (q: any) => any }
    > = {
      signups: { table: "profiles", col: "created_at" },
      jobs_published: {
        table: "jobs",
        col: "published_at",
        filter: (q) => q.eq("published", true),
      },
      applications: { table: "applications", col: "created_at" },
      outreach: {
        table: "outreach_messages",
        col: "sent_at",
        filter: (q) => q.eq("direction", "out"),
      },
      assistant_chats: { table: "assistant_chat_events", col: "created_at" },
    };
    const c = cfg[data.metric];
    let q = supabaseAdmin
      .from(c.table)
      .select(c.col)
      .gte(c.col, from.toISOString())
      .lte(c.col, to.toISOString())
      .limit(10000);
    if (c.filter) q = c.filter(q);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const byDay = new Map<string, number>();
    (rows ?? []).forEach((r: any) => {
      const v = r[c.col];
      if (!v) return;
      const day = String(v).slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    });

    // Fill empty days
    const out: { day: string; count: number }[] = [];
    const cursor = new Date(from);
    cursor.setUTCHours(0, 0, 0, 0);
    const endDay = new Date(to);
    endDay.setUTCHours(0, 0, 0, 0);
    while (cursor.getTime() <= endDay.getTime()) {
      const day = cursor.toISOString().slice(0, 10);
      out.push({ day, count: byDay.get(day) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
  });

// ---------- per-user table ----------

export const getUserUsageTable = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d) =>
    z
      .object({
        search: z.string().max(200).optional(),
        plan: z.string().max(40).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { data: dir, error } = await supabaseAdmin.rpc("admin_user_directory");
    if (error) throw new Error(error.message);
    const users: Array<{
      id: string;
      email: string | null;
      created_at: string;
      last_sign_in_at: string | null;
      plan: string;
      credits_remaining: number;
      sourcing_projects_used: number;
    }> = dir ?? [];

    const ids = users.map((u) => u.id);
    if (ids.length === 0) return [];

    // Aggregate per-user counts
    async function groupCount(table: string, col: string = "user_id") {
      const map = new Map<string, number>();
      // Supabase JS has no group-by; fetch user_id only and tally.
      const { data: rows, error } = await supabaseAdmin
        .from(table)
        .select(`${col},created_at`)
        .in(col, ids)
        .limit(50000);
      if (error) throw new Error(`${table}: ${error.message}`);
      const last = new Map<string, string>();
      (rows ?? []).forEach((r: any) => {
        const uid = r[col];
        if (!uid) return;
        map.set(uid, (map.get(uid) ?? 0) + 1);
        const prev = last.get(uid);
        if (!prev || (r.created_at && r.created_at > prev)) {
          last.set(uid, r.created_at);
        }
      });
      return { map, last };
    }

    const [jobs, jobsPub, apps, cands, outreach] = await Promise.all([
      groupCount("jobs"),
      (async () => {
        const { data: rows } = await supabaseAdmin
          .from("jobs")
          .select("user_id")
          .in("user_id", ids)
          .eq("published", true)
          .limit(50000);
        const m = new Map<string, number>();
        (rows ?? []).forEach((r: any) => m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1));
        return m;
      })(),
      groupCount("applications", "recruiter_user_id"),
      groupCount("candidates"),
      groupCount("outreach_messages"),
    ]);

    // Last activity = max(created_at across tables)
    const lastActivity = new Map<string, string>();
    for (const src of [jobs.last, apps.last, cands.last, outreach.last]) {
      src.forEach((v, k) => {
        const cur = lastActivity.get(k);
        if (!cur || v > cur) lastActivity.set(k, v);
      });
    }

    let result = users.map((u) => ({
      ...u,
      jobs_created: jobs.map.get(u.id) ?? 0,
      jobs_published: jobsPub.get(u.id) ?? 0,
      applications_received: apps.map.get(u.id) ?? 0,
      candidates_sourced: cands.map.get(u.id) ?? 0,
      outreach_sent: outreach.map.get(u.id) ?? 0,
      last_activity_at: lastActivity.get(u.id) ?? null,
    }));

    if (data.search) {
      const q = data.search.toLowerCase();
      result = result.filter(
        (r) => (r.email ?? "").toLowerCase().includes(q) || r.id.includes(q),
      );
    }
    if (data.plan && data.plan !== "all") {
      result = result.filter((r) => r.plan === data.plan);
    }

    result.sort((a, b) => {
      const av = a.last_activity_at ?? a.created_at;
      const bv = b.last_activity_at ?? b.created_at;
      return bv.localeCompare(av);
    });
    return result;
  });

// ---------- per-user detail ----------

export const getUserUsageDetail = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const [jobs, apps, threads] = await Promise.all([
      supabaseAdmin
        .from("jobs")
        .select("id,title,slug,published,published_at,created_at")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("applications")
        .select("id,name,email,status,created_at,job_id")
        .eq("recruiter_user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("outreach_threads")
        .select("id,subject,status,last_message_at,last_snippet")
        .eq("user_id", data.userId)
        .order("last_message_at", { ascending: false })
        .limit(10),
    ]);
    return {
      jobs: jobs.data ?? [],
      applications: apps.data ?? [],
      outreach_threads: threads.data ?? [],
    };
  });