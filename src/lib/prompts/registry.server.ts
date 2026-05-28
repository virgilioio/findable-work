import { supabaseAdmin } from "@/integrations/supabase/client.server";

type CachedPrompt = { body: string; version: number; cachedAt: number };
type CachedPartial = { body: string; cachedAt: number };

const PROMPT_TTL_MS = 60_000;
const promptCache = new Map<string, CachedPrompt>();
const partialCache = new Map<string, CachedPartial>();

const PARTIAL_TAG = /\{\{\s*partial:([a-z0-9_.-]+)\s*\}\}/gi;
const VAR_TAG = /\{\{\s*var:([a-z0-9_.-]+)\s*\}\}/gi;
const MAX_DEPTH = 5;

async function loadPrompt(slug: string): Promise<{ body: string; version: number }> {
  const cached = promptCache.get(slug);
  if (cached && Date.now() - cached.cachedAt < PROMPT_TTL_MS) return cached;

  const { data, error } = await supabaseAdmin
    .from("prompts")
    .select("body,version,is_active")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`prompt registry: ${error.message}`);
  if (!data) throw new Error(`prompt registry: missing prompt "${slug}"`);
  if (!data.is_active) throw new Error(`prompt registry: prompt "${slug}" is inactive`);

  const entry = { body: data.body ?? "", version: data.version ?? 1, cachedAt: Date.now() };
  promptCache.set(slug, entry);
  return entry;
}

async function loadPartial(slug: string): Promise<string> {
  const cached = partialCache.get(slug);
  if (cached && Date.now() - cached.cachedAt < PROMPT_TTL_MS) return cached.body;

  const { data, error } = await supabaseAdmin
    .from("prompt_partials")
    .select("body")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`prompt registry: ${error.message}`);
  if (!data) throw new Error(`prompt registry: missing partial "${slug}"`);

  const body = data.body ?? "";
  partialCache.set(slug, { body, cachedAt: Date.now() });
  return body;
}

async function expand(
  body: string,
  vars: Record<string, string>,
  depth: number,
  stack: Set<string>,
): Promise<string> {
  if (depth > MAX_DEPTH) throw new Error("prompt registry: partial depth exceeded");

  // Expand partials first
  const partialSlugs: string[] = [];
  body.replace(PARTIAL_TAG, (_m, slug) => {
    partialSlugs.push(slug);
    return "";
  });

  const unique = Array.from(new Set(partialSlugs));
  const resolved = new Map<string, string>();
  for (const slug of unique) {
    if (stack.has(slug)) throw new Error(`prompt registry: partial cycle on "${slug}"`);
    const raw = await loadPartial(slug);
    stack.add(slug);
    resolved.set(slug, await expand(raw, vars, depth + 1, stack));
    stack.delete(slug);
  }

  let out = body.replace(PARTIAL_TAG, (_m, slug) => resolved.get(slug) ?? "");
  out = out.replace(VAR_TAG, (_m, name) => vars[name] ?? "");
  return out;
}

/**
 * Resolve a system prompt by slug, expanding {{partial:slug}} and {{var:name}}
 * placeholders. Server-only: never call from client code.
 */
export async function getPrompt(
  slug: string,
  vars: Record<string, string> = {},
): Promise<string> {
  const { body } = await loadPrompt(slug);
  return expand(body, vars, 0, new Set());
}

/** Drop cached entries — admin saves call this so the next read sees fresh content. */
export function invalidatePromptCache(slug?: string) {
  if (!slug) {
    promptCache.clear();
    partialCache.clear();
    return;
  }
  promptCache.delete(slug);
  partialCache.delete(slug);
}