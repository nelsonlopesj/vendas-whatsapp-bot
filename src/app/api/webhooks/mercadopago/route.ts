import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { parseMercadoPagoWebhook } from "@/lib/mercadopago";
import { FlowEngine } from "@/lib/flow-engine";

/**
 * POST /api/webhooks/mercadopago
 * Recebe webhooks de confirmação de pagamento do Mercado Pago.
 *
 * O Mercado Pago envia notificações quando:
 * - payment.created (nova cobrança)
 * - payment.updated (status mudou, ex: approved)
 * - merchant_order (status do pedido)
 *
 * Formato: { action: "payment.updated", data: { id: "123456789" } }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Parse do webhook
    const parsed = parseMercadoPagoWebhook(body);
    if (!parsed) {
      return NextResponse.json({ success: true, ignored: true });
    }

    const { action, paymentId } = parsed;

    // Só processamos payment.updated e payment.created
    if (!action.includes("payment")) {
      return NextResponse.json({ success: true, ignored: true });
    }

    // Buscar venda pelo externalId
    const sale = await prisma.sale.findFirst({
      where: { externalId: paymentId },
      include: { tenant: true },
    });

    if (!sale) {
      console.log(`Sale not found for payment ${paymentId}`);
      return NextResponse.json({ success: false, error: "Venda não encontrada" });
    }

    // Processar pagamento
    const result = await FlowEngine.handlePixPayment(
      paymentId,
      sale.tenantId
    );

    return NextResponse.json({
      success: result.success,
      delivered: result.delivered,
    });
  } catch (error: any) {
    console.error("MercadoPago webhook error:", error);
    // Sempre retornar 200 para Mercado Pago não retentar
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 200 }
    );
  }
}
