import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Screening = Array<{
  id: string;
  type: "select" | "multi" | "textarea";
  question: string;
  options?: string[];
  required: boolean;
}>;

const baseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(60).optional().or(z.literal("")),
  linkedin: z.string().trim().max(300).optional().or(z.literal("")),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  resume_filename: z.string().trim().max(255).optional().or(z.literal("")),
  resume_path: z
    .string()
    .trim()
    .max(300)
    .regex(/^pending\/[A-Za-z0-9._-]+$/, "invalid path")
    .optional()
    .or(z.literal("")),
  resume_size: z.number().int().min(1).max(10 * 1024 * 1024).optional(),
  resume_mime: z
    .enum([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ])
    .optional(),
  answers: z.record(z.string().max(64), z.union([z.string().max(4000), z.array(z.string().max(120)).max(20)])),
});

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function deriveMatch(answers: Record<string, unknown>): number {
  let m = 72;
  const flat = Object.values(answers)
    .map((v) => (Array.isArray(v) ? v.join(" ") : String(v ?? "")))
    .join(" ")
    .toLowerCase();
  if (/exceeded/.test(flat)) m += 12;
  if (/(3.?5|5\+|5 ?years|fluent|native)/.test(flat)) m += 8;
  return Math.min(96, m);
}

function deriveTags(answers: Record<string, unknown>, max = 4): string[] {
  const tags: string[] = [];
  for (const v of Object.values(answers)) {
    if (Array.isArray(v)) for (const x of v) tags.push(String(x));
    else if (typeof v === "string" && v.length <= 40) tags.push(v);
    if (tags.length >= max) break;
  }
  return tags.slice(0, max);
}

