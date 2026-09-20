import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

function isOwner(session: any): boolean {
  return (session?.user as any)?.role === "owner";
}

// Somente master (owner): atualiza título/arquivo/ordem
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!isOwner(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Record<string, any> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.fileUrl === "string" && body.fileUrl.trim()) data.fileUrl = body.fileUrl.trim();
  if (typeof body.order === "number") data.order = body.order;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  const video = await prisma.tutorialVideo.update({ where: { id }, data });
  return NextResponse.json({ video });
}

// Somente master (owner): remove vídeo
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!isOwner(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.tutorialVideo.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
