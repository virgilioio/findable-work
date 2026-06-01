// Credit bundles. Source of truth for both server (Checkout) and client (UI).
// Server validates the bundle key against this list — never trust amounts
// coming from the browser.

export type CreditBundle = {
  key: "starter" | "growth" | "pro" | "scale";
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