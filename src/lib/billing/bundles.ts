// Credit plans. Source of truth for both server (Checkout) and client (UI).
// Each tier maps to TWO Stripe Prices on the same Product:
//   - a recurring monthly Price (subscription)
//   - a one-time Price (top-up)
// Price IDs are read from env at call time on the server (never trust the
// client). The client only sees keys, display info, and prices.

export type TierKey = "starter" | "growth" | "pro" | "scale";

export type CreditBundle = {
  key: TierKey;
  name: string;
  credits: number;
  amountCents: number;
  currency: "usd";
  highlight?: boolean;
  tagline: string;
};

export const CREDIT_BUNDLES: CreditBundle[] = [
  {
    key: "starter",
    name: "Starter",
    credits: 500,
    amountCents: 4900,
    currency: "usd",
    tagline: "~50 sourcing runs",
  },
  {
    key: "growth",
    name: "Growth",
    credits: 1500,
    amountCents: 12900,
    currency: "usd",
    highlight: true,
    tagline: "~150 sourcing runs",
  },
  {
    key: "pro",
    name: "Pro",
    credits: 4000,
    amountCents: 29900,
    currency: "usd",
    tagline: "~400 sourcing runs",
  },
  {
    key: "scale",
    name: "Scale",
    credits: 10000,
    amountCents: 69900,
    currency: "usd",
    tagline: "~1000 sourcing runs",
  },
];

export function getBundle(key: string): CreditBundle | undefined {
  return CREDIT_BUNDLES.find((b) => b.key === key);
}

export const SOURCING_RUN_COST = 10;
export const PHONE_REVEAL_COST = 1;

/**
 * Server-only: resolve the Stripe Price ID for a tier + kind from env.
 * Throws if the secret isn't configured (so checkout fails loud, not silent).
 */
export function getStripePriceId(
  tier: TierKey,
  kind: "monthly" | "topup",
): string {
  const upper = tier.toUpperCase();
  const suffix = kind === "monthly" ? "MONTHLY" : "TOPUP";
  const name = `STRIPE_PRICE_${upper}_${suffix}`;
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not configured. Create the Stripe Price and add the secret.`,
    );
  }
  return value;
}