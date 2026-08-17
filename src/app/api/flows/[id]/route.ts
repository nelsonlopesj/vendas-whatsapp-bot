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

    await prisma.flow.update({
      where: { id },
      data: {
        name: name || existing.name,
        triggerKeyword: triggerKeyword || existing.triggerKeyword,
        triggerMode: triggerMode || existing.triggerMode,
        isActive: isActive !== undefined ? isActive : existing.isActive,
      },
    });

    // Só mexe nos steps quando o payload os inclui —
    // o toggle de isActive na listagem envia apenas { isActive } e
    // NUNCA pode apagar os passos existentes.
    if (!Array.isArray(steps)) {
      const unchanged = await prisma.flow.findUnique({
        where: { id },
        include: { steps: { orderBy: { order: "asc" } } },
      });
      return NextResponse.json({ flow: unchanged });
    }

    // Update-in-place: preserva os IDs dos steps existentes (sessões em voo
    // mantêm currentStepId válido); cria os novos; deleta os removidos.
    const incoming = steps as any[];
    const existingSteps = await prisma.flowStep.findMany({
      where: { flowId: id },
    });
    const existingById = new Map(existingSteps.map((s) => [s.id, s]));

    // Deletar steps removidos
    const incomingIds = new Set(incoming.map((s: any) => s.id));
    const toDelete = existingSteps.filter((s) => !incomingIds.has(s.id));
    if (toDelete.length > 0) {
      await prisma.flowStep.deleteMany({
        where: { id: { in: toDelete.map((s) => s.id) } },
      });
    }

    // Upsert por step + mapa id-de-entrada → id-do-banco
    const entryToDb: Record<string, string> = {};
    for (let i = 0; i < incoming.length; i++) {
      const s = incoming[i];
      const data = {
        order: i + 1,
        type: s.type,
        label: s.label || s.type,
        config: s.config || {},
        productId: s.productId || null,
        positionX: typeof s.positionX === "number" ? s.positionX : null,
        positionY: typeof s.positionY === "number" ? s.positionY : null,
      };
      if (s.id && existingById.has(s.id)) {
        await prisma.flowStep.update({ where: { id: s.id }, data });
        entryToDb[s.id] = s.id;
      } else {
        const created = await prisma.flowStep.create({
          data: { ...data, flowId: id },
        });
        if (s.id) entryToDb[s.id] = created.id;
      }
    }

    // Remapear nextStepId/altNextStepId/arestas para os IDs do banco
    for (const s of incoming) {
      const dbId = entryToDb[s.id];
      if (!dbId) continue;
      const nextId = s.nextStepId ? entryToDb[s.nextStepId] || null : null;
      const altId = s.altNextStepId ? entryToDb[s.altNextStepId] || null : null;
      const rawEdges = Array.isArray(s.config?.outgoingEdges)
        ? (s.config.outgoingEdges as any[])
        : [];
      const remappedEdges = rawEdges.map((e: any) => ({
        ...e,
        targetStepId: e.targetStepId ? entryToDb[e.targetStepId] || null : null,
      }));
      await prisma.flowStep.update({
        where: { id: dbId },
        data: {
          nextStepId: nextId,
          altNextStepId: altId,
          ...(remappedEdges.length > 0
            ? { config: { ...(s.config || {}), outgoingEdges: remappedEdges } }
            : {}),
        },
      });
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
