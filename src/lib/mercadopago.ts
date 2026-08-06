/**
 * Mercado Pago Client — PIX
 *
 * Gera cobranças PIX via API do Mercado Pago e processa webhooks de confirmação.
 * Docs: https://www.mercadopago.com.br/developers/pt/reference
 */

interface CreatePixPaymentParams {
  amount: number; // Valor em reais (ex: 9.90)
  description: string; // Descrição da cobrança
  payerEmail?: string;
  expirationMinutes?: number; // Default 30 minutos
}

interface PixPaymentResult {
  id: string; // ID do pagamento no Mercado Pago
  status: string; // "pending"
  pixCopyPaste: string; // Código PIX copia-e-cola
  pixQrCodeBase64: string; // QR Code em base64
  pixExpiration: string; // Data de expiração ISO
  ticketUrl: string; // URL do comprovante
}

export class MercadoPagoClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.accessToken}`,
      "X-Idempotency-Key": crypto.randomUUID(),
    };
  }

  /**
   * Cria uma cobrança PIX
   */
  async createPixPayment(
    params: CreatePixPaymentParams
  ): Promise<PixPaymentResult> {
    const expirationMinutes = params.expirationMinutes || 30;
    const expirationDate = new Date(
      Date.now() + expirationMinutes * 60 * 1000
    );

    const body = {
      transaction_amount: params.amount,
      description: params.description,
      payment_method_id: "pix",
      payer: {
        email: params.payerEmail || "cliente@ezflow.com.br",
      },
      date_of_expiration: expirationDate.toISOString(),
    };

    const res = await fetch(
      "https://api.mercadopago.com/v1/payments",
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const error = await res.text();
      throw new Error(
        `MercadoPago createPayment failed: ${res.status} ${error}`
      );
    }

    const data = await res.json();

    // Extrair dados do PIX
    const pixData = data.point_of_interaction?.transaction_data;
    if (!pixData) {
      throw new Error("Dados PIX não encontrados na resposta do Mercado Pago");
    }

    return {
      id: String(data.id),
      status: data.status || "pending",
      pixCopyPaste: pixData.qr_code || "",
      pixQrCodeBase64: pixData.qr_code_base64 || "",
      pixExpiration: data.date_of_expiration,
      ticketUrl: pixData.ticket_url || "",
    };
  }

  /**
   * Consulta status de um pagamento
   */
  async getPaymentStatus(
    paymentId: string
  ): Promise<{
    id: string;
    status: string;
    statusDetail: string;
    amount: number;
    dateApproved: string | null;
  }> {
    const res = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        method: "GET",
        headers: this.headers,
      }
    );

    if (!res.ok) {
      throw new Error(
        `MercadoPago getPayment failed: ${res.status} ${await res.text()}`
      );
    }

    const data = await res.json();

    return {
      id: String(data.id),
      status: data.status,
      statusDetail: data.status_detail || "",
      amount: data.transaction_amount || 0,
      dateApproved: data.date_approved || null,
    };
  }

  /**
   * Cria link de pagamento (Checkout Pro) — apenas PIX
   */
  async createCheckoutLink(params: {
    amount: number;
    description: string;
    expirationMinutes?: number;
  }): Promise<string> {
    const expirationDate = new Date(
      Date.now() + (params.expirationMinutes || 30) * 60 * 1000
    );

    const body = {
      items: [{
        title: params.description.slice(0, 100),
        quantity: 1,
        unit_price: params.amount,
        currency_id: "BRL",
      }],
      payment_methods: {
        excluded_payment_types: [
          { id: "credit_card" },
          { id: "debit_card" },
          { id: "ticket" },
        ],
      },
      expires: true,
      expiration_date_to: expirationDate.toISOString(),
    };

    const res = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      throw new Error(`MercadoPago createCheckout failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return data.init_point as string;
  }

  /**
   * Cancela um pagamento pendente
   */
  async cancelPayment(paymentId: string): Promise<boolean> {
    const res = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        method: "PUT",
        headers: this.headers,
        body: JSON.stringify({ status: "cancelled" }),
      }
    );

    return res.ok;
  }
}

/**
 * Interpreta o webhook do Mercado Pago
 */
export function parseMercadoPagoWebhook(body: any): {
  action: string;
  paymentId: string;
} | null {
  try {
    // Formato: { action: "payment.created" | "payment.updated", data: { id: "..." } }
    const action = body?.action;
    const paymentId = body?.data?.id;

    if (!action || !paymentId) return null;

    return { action, paymentId: String(paymentId) };
  } catch {
    return null;
  }
}
