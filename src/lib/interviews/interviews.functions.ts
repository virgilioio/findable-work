import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createCalendarEventForSchedule,
  deleteCalendarEvent,
  hasCalendarConnection,
  type StageRef,
  type ScheduleRow,
} from "./calendar.server";

// --------------------------------------------------------------------------
// Schemas

const FORMATS = ["video", "async", "onsite", "phone"] as const;

const interviewerSchema = z.object({
  name: z.string().min(1).max(120),
  role: z.string().max(120).optional().default(""),
  email: z.string().email().max(200).optional().or(z.literal("")).optional(),
});

const stageSchema = z.object({
  id: z.string().min(1).max(64),
  order: z.number().int().min(0).max(50),
  name: z.string().min(1).max(120),
  format: z.enum(FORMATS).default("video"),
  duration_min: z.number().int().min(5).max(480).default(30),
  interviewers: z.array(interviewerSchema).max(8).default([]),
  description: z.string().max(2000).default(""),
  focus_areas: z.array(z.string().max(200)).max(12).default([]),
  suggested_questions: z.array(z.string().max(400)).max(12).default([]),
});

export type InterviewStage = z.infer<typeof stageSchema>;

function reorder(stages: InterviewStage[]): InterviewStage[] {
  return stages
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s, idx) => ({ ...s, order: idx }));
}

function newStageId(): string {
  return `stg_${Math.random().toString(36).slice(2, 10)}`;
}

// --------------------------------------------------------------------------
// Reads

export const getInterviewLoop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const [{ data: loop }, { data: schedules }, { data: calendarConn }] =
      await Promise.all([
        supabase
          .from("interview_loops")
          .select("*")
          .eq("conversation_id", data.conversationId)
          .maybeSingle(),
        supabase
          .from("interview_schedules")
          .select("*")
          .eq("conversation_id", data.conversationId)
          .order("start_at", { ascending: true, nullsFirst: false }),
        supabase
          .from("user_calendar_connections")
          .select("email")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
    return {
      loop: loop ?? null,
      schedules: schedules ?? [],
      calendarConnected: Boolean(calendarConn),
      calendarEmail: calendarConn?.email ?? null,
    };
  });

// --------------------------------------------------------------------------
// Upsert (full replace of stages + optional metadata)

