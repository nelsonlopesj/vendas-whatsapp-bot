import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();
  if (!token || !password) return NextResponse.json({ error: "Token e senha obrigatórios" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Mínimo 8 caracteres" }, { status: 400 });

  const user = await prisma.user.findFirst({
    where: { resetToken: token, resetTokenExp: { gt: new Date() } },
  });

  if (!user) {
    return NextResponse.json({ error: "Token inválido ou expirado." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: await hash(password, 12),
      resetToken: null,
      resetTokenExp: null,
    },
  });

  return NextResponse.json({ message: "Senha alterada com sucesso!" });
}
