import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import Stripe from "stripe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

const Input = z.object({ returnUrl: z.string().url() });

/**
 * Opens the Stripe Customer Portal so the user can update payment method,
 * switch plan, or cancel. Requires the Customer Portal to be enabled +
 * configured in Stripe Dashboard → Settings → Billing → Customer portal.
 */
export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: profile, error } = await (supabaseAdmin as any)
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();
    if (error) throw new Error(error.message);
    const customerId = (profile as { stripe_customer_id: string | null } | null)
      ?.stripe_customer_id;
    if (!customerId) {
      throw new Error("No billing account yet — start by subscribing or topping up.");
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: data.returnUrl,
    });
    return { url: session.url };
  });