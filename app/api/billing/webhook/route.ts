import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const endpointSecret = process.env.STRIPE_BILLING_WEBHOOK_SECRET!;
  const supabase = getSupabase();

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const { user_id, role } = session.metadata ?? {};
      if (!user_id) break;

      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;

      // Get trial end from subscription
      let trialEndsAt: string | null = null;
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        if (sub.trial_end) {
          trialEndsAt = new Date(sub.trial_end * 1000).toISOString();
        }
      }

      await supabase.from("profiles").update({
        stripe_customer_id: customerId,
        subscription_id: subscriptionId,
        subscription_status: "active",
        trial_ends_at: trialEndsAt,
      }).eq("id", user_id);

      console.log(`💳 [billing] ${role} ${user_id} subscribed (trial ends: ${trialEndsAt})`);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const status = subscription.status;
      const subId = subscription.id;

      await supabase.from("profiles").update({
        subscription_status: status,
      }).eq("subscription_id", subId);

      console.log(`💳 [billing] Subscription ${subId} → ${status}`);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;

      await supabase.from("profiles").update({
        subscription_status: "canceled",
        subscription_id: null,
      }).eq("subscription_id", subscription.id);

      console.log(`💳 [billing] Subscription ${subscription.id} canceled`);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as any;
      const subscriptionId = invoice.subscription as string | null;

      if (subscriptionId) {
        await supabase.from("profiles").update({
          subscription_status: "past_due",
        }).eq("subscription_id", subscriptionId);

        console.log(`💳 [billing] Subscription ${subscriptionId} → past_due`);
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
