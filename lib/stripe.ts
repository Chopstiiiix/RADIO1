import Stripe from "stripe";

// Re-export plan details and types for server-side convenience
export { PLAN_DETAILS, type BillingInterval, type SubscribableRole } from "./plans";

// Lazy init — avoids crash at build time if env var not set
let _stripe: Stripe | null = null;
function getStripeClient(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

// Lazy proxy — only initializes when first accessed at runtime
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return (getStripeClient() as any)[prop];
  },
});

/**
 * Stripe Price IDs for each role and billing interval.
 * Set these env vars with the price IDs from Stripe Dashboard.
 */
export const PRICES = {
  listener: {
    monthly: process.env.STRIPE_PRICE_LISTENER_MONTHLY || "",
    annual: process.env.STRIPE_PRICE_LISTENER_ANNUAL || "",
  },
  broadcaster: {
    monthly: process.env.STRIPE_PRICE_BROADCASTER_MONTHLY || "",
    annual: process.env.STRIPE_PRICE_BROADCASTER_ANNUAL || "",
  },
  advertiser: {
    monthly: process.env.STRIPE_PRICE_ADVERTISER_MONTHLY || "",
    annual: process.env.STRIPE_PRICE_ADVERTISER_ANNUAL || "",
  },
};

export const TRIAL_DAYS = 7;

export function getPriceId(role: "listener" | "broadcaster" | "advertiser", interval: "monthly" | "annual"): string {
  return PRICES[role][interval];
}
