/**
 * InfinitePay Client — Checkout Integrado (links de pagamento)
 *
 * Integração real da InfinitePay (validada em 2026-08-15):
 * - NÃO usa API key/token — identifica a conta pela InfiniteTag (handle, sem o $)
 * - POST https://api.checkout.infinitepay.io/links → cria link de pagamento
 *   payload: { handle, items:[{quantity, price(centavos), description}],
 *              order_nsu?, redirect_url?, webhook_url?, customer? }
 *   resposta: { url: "https://checkout.infinitepay.io/<handle>?lenc=..." }
 * - POST .../payment_check → consulta status (exige transaction_nsu/slug,
 *   que só chegam via webhook/redirect)
 * - Webhook (opcional, enviado no POST /links): { invoice_slug, amount,
 *   paid_amount, transaction_nsu, order_nsu, receipt_url, items } — responde 200
 *   rápido (400 = retry)
 */

export interface CheckoutLinkResult {
  url: string;
}

export interface PaymentCheckResult {
  paid: boolean;
  amount: number; // centavos
  paidAmount: number; // centavos
  captureMethod: string; // "pix" | "credit_card"
}

const BASE_URL = "https://api.checkout.infinitepay.io";

/** Normaliza telefone para o formato +55DDDNNNNNNNN esperado pela InfinitePay */
function normalizePhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  return `+55${digits}`;
}

export class InfinitePayClient {
  private handle: string;

  constructor(handle: string) {
    // Handle = InfiniteTag sem o símbolo $ do início
    this.handle = handle.replace(/^\$/, "").trim();
  }

  /**
   * Cria um link de pagamento (Checkout Integrado)
   * @param orderNsu id do pedido no nosso sistema (usado para casar o webhook)
   */
  async createCheckoutLink(params: {
    amount: number; // reais
    description: string;
    orderNsu: string;
    webhookUrl?: string;
    redirectUrl?: string;
    customer?: { name?: string; email?: string; phoneNumber?: string };
  }): Promise<CheckoutLinkResult> {
    const body: Record<string, any> = {
      handle: this.handle,
      items: [
        {
          quantity: 1,
          price: Math.round(params.amount * 100), // centavos
          description: params.description,
        },
      ],
      order_nsu: params.orderNsu,
    };
    if (params.webhookUrl) body.webhook_url = params.webhookUrl;
    if (params.redirectUrl) body.redirect_url = params.redirectUrl;
    if (params.customer) {
      const phoneNumber = normalizePhone(params.customer.phoneNumber);
      // Pré-preenche o que temos para o cliente não digitar (nome opcional)
      body.customer = {
        ...(params.customer.name ? { name: params.customer.name } : {}),
        ...(params.customer.email ? { email: params.customer.email } : {}),
        ...(phoneNumber ? { phone_number: phoneNumber } : {}),
      };
    }

    const res = await fetch(`${BASE_URL}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`InfinitePay links error: ${res.status} ${error}`);
    }

    const data = await res.json();
    if (!data?.url) {
      throw new Error(
        `InfinitePay links error: ${JSON.stringify(data)}`
      );
    }
    return { url: data.url };
  }

  /**
   * Consulta o status do pagamento (exige transaction_nsu/slug recebidos no webhook)
   */
  async checkPayment(params: {
    orderNsu: string;
    transactionNsu?: string;
    slug?: string;
  }): Promise<PaymentCheckResult> {
    const body: Record<string, any> = {
      handle: this.handle,
      order_nsu: params.orderNsu,
    };
    if (params.transactionNsu) body.transaction_nsu = params.transactionNsu;
    if (params.slug) body.slug = params.slug;

    const res = await fetch(`${BASE_URL}/payment_check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`InfinitePay payment_check error: ${res.status}`);
    }

    const data = await res.json();
    console.log(
      `[INFINITEPAY] payment_check order=${params.orderNsu} resp=${JSON.stringify(data)}`
    );

    return {
      paid: data?.paid === true,
      amount: data?.amount || 0,
      paidAmount: data?.paid_amount || data?.paidAmount || 0,
      captureMethod: data?.capture_method || data?.captureMethod || "",
    };
  }
}

/**
 * Detecta qual provider de PIX usar baseado no token configurado:
 * - Mercado Pago: APP_USR-* / TEST-*
 * - InfinitePay: qualquer outro valor não-vazio (a InfiniteTag/handle)
 */
export function detectPixProvider(
  token: string
): "mercadopago" | "infinitepay" | "unknown" {
  if (!token) return "unknown";
  if (token.startsWith("APP_USR-") || token.startsWith("TEST-"))
    return "mercadopago";
  return "infinitepay";
}
