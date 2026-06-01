import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import Stripe from "stripe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getBundle, CREDIT_BUNDLES, getStripePriceId } from "./bundles";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

const TierEnum = z.enum(
  CREDIT_BUNDLES.map((b) => b.key) as [string, ...string[]],
);

const Input = z.object({
  // "topup" = one-time purchase; "subscription" = recurring monthly plan.
  kind: z.enum(["topup", "subscription"]).default("topup"),
  // Renamed from bundleKey → tierKey to reflect dual use. We still accept
  // bundleKey as an alias for one release so old client builds don't break.
  tierKey: TierEnum.optional(),
  bundleKey: TierEnum.optional(),
  returnUrl: z.string().url(),
}).refine((v) => v.tierKey || v.bundleKey, {
  message: "tierKey is required",
  path: ["tierKey"],
});

/**
 * Get or create the Stripe customer for this user and cache the id on
 * profiles. Reusing the customer is required for subscriptions and the
 * billing portal.
 */
async function getOrCreateCustomerId(
  stripe: Stripe,
  userId: string,
  email: string | undefined,
): Promise<string> {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();
  if (error) throw new Error(error.message);
  const existing = (profile as { stripe_customer_id: string | null } | null)
    ?.stripe_customer_id;
  if (existing) return existing;

  const customer = await stripe.customers.create({
    email,
    metadata: { user_id: userId },
  });
  const { error: updErr } = await supabaseAdmin
    .from("profiles")
    .update({ stripe_customer_id: customer.id } as never)
    .eq("id", userId);
  if (updErr) {
    console.error("[checkout] cache stripe_customer_id failed:", updErr.message);
  }
  return customer.id;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    const tierKey = data.tierKey ?? data.bundleKey;
    if (!tierKey) throw new Error("tierKey is required");
    const bundle = getBundle(tierKey);
    if (!bundle) throw new Error("Unknown tier");

    const stripe = getStripe();
    const email = (claims as { email?: string } | undefined)?.email;

    const origin = new URL(data.returnUrl).origin;
    const successUrl = `${origin}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/app?checkout=cancelled`;

    // Always have a customer so subscriptions + portal work later.
    const customerId = await getOrCreateCustomerId(stripe, userId, email);
    const priceId = getStripePriceId(bundle.key, data.kind === "subscription" ? "monthly" : "topup");

    const baseMetadata = {
      user_id: userId,
      tier_key: bundle.key,
      credits: String(bundle.credits),
      kind: data.kind,
    };

    const session = await stripe.checkout.sessions.create({
      mode: data.kind === "subscription" ? "subscription" : "payment",
      customer: customerId,
      line_items: [{ quantity: 1, price: priceId }],
      metadata: baseMetadata,
      // Stripe duplicates checkout session metadata onto the resulting
      // subscription / payment_intent so the webhook can always read it.
      ...(data.kind === "subscription"
        ? { subscription_data: { metadata: baseMetadata } }
        : { payment_intent_data: { metadata: baseMetadata } }),
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
    });

    // For top-ups, keep recording in credit_purchases so the existing
    // checkout.session.completed handler can credit the account.
    if (data.kind === "topup") {
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
    }

    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url };
  });