import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  OPENAI_CHAT_COMPLETIONS_URL,
  getOpenAIKey,
  getOpenAIModel,
} from "@/lib/ai/openai-model.server";

/**
 * Public, unauthenticated candidate-facing chat for a published job.
 * Grounded strictly in the public job fields + whatever the candidate
 * has typed into the application form so far. Never persists transcripts.
 */

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const answerVal = z.union([z.string().max(1000), z.array(z.string().max(200)).max(20)]);

const formContextSchema = z
  .object({
    name: z.string().max(120).optional(),
    email: z.string().max(200).optional(),
    linkedin: z.string().max(300).optional(),
    location: z.string().max(200).optional(),
    resume_filename: z.string().max(200).optional(),
    answers: z.record(z.string().max(64), answerVal).optional(),
  })
  .partial();

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(20),
  formContext: formContextSchema.optional(),
});

// ----- rate limit -----
type Bucket = { hits: number; resetAt: number };
const BUCKETS = new Map<string, Bucket>();
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 20;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const b = BUCKETS.get(key);
  if (!b || now > b.resetAt) {
    BUCKETS.set(key, { hits: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  b.hits += 1;
  return b.hits > RATE_LIMIT;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

type Screening = Array<{
  id: string;
  type: "select" | "multi" | "textarea";
  question: string;
  options?: string[];
  required: boolean;
}>;

type PublicJob = {
  title: string;
  company: string | null;
  location: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  summary: string | null;
  description: string | null;
  requirements: string[] | null;
  responsibilities: string[] | null;
  must_have: string[] | null;
  nice_to_have: string[] | null;
  screening: Screening | null;
};

function buildSystemPrompt(grounding: string): string {
  return `You are the hiring assistant embedded in a public job post, talking directly to a candidate who is considering applying. Your job is to help them understand the role and the hiring process, and to give brief, encouraging, constructive feedback on their profile when asked.

Rules:
- Be warm, concise, and specific. 2–4 short sentences or a tight bullet list. Never write essays.
- Answer ONLY from the CONTEXT block below (role, requirements, the candidate's form data). If something isn't in the context (exact salary bands beyond what is posted, visa specifics, names of interviewers, start date), say you don't have that detail and suggest they ask in the intro call. Never invent facts.
- Do not discuss compensation specifics beyond what is already posted in the role.
- Never make outcome promises ("you will get the job", "you're guaranteed an interview"). No yes/no verdict on whether the candidate will be hired.
- For "feedback on my profile" questions: compare the candidate's typed answers / resume filename / LinkedIn against the must-haves and nice-to-haves. Be kind and constructive — call out strengths and one or two gaps to address, framed as suggestions. Never a yes/no verdict.
- Steer off-topic questions (politics, unrelated companies, personal opinions) back to this role.
- Reply in the same language as the candidate's last message (English or Spanish). Match their tone.
- Use plain Markdown. Short bullet lists are fine. No headings.

CONTEXT:
${grounding}`;
}

function buildGrounding(job: PublicJob, fc: z.infer<typeof formContextSchema> | undefined): string {
  const lines: string[] = [];
  lines.push(`ROLE: ${job.title}${job.company ? ` at ${job.company}` : ""}`);
  const meta = [
    job.location,
    job.employment_type ? job.employment_type.replace(/_/g, "-") : null,
    job.salary_min && job.salary_max
      ? `${job.currency || "USD"} ${job.salary_min.toLocaleString()}–${job.salary_max.toLocaleString()}`
      : job.salary_min
        ? `${job.currency || "USD"} ${job.salary_min.toLocaleString()}+`
        : null,
  ].filter(Boolean);
  if (meta.length) lines.push(meta.join(" · "));
  if (job.summary) lines.push(`\nSummary:\n${job.summary}`);
  else if (job.description) lines.push(`\nDescription:\n${job.description.slice(0, 2000)}`);

  if (job.responsibilities?.length) {
    lines.push(`\nWhat you'll do:\n${job.responsibilities.map((x) => "• " + x).join("\n")}`);
  }
  const must = job.must_have?.length ? job.must_have : job.requirements ?? [];
  if (must.length) {
    lines.push(`\nMust-have:\n${must.map((x) => "• " + x).join("\n")}`);
  }
  if (job.nice_to_have?.length) {
    lines.push(`\nNice-to-have:\n${job.nice_to_have.map((x) => "• " + x).join("\n")}`);
  }
  if (job.screening?.length) {
    lines.push(
      `\nApplication questions on this form:\n${job.screening.map((q) => "• " + q.question).join("\n")}`,
    );
  }

  // Candidate-provided form data (only what they've typed; never PII the
  // server would have to fetch).
  const candidateBits: string[] = [];
  if (fc?.name) candidateBits.push(`Name: ${fc.name}`);
  if (fc?.location) candidateBits.push(`Location: ${fc.location}`);
  if (fc?.linkedin) candidateBits.push(`LinkedIn: ${fc.linkedin}`);
  if (fc?.resume_filename) candidateBits.push(`Resume uploaded: ${fc.resume_filename}`);
  if (fc?.answers && Object.keys(fc.answers).length) {
    const ansLines = Object.entries(fc.answers)
      .map(([k, v]) => {
        const q = job.screening?.find((x) => x.id === k);
        const label = q ? q.question : k;
        const val = Array.isArray(v) ? v.join(", ") : v;
        return `  - ${label}: ${val}`;
      })
      .join("\n");
    candidateBits.push(`Application answers so far:\n${ansLines}`);
  }
  lines.push(
    `\nTHE CANDIDATE (use only for profile-feedback questions):\n${
      candidateBits.length ? candidateBits.join("\n") : "The candidate has not filled in the application form yet."
    }`,
  );

  return lines.join("\n");
}

function scriptedFallback(job: PublicJob, lastUser: string): string {
  const q = lastUser.toLowerCase();
  const isSpanish = /[áéíóúñ¿¡]|proceso|entrevista|remoto|sueldo|salario|cuánto|cuanto/.test(q);

  const isProcess = /process|interview|step|stages|proceso|entrevista|etapa/.test(q);
  const isTimeline = /how long|timeline|duration|weeks|days|cuánto tarda|cuanto tarda|duración|duracion/.test(q);
  const isRemote = /remote|in.?person|onsite|on.?site|hybrid|remoto|presencial|híbrido|hibrido/.test(q);
  const isFeedback = /feedback|profile|fit|match|chances|opinión|opinion|perfil/.test(q);

  if (isProcess) {
    return isSpanish
      ? "Por lo general el proceso incluye: llamada inicial, entrevista con el hiring manager, y un ejercicio práctico o entrevista técnica. El equipo te dará los detalles exactos en el primer contacto."
      : "Typically the process is: an intro call, a hiring manager interview, and a practical exercise or technical conversation. The team will share exact details on the first call.";
  }
  if (isTimeline) {
    return isSpanish
      ? "Normalmente toma entre 1 y 3 semanas de inicio a fin, dependiendo de la disponibilidad de los entrevistadores."
      : "Usually 1–3 weeks end to end, depending on interviewer availability.";
  }
  if (isRemote) {
    const loc = [job.location, job.employment_type?.replace(/_/g, "-")].filter(Boolean).join(" · ");
    return isSpanish
      ? `Según lo publicado: ${loc || "consulta la descripción de la vacante"}.`
      : `Per the posting: ${loc || "see the role details above"}.`;
  }
  if (isFeedback) {
    return isSpanish
      ? "Puedo ayudarte mejor si completas tu experiencia, LinkedIn y respuestas del formulario. Mientras tanto, revisa los must-haves publicados y usa tus respuestas para mostrar ejemplos concretos de experiencia relevante."
      : "I can give better profile feedback once you add your experience, LinkedIn, and form answers. For now, compare your background against the posted must-haves and use the application answers to highlight concrete examples.";
  }
  return isSpanish
    ? "Puedo ayudar con el proceso de entrevistas, el tiempo estimado, modalidad remota/presencial y cómo tu perfil se alinea con la vacante. Hazme una pregunta sobre esta posición."
    : "I can help with the interview process, expected timeline, remote/in-person setup, and how your profile lines up with the role. Ask me a role-specific question.";
}

function logFallback(reason: string, extra: Record<string, unknown> = {}) {
  console.error("[jobs-chat] FALLBACK", { reason, ...extra });
}

export const Route = createFileRoute("/api/public/jobs/$slug/chat")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const slug = params.slug;
        if (!slug || slug.length > 80) {
          return Response.json({ error: "Invalid slug" }, { status: 400 });
        }

        const ip = clientIp(request);
        if (rateLimited(`jc:ip:${ip}`) || rateLimited(`jc:slug:${slug}`)) {
          return Response.json({ error: "Too many requests" }, { status: 429 });
        }

        const json = await request.json().catch(() => null);
        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
          return Response.json({ error: "Invalid body" }, { status: 400 });
        }
        const { messages, formContext } = parsed.data;

        const { data: job, error: jobErr } = await supabaseAdmin
          .from("jobs")
          .select(
            "id, user_id, title, company, location, employment_type, salary_min, salary_max, currency, summary, description, requirements, responsibilities, must_have, nice_to_have, screening",
          )
          .eq("slug", slug)
          .eq("published", true)
          .maybeSingle();
        if (jobErr) {
          console.error("[jobs-chat] job load error", jobErr.message);
          return Response.json({ error: "Couldn't load job" }, { status: 500 });
        }
        if (!job) {
          return Response.json({ error: "Job not found" }, { status: 404 });
        }

        const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
        const isSpanish = /[áéíóúñ¿¡]|proceso|entrevista|remoto/.test(lastUser.toLowerCase());
        const logEvent = (usedFallback: boolean, reason?: string) => {
          // Best-effort, fire-and-forget. Never blocks the response.
          (supabaseAdmin as any)
            .from("assistant_chat_events")
            .insert({
              job_id: (job as any).id,
              job_slug: slug,
              recruiter_user_id: (job as any).user_id,
              lang: isSpanish ? "es" : "en",
              question_length: lastUser.length,
              had_form_context: Boolean(formContext && Object.keys(formContext).length),
              used_fallback: usedFallback,
              fallback_reason: reason ?? null,
            })
            .then(() => {}, (e: any) => console.error("[jobs-chat] log error", e?.message));
        };

        const grounding = buildGrounding(job as PublicJob, formContext);

        const system = buildSystemPrompt(grounding);

        let apiKey: string;
        let model: string;
        try {
          apiKey = getOpenAIKey();
          model = getOpenAIModel();
        } catch (e: any) {
          logFallback("missing_env", { message: e?.message });
          logEvent(true, "missing_env");
          return Response.json({ assistant: scriptedFallback(job as PublicJob, lastUser) });
        }

        try {
          const res = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: system },
                ...messages.map((m) => ({ role: m.role, content: m.content })),
              ],
              temperature: 0.3,
            }),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            logFallback("openai_error", { status: res.status, body: body.slice(0, 300) });
            logEvent(true, "openai_error");
            return Response.json({ assistant: scriptedFallback(job as PublicJob, lastUser) });
          }
          const data: any = await res.json();
          const txt = data?.choices?.[0]?.message?.content?.trim();
          if (!txt) {
            logFallback("empty_completion");
            logEvent(true, "empty_completion");
            return Response.json({ assistant: scriptedFallback(job as PublicJob, lastUser) });
          }
          logEvent(false);
          return Response.json({ assistant: txt });
        } catch (e: any) {
          logFallback("exception", { message: e?.message });
          logEvent(true, "exception");
          return Response.json({ assistant: scriptedFallback(job as PublicJob, lastUser) });
        }
      },
    },
  },
});