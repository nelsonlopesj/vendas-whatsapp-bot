import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Listar fluxos
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const flows = await prisma.flow.findMany({
    where: { tenantId },
    include: {
      steps: { orderBy: { order: "asc" } },
      _count: { select: { sessions: true, sales: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ flows });
}

// Criar fluxo
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { name, triggerKeyword, triggerMode, steps } = await req.json();

    // Verificar assinatura
    const { canCreateFlow } = await import("@/lib/subscription");
    if (!(await canCreateFlow(tenantId))) {
      return NextResponse.json(
        { error: "Trial expirado ou limite de fluxos atingido. Assine para continuar." },
        { status: 402 }
      );
    }

    if (!name || !triggerKeyword) {
      return NextResponse.json(
        { error: "Nome e keyword são obrigatórios" },
        { status: 400 }
      );
    }

    // Criar flow com steps (sem nextStepId temporários)
    const flow = await prisma.flow.create({
      data: {
        tenantId,
        name,
        triggerKeyword: triggerKeyword.toLowerCase().trim(),
        triggerMode: triggerMode || "contains",
        steps: {
          create: (steps || []).map((step: any, index: number) => ({
            order: index + 1,
            type: step.type,
            label: step.label || step.type,
            config: step.config || {},
            productId: step.productId || null,
            // nextStepId temporário (UUID do frontend) — mapeamos depois
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

    // Atualizar nextStepId e altNextStepId com os IDs reais do banco
    for (let i = 0; i < (steps || []).length; i++) {
      const step = steps[i];
      const dbStep = flow.steps[i];
      if (!dbStep) continue;
      const nextId = step.nextStepId ? oldToNew[step.nextStepId] : null;
      const altId = step.altNextStepId ? oldToNew[step.altNextStepId] : null;
      if (nextId || altId || step.nextStepId || step.altNextStepId) {
        await prisma.flowStep.update({
          where: { id: dbStep.id },
          data: { nextStepId: nextId || null, altNextStepId: altId || null },
        });
      }
    }

    const updated = await prisma.flow.findUnique({
      where: { id: flow.id },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    return NextResponse.json({ flow: updated }, { status: 201 });
  } catch (error: any) {
    console.error("Flow create error:", error);
    return NextResponse.json(
      { error: "Erro ao criar fluxo" },
      { status: 500 }
    );
  }
}
