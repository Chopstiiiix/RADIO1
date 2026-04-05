import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { stripe, getPriceId, TRIAL_DAYS, type SubscribableRole, type BillingInterval } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { interval?: BillingInterval };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const interval: BillingInterval = body.interval === "annual" ? "annual" : "monthly";

  // Get user's role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const role = profile.role as SubscribableRole;
  if (!["listener", "broadcaster", "advertiser"].includes(role)) {
    return NextResponse.json({ error: "Invalid role for subscription" }, { status: 400 });
  }

  const priceId = getPriceId(role, interval);
  if (!priceId) {
    return NextResponse.json({ error: "Price not configured — contact support" }, { status: 500 });
  }

  // Reuse existing Stripe customer or create new one
  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email!,
      metadata: { user_id: user.id, role },
    });
    customerId = customer.id;

    // Save customer ID to profile
    await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const { origin } = new URL(req.url);

  // Determine return URL based on role
  const returnPath = role === "broadcaster" ? "/broadcast" : role === "advertiser" ? "/advertise" : "/listen";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: { user_id: user.id, role },
    },
    metadata: { user_id: user.id, role },
    success_url: `${origin}${returnPath}?subscribed=true`,
    cancel_url: `${origin}${returnPath}`,
  });

  return NextResponse.json({ url: session.url });
}
