import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const WA_URL = process.env.EZFLOW_WA_URL || "http://evolution:8080";
const WA_KEY = process.env.EZFLOW_WA_KEY || process.env.EVOLUTION_API_KEY || "ezflow-master-key";

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
    const instance = `tenant-${tenant.slug}`;
    const baseUrl = WA_URL.replace(/\/$/, "");

    // Criar instância (idempotente)
    await fetch(`${baseUrl}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: WA_KEY },
      body: JSON.stringify({
        instanceName: instance,
        token: WA_KEY,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });

    // Verificar se já está conectado
    const statusRes = await fetch(
      `${baseUrl}/instance/connectionState/${instance}`,
      { headers: { apikey: WA_KEY } }
    );
    const statusData = await statusRes.json();

    if (statusData?.instance?.state === "open") {
      return NextResponse.json({ connected: true, state: "open", qrcode: null });
    }

    // Buscar QR Code
    const qrRes = await fetch(`${baseUrl}/instance/connect/${instance}`, {
      headers: { apikey: WA_KEY },
    });

    if (!qrRes.ok) {
      return NextResponse.json({
        connected: false,
        state: statusData?.instance?.state || "disconnected",
        qrcode: null,
        error: "Não foi possível gerar o QR Code. Tente novamente.",
      });
    }

    const qrData = await qrRes.json();
    // Evolution retorna base64 com prefixo "data:image/png;base64,..."
    const raw = qrData?.base64 || qrData?.qrcode || qrData?.qr_code || null;
    // Remove prefixo duplicado se já vier com data URI
    const qrcode = raw ? raw.replace(/^data:image\/\w+;base64,/, "") : null;

    return NextResponse.json({ connected: false, state: "qrcode", qrcode });
  } catch (error: any) {
    console.error("WA connect error:", error.message);
    return NextResponse.json(
      { error: "Serviço de conexão indisponível. Tente novamente em instantes." },
      { status: 200 }
    );
  }
}
