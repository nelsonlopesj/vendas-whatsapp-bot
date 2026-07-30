import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const WA_URL = process.env.EZFLOW_WA_URL || "http://evolution:8080";
const WA_KEY = process.env.EZFLOW_WA_KEY || process.env.EVOLUTION_API_KEY || "ezflow-master-key";

// Fetch com timeout de 5 segundos
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const instance = "default";
    const baseUrl = WA_URL.replace(/\/$/, "");

    // 1. Verificar status
    try {
      const statusRes = await fetchWithTimeout(
        `${baseUrl}/instance/connectionState/${instance}`,
        { headers: { apikey: WA_KEY } },
        3000
      );
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const state = statusData?.instance?.state;
        if (state === "open") {
          return NextResponse.json({ connected: true, state: "open", qrcode: null });
        }
        // Se tá travado em "connecting", deleta pra recriar limpo
        if (state === "connecting") {
          try { await fetchWithTimeout(`${baseUrl}/instance/delete/${instance}`, { method: "DELETE", headers: { apikey: WA_KEY } }, 3000); } catch {}
        }
      }
    } catch {
      // Evolution pode estar iniciando
    }

    // 2. Criar instância
    try {
      await fetchWithTimeout(
        `${baseUrl}/instance/create`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: WA_KEY },
          body: JSON.stringify({ instanceName: instance, token: WA_KEY, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
        },
        5000
      );
    } catch {}

    // 3. Buscar QR Code
    try {
      const qrRes = await fetchWithTimeout(
        `${baseUrl}/instance/connect/${instance}`,
        { headers: { apikey: WA_KEY } },
        5000
      );
      if (qrRes.ok) {
        const qrData = await qrRes.json();
        const raw = qrData?.base64 || qrData?.qrcode || qrData?.qr_code || null;
        const qrcode = raw ? raw.replace(/^data:image\/\w+;base64,/, "") : null;
        if (qrcode) {
          return NextResponse.json({ connected: false, state: "qrcode", qrcode });
        }
      }
    } catch {}

    // 4. Evolution está iniciando
    return NextResponse.json({
      connected: false,
      state: "starting",
      qrcode: null,
      error: "O serviço está iniciando. Aguarde alguns segundos...",
    });
  } catch (error: any) {
    console.error("WA error:", error.message);
    return NextResponse.json(
      { connected: false, state: "error", qrcode: null, error: "Serviço indisponível. Tente novamente." },
      { status: 200 }
    );
  }
}
