/**
 * InfinitePay Client — PIX
 *
 * InfinitePay é um gateway de pagamento brasileiro focado em PIX.
 * API: https://docs.infinitepay.io (documentação do desenvolvedor)
 *
 * Respostas são tratadas de forma defensiva: a API pode responder no
 * formato JSON:API (`{ data: { id, attributes: {...} } }`) ou flat
 * (`{ id, status, pix: {...} }`).
 */

interface CreatePixParams {
  amount: number;
  description: string;
  externalReference?: string;
  expirationMinutes?: number;
}

interface PixResult {
  id: string;
  status: string;
  pixCopyPaste: string;
  pixQrCodeBase64: string;
  pixExpiration: string;
}

/** Desembrulha respostas JSON:API ou flat em um objeto único */
function unwrap(data: any): any {
  const d = data?.data;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    return { ...data, ...d };
  }
  return data || {};
}

/**
 * Status considerados "pago" na InfinitePay.
 * A API usa snake_case; mantemos uma lista tolerante e logamos
 * status desconhecidos para ajuste fino em produção.
 */
export function isInfinitePayPaid(status: string): boolean {
  const s = (status || "").toLowerCase().trim();
  return ["paid", "approved", "confirmed", "settled", "completed"].includes(s);
}

/** Status que encerram a cobrança sem pagamento */
export function isInfinitePayFinished(status: string): boolean {
  const s = (status || "").toLowerCase().trim();
  return [
    "expired",
    "refused",
    "cancelled",
    "canceled",
    "failed",
    "chargeback",
    "reversed",
  ].includes(s);
}

export class InfinitePayClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
  }

  /**
   * Cria uma cobrança PIX
   */
  async createPixPayment(params: CreatePixParams): Promise<PixResult> {
    const expirationMinutes = params.expirationMinutes || 30;

    const body = {
      amount: Math.round(params.amount * 100), // centavos
      currency: "BRL",
      payment_method: "pix",
      description: params.description,
      external_reference: params.externalReference || "",
      pix_expiration: expirationMinutes * 60, // segundos
    };

    const res = await fetch("https://api.infinitepay.io/v2/transactions", {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`InfinitePay error: ${res.status} ${error}`);
    }

    const data = await res.json();
    const d = unwrap(data);
    const pix = d.attributes?.pix || d.pix || {};

    return {
      id: d.id || "",
      status: d.status || "pending",
      pixCopyPaste:
        pix.qr_code || pix.copy_paste || pix.emv || pix.qrCode || "",
      pixQrCodeBase64: pix.qr_code_base64 || pix.qrCodeBase64 || "",
      pixExpiration: d.expires_at || d.pixExpiration || "",
    };
  }

  /**
   * Consulta status de pagamento
   */
  async getPaymentStatus(transactionId: string): Promise<{
    id: string;
    status: string;
    amount: number;
  }> {
    const res = await fetch(
      `https://api.infinitepay.io/v2/transactions/${transactionId}`,
      { headers: this.headers }
    );

    if (!res.ok) {
      throw new Error(`InfinitePay status error: ${res.status}`);
    }

    const data = await res.json();
    const d = unwrap(data);

    const status = d.status || d.attributes?.status || "pending";
    console.log(`[INFINITEPAY] tx ${transactionId} status="${status}"`);

    return {
      id: d.id || transactionId,
      status,
      amount: (d.amount || d.attributes?.amount || 0) / 100,
    };
  }
}

/**
 * Detecta qual provider de PIX usar baseado no token
 */
export function detectPixProvider(
  token: string
): "mercadopago" | "infinitepay" | "unknown" {
  if (!token) return "unknown";
  if (token.startsWith("APP_USR-") || token.startsWith("TEST-"))
    return "mercadopago";
  if (token.startsWith("inf_") || token.startsWith("ip_"))
    return "infinitepay";
  return "unknown";
}