export const upsertInterviewLoop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        stages: z.array(stageSchema).max(15),
        context: z.string().max(4000).optional(),
        prep_tips: z.string().max(4000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: job } = await supabase
      .from("jobs")
      .select("id")
      .eq("conversation_id", data.conversationId)
      .maybeSingle();
    const stages = reorder(data.stages);
    const patch: Record<string, unknown> = { stages };
    if (typeof data.context === "string") patch.context = data.context;
    if (typeof data.prep_tips === "string") patch.prep_tips = data.prep_tips;
    const { data: row, error } = await supabase
      .from("interview_loops")
      .upsert(
        {
          user_id: userId,
          conversation_id: data.conversationId,
          job_id: job?.id ?? null,
          ...patch,
        },
        { onConflict: "conversation_id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// --------------------------------------------------------------------------
// Single-stage mutations (used by the inline editor)

async function loadLoopOwned(supabase: any, conversationId: string, userId: string) {
  const { data: loop, error } = await supabase
    .from("interview_loops")
    .select("*")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!loop) throw new Error("Interview loop not found");
  if (loop.user_id !== userId) throw new Error("Forbidden");
  return loop;
}

export const updateStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        stageId: z.string().min(1).max(64),
        patch: stageSchema.partial(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const loop = await loadLoopOwned(supabase, data.conversationId, userId);
    const stages = Array.isArray(loop.stages) ? (loop.stages as InterviewStage[]) : [];
    const next = stages.map((s) =>
      s.id === data.stageId ? ({ ...s, ...data.patch, id: s.id } as InterviewStage) : s,
    );
    const { error } = await supabase
      .from("interview_loops")
      .update({ stages: reorder(next) })
      .eq("id", loop.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        afterStageId: z.string().max(64).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const loop = await loadLoopOwned(supabase, data.conversationId, userId);
    const stages = (loop.stages as InterviewStage[]) ?? [];
    const newStage: InterviewStage = {
      id: newStageId(),
      order: stages.length,
      name: "New stage",
      format: "video",
      duration_min: 30,
      interviewers: [],
      description: "",
      focus_areas: [],
      suggested_questions: [],
    };
    let next: InterviewStage[];
    if (data.afterStageId) {
      const idx = stages.findIndex((s) => s.id === data.afterStageId);
      next = idx === -1 ? [...stages, newStage] : [
        ...stages.slice(0, idx + 1),
        newStage,
        ...stages.slice(idx + 1),
      ];
    } else {
      next = [...stages, newStage];
    }
    const { error } = await supabase
      .from("interview_loops")
      .update({ stages: reorder(next) })
      .eq("id", loop.id);
    if (error) throw new Error(error.message);
    return { stageId: newStage.id };
  });

export const removeStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        stageId: z.string().min(1).max(64),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const loop = await loadLoopOwned(supabase, data.conversationId, userId);
    const stages = (loop.stages as InterviewStage[]) ?? [];
    const next = stages.filter((s) => s.id !== data.stageId);
    const { error } = await supabase
      .from("interview_loops")
      .update({ stages: reorder(next) })
      .eq("id", loop.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderStages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        stageIds: z.array(z.string().min(1).max(64)).min(1).max(15),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const loop = await loadLoopOwned(supabase, data.conversationId, userId);
    const stages = (loop.stages as InterviewStage[]) ?? [];
    const byId = new Map(stages.map((s) => [s.id, s]));
    const next: InterviewStage[] = [];
    data.stageIds.forEach((id, i) => {
      const s = byId.get(id);
      if (s) next.push({ ...s, order: i });
    });
    // Append any stages that weren't in the list (defensive).
    stages.forEach((s) => {
      if (!data.stageIds.includes(s.id)) next.push({ ...s, order: next.length });
    });
    const { error } = await supabase
      .from("interview_loops")
      .update({ stages: next })
      .eq("id", loop.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --------------------------------------------------------------------------
// Schedules

export const addInterviewSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        stageId: z.string().min(1).max(64),
        candidateId: z.string().uuid().nullable().optional(),
        candidateName: z.string().min(1).max(200),
        candidateEmail: z.string().email().max(200).optional().or(z.literal("")).optional(),
        startAt: z.string().datetime().nullable().optional(),
        isAsync: z.boolean().optional().default(false),
        notes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const loop = await loadLoopOwned(supabase, data.conversationId, userId);
    const stages = (loop.stages as InterviewStage[]) ?? [];
    const stage = stages.find((s) => s.id === data.stageId);
    if (!stage) throw new Error("Unknown stage");
    const start = data.startAt ? new Date(data.startAt) : null;
    const end = start
      ? new Date(start.getTime() + (stage.duration_min ?? 30) * 60_000).toISOString()
      : null;
    const { data: row, error } = await supabase
      .from("interview_schedules")
      .insert({
        user_id: userId,
        conversation_id: data.conversationId,
        loop_id: loop.id,
        candidate_id: data.candidateId ?? null,
        candidate_name: data.candidateName,
        candidate_email: data.candidateEmail || null,
        stage_id: stage.id,
        stage_name: stage.name,
        start_at: start?.toISOString() ?? null,
        end_at: end,
        is_async: Boolean(data.isAsync) || stage.format === "async",
        notes: data.notes ?? "",
        status: "pending",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const cancelSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ scheduleId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("interview_schedules")
      .select("*")
      .eq("id", data.scheduleId)
      .maybeSingle();
    if (!row || row.user_id !== userId) throw new Error("Not found");
    if (row.google_event_id) {
      try {
        await deleteCalendarEvent({ userId, googleEventId: row.google_event_id });
      } catch (e) {
        console.error("calendar delete failed", e);
      }
    }
    const { error } = await supabase
      .from("interview_schedules")
      .delete()
      .eq("id", data.scheduleId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const confirmAllSchedules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const connected = await hasCalendarConnection(userId);
    if (!connected) {
      return { ok: false, code: "calendar_not_connected" as const };
    }
    const loop = await loadLoopOwned(supabase, data.conversationId, userId);
    const stages = (loop.stages as StageRef[]) ?? [];
    const stageById = new Map(stages.map((s) => [s.id, s]));
    const [{ data: pendingRows }, { data: job }] = await Promise.all([
      supabase
        .from("interview_schedules")
        .select("*")
        .eq("conversation_id", data.conversationId)
        .eq("status", "pending")
        .not("start_at", "is", null)
        .eq("is_async", false),
      supabase
        .from("jobs")
        .select("title")
        .eq("conversation_id", data.conversationId)
        .maybeSingle(),
    ]);
    const results: Array<{
      id: string;
      ok: boolean;
      error?: string;
    }> = [];
    for (const row of (pendingRows ?? []) as ScheduleRow[]) {
      const stage = stageById.get(row.stage_id);
      if (!stage) {
        results.push({ id: row.id, ok: false, error: "Stage missing" });
        continue;
      }
      try {
        const created = await createCalendarEventForSchedule({
          userId,
          schedule: row,
          stage,
          prepTips: loop.prep_tips || null,
          jobTitle: job?.title,
        });
        await supabaseAdmin
          .from("interview_schedules")
          .update({
            google_event_id: created.google_event_id,
            meet_link: created.meet_link,
            status: "confirmed",
          })
          .eq("id", row.id);
        results.push({ id: row.id, ok: true });
      } catch (e: any) {
        results.push({ id: row.id, ok: false, error: e?.message ?? "Failed" });
      }
    }
    return {
      ok: true,
      results,
      confirmed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    };
  });