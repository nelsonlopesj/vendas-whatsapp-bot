import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

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
  const existing = await prisma.product.findFirst({ where: { id, tenantId } });
  if (!existing) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }

  const { name, keyword, price, description, fileUrl, extraFiles } = await req.json();
  const updated = await prisma.product.update({
    where: { id },
    data: {
      name: name || existing.name,
      keyword: keyword || existing.keyword,
      price: price !== undefined ? price : existing.price,
      description: description !== undefined ? description : existing.description,
      fileUrl: fileUrl !== undefined ? fileUrl : existing.fileUrl,
      extraFiles: extraFiles !== undefined ? extraFiles : existing.extraFiles,
    },
  });

  return NextResponse.json({ product: updated });
}

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
  const existing = await prisma.product.findFirst({ where: { id, tenantId } });
  if (!existing) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }

  // Verificar se tem vendas — impedir delete se tiver
  const salesCount = await prisma.sale.count({ where: { productId: id } });
  if (salesCount > 0) {
    return NextResponse.json({ error: `Este produto tem ${salesCount} venda(s). Remova as vendas primeiro ou desative o produto.` }, { status: 400 });
  }
  await prisma.flowStep.updateMany({ where: { productId: id }, data: { productId: null } });
  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
