import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") || "";

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const tenantId = event.data?.object?.metadata?.tenantId;
        if (tenantId) {
          await prisma.tenant.update({
            where: { id: tenantId },
            data: { subscriptionStatus: "active", subscriptionEndsAt: null, trialEndsAt: null },
          });
          console.log(`[STRIPE] subscription activated for tenant ${tenantId}`);
        }
        break;
      }
      case "invoice.payment_failed": {
        // Renovação recusada: marca past_due (acesso bloqueado até regularizar)
        const customerId = event.data?.object?.customer;
        const tenant = await prisma.tenant.findFirst({
          where: { stripeCustomerId: customerId as string },
        });
        if (tenant) {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { subscriptionStatus: "past_due" },
          });
          console.log(`[STRIPE] past_due for tenant ${tenant.id}`);
        }
        break;
      }
      case "invoice.paid": {
        // Cobrança regularizada (retry após falha): volta para active
        const customerId = event.data?.object?.customer;
        const tenant = await prisma.tenant.findFirst({
          where: { stripeCustomerId: customerId as string },
        });
        if (tenant) {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { subscriptionStatus: "active", subscriptionEndsAt: null },
          });
          console.log(`[STRIPE] recovered to active for tenant ${tenant.id}`);
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data?.object;
        const customerId = sub?.customer;
        const tenant = await prisma.tenant.findFirst({
          where: { stripeCustomerId: customerId as string },
        });
        if (!tenant) break;
        // Cancelamento agendado (fim do período): mantém acesso até lá
        if (sub?.cancel_at_period_end) {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              subscriptionStatus: "active",
              subscriptionEndsAt: sub?.current_period_end
                ? new Date((sub.current_period_end as number) * 1000)
                : null,
            },
          });
          console.log(`[STRIPE] cancel_at_period_end for tenant ${tenant.id}`);
        } else if (sub?.status === "active") {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { subscriptionStatus: "active", subscriptionEndsAt: null },
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const customerId = event.data?.object?.customer;
        const tenant = await prisma.tenant.findFirst({
          where: { stripeCustomerId: customerId as string },
        });
        if (tenant) {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { subscriptionStatus: "cancelled", subscriptionEndsAt: new Date() },
          });
          console.log(`[STRIPE] subscription cancelled for tenant ${tenant.id}`);
        }
        break;
      }
    }
  } catch (err) {
    console.error("Stripe webhook error:", err);
    // 500 faz o Stripe reenviar o evento (o 200 anterior engolia falhas)
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
