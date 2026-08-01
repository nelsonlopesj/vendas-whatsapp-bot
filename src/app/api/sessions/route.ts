import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET — Lista sessões ativas/travadas
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  const status = req.nextUrl.searchParams.get("status") || "active,waiting_pix";

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
