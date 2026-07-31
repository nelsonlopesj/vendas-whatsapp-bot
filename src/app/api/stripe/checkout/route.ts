import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  const userEmail = session?.user?.email || "";
  if (!tenantId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  // Criar ou reusar customer Stripe
  let customerId = tenant?.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: userEmail, metadata: { tenantId } });
    customerId = customer.id;
    await prisma.tenant.update({ where: { id: tenantId }, data: { stripeCustomerId: customerId } });
  }

  const priceId = process.env.STRIPE_PRICE_ID || "price_xxx"; // Criar no dashboard Stripe
  const checkout = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXTAUTH_URL}/dashboard?subscribed=true`,
    cancel_url: `${process.env.NEXTAUTH_URL}/dashboard?cancelled=true`,
    metadata: { tenantId },
  });

  return NextResponse.json({ url: checkout.url });
}
