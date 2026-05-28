import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("conversations")
      .select("id,title,updated_at,created_at,pinned_at")
      .order("pinned_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ title: z.string().min(1).max(200).optional() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("conversations")
      .insert({ user_id: userId, title: data.title ?? "New conversation" })
      .select("id,title,updated_at,created_at,pinned_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const renameConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), title: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("conversations")
      .update({ title: data.title })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setConversationPinned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), pinned: z.boolean() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("conversations")
      .update({ pinned_at: data.pinned ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.from("conversations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const [
      { data: conv, error: e1 },
      { data: messages, error: e2 },
      { data: job, error: e3 },
      { data: tasks, error: e4 },
      { data: jobPost, error: e5 },
      { data: outreach, error: e6 },
    ] = await Promise.all([
        supabase.from("conversations").select("id,title,updated_at,created_at").eq("id", data.id).maybeSingle(),
        supabase
          .from("messages")
          .select("id,role,content,tool_calls,created_at")
          .eq("conversation_id", data.id)
          .order("created_at", { ascending: true }),
        supabase.from("jobs").select("*").eq("conversation_id", data.id).maybeSingle(),
        supabase
          .from("agent_tasks")
          .select("id,message_id,kind,label,status,summary,data,started_at,finished_at,created_at")
          .eq("conversation_id", data.id)
          .order("created_at", { ascending: true }),
        supabase.from("job_posts").select("*").eq("conversation_id", data.id).maybeSingle(),
        supabase.from("outreach_drafts").select("*").eq("conversation_id", data.id).maybeSingle(),
      ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    if (e3) throw new Error(e3.message);
    if (e4) throw new Error(e4.message);
    if (e5) throw new Error(e5.message);
    if (e6) throw new Error(e6.message);
    if (!conv) throw new Error("Conversation not found");
    return {
      conversation: conv,
      messages: messages ?? [],
      job: job ?? null,
      tasks: tasks ?? [],
      jobPost: jobPost ?? null,
      outreach: outreach ?? null,
    };
  });

// ---------------------------------------------------------------------
// Guest claim — takes a guest transcript + optional draft Job from the
// public homepage chat and persists it as a real conversation owned by
// the just-signed-in user. Returns the new conversationId.

const guestMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string().max(20000),
  tool_calls: z.unknown().nullable().optional(),
});

const guestDraftJobSchema = z
  .object({
    title: z.string().max(200).optional(),
    description: z.string().max(20000).optional(),
    requirements: z.array(z.string().max(500)).max(50).optional(),
    location: z.string().max(200).optional(),
    employment_type: z
      .enum(["full_time", "part_time", "contract", "internship", "temporary"])
      .optional(),
    salary_min: z.number().nullable().optional(),
    salary_max: z.number().nullable().optional(),
    currency: z.string().max(8).optional(),
  })
  .partial();

export const claimGuestConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        title: z.string().min(1).max(200).optional(),
        messages: z.array(guestMessageSchema).max(80),
        draftJob: guestDraftJobSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const title =
      data.title?.trim() ||
      data.draftJob?.title?.trim() ||
      data.messages.find((m) => m.role === "user")?.content.slice(0, 60) ||
      "New conversation";

    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .insert({ user_id: userId, title })
      .select("id")
      .single();
    if (convErr || !conv) throw new Error(convErr?.message ?? "Failed to create conversation");

    if (data.messages.length > 0) {
      const rows = data.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          conversation_id: conv.id,
          user_id: userId,
          role: m.role,
          content: m.content,
          tool_calls: (m.tool_calls ?? null) as never,
        }));
      if (rows.length > 0) {
        const { error: msgErr } = await supabase.from("messages").insert(rows);
        if (msgErr) throw new Error(msgErr.message);
      }
    }

    if (data.draftJob && (data.draftJob.title || data.draftJob.description)) {
      const dj = data.draftJob;
      const { error: jobErr } = await supabase.from("jobs").insert({
        user_id: userId,
        conversation_id: conv.id,
        title: dj.title ?? "",
        description: dj.description ?? "",
        requirements: dj.requirements ?? [],
        location: dj.location ?? "",
        employment_type: dj.employment_type ?? "full_time",
        salary_min: dj.salary_min ?? null,
        salary_max: dj.salary_max ?? null,
        currency: dj.currency ?? "USD",
        status: "draft",
      });
      if (jobErr) throw new Error(jobErr.message);
    }

    return { conversationId: conv.id };
  });