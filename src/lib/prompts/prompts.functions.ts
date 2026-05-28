import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./require-admin.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPrompt, invalidatePromptCache } from "./registry.server";

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9_.-]+$/i, "slug must be alphanumeric with . _ -");

export const adminCheck = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => ({ ok: true }));

export const listPrompts = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("prompts")
      .select("id,slug,title,description,is_active,version,updated_at")
      .order("slug");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listPartials = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("prompt_partials")
      .select("id,slug,title,description,updated_at")
      .order("slug");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getPromptBySlug = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d) => z.object({ slug: slugSchema }).parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("prompts")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const getPartialBySlug = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d) => z.object({ slug: slugSchema }).parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("prompt_partials")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const listRevisions = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d) => z.object({ promptId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("prompt_revisions")
      .select("id,version,title,description,created_at,edited_by")
      .eq("prompt_id", data.promptId)
      .order("version", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const savePromptInput = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  body: z.string().max(50000),
  is_active: z.boolean().default(true),
});

export const savePrompt = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) => savePromptInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing, error: readErr } = await supabaseAdmin
      .from("prompts")
      .select("id,version")
      .eq("slug", data.slug)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const nextVersion = (existing?.version ?? 0) + 1;
    const payload = {
      slug: data.slug,
      title: data.title,
      description: data.description,
      body: data.body,
      is_active: data.is_active,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    };

    let promptId = existing?.id;
    if (existing) {
      const { error } = await supabaseAdmin
        .from("prompts")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await supabaseAdmin
        .from("prompts")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      promptId = ins.id;
    }

    if (promptId) {
      await supabaseAdmin.from("prompt_revisions").insert({
        prompt_id: promptId,
        version: nextVersion,
        body: data.body,
        title: data.title,
        description: data.description,
        edited_by: context.userId,
      });
    }

    invalidatePromptCache(data.slug);
    return { ok: true, version: nextVersion };
  });

const savePartialInput = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  body: z.string().max(50000),
});

export const savePartial = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) => savePartialInput.parse(d))
  .handler(async ({ data }) => {
    const payload = { ...data, updated_at: new Date().toISOString() };
    const { error } = await supabaseAdmin
      .from("prompt_partials")
      .upsert(payload, { onConflict: "slug" });
    if (error) throw new Error(error.message);
    invalidatePromptCache();
    return { ok: true };
  });

export const previewPrompt = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) =>
    z.object({ slug: slugSchema, vars: z.record(z.string(), z.string()).default({}) }).parse(d),
  )
  .handler(async ({ data }) => {
    invalidatePromptCache(data.slug);
    const body = await getPrompt(data.slug, data.vars);
    return { body };
  });

export const deletePrompt = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) => z.object({ slug: slugSchema }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("prompts").delete().eq("slug", data.slug);
    if (error) throw new Error(error.message);
    invalidatePromptCache(data.slug);
    return { ok: true };
  });

export const deletePartial = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) => z.object({ slug: slugSchema }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("prompt_partials")
      .delete()
      .eq("slug", data.slug);
    if (error) throw new Error(error.message);
    invalidatePromptCache();
    return { ok: true };
  });