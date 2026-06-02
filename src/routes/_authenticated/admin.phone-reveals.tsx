import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminCheck } from "@/lib/prompts/prompts.functions";
import { getPhoneRevealStats, pingApolloWebhook } from "@/lib/admin-phone.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/phone-reveals")({
  beforeLoad: async () => {
    try {
      await adminCheck();
    } catch {
      throw redirect({ to: "/app" });
    }
  },
  component: AdminPhoneRevealsPage,
  head: () => ({ meta: [{ title: "Phone reveals · Admin" }] }),
});

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-bg-elev p-3">
      <div className="text-[11px] uppercase tracking-wide text-text-mute">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-text">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-text-mute">{hint}</div>}
    </div>
  );
}

function AdminPhoneRevealsPage() {
  const statsFn = useServerFn(getPhoneRevealStats);
  const pingFn = useServerFn(pingApolloWebhook);

  const statsQ = useQuery({
    queryKey: ["admin-phone-reveals"],
    queryFn: () => statsFn(),
    refetchInterval: 30_000,
  });

  const [pingResult, setPingResult] = useState<
    null | { ok: boolean; status: number; body: string; url: string | null; redirected?: boolean }
  >(null);
  const [pinging, setPinging] = useState(false);

  const s = statsQ.data;

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Phone reveals</h1>
          <p className="text-xs text-text-mute">Admin · Apollo webhook health</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/admin/usage" className="text-xs text-text-mute hover:text-text">
            Usage
          </Link>
          <Link to="/admin/prompts" className="text-xs text-text-mute hover:text-text">
            Prompts
          </Link>
          <Link to="/app" className="text-xs text-text-mute hover:text-text">
            ← Back to app
          </Link>
        </div>
      </header>

      <main className="px-6 py-6 space-y-6 max-w-[1200px] mx-auto">
        {/* Config */}
        <section className="rounded-md border border-border bg-bg-elev p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold">Webhook configuration</h2>
              <p className="mt-1 text-xs text-text-mute">
                Apollo POSTs phone numbers to this URL asynchronously after a reveal request.
              </p>
              <div className="mt-2 grid gap-1 font-mono text-[11.5px]">
                <div>
                  APOLLO_WEBHOOK_URL:{" "}
                  <span className={s?.config.webhookUrlSet ? "text-text" : "text-red-500"}>
                    {s?.config.webhookUrlSet
                      ? s.config.webhookUrlPreview ?? "(set)"
                      : "NOT SET"}
                  </span>
                </div>
                <div>
                  APOLLO_WEBHOOK_SECRET:{" "}
                  <span className={s?.config.webhookSecretSet ? "text-text" : "text-red-500"}>
                    {s?.config.webhookSecretSet ? "set" : "NOT SET"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Button
                size="sm"
                disabled={pinging}
                onClick={async () => {
                  setPinging(true);
                  setPingResult(null);
                  try {
                    const r = await pingFn();
                    setPingResult(r);
                  } catch (e) {
                    setPingResult({
                      ok: false,
                      status: 0,
                      body: e instanceof Error ? e.message : "failed",
                      url: null,
                    });
                  } finally {
                    setPinging(false);
                  }
                }}
              >
                {pinging ? "Pinging…" : "Ping webhook"}
              </Button>
              {pingResult && (
                <div
                  className={`text-[11.5px] font-mono ${
                    pingResult.ok ? "text-text" : "text-red-500"
                  }`}
                >
                  {pingResult.ok ? "✓ 200 OK" : `✗ status ${pingResult.status}`}
                  {pingResult.redirected && " — REDIRECTED (Apollo will drop body!)"}
                  {pingResult.body && (
                    <div className="text-text-mute">{pingResult.body}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Totals */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Apollo candidates"
            value={s?.totals.apolloSourced ?? "—"}
            hint="Scanned (last 1000)"
          />
          <StatCard
            label="Flagged has_direct_phone"
            value={s?.totals.flaggedHasDirectPhone ?? "—"}
          />
          <StatCard
            label="Phone revealed"
            value={s?.totals.phoneRevealed ?? "—"}
            hint={
              s
                ? `${s.totals.flaggedAndRevealed} of those were flagged (${s.totals.successRatePctOfFlagged}% success)`
                : ""
            }
          />
          <StatCard
            label="Stuck > 1 h"
            value={s ? s.pending.lt24h + s.pending.gt24h : "—"}
            hint={s?.stuckOldest ? `Oldest: ${s.stuckOldest.minutes} min` : ""}
          />
        </section>

        {/* Pending buckets */}
        <section className="rounded-md border border-border bg-bg-elev p-4">
          <h2 className="text-sm font-semibold">Pending reveals (no number yet)</h2>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
            <div>
              <div className="text-xl font-semibold">{s?.pending.lt5 ?? "—"}</div>
              <div className="text-[11px] text-text-mute">&lt; 5 min</div>
            </div>
            <div>
              <div className="text-xl font-semibold">{s?.pending.lt15 ?? "—"}</div>
              <div className="text-[11px] text-text-mute">5–15 min</div>
            </div>
            <div>
              <div className="text-xl font-semibold">{s?.pending.lt60 ?? "—"}</div>
              <div className="text-[11px] text-text-mute">15–60 min</div>
            </div>
            <div>
              <div className={`text-xl font-semibold ${s && s.pending.lt24h > 0 ? "text-amber-500" : ""}`}>
                {s?.pending.lt24h ?? "—"}
              </div>
              <div className="text-[11px] text-text-mute">1–24 h</div>
            </div>
            <div>
              <div className={`text-xl font-semibold ${s && s.pending.gt24h > 0 ? "text-red-500" : ""}`}>
                {s?.pending.gt24h ?? "—"}
              </div>
              <div className="text-[11px] text-text-mute">&gt; 24 h</div>
            </div>
          </div>
          <p className="mt-3 text-[11.5px] text-text-mute">
            Apollo typically delivers within a few minutes. If many candidates are stuck &gt; 1 h, the
            webhook URL is likely wrong (must be a direct URL with no redirect, e.g.{" "}
            <code className="font-mono">https://findable.work/api/public/apollo/phone?token=…</code>).
          </p>
        </section>

        {/* Recent events */}
        <section className="rounded-md border border-border bg-bg-elev p-4">
          <h2 className="text-sm font-semibold">Recent phone events (last 20)</h2>
          {!s ? (
            <p className="mt-2 text-xs text-text-mute">Loading…</p>
          ) : s.recentEvents.length === 0 ? (
            <p className="mt-2 text-xs text-text-mute">No phone-reveal events recorded yet.</p>
          ) : (
            <table className="mt-3 w-full text-[12.5px]">
              <thead className="text-text-mute text-left">
                <tr>
                  <th className="py-1 font-normal">When</th>
                  <th className="py-1 font-normal">Candidate</th>
                  <th className="py-1 font-normal">Event</th>
                  <th className="py-1 font-normal">Text</th>
                </tr>
              </thead>
              <tbody>
                {s.recentEvents.map((e, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5 font-mono text-[11.5px] text-text-mute">
                      {new Date(e.at).toLocaleString()}
                    </td>
                    <td className="py-1.5">{e.name}</td>
                    <td className="py-1.5">
                      <span
                        className={
                          e.type === "phone_revealed"
                            ? "text-emerald-500"
                            : e.type === "phone_reveal_attempted"
                              ? "text-text-mute"
                              : "text-amber-500"
                        }
                      >
                        {e.type}
                      </span>
                    </td>
                    <td className="py-1.5 text-text-mute">{e.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}