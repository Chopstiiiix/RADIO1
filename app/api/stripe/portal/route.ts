import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the broadcaster's Stripe customer ID from any active subscription
  const { data: subscription, error } = await supabase
    .from("agent_subscriptions")
    .select("stripe_customer_id")
    .eq("broadcaster_id", user.id)
    .not("stripe_customer_id", "is", null)
    .limit(1)
    .single();

  if (error || !subscription?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No active subscription found" },
      { status: 404 }
    );
  }

  const { origin } = new URL(req.url);

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${origin}/broadcast/agents`,
  });

  return NextResponse.json({ url: session.url });
}
