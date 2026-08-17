/**
 * Auto-cura do webhook da Evolution API.
 *
 * A reconexão do WhatsApp (novo QR) pode derrubar a configuração de webhook
 * da instância — e aí nenhuma mensagem chega no portal. Esta função registra
 * (idempotente) o webhook global da instância "default" e é chamada:
 * 1. no boot do portal (instrumentation)
 * 2. a cada 5 minutos (setInterval no instrumentation)
 * 3. no endpoint do QR code (sempre que a tela de conexão é consultada)
 */

const WA_URL = process.env.EZFLOW_WA_URL || "http://evolution:8080";
const WA_KEY =
  process.env.EZFLOW_WA_KEY ||
  process.env.EVOLUTION_API_KEY ||
  "ezflow-master-key";
const INSTANCE = "default";
const WEBHOOK_URL = "http://portal:3000/api/webhooks/evolution";

export async function ensureEvolutionWebhook(): Promise<boolean> {
  try {
    const baseUrl = WA_URL.replace(/\/$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${baseUrl}/webhook/set/${INSTANCE}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: WA_KEY,
        },
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: WEBHOOK_URL,
            events: ["MESSAGES_UPSERT"],
            webhookByEvents: false,
            webhookBase64: false,
          },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.error(
          `[WA-WEBHOOK] set failed: ${res.status}`
        );
        return false;
      }
      const data = await res.json();
      console.log(`[WA-WEBHOOK] ensured: ${data?.url || "ok"}`);
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    console.error(`[WA-WEBHOOK] ensure failed: ${err.message}`);
    return false;
  }
}
