import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const tenantId = (session?.user as any)?.tenantId;
  if (role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  // Período: últimos 7 dias
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const where = tenantId ? { tenantId, createdAt: { gte: since } } : { createdAt: { gte: since } };

  // Total de mensagens inbound (visitantes únicos)
  const visitors = await prisma.messageLog.findMany({
    where: { direction: "inbound", createdAt: { gte: since } },
    select: { customerPhone: true },
    distinct: ["customerPhone"],
  });

  // Sessões criadas
  const sessionsCreated = await prisma.flowSession.count({
    where: { ...where },
  });

  // Chegaram ao PIX (waiting_pix)
  const reachedPix = await prisma.flowSession.count({
    where: { ...where, status: "waiting_pix" },
  });

  // Pagaram
  const paid = await prisma.sale.count({
    where: { ...where, status: "PAID" },
  });

  // Por fluxo
  const byFlow = await prisma.flow.findMany({
    where: tenantId ? { tenantId } : {},
    select: {
      id: true,
      name: true,
      _count: { select: { sessions: true } },
    },
  });

  const flowStats = await Promise.all(
    byFlow.map(async (f) => {
      const pixCount = await prisma.flowSession.count({
        where: { flowId: f.id, status: "waiting_pix", createdAt: { gte: since } },
      });
      const paidCount = await prisma.sale.count({
        where: { flowId: f.id, status: "PAID", createdAt: { gte: since } },
      });
      return {
        name: f.name,
        sessions: f._count.sessions,
        reachedPix: pixCount,
        paid: paidCount,
      };
    })
  );

  // Receita
  const revenue = await prisma.sale.aggregate({
    where: { ...where, status: "PAID" },
    _sum: { amount: true },
  });

  return NextResponse.json({
    visitors: visitors.length,
    sessionsCreated,
    reachedPix,
    paid,
    revenue: revenue._sum.amount || 0,
    byFlow: flowStats,
  });
}
