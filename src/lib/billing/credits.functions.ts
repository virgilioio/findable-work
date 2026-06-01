import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CREDIT_BUNDLES,
  PHONE_REVEAL_COST,
  SOURCING_RUN_COST,
} from "./bundles";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const getCreditsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [profileRes, ledgerRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("credits_remaining, credits_seeded_at")
        .eq("id", userId)
        .single(),
      supabase
        .from("credit_ledger")
        .select("id, created_at, delta, reason, type, balance_after, metadata")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    if (profileRes.error) throw new Error(profileRes.error.message);

    const ledger = ledgerRes.data ?? [];
    const balance = profileRes.data?.credits_remaining ?? 0;

    const cutoff = Date.now() - THIRTY_DAYS_MS;
    let spent30d = 0;
    let added30d = 0;
    let sourcingRuns30d = 0;
    let phoneReveals30d = 0;
    for (const row of ledger) {
      const t = new Date(row.created_at as string).getTime();
      if (t < cutoff) continue;
      if (row.delta < 0) spent30d += -row.delta;
      else added30d += row.delta;
      if (row.type === "sourcing_run") sourcingRuns30d += 1;
      if (row.type === "phone_reveal") phoneReveals30d += 1;
    }

    return {
      balance,
      sourcingRunCost: SOURCING_RUN_COST,
      phoneRevealCost: PHONE_REVEAL_COST,
      bundles: CREDIT_BUNDLES,
      stats30d: {
        spent: spent30d,
        added: added30d,
        sourcingRuns: sourcingRuns30d,
        phoneReveals: phoneReveals30d,
      },
      ledger,
    };
  });

/**
 * Server-only helper: deduct credits atomically. Throws "insufficient_credits"
 * (with code so callers can map to a structured response) if balance < amount.
 * Always call BEFORE the paid external action (search, reveal, ...).
 */
export async function spendCreditsAdmin(opts: {
  userId: string;
  amount: number;
  type: string;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: true; balanceAfter: number } | { ok: false; reason: "insufficient_credits"; balance: number }> {
  const { data, error } = await supabaseAdmin.rpc("spend_credits" as never, {
    _user_id: opts.userId,
    _amount: opts.amount,
    _type: opts.type,
    _reason: opts.reason,
    _metadata: (opts.metadata ?? {}) as never,
  } as never);
  if (error) {
    if (/insufficient_credits/i.test(error.message)) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("credits_remaining")
        .eq("id", opts.userId)
        .single();
      return {
        ok: false,
        reason: "insufficient_credits",
        balance: profile?.credits_remaining ?? 0,
      };
    }
    throw new Error(error.message);
  }
  return { ok: true, balanceAfter: (data as unknown as number) ?? 0 };
}

const PreviewInput = z.object({});
export const previewBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PreviewInput.parse(input ?? {}))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("credits_remaining")
      .eq("id", userId)
      .single();
    if (error) throw new Error(error.message);
    return { balance: data?.credits_remaining ?? 0 };
  });