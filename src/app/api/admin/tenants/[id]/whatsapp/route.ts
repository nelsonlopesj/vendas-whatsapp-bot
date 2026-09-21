import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Owner-only: atualiza o WhatsApp de contato do cliente (tenant)
// — preenche quem entrou pelo Google (cadastro manual já coleta no registro)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "owner") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const digits = String(body.whatsappNumber || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) {
    return NextResponse.json(
      { error: "Número inválido — use DDD + número (ex: 5531999999999)" },
      { status: 400 }
    );
  }

  await prisma.tenant.update({
    where: { id },
    data: { whatsappNumber: digits },
  });

  return NextResponse.json({ ok: true, whatsappNumber: digits });
}
