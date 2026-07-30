import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { whatsappNumber, evolutionUrl, evolutionApikey, mercadopagoToken } =
      await req.json();

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        whatsappNumber,
        evolutionUrl,
        evolutionApikey,
        mercadopagoToken,
      },
    });

    return NextResponse.json({ tenant });
  } catch (error) {
    console.error("Settings update error:", error);
    return NextResponse.json(
      { error: "Erro ao salvar configurações" },
      { status: 500 }
    );
  }
}
