import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { adminCheck } from "@/lib/prompts/prompts.functions";
import {
  getUsageSummary,
  getUsageTimeseries,
  getUserUsageTable,
  getUserUsageDetail,
} from "@/lib/admin-usage.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/usage")({
  beforeLoad: async () => {
    try {
      await adminCheck();
    } catch {
      throw redirect({ to: "/app" });
    }
  },
  component: AdminUsagePage,
});

type Metric = "signups" | "jobs_published" | "applications" | "outreach" | "assistant_chats";

const METRIC_LABEL: Record<Metric, string> = {
  signups: "Signups",
  jobs_published: "Jobs published",
  applications: "Applications",
  outreach: "Outreach sent",
  assistant_chats: "Assistant chats",
};

const ADMIN_PLAN_OPTIONS = ["all", "free", "starter", "growth", "pro", "scale"];

function pct(now: number, prev: number) {
  if (!prev) return now ? "+∞" : "0%";
  const d = ((now - prev) / prev) * 100;
  const s = d > 0 ? "+" : "";
  return `${s}${d.toFixed(0)}%`;
}

function AdminUsagePage() {
  const sumFn = useServerFn(getUsageSummary);
  const tsFn = useServerFn(getUsageTimeseries);
  const tableFn = useServerFn(getUserUsageTable);
  const detailFn = useServerFn(getUserUsageDetail);

  const [days, setDays] = useState<30 | 90>(30);
  const [metric, setMetric] = useState<Metric>("signups");
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("all");
  const [openUser, setOpenUser] = useState<string | null>(null);

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [days]);

  const summaryQ = useQuery({
    queryKey: ["admin-usage-summary", range.from, range.to],
    queryFn: () => sumFn({ data: range }),
  });

  const tsQ = useQuery({
    queryKey: ["admin-usage-ts", metric, range.from, range.to],
    queryFn: () => tsFn({ data: { ...range, metric } }),
  });

  const tableQ = useQuery({
    queryKey: ["admin-usage-table", search, plan],
    queryFn: () => tableFn({ data: { search, plan } }),
  });

  const detailQ = useQuery({
    queryKey: ["admin-usage-detail", openUser],
    queryFn: () => (openUser ? detailFn({ data: { userId: openUser } }) : null),
    enabled: Boolean(openUser),
  });

  const s = summaryQ.data;
  const plans = ADMIN_PLAN_OPTIONS;

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Usage</h1>
          <p className="text-xs text-text-mute">Admin · product activity per user</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/admin/prompts" className="text-xs text-text-mute hover:text-text">
            Prompts
          </Link>
          <Link to="/app" className="text-xs text-text-mute hover:text-text">
            ← Back to app
          </Link>
        </div>
      </header>

      <main className="px-6 py-6 space-y-8 max-w-[1400px] mx-auto">
        {/* Range toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-mute">Range:</span>
          {[30, 90].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? "default" : "outline"}
              onClick={() => setDays(d as 30 | 90)}
            >
              Last {d} days
            </Button>
          ))}
        </div>

        {/* Summary cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Total users" value={s?.totalUsers} />
          <Card label="Active users" value={s?.activeUsers} hint={`in last ${days}d`} />
          <Card
            label="New signups"
            value={s?.signups}
            hint={s ? `${pct(s.signups, s.prevSignups)} vs prev` : undefined}
          />
          <Card label="Jobs created" value={s?.jobsCreated} />
          <Card label="Jobs published" value={s?.jobsPublished} />
          <Card label="Applications" value={s?.applications} />
          <Card label="Candidates sourced" value={s?.candidatesSourced} />
          <Card label="Outreach sent" value={s?.outreachSent} />
          <Card
            label="Assistant chats"
            value={s?.assistantChats}
            hint={
              s && s.assistantChats
                ? `${Math.round((s.assistantFallbacks / s.assistantChats) * 100)}% fallback`
                : undefined
            }
          />
          <Card
            label="Sourcing credits"
            value={s?.sourcingCreditsThisMonth}
            hint="this month"
          />
        </section>

        {/* Chart */}
        <section className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Activity over time</h2>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={metric === m ? "default" : "outline"}
                  onClick={() => setMetric(m)}
                >
                  {METRIC_LABEL[m]}
                </Button>
              ))}
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tsQ.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v: string) => v.slice(5)}
                  fontSize={10}
                />
                <YAxis fontSize={10} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary, 220 90% 56%))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* User table */}
        <section className="rounded-lg border border-border">
          <div className="flex items-center gap-2 p-3 border-b border-border">
            <Input
              placeholder="Search by email or ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-border bg-bg"
            >
              {plans.map((p) => (
                <option key={p} value={p}>
                  {p === "all" ? "All plans" : p}
                </option>
              ))}
            </select>
            <span className="ml-auto text-xs text-text-mute">
              {(tableQ.data ?? []).length} users
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-text-mute">
                <tr className="border-b border-border">
                  <Th>Email</Th>
                  <Th>Plan</Th>
                  <Th>Signed up</Th>
                  <Th>Last activity</Th>
                  <Th align="right">Jobs</Th>
                  <Th align="right">Pub</Th>
                  <Th align="right">Apps</Th>
                  <Th align="right">Cands</Th>
                  <Th align="right">Outr</Th>
                  <Th align="right">Credits</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {(tableQ.data ?? []).map((u) => (
                  <>
                    <tr key={u.id} className="border-b border-border hover:bg-bg-hover">
                      <Td className="font-medium">{u.email ?? u.id.slice(0, 8)}</Td>
                      <Td>{u.plan}</Td>
                      <Td>{fmtDate(u.created_at)}</Td>
                      <Td>{u.last_activity_at ? fmtDate(u.last_activity_at) : "—"}</Td>
                      <Td align="right">{u.jobs_created}</Td>
                      <Td align="right">{u.jobs_published}</Td>
                      <Td align="right">{u.applications_received}</Td>
                      <Td align="right">{u.candidates_sourced}</Td>
                      <Td align="right">{u.outreach_sent}</Td>
                      <Td align="right">{u.credits_remaining}</Td>
                      <Td>
                        <button
                          className="text-text-mute hover:text-text"
                          onClick={() => setOpenUser(openUser === u.id ? null : u.id)}
                        >
                          {openUser === u.id ? "Close" : "View"}
                        </button>
                      </Td>
                    </tr>
                    {openUser === u.id && (
                      <tr className="bg-bg-hover/40">
                        <td colSpan={11} className="p-4">
                          {detailQ.isLoading || !detailQ.data ? (
                            <p className="text-text-mute">Loading…</p>
                          ) : (
                            <div className="grid md:grid-cols-3 gap-4">
                              <DetailList
                                title="Recent jobs"
                                items={detailQ.data.jobs.map((j: any) => ({
                                  primary: j.title || "(untitled)",
                                  secondary: `${j.published ? "published" : "draft"} · ${fmtDate(j.created_at)}`,
                                }))}
                              />
                              <DetailList
                                title="Recent applications"
                                items={detailQ.data.applications.map((a: any) => ({
                                  primary: a.name,
                                  secondary: `${a.status} · ${fmtDate(a.created_at)}`,
                                }))}
                              />
                              <DetailList
                                title="Recent outreach"
                                items={detailQ.data.outreach_threads.map((t: any) => ({
                                  primary: t.subject || "(no subject)",
                                  secondary: `${t.status} · ${fmtDate(t.last_message_at)}`,
                                }))}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {tableQ.isLoading && (
                  <tr>
                    <td colSpan={11} className="p-6 text-center text-text-mute">
                      Loading users…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function Card({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | undefined;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] text-text-mute">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value ?? "—"}</p>
      {hint && <p className="text-[11px] text-text-mute mt-1">{hint}</p>}
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children?: React.ReactNode;
  align?: "right";
}) {
  return (
    <th
      className={`px-3 py-2 font-normal text-[11px] uppercase tracking-wide ${
        align === "right" ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  className,
}: {
  children: React.ReactNode;
  align?: "right";
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-2 ${align === "right" ? "text-right tabular-nums" : ""} ${className ?? ""}`}
    >
      {children}
    </td>
  );
}

function DetailList({
  title,
  items,
}: {
  title: string;
  items: Array<{ primary: string; secondary: string }>;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-text-mute mb-2">{title}</p>
      {items.length === 0 ? (
        <p className="text-text-mute text-xs">None</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="text-xs">
              <p className="font-medium truncate">{it.primary}</p>
              <p className="text-text-mute">{it.secondary}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}