import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAGES = ["Sourced", "Contacted", "Screening", "Interview", "Offer"] as const;

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
      { id: 1, type: "added", by: "Gio AI", when: "Just now", text: "Added to project" },
      { id: 2, type: "matched", by: "Gio AI", when: "Just now", text: `Match score calculated: ${input.match}%` },
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
    const { supabase } = context;
    const { id, ...patch } = data;
    const update: { stage?: typeof STAGES[number]; starred?: boolean; stage_changed_at?: string } = { ...patch };
    if (patch.stage) update.stage_changed_at = new Date().toISOString();
    const { data: row, error } = await supabase
      .from("candidates")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.from("candidates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });