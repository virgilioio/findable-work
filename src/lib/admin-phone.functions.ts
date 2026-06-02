import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/prompts/require-admin.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type ActivityEntry = { type?: string; at?: string; when?: string; text?: string };

function latestActivityOfType(activity: unknown, type: string): ActivityEntry | null {
  if (!Array.isArray(activity)) return null;
  let best: ActivityEntry | null = null;
  let bestT = -Infinity;
  for (const a of activity as ActivityEntry[]) {
    if (a?.type !== type) continue;
    const t = a.at ? new Date(a.at).getTime() : 0;
    if (t > bestT) {
      bestT = t;
      best = a;
    }
  }
  return best;
}

/**
 * Admin diagnostic: phone-reveal pipeline health across all users.
 */
export const getPhoneRevealStats = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    // Pull a wide window of candidates that could matter for phone reveals.
    // Limit to apollo-sourced (apollo_id IS NOT NULL) — those are the only
    // ones eligible for reveal.
    const { data: rows, error } = await supabaseAdmin
      .from("candidates")
      .select("id, name, phone, has_direct_phone, apollo_id, activity, created_at, user_id")
      .not("apollo_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);

    const all = rows ?? [];
    const withDirectFlag = all.filter((r) => r.has_direct_phone);
    const withPhone = all.filter((r) => !!r.phone);
    const withFlagAndPhone = withDirectFlag.filter((r) => !!r.phone);

    // Buckets for candidates that have a pending request but no phone yet.
    const ageBuckets = { lt5: 0, lt15: 0, lt60: 0, lt24h: 0, gt24h: 0 };
    const now = Date.now();
    let stuckOldest: { id: string; name: string; minutes: number } | null = null;

    for (const r of all) {
      if (r.phone) continue;
      const pending = latestActivityOfType(r.activity, "phone_reveal_pending");
      const revealed = latestActivityOfType(r.activity, "phone_revealed");
      const attempted = latestActivityOfType(r.activity, "phone_reveal_attempted");
      // Skip if a terminal event came after the pending one
      const pendingAt = pending?.at ? new Date(pending.at).getTime() : 0;
      const terminalAt = Math.max(
        revealed?.at ? new Date(revealed.at).getTime() : 0,
        attempted?.at ? new Date(attempted.at).getTime() : 0,
      );
      if (!pendingAt || terminalAt >= pendingAt) continue;

      const ageMin = (now - pendingAt) / 60000;
      if (ageMin < 5) ageBuckets.lt5++;
      else if (ageMin < 15) ageBuckets.lt15++;
      else if (ageMin < 60) ageBuckets.lt60++;
      else if (ageMin < 60 * 24) ageBuckets.lt24h++;
      else ageBuckets.gt24h++;

      if (!stuckOldest || ageMin > stuckOldest.minutes) {
        stuckOldest = { id: r.id, name: r.name, minutes: Math.round(ageMin) };
      }
    }

    // Last 20 phone-related events across all candidates (recent first).
    const events: Array<{
      candidate_id: string;
      name: string;
      type: "phone_reveal_pending" | "phone_revealed" | "phone_reveal_attempted";
      at: string;
      text: string;
    }> = [];
    for (const r of all) {
      if (!Array.isArray(r.activity)) continue;
      for (const a of r.activity as ActivityEntry[]) {
        if (
          a?.type === "phone_reveal_pending" ||
          a?.type === "phone_revealed" ||
          a?.type === "phone_reveal_attempted"
        ) {
          if (!a.at) continue;
          events.push({
            candidate_id: r.id,
            name: r.name,
            type: a.type as never,
            at: a.at,
            text: a.text ?? "",
          });
        }
      }
    }
    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const recent = events.slice(0, 20);

    const webhookUrlSet = Boolean(process.env.APOLLO_WEBHOOK_URL);
    const webhookSecretSet = Boolean(process.env.APOLLO_WEBHOOK_SECRET);
    const webhookUrlPreview = process.env.APOLLO_WEBHOOK_URL
      ? process.env.APOLLO_WEBHOOK_URL.split("?")[0]
      : null;

    return {
      totals: {
        candidatesScanned: all.length,
        apolloSourced: all.length,
        flaggedHasDirectPhone: withDirectFlag.length,
        phoneRevealed: withPhone.length,
        flaggedAndRevealed: withFlagAndPhone.length,
        successRatePctOfFlagged: withDirectFlag.length
          ? Math.round((withFlagAndPhone.length / withDirectFlag.length) * 100)
          : 0,
      },
      pending: ageBuckets,
      stuckOldest,
      recentEvents: recent,
      config: {
        webhookUrlSet,
        webhookSecretSet,
        webhookUrlPreview,
      },
    };
  });

/**
 * Admin diagnostic: POST a fake payload to our own webhook with the secret
 * to confirm the public endpoint is reachable and responds 200.
 */
export const pingApolloWebhook = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const url = process.env.APOLLO_WEBHOOK_URL;
    if (!url) {
      return {
        ok: false,
        status: 0,
        body: "APOLLO_WEBHOOK_URL is not set",
        url: null,
      };
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Use a non-existent apollo id so we never accidentally mutate a
        // real candidate. Handler logs a warn and returns 200.
        body: JSON.stringify({
          person: { id: "ping-diagnostic-not-a-real-id", phone_numbers: [] },
        }),
        redirect: "manual",
      });
      const text = await res.text().catch(() => "");
      return {
        ok: res.status === 200,
        status: res.status,
        body: text.slice(0, 200),
        url: url.split("?")[0],
        redirected: res.status >= 300 && res.status < 400,
      };
    } catch (e) {
      return {
        ok: false,
        status: 0,
        body: e instanceof Error ? e.message : "fetch failed",
        url: url.split("?")[0],
      };
    }
  });