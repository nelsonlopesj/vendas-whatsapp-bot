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

import prisma from "./prisma";

const WA_URL = process.env.EZFLOW_WA_URL || "http://evolution:8080";
const WA_KEY =
  process.env.EZFLOW_WA_KEY ||
  process.env.EVOLUTION_API_KEY ||
  "ezflow-master-key";
const WEBHOOK_URL = "http://portal:3000/api/webhooks/evolution";

/**
 * Nome da instância Evolution de um tenant.
 * O master (tenant com usuário owner) usa "default" — preserva a conexão
 * existente. Cada cliente tem a própria instância = tenantId.
 */
const instanceCache = new Map<string, string>();

export async function getTenantInstance(tenantId: string): Promise<string> {
  const cached = instanceCache.get(tenantId);
  if (cached) return cached;
  const owner = await prisma.user.findFirst({
    where: { role: "owner", tenantId },
    select: { id: true },
  });
  const instance = owner ? "default" : tenantId;
  instanceCache.set(tenantId, instance);
  return instance;
}

/** Invalida o cache (após mudanças de role) */
export function clearTenantInstanceCache(): void {
  instanceCache.clear();
}

export async function ensureEvolutionWebhook(instance = "default"): Promise<boolean> {
  try {
    const baseUrl = WA_URL.replace(/\/$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${baseUrl}/webhook/set/${instance}`, {
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
          `[WA-WEBHOOK] set failed for ${instance}: ${res.status}`
        );
        return false;
      }
      const data = await res.json();
      console.log(`[WA-WEBHOOK] ensured for ${instance}: ${data?.url || "ok"}`);
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    console.error(`[WA-WEBHOOK] ensure failed for ${instance}: ${err.message}`);
    return false;
  }
}

/** Garante o webhook do master ("default") e de todos os tenants ativos */
export async function ensureAllEvolutionWebhooks(): Promise<void> {
  await ensureEvolutionWebhook("default");
  try {
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    for (const t of tenants) {
      await ensureEvolutionWebhook(t.id);
    }
  } catch (err: any) {
    console.error("[WA-WEBHOOK] ensure all failed:", err.message);
  }
}
