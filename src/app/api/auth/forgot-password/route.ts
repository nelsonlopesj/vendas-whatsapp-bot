import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email obrigatório" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Não revelar se o email existe ou não
    return NextResponse.json({ message: "Se o email existir, um link de recuperação será enviado." });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: token, resetTokenExp: expires },
  });

  const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;

  // O link NUNCA pode voltar na resposta (takeover de conta). Em produção,
  // envie por email. Por enquanto, o link fica só no log do servidor.
  console.log(`[PASSWORD-RESET] ${user.email}: ${resetUrl}`);

  return NextResponse.json({
    message: "Se o email existir, um link de recuperação será enviado.",
  });
}
