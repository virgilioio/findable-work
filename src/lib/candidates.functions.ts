import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requestApolloPhoneReveal } from "@/lib/sourcing/apollo.server";
import { spendCreditsAdmin } from "@/lib/billing/credits.functions";
import { PHONE_REVEAL_COST } from "@/lib/billing/bundles";
import { logAuditEvent } from "@/lib/audit.server";

const STAGES = ["Applied", "Sourced", "Contacted", "Screening", "Interview", "Offer"] as const;

function enrich(input: {
  id: number;
  name: string;
  role: string;
  company: string;
  match: number;
  tags: string[];
  stage: string;
}) {
  const slug = input.name.toLowerCase().replace(/\s+/g, ".").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const handle = input.name.toLowerCase().replace(/\s+/g, "-").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const years = 3 + (input.id % 3);
  return {
    email: `${slug}@example.com`,
    phone: "+52 55 " + (1000 + (input.id * 73) % 9000) + " " + (1000 + (input.id * 47) % 9000),
    linkedin: `linkedin.com/in/${handle}`,
    location: "Mexico City, Mexico",
    summary:
      `${input.role} at ${input.company} with ${years} years driving outbound for B2B SaaS in LATAM. ` +
      `Consistently exceeded quota (avg 118% in last 4 quarters). Strong in multichannel sequencing and MEDDPICC qualification.`,
    experience: [
      { id: 1, role: input.role, company: input.company, period: "2023 — Present", desc: "Led top-of-funnel for LATAM mid-market. 32 meetings/mo avg, 116% of quota." },
      { id: 2, role: "SDR", company: "Sprinklr LATAM", period: "2021 — 2023", desc: "First SDR hired in CDMX. Built outbound playbook from scratch." },
      { id: 3, role: "BDR", company: "Softtek", period: "2020 — 2021", desc: "Inbound qualification for enterprise IT services." },
    ],
    education: [{ school: "ITAM", degree: "BA, Business Administration", period: "2016 — 2020" }],
    match_breakdown: [
      { label: "Years experience", score: 95, note: `${years} yrs at B2B SaaS (target 3–5)` },
      { label: "Sales stack", score: 92, note: "Salesforce + Outreach + LinkedIn Sales Nav" },
      { label: "Languages", score: 100, note: "Spanish native, English C1" },
      { label: "Location", score: 100, note: "Based in CDMX, hybrid-ready" },
      { label: "Industry fit", score: 78, note: input.tags.includes("Fintech") ? "Fintech background, SaaS adjacent" : "Direct SaaS background" },
    ],
    activity: [
      { id: 1, type: "added", by: "findable", when: "Just now", text: "Added to project" },
      { id: 2, type: "matched", by: "findable", when: "Just now", text: `Match score calculated: ${input.match}%` },
    ],
  };
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export const listCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("candidates")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("match", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const createSchema = z.object({
  conversationId: z.string().uuid(),
  name: z.string().min(1).max(200),
  role: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  source: z.string().max(60).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  match: z.number().int().min(0).max(100).optional(),
});

export const createCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const match = data.match ?? 70 + Math.floor(Math.random() * 20);
    const tags = data.tags ?? [];
    const stage = "Sourced";
    const seed = Math.floor(Math.random() * 1000) + 1;
    const enr = enrich({
      id: seed,
      name: data.name,
      role: data.role ?? "—",
      company: data.company ?? "—",
      match,
      tags,
      stage,
    });
    const { data: row, error } = await supabase
      .from("candidates")
      .insert({
        user_id: userId,
        conversation_id: data.conversationId,
        name: data.name,
        role: data.role ?? "—",
        company: data.company ?? "—",
        source: data.source ?? "LinkedIn",
        match,
        tags,
        stage,
        avatar: initials(data.name),
        email: enr.email,
        phone: enr.phone,
        linkedin: enr.linkedin,
        location: enr.location,
        summary: enr.summary,
        experience: enr.experience,
        education: enr.education,
        match_breakdown: enr.match_breakdown,
        activity: enr.activity,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const patchSchema = z.object({
  id: z.string().uuid(),
  stage: z.enum(STAGES).optional(),
  starred: z.boolean().optional(),
});

export const updateCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => patchSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { id, ...patch } = data;
    const update: { stage?: typeof STAGES[number]; starred?: boolean; stage_changed_at?: string } = { ...patch };
    if (patch.stage) update.stage_changed_at = new Date().toISOString();
    let prevStage: string | undefined;
    if (patch.stage) {
      const { data: prev } = await supabase
        .from("candidates")
        .select("stage")
        .eq("id", id)
        .maybeSingle();
      prevStage = prev?.stage;
    }
    const { data: row, error } = await supabase
      .from("candidates")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    if (patch.stage && row && prevStage !== patch.stage) {
      await logAuditEvent({
        userId,
        action: "candidate.stage_changed",
        entityType: "candidate",
        entityId: id,
        metadata: { from: prevStage ?? null, to: patch.stage, name: row.name },
      });
    }
    return row;
  });

export const deleteCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: prev } = await supabase
      .from("candidates")
      .select("name, email, stage")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabase.from("candidates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAuditEvent({
      userId,
      action: "candidate.deleted",
      entityType: "candidate",
      entityId: data.id,
      metadata: {
        name: prev?.name ?? null,
        email: prev?.email ?? null,
        stage: prev?.stage ?? null,
      },
    });
    return { ok: true };
  });

