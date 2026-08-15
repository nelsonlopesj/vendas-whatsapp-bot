import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { FlowEngine } from "@/lib/flow-engine";

/**
 * POST /api/webhooks/infinitepay
 * Recebe webhooks do Checkout Integrado da InfinitePay.
 *
 * A URL é enviada por link no POST /links (webhook_url). Quando o pagamento
 * é aprovado, a InfinitePay envia:
 * {
 *   "invoice_slug": "...", "amount": 1000, "paid_amount": 1010,
 *   "installments": 1, "capture_method": "pix" | "credit_card",
 *   "transaction_nsu": "UUID", "order_nsu": "<nosso orderNsu>",
 *   "receipt_url": "...", "items": [...]
 * }
 *
 * Regra da InfinitePay: responder 200 rápido (menos de 1s) = tudo certo;
 * 400 = eles retentam.
 *
 * Segurança: o corpo NUNCA é confiado como prova — handlePixPayment
 * re-valida via payment_check com transaction_nsu + slug.
 */
export async function POST(req: NextRequest) {
  const start = Date.now();
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: true, ignored: true });
    }

    const orderNsu =
      body?.order_nsu || body?.orderNsu || body?.data?.order_nsu || "";
    const transactionNsu =
      body?.transaction_nsu ||
      body?.transactionNsu ||
      body?.data?.transaction_nsu ||
      "";
    const slug = body?.invoice_slug || body?.slug || body?.data?.invoice_slug || "";

    if (!orderNsu) {
      console.log("[INFINITEPAY-WEBHOOK] no order_nsu in payload");
      return NextResponse.json({ success: true, ignored: true });
    }

    // Venda casada pelo order_nsu (externalId)
    const sale = await prisma.sale.findFirst({
      where: { externalId: orderNsu },
      include: { tenant: true },
    });

    if (!sale) {
      console.log(`Sale not found for order_nsu ${orderNsu}`);
      return NextResponse.json({ success: false, error: "Venda não encontrada" });
    }

    // Re-valida com a API da InfinitePay e entrega se confirmado
    const result = await FlowEngine.handlePixPayment(orderNsu, sale.tenantId, {
      transactionNsu,
      slug,
    });

    console.log(
      `[INFINITEPAY-WEBHOOK] order=${orderNsu} success=${result.success} delivered=${result.delivered} ms=${Date.now() - start}`
    );

    return NextResponse.json({
      success: result.success,
      delivered: result.delivered,
    });
  } catch (error: any) {
    console.error("InfinitePay webhook error:", error);
    // 200 para não gerar retries indevidos em erros nossos
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 200 }
    );
  }
}
