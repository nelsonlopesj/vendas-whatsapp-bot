/**
 * PagBank (PagSeguro) Client — PIX copia-e-cola + checkout hospedado
 *
 * Docs: https://developer.pagbank.com.br
 * - POST https://api.pagseguro.com/orders → cria pedido com QR Code PIX:
 *   resposta `qr_codes[0].text` = BR Code copia-e-cola, links PNG/base64,
 *   `expiration_date` (default 24h).
 * - POST https://api.pagseguro.com/checkouts → checkout hospedado (link PAY).
 * - GET  /orders/{id} → status (`charges[0].status` = "PAID" para PIX).
 * - Webhook: `notification_urls` no payload → POST com o mesmo formato da
 *   resposta síncrona (order completa). Sempre responder 200.
 *
 * Auth: Bearer token (painel PagBank → Vendas → Integrações → Gerar Token).
 * Requisito da conta: pelo menos uma chave PIX ativa.
 */

const BASE_URL = "https://api.pagseguro.com";

export class PagBankClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
    };
  }

  /**
   * Cria um pedido com QR Code PIX (copia-e-cola direto — sem página de checkout)
   */
  async createPixPayment(params: {
    amount: number; // reais
    description: string;
    referenceId: string;
    expirationMinutes?: number;
    notificationUrl?: string;
    customer?: { name?: string; email?: string; phone?: string };
  }): Promise<{
    id: string;
    referenceId: string;
    pixCopyPaste: string;
    pixQrCodeBase64: string;
    pixExpiration: string;
  }> {
    const expiration = new Date(
      Date.now() + (params.expirationMinutes || 30) * 60 * 1000
    );

    const body: Record<string, any> = {
      reference_id: params.referenceId,
      items: [
        {
          name: params.description.slice(0, 100),
          quantity: 1,
          unit_amount: Math.round(params.amount * 100), // centavos
        },
      ],
      qr_codes: [
        {
          amount: { value: Math.round(params.amount * 100) },
          expiration_date: expiration.toISOString(),
        },
      ],
    };
    if (params.notificationUrl) {
      body.notification_urls = [params.notificationUrl];
    }
    if (params.customer) {
      const c: Record<string, any> = {};
      if (params.customer.name) c.name = params.customer.name;
      if (params.customer.email) c.email = params.customer.email;
      body.customer = c;
    }

    const res = await fetch(`${BASE_URL}/orders`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`PagBank createOrder failed: ${res.status} ${error}`);
    }

    const data = await res.json();
    const qr = Array.isArray(data.qr_codes) ? data.qr_codes[0] : {};

    let qrBase64 = "";
    const base64Link = (qr.links || []).find(
      (l: any) => l.rel === "QRCODE.BASE64"
    );
    if (base64Link?.href) {
      try {
        const b64Res = await fetch(base64Link.href, { headers: this.headers });
        if (b64Res.ok) qrBase64 = await b64Res.text();
      } catch {
        qrBase64 = "";
      }
    }

    return {
      id: data.id || "",
      referenceId: data.reference_id || params.referenceId,
      pixCopyPaste: qr.text || qr.qr_code || "",
      pixQrCodeBase64: qrBase64,
      pixExpiration: qr.expiration_date || "",
    };
  }

  /**
   * Cria checkout hospedado (link de pagamento)
   */
  async createCheckoutLink(params: {
    amount: number;
    description: string;
    referenceId: string;
    expirationMinutes?: number;
    notificationUrl?: string;
  }): Promise<string> {
    const expiration = new Date(
      Date.now() + (params.expirationMinutes || 30) * 60 * 1000
    );

    const body: Record<string, any> = {
      reference_id: params.referenceId,
      customer_modifiable: false,
      items: [
        {
          name: params.description.slice(0, 100),
          quantity: 1,
          unit_amount: Math.round(params.amount * 100),
        },
      ],
      expiration_date: expiration.toISOString(),
    };
    if (params.notificationUrl) {
      body.payment_notification_urls = [params.notificationUrl];
    }

    const res = await fetch(`${BASE_URL}/checkouts`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`PagBank createCheckout failed: ${res.status} ${error}`);
    }

    const data = await res.json();
    const payLink = (data.links || []).find((l: any) => l.rel === "PAY");
    return payLink?.href || "";
  }

  /**
   * Consulta o status de um pedido (PIX pago = charges[0].status === "PAID")
   */
  async getOrderStatus(orderId: string): Promise<{
    id: string;
    status: string;
    paid: boolean;
  }> {
    const res = await fetch(`${BASE_URL}/orders/${orderId}`, {
      headers: this.headers,
    });

    if (!res.ok) {
      throw new Error(`PagBank getOrder failed: ${res.status}`);
    }

    const data = await res.json();
    const charge = Array.isArray(data.charges) ? data.charges[0] : null;
    const status = charge?.status || data.status || "pending";
    console.log(`[PAGBANK] order ${orderId} status="${status}"`);

    return {
      id: data.id || orderId,
      status,
      paid: status === "PAID",
    };
  }
}
