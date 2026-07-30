/**
 * InfinitePay Client — PIX
 *
 * InfinitePay é um gateway de pagamento brasileiro focado em PIX.
 * API: https://docs.infinitepay.io
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
    const pix = data?.attributes?.pix || {};

    return {
      id: data.id || data.data?.id || "",
      status: data.status || "pending",
      pixCopyPaste: pix.qr_code || pix.copy_paste || "",
      pixQrCodeBase64: pix.qr_code_base64 || "",
      pixExpiration: data.expires_at || "",
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
    return {
      id: data.id || data.data?.id || transactionId,
      status: data.status || "pending",
      amount: (data.amount || 0) / 100,
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