export const revealCandidatePhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: cand, error: loadErr } = await supabase
      .from("candidates")
      .select("id, apollo_id, phone, activity, source")
      .eq("id", data.id)
      .single();
    if (loadErr) throw new Error(loadErr.message);
    if (!cand) throw new Error("Candidate not found");
    if (cand.phone) return { phone: cand.phone, alreadyRevealed: true };
    if (!cand.apollo_id) throw new Error("This candidate did not come from Apollo, no phone to reveal.");

    // Idempotency: skip if a reveal was requested for this candidate in the last 10 min.
    const activity = Array.isArray(cand.activity) ? [...(cand.activity as any[])] : [];
    const recentPending = activity
      .filter((a) => a?.type === "phone_reveal_pending" && a?.at)
      .some((a) => Date.now() - new Date(a.at).getTime() < 10 * 60 * 1000);
    if (recentPending) {
      return { status: "pending" as const, alreadyPending: true };
    }

    // Call Apollo first; only charge credits if Apollo accepted and either
    // returned a phone synchronously OR queued the request for async webhook
    // delivery. Failures (no permission / not matched / waterfall failed)
    // are surfaced to the UI without burning credits.
    const outcome = await requestApolloPhoneReveal(cand.apollo_id);

    if (!outcome.ok) {
      const text =
        outcome.reason === "no_permission"
          ? "Phone reveal not enabled on the Apollo plan"
          : outcome.reason === "not_matched"
            ? "Apollo couldn't match this profile"
            : "No mobile available from Apollo";
      activity.push({
        id: activity.length + 1,
        type: "phone_reveal_attempted",
        by: "apollo",
        when: "Just now",
        at: new Date().toISOString(),
        text,
      });
      const { error: updErr } = await supabase
        .from("candidates")
        .update({ activity })
        .eq("id", data.id);
      if (updErr) throw new Error(updErr.message);
      return {
        status: "no_number" as const,
        reason: outcome.reason,
        message: outcome.message,
      };
    }

    // Apollo accepted. Charge credits before persisting the result (so a
    // credit shortage doesn't leave a candidate row with a revealed phone
    // we never billed for). Skip for direct-Applicant rows (no outbound
    // sourcing involved); Apollo-sourced candidates always pay.
    if (cand.source !== "Applicant") {
      const spend = await spendCreditsAdmin({
        userId,
        amount: PHONE_REVEAL_COST,
        type: "phone_reveal",
        reason: "Phone reveal",
        metadata: { candidate_id: cand.id, apollo_id: cand.apollo_id },
      });
      if (!spend.ok) {
        return {
          status: "insufficient_credits" as const,
          balance: spend.balance,
          required: PHONE_REVEAL_COST,
        };
      }
    }

    if (outcome.phone) {
      // Synchronous hit — Apollo handed us the number in the bulk_match
      // response. Save it and mark the activity as revealed.
      activity.push({
        id: activity.length + 1,
        type: "phone_revealed",
        by: "apollo",
        when: "Just now",
        at: new Date().toISOString(),
        text: `Phone number revealed (${PHONE_REVEAL_COST} credits used)`,
      });
      const { error: updErr } = await supabase
        .from("candidates")
        .update({ phone: outcome.phone, activity })
        .eq("id", data.id);
      if (updErr) throw new Error(updErr.message);
      return { status: "revealed" as const, phone: outcome.phone };
    }

    // Queued — Apollo will deliver via webhook. The drawer polls until then.
    activity.push({
      id: activity.length + 1,
      type: "phone_reveal_pending",
      by: "you",
      when: "Just now",
      at: new Date().toISOString(),
      text: "Phone reveal requested — results usually arrive within a few minutes",
    });
    const { error: updErr } = await supabase
      .from("candidates")
      .update({ activity })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    return { status: "pending" as const, alreadyPending: false };
  });