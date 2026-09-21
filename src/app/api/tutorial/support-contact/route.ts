import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Público no acesso, mas o CONTATO só é retornado para assinantes Pro.
// A página estática do tutorial (public/tutorial.html) consulta em runtime;
// o fetch same-origin envia o cookie de sessão. O número do WhatsApp NÃO
// fica no HTML público — só é devolvido aqui, para quem tem sessão Pro.
// force-dynamic evita cache estático do build.
export const dynamic = "force-dynamic";

const WA_LINK =
  "https://wa.me/5511952482267?text=" +
  encodeURIComponent("Olá! Preciso de ajuda com a EZFlow.");
const WA_LABEL = "(11) 95248-2267";

export async function GET() {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ pro: false });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const status = tenant?.subscriptionStatus || "trial";
  // "Pro" = assinatura vigente (ativa ou em regularização) — mesma regra da aba Suporte
  const isPro = status === "active" || status === "past_due";

  if (!isPro) {
    return NextResponse.json({ pro: false });
  }

  return NextResponse.json({ pro: true, waLink: WA_LINK, waLabel: WA_LABEL });
}
