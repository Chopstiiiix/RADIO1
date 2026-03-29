import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Service role client — no user context needed for webhooks
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
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
      const { broadcaster_id, agent_id, role } = session.metadata ?? {};

      if (!broadcaster_id || !agent_id || !role) {
        console.error("Webhook: missing metadata on checkout session", session.id);
        break;
      }

      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;

      // Retrieve subscription to get current_period_end
      let currentPeriodEnd: string | null = null;
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId) as any;
        const periodEnd = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end;
        if (periodEnd) {
          currentPeriodEnd = new Date(periodEnd * 1000).toISOString();
        }
      }

      // Upsert agent_subscriptions record
      const { error: subError } = await supabase
        .from("agent_subscriptions")
        .upsert(
          {
            broadcaster_id,
            agent_id,
            role,
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId,
            status: "active",
            current_period_end: currentPeriodEnd,
          },
          { onConflict: "broadcaster_id,agent_id" }
        );

      if (subError) {
        console.error("Webhook: failed to upsert agent_subscriptions", subError);
      }

      // Ensure broadcaster_agent_configs exists with ai_host_enabled
      const { error: configError } = await supabase
        .from("broadcaster_agent_configs")
        .upsert(
          {
            broadcaster_id,
            ai_host_enabled: true,
          },
          { onConflict: "broadcaster_id" }
        );

      if (configError) {
        console.error("Webhook: failed to upsert broadcaster_agent_configs", configError);
      }

      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as any;
      const status = subscription.status;

      const currentPeriodEnd = new Date(
        subscription.current_period_end * 1000
      ).toISOString();

      const { error } = await supabase
        .from("agent_subscriptions")
        .update({
          status,
          current_period_end: currentPeriodEnd,
        })
        .eq("stripe_subscription_id", subscription.id);

      if (error) {
        console.error("Webhook: failed to update subscription", error);
      }

      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as any;

      const { error } = await supabase
        .from("agent_subscriptions")
        .update({ status: "canceled" })
        .eq("stripe_subscription_id", subscription.id);

      if (error) {
        console.error("Webhook: failed to cancel subscription", error);
      }

      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as any;
      const subscriptionId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;

      if (subscriptionId) {
        const { error } = await supabase
          .from("agent_subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_subscription_id", subscriptionId);

        if (error) {
          console.error("Webhook: failed to mark subscription past_due", error);
        }
      }

      break;
    }

    default:
      // Unhandled event type — acknowledge silently
      break;
  }

  return NextResponse.json({ received: true });
}
