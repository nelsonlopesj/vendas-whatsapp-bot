import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/evolution/qrcode
 * Busca o QR Code da Evolution API para conectar o WhatsApp.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant?.evolutionUrl || !tenant?.evolutionApikey) {
    return NextResponse.json(
      { error: "Evolution API não configurada" },
      { status: 400 }
    );
  }

  try {
    const instance = "default";
    const baseUrl = tenant.evolutionUrl.replace(/\/$/, "");

    // 1. Tentar criar instância (idempotente — se já existe, só retorna)
    await fetch(`${baseUrl}/instance/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: tenant.evolutionApikey,
      },
      body: JSON.stringify({
        instanceName: instance,
        token: tenant.evolutionApikey,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });

    // 2. Buscar QR Code
    const qrRes = await fetch(
      `${baseUrl}/instance/connect/${instance}`,
      {
        headers: { apikey: tenant.evolutionApikey },
      }
    );

    if (!qrRes.ok) {
      // Pode já estar conectado
      const statusRes = await fetch(
        `${baseUrl}/instance/connectionState/${instance}`,
        {
          headers: { apikey: tenant.evolutionApikey },
        }
      );
      const statusData = await statusRes.json();

      return NextResponse.json({
        connected: statusData?.instance?.state === "open",
        state: statusData?.instance?.state || "unknown",
        qrcode: null,
      });
    }

    const qrData = await qrRes.json();

    return NextResponse.json({
      connected: false,
      state: "qrcode",
      qrcode: qrData?.qrcode || qrData?.qr_code || null,
      // Evolution API v2 retorna { qrcode: "base64..." } ou { qr_code: "..." }
    });
  } catch (error: any) {
    console.error("Evolution QR Code error:", error);
    return NextResponse.json(
      { error: "Erro ao conectar à Evolution API. Verifique a URL." },
      { status: 500 }
    );
  }
}
