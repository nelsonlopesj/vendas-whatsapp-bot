import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { FlowEngine } from "@/lib/flow-engine";

/**
 * POST /api/webhooks/pagbank
 * Recebe notificações do PagBank (configuradas via notification_urls na
 * criação do pedido/checkout). O payload é o mesmo formato da resposta
 * síncrona (order completa com charges[0].status = "PAID" para PIX).
 *
 * Casamento da venda: por `id` do pedido (externalId) com fallback por
 * `reference_id` (linkRef dos checkouts). A confirmação é SEMPRE revalidada
 * no PagBank pelo handlePixPayment (o corpo nunca é confiado como prova).
 * Responde 200 rápido sempre.
 */
export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: true, ignored: true });
    }

    const orderId = body?.id || body?.data?.id || "";
    const referenceId = body?.reference_id || body?.data?.reference_id || "";
    if (!orderId && !referenceId) {
      console.log("[PAGBANK-WEBHOOK] no id/reference_id in payload");
      return NextResponse.json({ success: true, ignored: true });
    }

    // Casa a venda pelo id do pedido (externalId) ou pela reference_id (link)
    let sale = null;
    if (orderId) {
      sale = await prisma.sale.findFirst({
        where: { externalId: orderId },
        include: { tenant: true },
      });
    }
    if (!sale && referenceId) {
      sale = await prisma.sale.findFirst({
        where: {
          metadata: { path: ["linkRef"], equals: referenceId },
        },
        include: { tenant: true },
      });
      if (sale) {
        console.log(`[PAGBANK-WEBHOOK] matched sale via linkRef ${referenceId}`);
      }
    }

    if (!sale?.externalId) {
      console.log(`[PAGBANK-WEBHOOK] sale not found (order=${orderId} ref=${referenceId})`);
      return NextResponse.json({ success: false, error: "Venda não encontrada" });
    }

    // Revalida no PagBank e entrega se confirmado
    const result = await FlowEngine.handlePixPayment(sale.externalId, sale.tenantId);

    console.log(
      `[PAGBANK-WEBHOOK] order=${orderId} success=${result.success} delivered=${result.delivered}`
    );
    return NextResponse.json({
      success: result.success,
      delivered: result.delivered,
    });
  } catch (error: any) {
    console.error("PagBank webhook error:", error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 200 }
    );
  }
}
