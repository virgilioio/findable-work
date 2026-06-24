import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/prompts/require-admin.server";

const GrantByIdInput = z.object({
  userId: z.string().uuid(),
  amount: z.number().int().min(1).max(100000),
  note: z.string().trim().max(200).optional(),
});

const GrantByEmailInput = z.object({
  email: z.string().trim().email(),
  amount: z.number().int().min(1).max(100000),
  note: z.string().trim().max(200).optional(),
});

async function callGrant(
  userId: string,
  amount: number,
  note: string | undefined,
  grantedBy: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("credits_remaining")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("user_not_found");

  const balanceAfter = Number(profile.credits_remaining ?? 0) + amount;
  const { error: updateError } = await admin
    .from("profiles")
    .update({ credits_remaining: balanceAfter })
    .eq("id", userId);
  if (updateError) throw new Error(updateError.message);

  const reason = `${note?.trim() || "Admin refill"} (admin_grant by ${grantedBy})`;
  const { error: ledgerError } = await admin.from("credit_ledger").insert({
    user_id: userId,
    delta: amount,
    reason,
  });
  if (ledgerError) throw new Error(ledgerError.message);

  return { balanceAfter };
}

export const adminGrantCredits = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) => GrantByIdInput.parse(d))
  .handler(async ({ data, context }) => {
    return callGrant(data.userId, data.amount, data.note, context.userId);
  });

export const grantCreditsByEmail = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) => GrantByEmailInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const target = data.email.toLowerCase();
    let userId: string | null = null;
    const perPage = 1000;
    for (let page = 1; page <= 100 && !userId; page += 1) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error) throw new Error(error.message);
      const match = (list?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === target);
      if (match) userId = match.id;
      if ((list?.users ?? []).length < perPage) break;
    }
    if (!userId) throw new Error(`user_not_found: ${data.email}`);
    const res = await callGrant(userId, data.amount, data.note, context.userId);
    return { ...res, userId, email: data.email };
  });