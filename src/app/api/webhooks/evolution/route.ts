import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { EvolutionClient } from "@/lib/evolution";
import { FlowEngine } from "@/lib/flow-engine";

const WA_URL = process.env.EZFLOW_WA_URL || "http://evolution:8080";
const WA_KEY = process.env.EZFLOW_WA_KEY || process.env.EVOLUTION_API_KEY || "ezflow-master-key";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseWebhook(body);
    if (!parsed) {
      return NextResponse.json({ success: true, ignored: true });
    }

    const { phone, message, messageId, pushName } = parsed;
    console.log(`[WA-IN] ${phone}: "${message}" (${pushName || "?"})`);

    // Buscar todos os tenants ativos
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
    });

    if (tenants.length === 0) {
      return NextResponse.json({ success: false, error: "Nenhum tenant ativo" });
    }

    const evolutionClient = new EvolutionClient({
      baseUrl: WA_URL,
      apikey: WA_KEY,
      instance: "default",
    });

    let processed = false;

    for (const tenant of tenants) {
      // Sessão ativa para este tenant?
      const session = await prisma.flowSession.findFirst({
        where: {
          tenantId: tenant.id,
          customerPhone: phone,
          status: { in: ["active", "waiting_pix"] },
        },
      });

      if (session) {
        const result = await FlowEngine.processIncoming(phone, message, tenant.id, pushName, evolutionClient);
        // Só marca como processado se a sessão ainda está ativa ou waiting_pix
        // Se foi completada/timed_out, deixa cair no keyword match abaixo
        if (result.action !== "no_match" && result.session?.status !== "completed" && result.session?.status !== "timed_out") {
          await prisma.messageLog.create({
            data: {
              tenantId: tenant.id,
              sessionId: session.id,
              customerPhone: phone,
              direction: "inbound",
              type: "text",
              content: message,
              wamId: messageId,
              status: "received",
            },
          });
          processed = true;
          break;
        }
        console.log(`[WA-SESSION] old session closed, trying keyword match for "${message}"`);
      }
    }

    // Sem sessão: tenta keyword match
    if (!processed) {
      for (const tenant of tenants) {
        const result = await FlowEngine.processIncoming(phone, message, tenant.id, pushName, evolutionClient);

        if (result.action !== "no_match") {
          await prisma.messageLog.create({
            data: {
              tenantId: tenant.id,
              sessionId: result.session?.id || undefined,
              customerPhone: phone,
              direction: "inbound",
              type: "text",
              content: message,
              wamId: messageId,
              status: "received",
            },
          });
          processed = true;
          console.log(`[WA-FLOW] matched flow for ${phone}: "${message}"`);
          break;
        }
      }
    }

    if (!processed) {
      console.log(`[WA-NOMATCH] ${phone}: "${message}" — nenhum fluxo`);
    }

    return NextResponse.json({ success: true, processed });
  } catch (error: any) {
    console.error("[WA-ERR]", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 200 });
  }
}

function parseWebhook(body: any): { phone: string; message: string; messageId: string; pushName?: string } | null {
  try {
    if (body?.event !== "messages.upsert") return null;
    const msg = body?.data;
    if (!msg?.key?.remoteJid || msg.key.fromMe) return null;

    const phone = msg.key.remoteJid.replace(/@s\.whatsapp\.net$/, "");
    let message = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || "";

    return { phone, message, messageId: msg.key.id, pushName: msg.pushName };
  } catch {
    return null;
  }
}
