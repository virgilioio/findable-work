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
    tagline: "≈500 candidates · ~49 source-mores",
  },
  {
    key: "growth",
    name: "Growth",
    credits: 1500,
    amountCents: 12900,
    currency: "usd",
    highlight: true,
    tagline: "≈1,500 candidates · ~149 source-mores",
  },
  {
    key: "pro",
    name: "Pro",
    credits: 4000,
    amountCents: 29900,
    currency: "usd",
    tagline: "≈4,000 candidates",
  },
  {
    key: "scale",
    name: "Scale",
    credits: 10000,
    amountCents: 69900,
    currency: "usd",
    tagline: "≈10,000 candidates",
  },
];

export function getBundle(key: string): CreditBundle | undefined {
  return CREDIT_BUNDLES.find((b) => b.key === key);
}

// New model: charge per candidate actually inserted. Phone reveals unchanged.
// SOURCING_RUN_COST is kept as a legacy export (= 1) so any remaining imports
// don't crash; do NOT use it to gate runs — use CANDIDATE_ADD_COST + a balance
// pre-check, and debit per insert.
export const CANDIDATE_ADD_COST = 1;
export const PHONE_REVEAL_COST = 5;
export const SOURCING_RUN_COST = CANDIDATE_ADD_COST;
// Typical fresh-insert quotas, used for the "low balance" warning and copy.
export const INITIAL_RUN_TARGET = 20;
export const SOURCE_MORE_TARGET = 10;

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