export const Route = createFileRoute("/api/public/jobs/$slug/apply")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const slug = String(params.slug || "").slice(0, 200);
        if (!slug) return new Response("Not found", { status: 404 });

        // Load job (admin — public flow).
        const { data: job, error: jobErr } = await supabaseAdmin
          .from("jobs")
          .select("id, user_id, slug, title, published, screening")
          .eq("slug", slug)
          .maybeSingle();
        if (jobErr) return new Response("Error", { status: 500 });
        if (!job || !job.published) {
          return new Response(JSON.stringify({ error: "not_live" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const parsed = baseSchema.safeParse(payload);
        if (!parsed.success) {
          return Response.json({ error: "invalid", details: parsed.error.flatten() }, { status: 400 });
        }
        const input = parsed.data;

        // If a resume_path was provided, verify the object actually exists in storage
        // and re-read its real size before trusting any client-reported size.
        let verifiedPath: string | null = null;
        let verifiedSize: number | null = null;
        let verifiedMime: string | null = null;
        if (input.resume_path) {
          const folder = "pending";
          const filename = input.resume_path.slice(folder.length + 1);
          const { data: objs, error: lsErr } = await supabaseAdmin.storage
            .from("resumes")
            .list(folder, { search: filename, limit: 1 });
          if (lsErr) {
            return Response.json({ error: "resume_lookup_failed" }, { status: 400 });
          }
          const obj = (objs || []).find((o) => o.name === filename);
          if (!obj) {
            return Response.json({ error: "resume_missing" }, { status: 400 });
          }
          const sz = (obj.metadata as any)?.size as number | undefined;
          const mt = (obj.metadata as any)?.mimetype as string | undefined;
          if (typeof sz === "number" && sz > 10 * 1024 * 1024) {
            return Response.json({ error: "resume_too_large" }, { status: 400 });
          }
          verifiedPath = input.resume_path;
          verifiedSize = typeof sz === "number" ? sz : input.resume_size ?? null;
          verifiedMime = mt || input.resume_mime || null;
        }

        // Enforce required screening fields server-side.
        const screening = (Array.isArray(job.screening) ? (job.screening as unknown as Screening) : []) ?? [];
        for (const q of screening) {
          if (!q.required) continue;
          const a = (input.answers as Record<string, unknown>)[q.id];
          if (a === undefined || a === null || a === "" || (Array.isArray(a) && a.length === 0)) {
            return Response.json({ error: "missing_answer", id: q.id }, { status: 400 });
          }
        }

        // Rate-limit: same email + job within 60s.
        const sixtyAgo = new Date(Date.now() - 60_000).toISOString();
        const { data: recent } = await supabaseAdmin
          .from("applications")
          .select("id")
          .eq("job_id", job.id)
          .eq("email", input.email)
          .gte("created_at", sixtyAgo)
          .maybeSingle();
        if (recent) {
          return Response.json({ error: "duplicate" }, { status: 429 });
        }

        // Insert application.
        const { data: appRow, error: insErr } = await supabaseAdmin
          .from("applications")
          .insert({
            job_id: job.id,
            recruiter_user_id: job.user_id,
            name: input.name,
            email: input.email,
            phone: input.phone || null,
            linkedin: input.linkedin || null,
            location: input.location || null,
            resume_filename: input.resume_filename || null,
            resume_url: verifiedPath,
            resume_size: verifiedSize,
            resume_mime: verifiedMime,
            answers: input.answers as any,
            screening: screening as any,
            status: "applied",
          })
          .select("*")
          .single();
        if (insErr || !appRow) {
          console.error("[apply] insert failed", insErr?.message);
          return new Response("Error", { status: 500 });
        }

        // Move the resume from pending/ to applications/<id>/ for easier cleanup.
        if (verifiedPath) {
          const filename = verifiedPath.slice("pending/".length);
          const finalPath = `applications/${appRow.id}/${filename}`;
          const { error: mvErr } = await supabaseAdmin.storage
            .from("resumes")
            .move(verifiedPath, finalPath);
          if (!mvErr) {
            await supabaseAdmin
              .from("applications")
              .update({ resume_url: finalPath })
              .eq("id", appRow.id);
          } else {
            console.warn("[apply] resume move failed", mvErr.message);
          }
        }

        // Resolve recruiter's conversation for this job so the candidate is reachable from chat.
        const { data: jobFull } = await supabaseAdmin
          .from("jobs")
          .select("conversation_id")
          .eq("id", job.id)
          .single();

        const match = deriveMatch(input.answers as any);
        const tags = deriveTags(input.answers as any);
        const submittedAt = new Date(appRow.created_at as any).toLocaleString();

        // Create the candidate row at Applied stage.
        if (!jobFull?.conversation_id) {
          // Job somehow missing a conversation — application is saved, no candidate row.
          return Response.json({ ok: true });
        }

        const { data: candRow, error: candErr } = await supabaseAdmin
          .from("candidates")
          .insert({
            user_id: job.user_id,
            conversation_id: jobFull.conversation_id,
            name: input.name,
            role: "Applicant",
            company: input.location || "—",
            stage: "Applied",
            source: "Application",
            match,
            tags: tags.length ? tags : ["New applicant"],
            starred: false,
            avatar: initials(input.name) || "?",
            email: input.email,
            phone: input.phone || null,
            linkedin: input.linkedin || null,
            location: input.location || null,
            summary: `Applied via public job post for ${job.title}.`,
            experience: [] as any,
            education: [] as any,
            match_breakdown: [] as any,
            activity: [
              {
                id: 1,
                type: "applied",
                by: "Applicant",
                when: submittedAt,
                text: `Applied via public job post — ${job.title}`,
              },
            ] as any,
            application_id: appRow.id,
          })
          .select("id")
          .single();

        if (candErr) {
          console.error("[apply] candidate insert failed", candErr.message);
          // Application is saved; recruiter can still see it. Don't fail the user.
        } else if (candRow) {
          await supabaseAdmin
            .from("applications")
            .update({ candidate_id: candRow.id })
            .eq("id", appRow.id);
        }

        return Response.json({ ok: true });
      },
    },
  },
});