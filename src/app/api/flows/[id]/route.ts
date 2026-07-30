import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Buscar fluxo por ID
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const flow = await prisma.flow.findFirst({
    where: { id, tenantId },
    include: {
      steps: { orderBy: { order: "asc" } },
      _count: { select: { sessions: true, sales: true } },
    },
  });

  if (!flow) {
    return NextResponse.json(
      { error: "Fluxo não encontrado" },
      { status: 404 }
    );
  }

  return NextResponse.json({ flow });
}

// Atualizar fluxo
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  // Verificar ownership
  const existing = await prisma.flow.findFirst({
    where: { id, tenantId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Fluxo não encontrado" },
      { status: 404 }
    );
  }

  try {
    const { name, triggerKeyword, triggerMode, isActive, steps } =
      await req.json();

    // Delete old steps and recreate
    await prisma.flowStep.deleteMany({ where: { flowId: id } });

    const flow = await prisma.flow.update({
      where: { id },
      data: {
        name: name || existing.name,
        triggerKeyword: triggerKeyword || existing.triggerKeyword,
        triggerMode: triggerMode || existing.triggerMode,
        isActive: isActive !== undefined ? isActive : existing.isActive,
        steps: {
          create: (steps || []).map((step: any, index: number) => ({
            order: index + 1,
            type: step.type,
            label: step.label || step.type,
            config: step.config || {},
            productId: step.productId || null,
          })),
        },
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    // Mapear IDs antigos → novos para nextStepId/altNextStepId
    const oldToNew: Record<string, string> = {};
    (steps || []).forEach((s: any, i: number) => {
      if (s.id && flow.steps[i]) oldToNew[s.id] = flow.steps[i].id;
    });
    for (let i = 0; i < (steps || []).length; i++) {
      const s = steps[i];
      const db = flow.steps[i];
      if (!db) continue;
      const nextId = s.nextStepId ? oldToNew[s.nextStepId] || null : null;
      const altId = s.altNextStepId ? oldToNew[s.altNextStepId] || null : null;
      if (nextId || altId) {
        await prisma.flowStep.update({
          where: { id: db.id },
          data: { nextStepId: nextId, altNextStepId: altId },
        });
      }
    }

    const updated = await prisma.flow.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    return NextResponse.json({ flow: updated });
  } catch (error: any) {
    console.error("Flow update error:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar fluxo" },
      { status: 500 }
    );
  }
}

// Deletar fluxo
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.flow.findFirst({
    where: { id, tenantId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Fluxo não encontrado" },
      { status: 404 }
    );
  }

  // Deletar dados relacionados primeiro
  await prisma.flowSession.deleteMany({ where: { flowId: id } });
  await prisma.sale.updateMany({ where: { flowId: id }, data: { flowId: null } });
  await prisma.flowStep.deleteMany({ where: { flowId: id } });
  await prisma.flow.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
