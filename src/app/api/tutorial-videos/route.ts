import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Público: a página do tutorial (estática) lê esta lista em runtime.
// force-dynamic evita cache estático do build.
export const dynamic = "force-dynamic";

export async function GET() {
  const videos = await prisma.tutorialVideo.findMany({
    orderBy: { order: "asc" },
    select: { id: true, title: true, fileUrl: true, order: true },
  });
  return NextResponse.json({ videos });
}

// Somente master (owner): adiciona vídeo ao final da lista
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "owner") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { title, fileUrl } = await req.json().catch(() => ({}));
  if (!title?.trim() || !fileUrl?.trim()) {
    return NextResponse.json(
      { error: "Título e arquivo são obrigatórios" },
      { status: 400 }
    );
  }

  const last = await prisma.tutorialVideo.findFirst({
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const video = await prisma.tutorialVideo.create({
    data: {
      title: title.trim(),
      fileUrl: fileUrl.trim(),
      order: (last?.order ?? 0) + 1,
    },
  });

  return NextResponse.json({ video }, { status: 201 });
}
