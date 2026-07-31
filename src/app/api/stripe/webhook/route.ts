import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import prisma from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") || "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenantId;
        if (tenantId) {
          await prisma.tenant.update({
            where: { id: tenantId },
            data: {
              subscriptionStatus: "active",
              subscriptionEndsAt: null,
              trialEndsAt: null,
            },
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const tenant = await prisma.tenant.findFirst({ where: { stripeCustomerId: customerId } });
        if (tenant) {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { subscriptionStatus: "cancelled", subscriptionEndsAt: new Date() },
          });
        }
        break;
      }
    }
  } catch (err) {
    console.error("Stripe webhook error:", err);
  }

  return NextResponse.json({ received: true });
}
