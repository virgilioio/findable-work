import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const listApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: job, error: jErr } = await supabase
      .from("jobs")
      .select("id")
      .eq("conversation_id", data.conversationId)
      .maybeSingle();
    if (jErr) throw new Error(jErr.message);
    if (!job) return [];
    const { data: rows, error } = await supabase
      .from("applications")
      .select("*")
      .eq("job_id", job.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("applications")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const getResumeSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("applications")
      .select("id, recruiter_user_id, resume_url, resume_filename")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Application not found");
    if (row.recruiter_user_id !== userId) throw new Error("Forbidden");
    if (!row.resume_url) throw new Error("No resume on file");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("resumes")
      .createSignedUrl(row.resume_url, 300, {
        download: row.resume_filename || undefined,
      });
    if (sErr || !signed) throw new Error(sErr?.message || "Could not sign url");
    return { url: signed.signedUrl };
  });