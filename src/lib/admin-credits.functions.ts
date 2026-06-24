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
  const { data, error } = await (supabaseAdmin as any).rpc("admin_grant_credits", {
    _user_id: userId,
    _amount: amount,
    _note: note ?? null,
    _granted_by: grantedBy,
  });
  if (error) throw new Error(error.message);
  return { balanceAfter: Number(data ?? 0) };
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