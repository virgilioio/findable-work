import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

/**
 * Best-effort fixed-window rate limiter backed by a Postgres counter.
 *
 * Race-prone (no SELECT FOR UPDATE), but good enough to slow down obvious
 * abuse on hot endpoints. Replace when proper edge primitives ship.
 */
export async function checkRateLimit(args: {
  bucket: string;
  subject: string;
  max: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const { bucket, subject, max, windowSeconds } = args;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStartIso = new Date(windowStartMs).toISOString();

  try {
    const admin = supabaseAdmin as any;
    const { data: existing } = await admin
      .from("rate_limits")
      .select("count")
      .eq("bucket", bucket)
      .eq("subject", subject)
      .eq("window_start", windowStartIso)
      .maybeSingle();

    const current = existing?.count ?? 0;
    if (current >= max) {
      const retryAfterSeconds = Math.ceil((windowStartMs + windowMs - now) / 1000);
      return { ok: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
    }

    const next = current + 1;
    await admin.from("rate_limits").upsert(
      {
        bucket,
        subject,
        window_start: windowStartIso,
        count: next,
      },
      { onConflict: "bucket,subject,window_start" },
    );
    return { ok: true, remaining: Math.max(0, max - next) };
  } catch (err) {
    // Fail open: never let limiter failures block legitimate traffic.
    console.error("[rate-limit] check failed, allowing request", err);
    return { ok: true, remaining: max };
  }
}

/**
 * Convenience helper: throws a Response 429 when over limit. Use inside
 * server route handlers (createFileRoute server handlers).
 */
export async function enforceRateLimit(args: {
  bucket: string;
  subject: string;
  max: number;
  windowSeconds: number;
}): Promise<Response | null> {
  const result = await checkRateLimit(args);
  if (result.ok) return null;
  return new Response(
    JSON.stringify({
      error: "Too many requests",
      retryAfterSeconds: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(result.retryAfterSeconds),
      },
    },
  );
}

/**
 * Stable hash of an IP-like string for use as a rate-limit subject without
 * persisting the raw IP. Uses Web Crypto SHA-256 (available in Workers).
 */
export async function hashSubject(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}