import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Listar produtos
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const products = await prisma.product.findMany({
    where: { tenantId },
    include: { _count: { select: { sales: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ products });
}

// Criar produto
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  const userId = (session?.user as any)?.id || session?.user?.email;
  if (!tenantId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Buscar user ID do tenant
  const user = await prisma.user.findFirst({
    where: { tenantId, email: session?.user?.email || "" },
  });
  if (!user) {
    return NextResponse.json(
      { error: "Usuário não encontrado" },
      { status: 400 }
    );
  }

  try {
    const { name, keyword, price, description, fileUrl, fileType, fileSize, extraFiles } =
      await req.json();

    if (!name || !keyword || price === undefined) {
      return NextResponse.json(
        { error: "Nome, keyword e preço são obrigatórios" },
        { status: 400 }
      );
    }

    const product = await prisma.product.create({
      data: {
        tenantId,
        userId: user.id,
        name,
        keyword: keyword.toLowerCase().trim(),
        price,
        description: description || null,
        fileUrl: fileUrl || "",
        extraFiles: extraFiles || [],
        fileType: fileType || null,
        fileSize: fileSize || null,
      },
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error: any) {
    console.error("Product create error:", error);
    return NextResponse.json(
      { error: "Erro ao criar produto" },
      { status: 500 }
    );
  }
}
