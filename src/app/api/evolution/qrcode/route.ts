import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Config global da Evolution (servidor, não visível ao cliente)
const EVOLUTION_URL =
  process.env.EVOLUTION_API_URL || "http://evolution:8080";
const EVOLUTION_API_KEY =
  process.env.EVOLUTION_API_KEY || "ezflow-master-key";

export async function GET() {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant não encontrado" }, { status: 400 });
  }

  try {
    // Cada tenant tem sua própria instância na Evolution API
    const instance = `tenant-${tenant.slug}`;
    const baseUrl = EVOLUTION_URL.replace(/\/$/, "");

    // 1. Criar instância (idempotente)
    await fetch(`${baseUrl}/instance/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        instanceName: instance,
        token: EVOLUTION_API_KEY,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });

    // 2. Verificar se já está conectado
    const statusRes = await fetch(
      `${baseUrl}/instance/connectionState/${instance}`,
      { headers: { apikey: EVOLUTION_API_KEY } }
    );
    const statusData = await statusRes.json();

    if (statusData?.instance?.state === "open") {
      return NextResponse.json({
        connected: true,
        state: "open",
        qrcode: null,
      });
    }

    // 3. Buscar QR Code
    const qrRes = await fetch(
      `${baseUrl}/instance/connect/${instance}`,
      { headers: { apikey: EVOLUTION_API_KEY } }
    );

    if (!qrRes.ok) {
      return NextResponse.json({
        connected: false,
        state: statusData?.instance?.state || "disconnected",
        qrcode: null,
        error: `Status: ${qrRes.status}. Tente novamente.`,
      });
    }

    const qrData = await qrRes.json();

    return NextResponse.json({
      connected: false,
      state: "qrcode",
      qrcode: qrData?.base64 || qrData?.qrcode || qrData?.qr_code || null,
    });
  } catch (error: any) {
    console.error("QR Code error:", error.message);
    return NextResponse.json(
      { error: "Evolution API indisponível. O serviço está iniciando..." },
      { status: 200 } // 200 pra não quebrar o frontend
    );
  }
}
