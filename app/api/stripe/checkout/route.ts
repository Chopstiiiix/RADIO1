import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify broadcaster role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "broadcaster") {
    return NextResponse.json({ error: "Not a broadcaster" }, { status: 403 });
  }

  // Parse request body
  let body: { agent_id: string; role: "primary" | "cohost" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { agent_id, role } = body;

  if (!agent_id || !role) {
    return NextResponse.json(
      { error: "agent_id and role are required" },
      { status: 400 }
    );
  }

  if (role !== "primary" && role !== "cohost") {
    return NextResponse.json(
      { error: "role must be 'primary' or 'cohost'" },
      { status: 400 }
    );
  }

  // Fetch the agent to get the correct Stripe price ID
  const { data: agent, error: agentError } = await supabase
    .from("ai_agents")
    .select("id, name, stripe_price_id_primary, stripe_price_id_cohost")
    .eq("id", agent_id)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const priceId =
    role === "primary"
      ? agent.stripe_price_id_primary
      : agent.stripe_price_id_cohost;

  if (!priceId) {
    return NextResponse.json(
      { error: `No Stripe price configured for ${role} role` },
      { status: 400 }
    );
  }

  // Check if broadcaster already has a Stripe customer ID
  const { data: existingSub } = await supabase
    .from("agent_subscriptions")
    .select("stripe_customer_id")
    .eq("broadcaster_id", user.id)
    .not("stripe_customer_id", "is", null)
    .limit(1)
    .single();

  let customerId = existingSub?.stripe_customer_id;

  // Create a new Stripe customer if none exists
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { broadcaster_id: user.id },
    });
    customerId = customer.id;
  }

  // Build checkout session
  const { origin } = new URL(req.url);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      broadcaster_id: user.id,
      agent_id: agent.id,
      role,
    },
    success_url: `${origin}/broadcast/agents?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/broadcast/agents`,
  });

  return NextResponse.json({ url: session.url });
}
