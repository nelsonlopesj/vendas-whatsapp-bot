import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * POST /api/stripe/portal — abre o Customer Portal do Stripe para o cliente
 * gerenciar/cancelar a própria assinatura ("Cancele quando quiser").
 */
export async function POST(req: NextRequest) {
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant?.stripeCustomerId) {
    return NextResponse.json(
      { error: "Nenhuma assinatura encontrada para gerenciar." },
      { status: 400 }
    );
  }

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${process.env.NEXTAUTH_URL}/dashboard`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err: any) {
    console.error("[STRIPE] portal error:", err.message);
    return NextResponse.json(
      { error: "Portal indisponível. Contate o suporte." },
      { status: 500 }
    );
  }
}
