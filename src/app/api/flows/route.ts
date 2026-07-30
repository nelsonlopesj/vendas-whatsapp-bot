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

    if (!name || !triggerKeyword) {
      return NextResponse.json(
        { error: "Nome e keyword são obrigatórios" },
        { status: 400 }
      );
    }

    const flow = await prisma.flow.create({
      data: {
        tenantId,
        name,
        triggerKeyword: triggerKeyword.toLowerCase().trim(),
        triggerMode: triggerMode || "contains",
        steps: {
          create: (steps || []).map(
            (step: any, index: number) => ({
              order: index + 1,
              type: step.type,
              label: step.label || step.type,
              config: step.config || {},
              productId: step.productId || null,
              nextStepId: step.nextStepId || null,
              altNextStepId: step.altNextStepId || null,
            })
          ),
        },
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    return NextResponse.json({ flow }, { status: 201 });
  } catch (error: any) {
    console.error("Flow create error:", error);
    return NextResponse.json(
      { error: "Erro ao criar fluxo" },
      { status: 500 }
    );
  }
}
