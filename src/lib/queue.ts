/**
 * Redis + BullMQ — Sistema de Filas
 *
 * Gerencia filas de processamento:
 * - flow-sessions: processa mensagens recebidas
 * - flow-timeouts: delayed jobs para timeout de WAIT_RESPONSE
 * - pix-polling: verifica status de PIX periodicamente
 */

import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { FlowEngine } from "./flow-engine";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// ===== Queues =====

export const flowInboundQueue = new Queue("flow-inbound", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export const flowTimeoutQueue = new Queue("flow-timeouts", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export const pixPollingQueue = new Queue("pix-polling", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// ===== Workers =====

// Worker para processar mensagens inbound
export const inboundWorker = new Worker(
  "flow-inbound",
  async (job) => {
    const { phone, message, tenantId, pushName, evolutionConfig } = job.data;

    // Criar Evolution client
    let evolutionClient = undefined;
    if (evolutionConfig?.baseUrl && evolutionConfig?.apikey) {
      const { EvolutionClient } = await import("./evolution");
      evolutionClient = new EvolutionClient({
        baseUrl: evolutionConfig.baseUrl,
        apikey: evolutionConfig.apikey,
        instance: evolutionConfig.instance || "default",
      });
    }

    const result = await FlowEngine.processIncoming(
      phone,
      message,
      tenantId,
      pushName,
      evolutionClient
    );

    // Agendar timeout se a sessão está em WAIT_RESPONSE
    if (result.session && result.session.status === "active") {
      // Buscar o step atual para verificar se precisa de timeout
      const { default: prisma } = await import("./prisma");
      const step = await prisma.flowStep.findUnique({
        where: { id: result.session.currentStepId! },
      });

      if (step?.type === "WAIT_RESPONSE") {
        const config = (step.config || {}) as Record<string, any>;
        const timeoutSeconds = config.timeout || 3600;

        await flowTimeoutQueue.add(
          "timeout",
          { sessionId: result.session.id },
          { delay: timeoutSeconds * 1000, jobId: `timeout-${result.session.id}` }
        );
      }
    }

    return result;
  },
  { connection, concurrency: 10 }
);

// Worker para processar timeouts e lembretes PIX
export const timeoutWorker = new Worker(
  "flow-timeouts",
  async (job) => {
    const { sessionId, message, reminder } = job.data;

    // Polling de status PIX
    if (job.name === "pix-poll") {
      const { paymentId, tenantId } = job.data;
      await FlowEngine.handlePixPayment(paymentId, tenantId);
      return;
    }

    // Retomada de DELAY (grafo): só continua se a sessão ainda espera esse step
    if (job.name === "delay") {
      const { stepId, toStepId } = job.data;
      const { default: prisma } = await import("./prisma");
      const session = await prisma.flowSession.findUnique({
        where: { id: sessionId },
      });
      if (
        !session ||
        session.currentStepId !== stepId ||
        session.status !== "waiting_delay"
      ) {
        console.log(
          `[FLOW-DELAY] job stale for session ${sessionId?.slice(-8)}, skipping`
        );
        return;
      }
      console.log(
        `[FLOW-DELAY] resuming session ${sessionId?.slice(-8)} → ${toStepId}`
      );
      await FlowEngine.resumeGraph(sessionId, toStepId || null);
      return;
    }

    // Lembrete de remarketing PIX / follow-up pós-expiração
    if (job.name === "pix-reminder" && reminder) {
      const { default: prisma } = await import("./prisma");
      const session = await prisma.flowSession.findUnique({
        where: { id: sessionId },
        include: { tenant: true, flow: true },
      });
      if (!session) return;
      // Para follow-up (reminder=3), não verifica status (a sessão já foi fechada como failed)
      if (reminder <= 2 && session.status !== "waiting_pix") return;

      const flowKeyword = session.flow?.triggerKeyword || "iniciar";
      const text = message.replace(/\{\{keyword\}\}/g, flowKeyword);

      const waUrl = session.tenant?.evolutionUrl || process.env.EZFLOW_WA_URL || "http://evolution:8080";
      const waKey = session.tenant?.evolutionApikey || process.env.EZFLOW_WA_KEY || process.env.EVOLUTION_API_KEY || "ezflow-master-key";
      const { EvolutionClient } = await import("./evolution");
      const evo = new EvolutionClient({ baseUrl: waUrl, apikey: waKey, instance: "default" });
      await evo.sendText({ number: session.customerPhone, text });
      return;
    }

    // Timeout de WAIT_RESPONSE
    await FlowEngine.handleTimeout(sessionId);
  },
  { connection }
);

// Worker para polling de status PIX
export const pixPollingWorker = new Worker(
  "pix-polling",
  async (job) => {
    const { paymentId, tenantId } = job.data;
    const result = await FlowEngine.handlePixPayment(paymentId, tenantId);

    // Se ainda pendente, reagendar
    if (!result.delivered) {
      const { default: prisma } = await import("./prisma");
      const sale = await prisma.sale.findFirst({
        where: { externalId: paymentId, tenantId },
      });

      if (sale && sale.status === "PENDING") {
        // Reagendar em 30 segundos
        await pixPollingQueue.add(
          "poll",
          { paymentId, tenantId },
          { delay: 30000, jobId: `poll-${paymentId}` }
        );
      }
    }
  },
  { connection }
);

// ===== Logging =====

inboundWorker.on("completed", (job) => {
  if (job) {
    console.log(`✅ Inbound job ${job.id} completed`);
  }
});

inboundWorker.on("failed", (job, err) => {
  if (job) {
    console.error(`❌ Inbound job ${job.id} failed:`, err.message);
  }
});

console.log("🔄 BullMQ workers started");
