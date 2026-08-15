import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { FlowEngine } from "@/lib/flow-engine";

/**
 * POST /api/webhooks/infinitepay
 * Recebe webhooks de confirmação de pagamento da InfinitePay.
 *
 * A InfinitePay permite configurar um webhook no painel (API → Webhooks).
 * O formato exato do payload varia; este handler extrai o id da transação
 * de forma defensiva (JSON:API ou flat) e SEMPRE re-valida o status
 * diretamente na API da InfinitePay — o corpo do webhook nunca é confiado
 * como prova de pagamento (handlePixPayment consulta o gateway).
 *
 * Sempre responde 200 para evitar retries desnecessários.
 */
export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Corpo vazio ou não-JSON: nada a processar
      return NextResponse.json({ success: true, ignored: true });
    }

    // Extração defensiva do id da transação
    const candidates = [
      body?.id,
      body?.transaction_id,
      body?.transactionId,
      body?.data?.id,
      body?.data?.transaction_id,
      body?.data?.transactionId,
      body?.data?.attributes?.id,
      body?.event?.data?.id,
    ];
    const paymentId = candidates.find(
      (v) => typeof v === "string" && v.length > 0
    );

    if (!paymentId) {
      console.log("[INFINITEPAY-WEBHOOK] no transaction id found in payload");
      return NextResponse.json({ success: true, ignored: true });
    }

    // Buscar venda pelo externalId (igual ao webhook do Mercado Pago)
    const sale = await prisma.sale.findFirst({
      where: { externalId: paymentId },
      include: { tenant: true },
    });

    if (!sale) {
      console.log(`Sale not found for payment ${paymentId}`);
      return NextResponse.json({ success: false, error: "Venda não encontrada" });
    }

    // Processar pagamento (re-valida status no gateway)
    const result = await FlowEngine.handlePixPayment(paymentId, sale.tenantId);

    return NextResponse.json({
      success: result.success,
      delivered: result.delivered,
    });
  } catch (error: any) {
    console.error("InfinitePay webhook error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 200 }
    );
  }
}
