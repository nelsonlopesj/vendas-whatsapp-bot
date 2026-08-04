import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET — Lista sessões ativas/travadas (auto-marca expiradas)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  const action = req.nextUrl.searchParams.get("action");

  // Logs de uma sessão específica
  if (sessionId && action === "logs") {
    const logs = await prisma.messageLog.findMany({
      where: { sessionId },
      select: { direction: true, type: true, content: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    return NextResponse.json({ logs });
  }

  const status = req.nextUrl.searchParams.get("status") || "active,waiting_pix,timed_out,failed";

  // Auto-marcar expiradas antes de listar
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  // Sessões active com +24h → timed_out
  await prisma.flowSession.updateMany({
    where: { status: "active", lastActivityAt: { lt: dayAgo }, ...(tenantId ? { tenantId } : {}) },
    data: { status: "timed_out", failureReason: "auto_expired", completedAt: now },
  });

  // Sessões waiting_pix com +6h → timed_out
  await prisma.flowSession.updateMany({
    where: { status: "waiting_pix", lastActivityAt: { lt: sixHoursAgo }, ...(tenantId ? { tenantId } : {}) },
    data: { status: "timed_out", failureReason: "auto_expired_pix", completedAt: now },
  });

  const where: any = {
    status: { in: status.split(",") },
    ...(tenantId ? { tenantId } : {}),
  };

  const sessions = await prisma.flowSession.findMany({
    where,
    include: { flow: { select: { name: true } } },
    orderBy: { lastActivityAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ sessions });
}

// POST — Reseta/fecha sessões travadas
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { sessionId, action, tenantId } = await req.json();

  // action: "close" | "close_all_stuck" | "close_all"
  if (action === "close" && sessionId) {
    await prisma.flowSession.update({
      where: { id: sessionId },
      data: { status: "failed", failureReason: "admin_reset", completedAt: new Date() },
    });
    return NextResponse.json({ success: true, closed: 1 });
  }

  if (action === "close_all_stuck") {
    // Fecha sessões active com mais de 1h sem atividade
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const result = await prisma.flowSession.updateMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: "active",
        lastActivityAt: { lt: oneHourAgo },
      },
      data: { status: "timed_out", failureReason: "admin_reset", completedAt: new Date() },
    });
    return NextResponse.json({ success: true, closed: result.count });
  }

  if (action === "retry_delivery" && sessionId) {
    const { FlowEngine } = await import("@/lib/flow-engine");
    const sale = await prisma.sale.findFirst({ where: { sessionId, status: "PAID", deliveryStatus: { not: "sent" } } });
    if (!sale?.externalId) return NextResponse.json({ error: "No pending PAID sale found" }, { status: 404 });
    await prisma.sale.updateMany({ where: { id: sale.id }, data: { deliveryStatus: null } });
    const result = await FlowEngine.handlePixPayment(sale.externalId, sale.tenantId);
    return NextResponse.json({ success: result.delivered, ...result });
  }

  if (action === "close_all_expired") {
    // Limpa sessões já marcadas como timed_out (expiradas automaticamente)
    const result = await prisma.flowSession.updateMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: "timed_out",
        failureReason: { in: ["auto_expired", "auto_expired_pix"] },
      },
      data: { status: "expired", completedAt: new Date() },
    });
    return NextResponse.json({ success: true, closed: result.count });
  }

  if (action === "close_all") {
    const result = await prisma.flowSession.updateMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: { in: ["active", "waiting_pix"] },
      },
      data: { status: "failed", failureReason: "admin_reset", completedAt: new Date() },
    });
    return NextResponse.json({ success: true, closed: result.count });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
