import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { parseEvolutionWebhook, EvolutionClient } from "@/lib/evolution";
import { FlowEngine } from "@/lib/flow-engine";
import { flowInboundQueue } from "@/lib/queue";

/**
 * POST /api/webhooks/evolution
 * Recebe webhooks da Evolution API quando novas mensagens chegam no WhatsApp.
 *
 * A Evolution API envia:
 * {
 *   event: "messages.upsert",
 *   instance: "default",
 *   data: { key: {...}, message: {...}, pushName: "...", messageType: "..." }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Parse do webhook
    const parsed = parseEvolutionWebhook(body);
    if (!parsed) {
      return NextResponse.json({ success: true, ignored: true });
    }

    const { phone, message, messageId, pushName, instance } = parsed;
    console.log(`[WA-IN] ${phone}: "${message}" (${pushName || "desconhecido"})`);

    // Buscar tenant pela instância da Evolution
    // Assumimos que instance name == tenant slug ou fazemos mapeamento via URL
    const instanceName = instance || body.instance || "default";

    // Buscar todos os tenants ativos (no MVP, processa contra todos que têm Evolution configurada)
    const tenants = await prisma.tenant.findMany({
      where: {
        isActive: true,
        evolutionUrl: { not: null },
        evolutionApikey: { not: null },
      },
    });

    if (tenants.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Nenhum tenant com Evolution configurado",
      });
    }

    // Para cada tenant, verificar se a mensagem matcha algum fluxo
    // No MVP, processamos serialmente. Em produção: fila BullMQ.
    let processed = false;

    for (const tenant of tenants) {
      // Verificar se já existe sessão ativa para este tenant+phone
      const existingSession = await prisma.flowSession.findFirst({
        where: {
          tenantId: tenant.id,
          customerPhone: phone,
          status: { in: ["active", "waiting_pix"] },
        },
      });

      if (existingSession) {
        // Processar nesta sessão
        const evolutionClient = new EvolutionClient({
          baseUrl: tenant.evolutionUrl!,
          apikey: tenant.evolutionApikey!,
          instance: instanceName,
        });

        await FlowEngine.processIncoming(
          phone,
          message,
          tenant.id,
          pushName,
          evolutionClient
        );

        // Log da mensagem
        await prisma.messageLog.create({
          data: {
            tenantId: tenant.id,
            sessionId: existingSession.id,
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
    }

    // Se não encontrou sessão ativa, tentar match de keyword
    if (!processed) {
      for (const tenant of tenants) {
        const evolutionClient = new EvolutionClient({
          baseUrl: tenant.evolutionUrl!,
          apikey: tenant.evolutionApikey!,
          instance: instanceName,
        });

        const result = await FlowEngine.processIncoming(
          phone,
          message,
          tenant.id,
          pushName,
          evolutionClient
        );

        if (result.action !== "no_match") {
          // Log da mensagem
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
          break;
        }
      }
    }

    if (!processed) {
      console.log(
        `No matching flow found for message "${message}" from ${phone}`
      );
    }

    return NextResponse.json({ success: true, processed });
  } catch (error: any) {
    console.error("Evolution webhook error:", error);
    // Sempre retornar 200 para Evolution não retentar
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 200 }
    );
  }
}
