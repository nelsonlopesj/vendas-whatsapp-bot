import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "50");

  const where: any = { tenantId };
  if (status) where.status = status;

  const sales = await prisma.sale.findMany({
    where,
    include: { product: true, flow: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });

  const total = await prisma.sale.count({ where });
  const revenue = await prisma.sale.aggregate({
    where: { ...where, status: "PAID" },
    _sum: { amount: true },
  });

  return NextResponse.json({
    sales,
    total,
    revenue: revenue._sum.amount || 0,
  });
}
