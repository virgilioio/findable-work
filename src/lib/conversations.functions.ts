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
      ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    if (e3) throw new Error(e3.message);
    if (e4) throw new Error(e4.message);
    if (e5) throw new Error(e5.message);
    if (!conv) throw new Error("Conversation not found");
    return {
      conversation: conv,
      messages: messages ?? [],
      job: job ?? null,
      tasks: tasks ?? [],
      jobPost: jobPost ?? null,
    };
  });