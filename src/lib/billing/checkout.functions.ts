import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import Stripe from "stripe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getBundle, CREDIT_BUNDLES } from "./bundles";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2025-09-30.clover" });
}

const Input = z.object({
  bundleKey: z.enum(
    CREDIT_BUNDLES.map((b) => b.key) as [string, ...string[]],
  ),
  returnUrl: z.string().url(),
});

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    const bundle = getBundle(data.bundleKey);
    if (!bundle) throw new Error("Unknown bundle");

    const stripe = getStripe();

    const origin = new URL(data.returnUrl).origin;
    const successUrl = `${origin}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/app?checkout=cancelled`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: (claims as { email?: string } | undefined)?.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: bundle.currency,
            unit_amount: bundle.amountCents,
            product_data: {
              name: `Findable — ${bundle.name} (${bundle.credits.toLocaleString()} credits)`,
              description: bundle.tagline,
            },
          },
        },
      ],
      metadata: {
        user_id: userId,
        bundle_key: bundle.key,
        credits: String(bundle.credits),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    const { error } = await supabaseAdmin.from("credit_purchases" as never).insert({
      user_id: userId,
      stripe_session_id: session.id,
      bundle_key: bundle.key,
      credits: bundle.credits,
      amount_cents: bundle.amountCents,
      currency: bundle.currency,
      status: "pending",
    } as never);
    if (error) {
      console.error("[checkout] insert credit_purchase failed:", error.message);
      throw new Error("Could not record purchase");
    }

    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url };
  });