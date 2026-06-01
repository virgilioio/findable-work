import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendBrandedEmail } from "@/lib/email/send.server";
import {
  newApplicantDigestHtml,
  type DigestGroup,
} from "@/lib/email/templates.server";

// Auth: callers must pass the Supabase anon/publishable key in `apikey`.
function unauthorized() {
  return new Response("Unauthorized", { status: 401 });
}

export const Route = createFileRoute("/api/public/hooks/send-application-digests")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!apiKey || !expected || apiKey !== expected) return unauthorized();

        // 1. Find recruiters who opted into the digest.
        const { data: profiles, error: pErr } = await (supabaseAdmin as any)
          .from("profiles")
          .select("id, last_digest_sent_at")
          .eq("notify_daily_digest", true);
        if (pErr) {
          console.error("[digest] profile lookup", pErr.message);
          return new Response("Error", { status: 500 });
        }

        let sent = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const p of profiles ?? []) {
          try {
            const since = p.last_digest_sent_at
              ? new Date(p.last_digest_sent_at).toISOString()
              : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

            // 2. Pull new applications + job titles.
            const { data: apps, error: aErr } = await supabaseAdmin
              .from("applications")
              .select("id, name, job_id, created_at")
              .eq("recruiter_user_id", p.id)
              .gte("created_at", since)
              .order("created_at", { ascending: true });
            if (aErr) throw new Error(aErr.message);
            if (!apps || apps.length === 0) {
              skipped++;
              continue;
            }

            const jobIds = Array.from(new Set(apps.map((a) => a.job_id)));
            const { data: jobs, error: jErr } = await supabaseAdmin
              .from("jobs")
              .select("id, title, conversation_id")
              .in("id", jobIds);
            if (jErr) throw new Error(jErr.message);
            const jobMap = new Map(
              (jobs ?? []).map((j) => [j.id, j]),
            );

            // 3. Group applicants by job title.
            const grouped = new Map<string, DigestGroup>();
            for (const a of apps) {
              const j = jobMap.get(a.job_id);
              if (!j) continue;
              const key = j.id;
              const g =
                grouped.get(key) ??
                ({ jobTitle: j.title || "Untitled role", applicants: [] } as DigestGroup);
              g.applicants.push({
                name: a.name,
                appUrl: `https://findable.work/app/c/${j.conversation_id ?? ""}`,
              });
              grouped.set(key, g);
            }
            const groups = Array.from(grouped.values());
            if (groups.length === 0) {
              skipped++;
              continue;
            }

            // 4. Recruiter email.
            const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(
              p.id,
            );
            const to = userRes?.user?.email;
            if (!to) {
              skipped++;
              continue;
            }

            const tpl = newApplicantDigestHtml({
              recruiterFirstName: "",
              groups,
            });
            await sendBrandedEmail({
              to,
              subject: tpl.subject,
              html: tpl.html,
              text: tpl.text,
            });

            // 5. Stamp last_digest_sent_at.
            await (supabaseAdmin as any)
              .from("profiles")
              .update({ last_digest_sent_at: new Date().toISOString() })
              .eq("id", p.id);

            sent++;
          } catch (e: any) {
            console.error("[digest] failed for", p.id, e?.message);
            errors.push(`${p.id}: ${e?.message ?? "unknown"}`);
          }
        }

        return Response.json({ ok: true, sent, skipped, errors });
      },
    },
  },
});