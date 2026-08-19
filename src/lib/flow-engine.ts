/**
 * Flow Engine — Máquina de Estados para Automação de Vendas
 *
 * Gerencia sessões de fluxo, processa mensagens recebidas, executa passos
 * (mensagem, espera, PIX, entrega, condição, loop) e gerencia timeouts/retry.
 */

import { randomUUID } from "crypto";
import prisma from "./prisma";
import { EvolutionClient } from "./evolution";
import { MercadoPagoClient } from "./mercadopago";
import { detectPixProvider } from "./infinitepay";
import {
  hasGraphEdges,
  resolveOutgoing,
  resolveConditionTarget,
  MAX_STEPS_PER_PASS,
  MAX_EXEC_PER_STEP_PER_PASS,
} from "./flow-graph";
import { PORT_NEXT, PORT_ALT, PORT_TIMEOUT, PORT_BACK } from "./flow-types";

// ===== Tipos =====

export interface FlowSession {
  id: string;
  flowId: string;
  tenantId: string;
  currentStepId: string | null;
  customerPhone: string;
  customerName?: string | null;
  status: "active" | "waiting_pix" | "waiting_delay" | "timed_out" | "completed" | "failed";
  variables: Record<string, string>;
  loopCounters: Record<string, number>;
  currentPixId?: string | null;
  failureReason?: string | null;
}

interface FlowStepData {
  id: string;
  type: string;
  order: number;
  label: string | null;
  config: Record<string, any>;
  productId: string | null;
  nextStepId: string | null;
  altNextStepId: string | null;
}

// ===== Template Renderer =====

function renderTemplate(
  text: string,
  variables: Record<string, string>
): string {
  return text.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => {
    return variables[key] || `{{${key}}}`;
  });
}

// ===== Keyword Matching =====

function matchKeyword(
  message: string,
  keyword: string,
  mode: string
): boolean {
  const msg = message.toLowerCase().trim();
  const kw = keyword.toLowerCase().trim();

  switch (mode) {
    case "exact":
      return msg === kw;
    case "regex":
      try {
        return new RegExp(kw, "i").test(msg);
      } catch {
        return msg.includes(kw);
      }
    case "contains":
    default:
      return msg.includes(kw);
  }
}

// ===== Response Matching =====

function matchResponse(
  message: string,
  expected: string[],
  operator: string = "contains_any"
): boolean {
  const msg = message.toLowerCase().trim();
  const values = expected.map((v) => v.toLowerCase().trim());

  switch (operator) {
    case "equals":
      return values.some((v) => msg === v);
    case "not_contains":
      return !values.some((v) => msg.includes(v));
    case "contains_any":
    default:
      return values.some((v) => msg.includes(v));
  }
}

// ===== Timeout Scheduler =====

async function scheduleTimeout(
  sessionId: string,
  stepId: string | null,
  variables: Record<string, string>,
  loopCounters: Record<string, number>
) {
  if (!stepId) return;
  try {
    const prisma = (await import("./prisma")).default;
    const step = await prisma.flowStep.findUnique({ where: { id: stepId } });
    if (!step || step.type !== "WAIT_RESPONSE") return;

    const config = (step.config || {}) as Record<string, any>;
    const timeoutSeconds = config.timeout || 3600;
    const onTimeout = config.onTimeout || "exit";
    if (onTimeout !== "retry") return;

    // Namespace "retry:" evita colisão com contadores de LOOP
    const retryKey = `retry:${stepId}`;
    const retryCount = loopCounters[retryKey] ?? loopCounters[stepId] ?? 0;
    const { flowTimeoutQueue } = await import("./queue");
    await flowTimeoutQueue.add(
      "timeout",
      { sessionId, stepId, retryCount },
      { delay: timeoutSeconds * 1000, jobId: `timeout-${sessionId}-${retryCount}` }
    );
    console.log(`[TIMEOUT] scheduled for session ${sessionId} in ${timeoutSeconds}s (retry ${retryCount})`);
  } catch (err: any) {
    console.error(`[TIMEOUT] failed to schedule:`, err.message);
  }
}

// ===== Product File Sender (sem mensagem de pagamento) =====

async function sendProductFiles(session: any, phone: string, evolutionClient: EvolutionClient) {
  const variables = (session.variables || {}) as Record<string, string>;
  const fileUrl = variables["product.fileUrl"] || "";
  const extraFiles = variables["product.extraFiles"] || "[]";

  const filesToSend: { url: string; name: string }[] = [];
  try { const extra = JSON.parse(extraFiles); (extra as any[]).forEach((f: any) => filesToSend.push({ url: f.url, name: f.name || "Arquivo" })); } catch {}
  if (fileUrl && !filesToSend.some(f => f.url === fileUrl)) {
    const ext = fileUrl.split(".").pop() || "";
    const name = variables["product.name"] || "Arquivo";
    filesToSend.push({ url: fileUrl, name: name.endsWith(`.${ext}`) ? name : `${name}.${ext}` });
  }

  for (const f of filesToSend) {
    let mediaUrl = f.url;
    if (f.url.startsWith("/uploads/")) {
      try {
        const { readFile } = await import("fs/promises");
        const path = await import("path");
        const filePath = path.join(process.cwd(), "public", f.url);
        const buffer = await readFile(filePath);
        mediaUrl = buffer.toString("base64");
      } catch {}
    }
    const ext = (f.url.split(".").pop() || "").toLowerCase();
    const type = ["mp3","m4a","ogg","wav"].includes(ext) ? "audio" : ["mp4","avi","mov"].includes(ext) ? "video" : ["jpg","jpeg","png","gif","webp"].includes(ext) ? "image" : "document";
    try {
      await evolutionClient.sendMedia({ number: phone, mediaType: type as any, mediaUrl, fileName: f.name, caption: `📎 ${f.name}` });
    } catch (err: any) { console.error(`[TRUST] sendFile failed for ${f.name}:`, err.message); }
  }
}

// ===== Trust PIX Generator =====

async function generateTrustPix(
  session: any,
  pixStep: FlowStepData,
  amount: number,
  tenantId: string,
  evolutionClient: EvolutionClient,
  allSteps: FlowStepData[]
): Promise<{ pixId?: string; variables: Record<string, string> }> {
  const config = (pixStep.config || {}) as Record<string, any>;
  const phone = session.customerPhone;

  // Buscar tenant para token
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const token = tenant?.mercadopagoToken || "";
  if (!token) throw new Error("Token de pagamento não configurado");

  // Buscar produto
  let description = config.description || "Produto digital";
  if (pixStep.productId) {
    const product = await prisma.product.findUnique({ where: { id: pixStep.productId } });
    if (product) description = product.name;
  }

  // Gerar cobrança com valor customizado (PIX Mercado Pago ou link InfinitePay)
  const isInfinitePay = detectPixProvider(token) === "infinitepay";
  let pix: { id: string; pixCopyPaste: string; pixQrCodeBase64: string; pixExpiration: string };
  if (isInfinitePay) {
    const { InfinitePayClient } = await import("./infinitepay");
    const ip = new InfinitePayClient(token);
    const orderNsu = `ezflow-trust-${randomUUID()}`;
    const webhookUrl = process.env.NEXTAUTH_URL
      ? `${process.env.NEXTAUTH_URL.replace(/\/$/, "")}/api/webhooks/infinitepay`
      : undefined;
    const r = await ip.createCheckoutLink({
      amount,
      description,
      orderNsu,
      webhookUrl,
      customer: {
        name: session.customerName || undefined,
        phoneNumber: phone,
      },
    });
    console.log(`[TRUST] InfinitePay link created order=${orderNsu}`);
    pix = { id: orderNsu, pixCopyPaste: r.url, pixQrCodeBase64: "", pixExpiration: "" };
  } else {
    const { MercadoPagoClient } = await import("./mercadopago");
    const mp = new MercadoPagoClient(token);
    const r = await mp.createPixPayment({ amount, description, expirationMinutes: config.expirationMinutes || 30 });
    pix = { id: r.id, pixCopyPaste: r.pixCopyPaste, pixQrCodeBase64: r.pixQrCodeBase64, pixExpiration: r.pixExpiration };
  }

  // Mensagem de confiança + cobrança
  const trustMsg = config.trustMessage || (isInfinitePay
    ? `Aqui está! Espero que goste. Se puder contribuir com qualquer valor pelo link abaixo, sua boa-fé ajuda a manter esse projeto! 🙏`
    : `Aqui está! Espero que goste. Se puder contribuir com qualquer valor pelo PIX abaixo, sua boa-fé ajuda a manter esse projeto! 🙏`);
  await evolutionClient.sendText({ number: phone, text: trustMsg });
  await evolutionClient.sendText({ number: phone, text: pix.pixCopyPaste });

  // Link de pagamento (Checkout Pro) no módulo confiança — mesmo critério
  // do fluxo normal: paymentMode "link" ou "both" (só Mercado Pago)
  const trustLinkRef =
    !isInfinitePay &&
    (config.paymentMode === "link" || config.paymentMode === "both")
      ? `ezlink-${randomUUID()}`
      : "";
  if (!isInfinitePay && (config.paymentMode === "link" || config.paymentMode === "both")) {
    try {
      const { MercadoPagoClient } = await import("./mercadopago");
      const mpLink = new MercadoPagoClient(token);
      const linkUrl = await mpLink.createCheckoutLink({
        amount,
        description,
        expirationMinutes: config.expirationMinutes || 30,
        externalReference: trustLinkRef,
      });
      if (linkUrl) {
        await evolutionClient.sendText({
          number: phone,
          text: `💻 *Ou pague pelo link:*\n${linkUrl}`,
        });
      }
    } catch (err: any) {
      console.error("[TRUST-LINK] failed:", err.message);
    }
  }

  // Registrar venda com valor customizado
  await prisma.sale.create({
    data: {
      tenantId,
      flowId: session.flowId,
      sessionId: session.id,
      productId: pixStep.productId || "unknown",
      customerPhone: phone,
      customerName: session.customerName,
      amount,
      status: "PENDING",
      externalId: pix.id,
      pixCopyPaste: pix.pixCopyPaste,
      pixQrCode: pix.pixQrCodeBase64,
      pixExpiresAt: isInfinitePay ? null : new Date(pix.pixExpiration),
      metadata: { trustMode: true, originalSale: true, pixStepId: (pixStep as any)?.id || null, gateway: isInfinitePay ? "infinitepay" : "mercadopago", ...(trustLinkRef ? { linkRef: trustLinkRef } : {}) },
    },
  });

  // Agendar lembretes de remarketing (opcionais, igual fluxo normal)
  const reminder1Min = config.reminder1Minutes;
  const reminder2Min = config.reminder2Minutes;
  try {
    const { flowTimeoutQueue } = await import("./queue");
    if (reminder1Min && config.reminder1Message) {
      await flowTimeoutQueue.add("pix-reminder", { sessionId: session.id, reminder: 1, message: config.reminder1Message }, { delay: reminder1Min * 60 * 1000, jobId: `pix-reminder1-${session.id}` });
      console.log(`[PIX-REMINDER] trust 1st reminder scheduled in ${reminder1Min}min`);
    }
    if (reminder2Min && config.reminder2Message) {
      await flowTimeoutQueue.add("pix-reminder", { sessionId: session.id, reminder: 2, message: config.reminder2Message }, { delay: reminder2Min * 60 * 1000, jobId: `pix-reminder2-${session.id}` });
      console.log(`[PIX-REMINDER] trust 2nd reminder scheduled in ${reminder2Min}min`);
    }
    // Polling robusto: a cada 30s até expirar
    const expMinutes = config.expirationMinutes || 30;
    const iterations = Math.ceil((expMinutes * 60) / 30);
    for (let i = 1; i <= iterations; i++) {
      await flowTimeoutQueue.add("pix-poll", { paymentId: pix.id, tenantId }, { delay: i * 30000, jobId: `pix-poll-${pix.id}-${i}` });
    }
  } catch (err: any) { console.error(`[PIX-REMINDER] failed to schedule:`, err.message); }

  return { pixId: pix.id, variables: { pixId: pix.id, pixStatus: "pending" } };
}

// ===== Flow Engine =====

export class FlowEngine {
  /**
   * Processa uma mensagem recebida do WhatsApp.
   * Esta é a função principal chamada pelo webhook.
   */
  static async processIncoming(
    phone: string,
    message: string,
    tenantId: string,
    pushName?: string,
    evolutionClient?: EvolutionClient
  ): Promise<{
    action: "new_session" | "continue_session" | "no_match" | "error";
    session?: FlowSession;
    response?: string;
  }> {
    try {
      // 1. Buscar sessão ativa para este contato
      const existingSession = await prisma.flowSession.findFirst({
        where: {
          tenantId,
          customerPhone: phone,
          status: { in: ["active", "waiting_pix"] },
        },
        include: { flow: { include: { steps: true } } },
        orderBy: { createdAt: "desc" },
      });

      // 2. Se tem sessão ativa → continuar fluxo
      if (existingSession) {
        return await FlowEngine.continueSession(
          existingSession,
          message,
          pushName,
          evolutionClient
        );
      }

      // 3. Se não tem → buscar fluxo por keyword match
      const flows = await prisma.flow.findMany({
        where: {
          tenantId,
          isActive: true,
        },
        include: { steps: { orderBy: { order: "asc" } } },
      });

      const matchedFlow = flows.find((flow) =>
        matchKeyword(message, flow.triggerKeyword, flow.triggerMode)
      );

      if (!matchedFlow) {
        // 4. Se não tem fluxo que matcha, enviar mensagem padrão se tiver welcomeMessage
        // Por ora, retorna no_match
        return { action: "no_match" };
      }

      // 5. Criar nova sessão
      return await FlowEngine.startSession(
        matchedFlow,
        phone,
        tenantId,
        pushName,
        evolutionClient
      );
    } catch (error) {
      console.error("FlowEngine processIncoming error:", error);
      return { action: "error" };
    }
  }

  /**
   * Inicia uma nova sessão de fluxo
   */
  private static async startSession(
    flow: any,
    phone: string,
    tenantId: string,
    pushName?: string,
    evolutionClient?: EvolutionClient
  ): Promise<{
    action: "new_session";
    session?: FlowSession;
    response?: string;
  }> {
    const firstStep = flow.steps?.[0];

    // Criar sessão no banco
    const session = await prisma.flowSession.create({
      data: {
        tenantId,
        flowId: flow.id,
        currentStepId: firstStep?.id || null,
        customerPhone: phone,
        customerName: pushName || null,
        status: "active",
        variables: {},
        loopCounters: {},
      },
    });

    // Pre-carregar variáveis de produto dos passos
    const productVars: Record<string, string> = {};
    for (const step of (flow.steps || [])) {
      if (step.productId) {
        const product = await prisma.product.findUnique({ where: { id: step.productId } });
        if (product) {
          productVars["product.name"] = product.name;
          productVars["product.price"] = String(product.price);
          productVars["product.fileUrl"] = product.fileUrl || "";
          productVars["product.extraFiles"] = JSON.stringify(product.extraFiles || []);
        }
      }
    }
    await prisma.flowSession.update({ where: { id: session.id }, data: { variables: productVars } });
    // Atualizar objeto local para o executeStep usar as variáveis
    (session as any).variables = productVars;

    // Executar passos em sequência até chegar em interação ou fim
    if (firstStep && evolutionClient) {
    let currentStep = firstStep;
    let allVars = { ...productVars };
    let pixId: string | undefined;
    let lastStatus = "active";
    let nextId: string | null = firstStep?.id || null;

    const graphStart = hasGraphEdges(flow.steps as any[]);
    let totalExec = 0;
    const execCounts: Record<string, number> = {};
    const loopCounters: Record<string, number> = {};

    while (currentStep && evolutionClient) {
      console.log(`[FLOW-STEP] executing step type=${currentStep.type} label=${currentStep.label}`);
      // Parar ANTES de executar WAIT_RESPONSE (depende de resposta do cliente)
      if (currentStep.type === "WAIT_RESPONSE") { console.log("[FLOW-STOP] breaking at WAIT_RESPONSE"); break; }

      // Guarda de ciclo/budget
      totalExec++;
      execCounts[currentStep.id] = (execCounts[currentStep.id] || 0) + 1;
      if (totalExec > MAX_STEPS_PER_PASS || execCounts[currentStep.id] > MAX_EXEC_PER_STEP_PER_PASS) {
        console.error(`[FLOW-GUARD] budget/cycle exceeded at step ${currentStep.id} (startSession)`);
        lastStatus = "failed";
        nextId = currentStep.id;
        await prisma.flowSession.update({ where: { id: session.id }, data: { status: "failed", failureReason: "cycle_or_budget", variables: allVars } });
        return { action: "new_session", session: { id: session.id, flowId: session.flowId, tenantId: session.tenantId, customerPhone: session.customerPhone, customerName: session.customerName, currentStepId: nextId, status: "failed", variables: allVars, loopCounters, currentPixId: pixId || null } };
      }

      // GENERATE_PIX: executa e depois pausa
      let result: any;
      try {
        result = await FlowEngine.executeStep(
          currentStep as FlowStepData,
          { ...session, variables: allVars },
          phone,
          tenantId,
          evolutionClient,
          flow.steps as FlowStepData[]
        );
      } catch (err: any) {
        console.error(`[FLOW-ERR] step ${currentStep.id} (${currentStep.type}) failed at start:`, err.message);
        try {
          await evolutionClient.sendText({ number: phone, text: "Ops! Tive um problema nessa etapa. Tente novamente em instantes. 🙏" });
        } catch {}
        await prisma.flowSession.update({ where: { id: session.id }, data: { status: "failed", failureReason: "step_error", variables: allVars } });
        return { action: "new_session", session: { id: session.id, flowId: session.flowId, tenantId: session.tenantId, customerPhone: session.customerPhone, customerName: session.customerName, currentStepId: currentStep.id, status: "failed", variables: allVars, loopCounters, currentPixId: null } };
      }
      allVars = { ...allVars, ...result.variables };
      pixId = result.pixId || pixId;
      lastStatus = result.status;
      nextId = result.nextStepId;

      // Grafo: o próximo passo vem da aresta da porta "next"
      // (LOOP é exceção: devolve o alvo da porta "back" quando continua o ciclo)
      if (graphStart && result.status === "active" && currentStep.type !== "LOOP") {
        const gNext = resolveOutgoing(flow.steps as any[], currentStep as any, PORT_NEXT);
        if (gNext) { result.nextStepId = gNext; nextId = gNext; }
      }

      // Se gerou PIX, pausa para aguardar pagamento
      if (result.status === "waiting_pix") { console.log("[FLOW-STOP] breaking at GENERATE_PIX (waiting_pix)"); break; }

      // DELAY em grafo: pausa assíncrona (job retoma depois)
      if (result.status === "waiting_delay") {
        const delayMs = (result as any).delayMs || 5000;
        nextId = currentStep.id;
        await prisma.flowSession.update({ where: { id: session.id }, data: { currentStepId: currentStep.id, status: "waiting_delay", variables: allVars, loopCounters } });
        const { flowTimeoutQueue } = await import("./queue");
        await flowTimeoutQueue.add(
          "delay",
          { sessionId: session.id, stepId: currentStep.id, toStepId: result.nextStepId },
          { delay: delayMs, jobId: `delay-${session.id}-${currentStep.id}` }
        );
        console.log(`[FLOW-DELAY] scheduled ${delayMs}ms for step ${currentStep.id} in session ${session.id?.slice(-8)}`);
        return {
          action: "new_session",
          session: { id: session.id, flowId: session.flowId, tenantId: session.tenantId, customerPhone: session.customerPhone, customerName: session.customerName, currentStepId: nextId, status: "waiting_delay", variables: allVars, loopCounters, currentPixId: pixId || null },
        };
      }

      // Parar se não tem próximo
      if (!result.nextStepId) break;
      // Ir pro próximo
      currentStep = flow.steps?.find((s: any) => s.id === result.nextStepId);
    }

    // Atualizar currentStepId no banco
    await prisma.flowSession.update({
      where: { id: session.id },
      data: {
        currentStepId: nextId,
        status: lastStatus,
        variables: allVars,
        currentPixId: pixId || null,
        loopCounters,
      },
    });

    // Agendar timeout se parou em WAIT_RESPONSE
    scheduleTimeout(session.id, nextId, allVars, loopCounters);

    return {
      action: "new_session",
      session: {
        id: session.id,
        flowId: session.flowId,
        tenantId: session.tenantId,
        customerPhone: session.customerPhone,
        customerName: session.customerName,
        currentStepId: nextId,
        status: lastStatus as FlowSession["status"],
        variables: allVars,
        loopCounters,
        currentPixId: pixId || null,
      },
    };
    }

    return {
      action: "new_session",
      session: {
        id: session.id,
        flowId: session.flowId,
        tenantId: session.tenantId,
        currentStepId: session.currentStepId,
        customerPhone: session.customerPhone,
        customerName: session.customerName || undefined,
        status: "active",
        variables: productVars,
        loopCounters: {},
      },
    };
  }

  /**
   * Continua uma sessão existente após resposta do cliente
   */
  private static async continueSession(
    session: any,
    message: string,
    pushName?: string,
    evolutionClient?: EvolutionClient
  ): Promise<{
    action: "continue_session";
    session?: FlowSession;
    response?: string;
  }> {
    const steps: FlowStepData[] = session.flow?.steps || [];
    const graph = hasGraphEdges(steps as any[]);
    const currentStep = steps.find(
      (s: FlowStepData) => s.id === session.currentStepId
    );
    console.log(`[FLOW-CONT] msg="${message}" step=${currentStep?.type} sessionId=${session.id}`);

    if (!currentStep) {
      // Fluxo acabou? Finalizar sessão
      await prisma.flowSession.update({
        where: { id: session.id },
        data: { status: "completed", completedAt: new Date() },
      });
      return { action: "continue_session" };
    }

    let allVars = (session.variables || {}) as Record<string, string>;
    const loopCounters = (session.loopCounters || {}) as Record<
      string,
      number
    >;

    // Atualizar último activity
    await prisma.flowSession.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    });

    // Cancelar timeout pendente (cliente respondeu)
    try {
      const { flowTimeoutQueue } = await import("./queue");
      for (let r = 0; r <= 5; r++) {
        const jobId = `timeout-${session.id}-${r}`;
        const timeoutJob = await flowTimeoutQueue.getJob(jobId);
        if (timeoutJob) { await timeoutJob.remove(); console.log(`[TIMEOUT] cancelled ${jobId}`); }
      }
    } catch {} // Ignora erro

    // Determinar próximo passo baseado no tipo do passo atual
    let nextStepId: string | null = null;
    let responseText: string | undefined;

    if (currentStep.type === "GENERATE_PIX" && session.status === "waiting_pix") {
      const pixConfig = (currentStep.config || {}) as Record<string, any>;

      // Módulo Confiança: se keyword configurada e mensagem matcha
      if (pixConfig.trustKeyword && matchKeyword(message, pixConfig.trustKeyword, "contains")) {
        // Idempotência: se o material já foi liberado (modo confiança ativo),
        // NÃO repete a entrega — apenas re-pergunta o valor
        if (allVars["_trustMode"] === "asking_amount") {
          if (evolutionClient) {
            const askAgain = pixConfig.trustAskMessage || `Qual valor gostaria de contribuir? (R$${pixConfig.trustMinAmount || 10}-R$${pixConfig.trustMaxAmount || 20})`;
            await evolutionClient.sendText({ number: session.customerPhone, text: askAgain });
          }
          console.log(`[TRUST] re-ask (already delivered) for session ${session.id?.slice(-8)}`);
          return { action: "continue_session", session: { ...session, status: "waiting_pix", variables: allVars } };
        }

        // Entrega o produto imediatamente
        const welcomeMsg = pixConfig.trustWelcomeMessage || `🎁 Quero que você conheça meu trabalho. Vou liberar o material agora. Se ajudar, contribua. Você decide. ❤️`;
        allVars["_trustMode"] = "asking_amount";
        await prisma.flowSession.update({ where: { id: session.id }, data: { variables: allVars, lastActivityAt: new Date() } });
        if (evolutionClient) {
          await evolutionClient.sendText({ number: session.customerPhone, text: welcomeMsg });
          // Entrega os arquivos (sem mensagem de pagamento)
          await sendProductFiles({ ...session, variables: allVars }, session.customerPhone, evolutionClient);
          // Pergunta o valor
          await new Promise(r => setTimeout(r, 1500));
          const askMsg = pixConfig.trustAskMessage || `Qual valor gostaria de contribuir? (R$${pixConfig.trustMinAmount || 10}-R$${pixConfig.trustMaxAmount || 20})`;
          await evolutionClient.sendText({ number: session.customerPhone, text: askMsg });
        }
        console.log(`[TRUST] trust keyword matched for session ${session.id?.slice(-8)}, delivered + asking amount`);
        return { action: "continue_session", session: { ...session, status: "waiting_pix", variables: allVars } };
      }

      // Modo confiança ativo: aguardando valor
      if (allVars["_trustMode"] === "asking_amount") {
        const min = pixConfig.trustMinAmount || 10;
        const max = pixConfig.trustMaxAmount || 20;
        const amount = parseFloat(message.replace(",", "."));
        if (isNaN(amount) || amount < min || amount > max) {
          const invalidMsg = pixConfig.trustInvalidMessage || `Por favor, envie um valor entre R$${min} e R$${max}.`;
          if (evolutionClient) await evolutionClient.sendText({ number: session.customerPhone, text: invalidMsg });
          return { action: "continue_session" };
        }
        // Valor válido: gerar novo PIX, entregar produto, enviar mensagem
        console.log(`[TRUST] amount ${amount} accepted, generating PIX and delivering...`);
        try {
          const trustResult = await generateTrustPix(session, currentStep as FlowStepData, amount, session.tenantId, evolutionClient!, steps);
          allVars = { ...allVars, ...trustResult.variables, _trustMode: "completed" };
          await prisma.flowSession.update({ where: { id: session.id }, data: { variables: allVars, status: "waiting_pix", currentPixId: trustResult.pixId || null, lastActivityAt: new Date() } });
          return { action: "continue_session", session: { ...session, status: "waiting_pix", variables: allVars, currentPixId: trustResult.pixId || null } };
        } catch (err: any) {
          console.error(`[TRUST] failed:`, err.message, err.stack?.split("\n")?.[1] || "");
          if (evolutionClient) await evolutionClient.sendText({ number: session.customerPhone, text: "Ops! Tive um problema. Tente novamente mais tarde." });
          return { action: "continue_session" };
        }
      }

      // Mensagem avulsa enquanto espera o pagamento: NÃO pode fechar a sessão
      // (a entrega pós-pagamento depende dela). Só fecha se o cliente pedir
      // reinício explícito enviando a keyword do fluxo.
      const flowKeyword = session.flow?.triggerKeyword || "";
      const flowMode = session.flow?.triggerMode || "contains";
      if (flowKeyword && matchKeyword(message, flowKeyword, flowMode)) {
        console.log(`[FLOW-CONT] GENERATE_PIX waiting_pix — keyword restart, closing session`);
        await prisma.flowSession.update({ where: { id: session.id }, data: { status: "completed", completedAt: new Date() } });
        return { action: "continue_session", session: { ...session, status: "completed" as any } };
      }
      if (evolutionClient) {
        try {
          await evolutionClient.sendText({
            number: session.customerPhone,
            text: "💰 Estou aguardando a confirmação do seu pagamento! Assim que o PIX for confirmado, envio seu material na hora. 😊",
          });
        } catch {}
      }
      await prisma.flowSession.update({
        where: { id: session.id },
        data: { lastActivityAt: new Date(), variables: allVars },
      });
      console.log(`[FLOW-CONT] waiting_pix kept alive for session ${session.id?.slice(-8)}`);
      return { action: "continue_session", session: { ...session, status: "waiting_pix", variables: allVars } };
    }

    if (
      currentStep.type === "WAIT_RESPONSE" ||
      currentStep.type === "CONDITION"
    ) {
      const config = (currentStep.config || {}) as Record<string, any>;

      if (currentStep.type === "WAIT_RESPONSE") {
        // Salvar resposta na variável
        const varName = config.variable || "resposta";
        allVars[varName] = message;

        // Verificar se resposta é esperada
        const expected = config.expected || [];
        // Palavras de desinteresse ("não", "desisto"...): desviam para a rota de recusa
        const altKeywords = config.altKeywords || [];

        if (graph && expected.length === 0 && altKeywords.length === 0) {
          // WAIT_RESPONSE sem listas no grafo = espera QUALQUER resposta:
          // avança direto pela porta next
          nextStepId = resolveOutgoing(steps as any[], currentStep as any, PORT_NEXT);
        } else if (expected.length > 0 && matchResponse(message, expected)) {
          nextStepId = graph
            ? resolveOutgoing(steps as any[], currentStep as any, PORT_NEXT)
            : currentStep.nextStepId || steps.find((s: FlowStepData) => s.order === currentStep.order + 1)?.id || null;
        } else if (altKeywords.length > 0 && matchResponse(message, altKeywords)) {
          if (graph) {
            // Grafo: recusa segue a aresta da porta "alt" (sem aresta = despedida)
            nextStepId = resolveOutgoing(steps as any[], currentStep as any, PORT_ALT);
          } else {
            // Se o próximo passo é um CONDITION, deixa o CONDITION decidir a rota
            const naturalNext =
              currentStep.nextStepId ||
              steps.find((s: FlowStepData) => s.order === currentStep.order + 1)?.id ||
              null;
            const nextIsCondition =
              steps.find((s: FlowStepData) => s.id === naturalNext)?.type === "CONDITION";

            if (nextIsCondition) {
              nextStepId = naturalNext;
            } else if (currentStep.altNextStepId) {
              // Tem rota de recusa configurada: segue para ela
              nextStepId = currentStep.altNextStepId;
            } else {
              nextStepId = null;
            }
          }
          if (!nextStepId) {
            // Sem rota de recusa: mensagem de despedida e encerra o fluxo
            const flowKeyword = session.flow?.triggerKeyword || "iniciar";
            const goodbye = (
              config.altMessage ||
              "Tudo bem! 😊 Se mudar de ideia, é só me enviar *{{keyword}}* novamente."
            ).replace(/\{\{keyword\}\}/g, flowKeyword);
            if (evolutionClient) {
              await evolutionClient.sendText({ number: session.customerPhone, text: goodbye });
            }
            await prisma.flowSession.update({
              where: { id: session.id },
              data: { status: "completed", completedAt: new Date(), variables: allVars, loopCounters },
            });
            return {
              action: "continue_session",
              session: {
                id: session.id,
                flowId: session.flowId,
                tenantId: session.tenantId,
                currentStepId: null,
                customerPhone: session.customerPhone,
                customerName: session.customerName || undefined,
                status: "completed",
                variables: allVars,
                loopCounters,
              },
            };
          }
        } else if (graph) {
          // Grafo: se o próximo passo é um CONDITION, encaminha QUALQUER resposta
          // para ele decidir (o fallback fica por conta da rota "*" do CONDITION)
          const nextTarget = resolveOutgoing(steps as any[], currentStep as any, PORT_NEXT);
          const nextIsCondition =
            steps.find((s: FlowStepData) => s.id === nextTarget)?.type === "CONDITION";
          if (nextIsCondition) {
            nextStepId = nextTarget;
          } else {
            // Sem CONDITION na sequência: fallback atual (sem consumir retries)
            const replyMsg = config.fallbackMessage || config.retryMessage;
            if (replyMsg && evolutionClient) {
              await evolutionClient.sendText({ number: session.customerPhone, text: replyMsg });
            }
            nextStepId = currentStep.id; // Fica aguardando
            await prisma.flowSession.update({ where: { id: session.id }, data: { variables: allVars, loopCounters } });
            scheduleTimeout(session.id, currentStep.id, allVars, loopCounters);
          }
        } else {
          // Resposta não esperada — envia fallback sem consumir retries
          const replyMsg = config.fallbackMessage || config.retryMessage;
          if (replyMsg && evolutionClient) {
            await evolutionClient.sendText({ number: session.customerPhone, text: replyMsg });
          }
          nextStepId = currentStep.id; // Fica aguardando
          // Reagendar timeout (foi cancelado no início do continueSession)
          await prisma.flowSession.update({ where: { id: session.id }, data: { variables: allVars, loopCounters } });
          scheduleTimeout(session.id, currentStep.id, allVars, loopCounters);
        }
      } else if (currentStep.type === "CONDITION") {
        if (graph) {
          // Grafo: rotas nomeadas com arestas explícitas (route:<id>)
          const cr = resolveConditionTarget(steps as any[], currentStep as any, message);
          if (cr.reply && evolutionClient) {
            await evolutionClient.sendText({ number: session.customerPhone, text: cr.reply });
          }
          nextStepId = cr.targetStepId;
        } else {
          // Legado: avaliação idêntica à atual (goToType next/alt/prev)
          const varName = config.variable || "resposta";
          const routes = config.routes || [];
          let matched = false;

          for (const route of routes) {
            const routeValues = route.values || [];
            if (
              routeValues.includes("*") ||
              matchResponse(message, routeValues, config.operator)
            ) {
              if (route.goToType === "next") {
                nextStepId = currentStep.nextStepId || steps.find((s: FlowStepData) => s.order === currentStep.order + 1)?.id || null;
              } else if (route.goToType === "alt") {
                nextStepId = currentStep.altNextStepId || steps.find((s: FlowStepData) => s.order === currentStep.order + 1)?.id || null;
              } else if (route.goToType === "prev") {
                const prevStep = steps.find((s: FlowStepData) => s.order === currentStep.order - 1);
                nextStepId = prevStep?.id || null;
                const pConfig = (prevStep?.config || {}) as Record<string, any>;
                const reply = route.message || pConfig.fallbackMessage || pConfig.retryMessage;
                if (reply && evolutionClient) {
                  await evolutionClient.sendText({ number: session.customerPhone, text: reply });
                }
              }
              matched = true;
              break;
            }
          }

          if (!matched) {
            // Fallback: caminho padrão
            nextStepId = currentStep.nextStepId;
          }
        }
      }
    } else {
      // Para passos que não dependem de resposta (SEND_MESSAGE, etc.)
      // Avança para o próximo
      nextStepId = currentStep.nextStepId;
    }

    // Se não tem próximo passo → completar sessão
    if (!nextStepId) {
      await prisma.flowSession.update({
        where: { id: session.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          variables: allVars,
          loopCounters,
        },
      });
      return {
        action: "continue_session",
        session: {
          id: session.id,
          flowId: session.flowId,
          tenantId: session.tenantId,
          currentStepId: null,
          customerPhone: session.customerPhone,
          customerName: session.customerName || undefined,
          status: "completed",
          variables: allVars,
          loopCounters,
        },
      };
    }

    // Executar passos em sequência até chegar em interação ou fim
    let cs = steps.find((s: FlowStepData) => s.id === nextStepId);
    let totalExec = 0;
    const execCounts: Record<string, number> = {};
    while (cs && evolutionClient) {
      if (cs.type === "WAIT_RESPONSE") {
        // WAIT_RESPONSE: pausa e espera input do cliente
        await prisma.flowSession.update({ where: { id: session.id }, data: { currentStepId: cs.id, status: "active", variables: allVars, loopCounters } });
        scheduleTimeout(session.id, cs.id, allVars, loopCounters);
        return { action: "continue_session", session: { id: session.id, flowId: session.flowId, tenantId: session.tenantId, currentStepId: cs.id, customerPhone: session.customerPhone, customerName: session.customerName || undefined, status: "active", variables: allVars, loopCounters } };
      }

      if (cs.type === "CONDITION") {
        if (graph) {
          // Grafo: rotas nomeadas com arestas — avalia a resposta recém-recebida
          const cr = resolveConditionTarget(steps as any[], cs as any, message);
          if (cr.reply && evolutionClient) {
            await evolutionClient.sendText({ number: session.customerPhone, text: cr.reply });
          }
          if (!cr.targetStepId) break;
          cs = steps.find((s: FlowStepData) => s.id === cr.targetStepId) || undefined;
          continue;
        }
        // Legado: avaliação idêntica à atual
        const cConfig = (cs.config || {}) as Record<string, any>;
        const routes = cConfig.routes || [];
        let target = cs.nextStepId;
        for (const route of routes) {
          const routeValues = (route.values || []) as string[];
          if (
            routeValues.includes("*") ||
            matchResponse(message, routeValues, cConfig.operator)
          ) {
            if (route.goToType === "alt") {
              target = cs.altNextStepId || null;
            } else if (route.goToType === "prev") {
              // Voltar ao passo anterior (re-perguntar) — usado para dúvidas:
              // envia a mensagem da rota e volta para a pergunta
              const prevStep = steps.find((s: FlowStepData) => s.order === cs!.order - 1);
              target = prevStep?.id || null;
              const pConfig = (prevStep?.config || {}) as Record<string, any>;
              const reAsk = route.message || pConfig.fallbackMessage || pConfig.retryMessage;
              if (reAsk && evolutionClient) {
                await evolutionClient.sendText({ number: session.customerPhone, text: reAsk });
              }
            }
            // "next" (padrão) mantém cs.nextStepId
            break;
          }
        }
        if (!target) break;
        cs = steps.find((s: FlowStepData) => s.id === target) || undefined;
        continue;
      }

      // Guarda de ciclo/budget (nunca executar em loop infinito)
      totalExec++;
      execCounts[cs.id] = (execCounts[cs.id] || 0) + 1;
      if (totalExec > MAX_STEPS_PER_PASS || execCounts[cs.id] > MAX_EXEC_PER_STEP_PER_PASS) {
        console.error(`[FLOW-GUARD] budget/cycle exceeded at step ${cs.id} (type=${cs.type})`);
        await prisma.flowSession.update({ where: { id: session.id }, data: { status: "failed", failureReason: "cycle_or_budget", variables: allVars, loopCounters } });
        return { action: "continue_session", session: { id: session.id, flowId: session.flowId, tenantId: session.tenantId, currentStepId: cs.id, customerPhone: session.customerPhone, customerName: session.customerName || undefined, status: "failed", variables: allVars, loopCounters } };
      }

      // GENERATE_PIX e outros: executa normalmente (com allVars mesclado)
      // Erros de configuração do usuário (produto sem preço, PIX sem token...)
      // não podem derrubar o motor: avisa o cliente e tenta a saída alternativa
      let result: any;
      try {
        const mergedSession = { ...session, variables: allVars };
        result = await FlowEngine.executeStep(cs, mergedSession, session.customerPhone, session.tenantId, evolutionClient, steps);
      } catch (err: any) {
        console.error(`[FLOW-ERR] step ${cs.id} (${cs.type}) failed:`, err.message);
        try {
          await evolutionClient.sendText({ number: session.customerPhone, text: "Ops! Tive um problema nessa etapa. Tente novamente em instantes. 🙏" });
        } catch {}
        const altTarget: string | null = graph
          ? resolveOutgoing(steps as any[], cs as any, PORT_ALT)
          : cs?.altNextStepId || null;
        if (altTarget) {
          cs = steps.find((s: FlowStepData) => s.id === altTarget) || undefined;
          continue;
        }
        await prisma.flowSession.update({ where: { id: session.id }, data: { status: "failed", failureReason: "step_error", variables: allVars, loopCounters } });
        return { action: "continue_session", session: { id: session.id, flowId: session.flowId, tenantId: session.tenantId, currentStepId: cs.id, customerPhone: session.customerPhone, customerName: session.customerName || undefined, status: "failed", variables: allVars, loopCounters } };
      }
      allVars = { ...allVars, ...result.variables };

      // Grafo: o próximo passo vem da aresta da porta "next"
      // (LOOP é exceção: devolve o alvo da porta "back" quando continua o ciclo)
      if (graph && result.status === "active" && cs.type !== "LOOP") {
        const gNext = resolveOutgoing(steps as any[], cs as any, PORT_NEXT);
        if (gNext) result.nextStepId = gNext;
      }

      // Se gerou PIX, salva e pausa para aguardar pagamento
      if (result.status === "waiting_pix") {
        await prisma.flowSession.update({ where: { id: session.id }, data: { currentStepId: result.nextStepId || cs.id, status: "waiting_pix", variables: allVars, loopCounters, currentPixId: result.pixId || null } });
        return { action: "continue_session", session: { id: session.id, flowId: session.flowId, tenantId: session.tenantId, currentStepId: result.nextStepId || cs.id, customerPhone: session.customerPhone, customerName: session.customerName || undefined, status: "waiting_pix", variables: allVars, loopCounters, currentPixId: result.pixId || null } };
      }

      // DELAY em grafo: pausa assíncrona (job retoma depois)
      if (result.status === "waiting_delay") {
        const delayMs = (result as any).delayMs || 5000;
        await prisma.flowSession.update({ where: { id: session.id }, data: { currentStepId: cs.id, status: "waiting_delay", variables: allVars, loopCounters } });
        const { flowTimeoutQueue } = await import("./queue");
        await flowTimeoutQueue.add(
          "delay",
          { sessionId: session.id, stepId: cs.id, toStepId: result.nextStepId },
          { delay: delayMs, jobId: `delay-${session.id}-${cs.id}` }
        );
        console.log(`[FLOW-DELAY] scheduled ${delayMs}ms for step ${cs.id} in session ${session.id?.slice(-8)}`);
        return { action: "continue_session", session: { id: session.id, flowId: session.flowId, tenantId: session.tenantId, currentStepId: cs.id, customerPhone: session.customerPhone, customerName: session.customerName || undefined, status: "waiting_delay", variables: allVars, loopCounters } };
      }

      if (!result.nextStepId) break;
      cs = steps.find((s: FlowStepData) => s.id === result.nextStepId) || undefined;
    }

    // Atualizar sessão (alvo pendurado = encerra para não ficar preso)
    if (cs?.id) {
      await prisma.flowSession.update({ where: { id: session.id }, data: { currentStepId: cs.id, status: "active", variables: allVars, loopCounters } });
    } else {
      console.log(`[FLOW-END] dangling target for session ${session.id?.slice(-8)} — completing`);
      await prisma.flowSession.update({ where: { id: session.id }, data: { status: "completed", completedAt: new Date(), variables: allVars, loopCounters } });
    }

    return { action: "continue_session" };
  }

  /**
   * Executa um passo específico
   */
  static async executeStep(
    step: FlowStepData,
    session: any,
    phone: string,
    tenantId: string,
    evolutionClient: EvolutionClient,
    allSteps: FlowStepData[]
  ): Promise<{
    nextStepId: string | null;
    status: FlowSession["status"];
    variables: Record<string, string>;
    loopCounters?: Record<string, number>;
    pixId?: string;
    response?: string;
    failureReason?: string;
  }> {
    const variables = { ...(session.variables || {}) };
    const loopCounters = { ...(session.loopCounters || {}) };
    const config = (step.config || {}) as Record<string, any>;

    switch (step.type) {
      case "SEND_MESSAGE": {
        const text = renderTemplate(config.text || "", {
          ...variables,
          "customer.name": session.customerName || "Cliente",
        });

        try {
          await evolutionClient.sendText({ number: phone, text });
        } catch (err) {
          console.error("Failed to send message:", err);
        }

        await prisma.messageLog.create({
          data: {
            tenantId,
            sessionId: session.id,
            customerPhone: phone,
            direction: "outbound",
            type: "text",
            content: text,
          },
        });

        // Auto-avançar: se não tem nextStepId, vai pro próximo por ordem
        const nextByOrder = allSteps.find(s => s.order === step.order + 1);
        return {
          nextStepId: step.nextStepId || nextByOrder?.id || null,
          status: "active",
          variables,
          loopCounters,
          response: text,
        };
      }

      case "WAIT_RESPONSE": {
        // Não envia nada, apenas espera a resposta do cliente
        variables._waitStartedAt = String(Date.now());
        return {
          nextStepId: step.id, // Aguarda no mesmo passo
          status: "active",
          variables,
          loopCounters,
        };
      }

      case "GENERATE_PIX": {
        const pixConfig = (step.config || {}) as Record<string, any>;

        // Se módulo confiança ativo e resposta foi a keyword de confiança
        const trustKeyword = pixConfig.trustKeyword;
        const resposta = variables["resposta"] || variables["_lastMessage"] || "";
        if (trustKeyword && matchKeyword(resposta, trustKeyword, "contains")) {
          console.log(`[TRUST] confidence keyword matched at PIX generation, entering trust flow`);
          const welcomeMsg = pixConfig.trustWelcomeMessage || `🎁 Quero que você conheça meu trabalho. Vou liberar o material agora. Se ajudar, contribua. Você decide. ❤️`;
          const askMsg = pixConfig.trustAskMessage || `Qual valor gostaria de contribuir? (R$${pixConfig.trustMinAmount || 10}-R$${pixConfig.trustMaxAmount || 20})`;
          variables["_trustMode"] = "asking_amount";

          // 1. Envia mensagem de boas-vindas
          await evolutionClient.sendText({ number: phone, text: welcomeMsg });

          // 2. Entrega os arquivos (sem mensagem de pagamento)
          await sendProductFiles({ ...session, variables }, phone, evolutionClient);

          // 3. Pergunta o valor da contribuição
          await new Promise(r => setTimeout(r, 1500));
          await evolutionClient.sendText({ number: phone, text: askMsg });

          return {
            nextStepId: step.id,
            status: "waiting_pix",
            variables,
            loopCounters,
          };
        }

        // Buscar tenant config do gateway de pagamento
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
        });
        const token = tenant?.mercadopagoToken || "";
        if (!token) {
          console.error(`[PIX-ERR] No payment token for tenant ${tenantId}`);
          try {
            await evolutionClient.sendText({
              number: phone,
              text: "❌ *Erro ao gerar PIX*\n\nO token de pagamento não foi configurado. Por favor, entre em contato com o suporte.",
            });
          } catch {}
          return {
            nextStepId: step.altNextStepId || null,
            status: "failed",
            variables,
            loopCounters,
            response: "Erro: token de pagamento não configurado",
          };
        }

        // Buscar produto vinculado
        let price = 0;
        let description = config.description || "Produto digital";

        if (step.productId) {
          const product = await prisma.product.findUnique({
            where: { id: step.productId },
          });
          if (product) {
            price = product.price;
            description = product.name;
            variables["product.name"] = product.name;
            variables["product.price"] = String(product.price);
            variables["product.fileUrl"] = product.fileUrl;
            variables["product.extraFiles"] = JSON.stringify(product.extraFiles || []);
          }
        } else if (config.valueFrom) {
          price = parseFloat(variables[config.valueFrom] || "0") || 0;
        }

        try {
          const isInfinitePay = detectPixProvider(token) === "infinitepay";
          // orderNsu fixo para retries (InfinitePay casa o webhook por ele)
          const orderNsu = isInfinitePay ? `ezflow-${randomUUID()}` : "";

          // Retry: 3 tentativas para criar cobrança (resiliência a falhas momentâneas do gateway)
          let pix: { id: string; pixCopyPaste: string; pixQrCodeBase64: string; pixExpiration: string };
          let pixError: any = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              if (isInfinitePay) {
                const { InfinitePayClient } = await import("./infinitepay");
                const ip = new InfinitePayClient(token);
                const webhookUrl = process.env.NEXTAUTH_URL
                  ? `${process.env.NEXTAUTH_URL.replace(/\/$/, "")}/api/webhooks/infinitepay`
                  : undefined;
                const r = await ip.createCheckoutLink({
                  amount: price,
                  description,
                  orderNsu,
                  webhookUrl,
                  customer: {
                    name: session.customerName || undefined,
                    phoneNumber: phone,
                  },
                });
                console.log(`[PIX-LINK] InfinitePay link created order=${orderNsu}`);
                pix = { id: orderNsu, pixCopyPaste: r.url, pixQrCodeBase64: "", pixExpiration: "" };
              } else {
                const mp = new MercadoPagoClient(token);
                const r = await mp.createPixPayment({ amount: price, description, expirationMinutes: config.expirationMinutes || 30 });
                pix = { id: r.id, pixCopyPaste: r.pixCopyPaste, pixQrCodeBase64: r.pixQrCodeBase64, pixExpiration: r.pixExpiration };
              }
              pixError = null;
              break; // sucesso, sai do loop
            } catch (err: any) {
              pixError = err;
              if (attempt < 2) {
                console.log(`[PIX-RETRY] attempt ${attempt + 1} failed (${err.message}), retrying in 2s...`);
                await new Promise(r => setTimeout(r, 2000));
              }
            }
          }
          if (pixError) throw pixError;

          // Forma de pagamento: "pix" (padrão) | "link" | "both"
          // Fluxos antigos com paymentLink=true viram "both"
          const paymentMode = isInfinitePay
            ? "link"
            : ((config.paymentMode as string) || (config.paymentLink ? "both" : "pix"));

          // Checkout Pro (Mercado Pago) — criado quando o link faz parte do modo
          let checkoutUrl = "";
          const linkRef =
            !isInfinitePay && (paymentMode === "link" || paymentMode === "both")
              ? `ezlink-${randomUUID()}`
              : "";
          if (!isInfinitePay && (paymentMode === "link" || paymentMode === "both")) {
            try {
              const mpCheckout = new MercadoPagoClient(token);
              checkoutUrl =
                (await mpCheckout.createCheckoutLink({
                  amount: price,
                  description,
                  expirationMinutes: config.expirationMinutes || 30,
                  externalReference: linkRef,
                })) || "";
            } catch (err: any) {
              console.error("[PIX-LINK] failed to create checkout link:", err.message);
            }
          }

          if (paymentMode === "link") {
            // Link como forma principal (sem código PIX) — InfinitePay e MP link
            await evolutionClient.sendText({
              number: phone,
              text: `💳 *Pagamento*\n\n📦 *Produto:* ${description}\n💰 *Valor:* R$ ${price.toFixed(2)}\n\n👉 Pague pelo link abaixo:\n${checkoutUrl || pix.pixCopyPaste}`,
            });
          } else {
            // PIX copia-e-cola (com link adicional quando "both")
            await evolutionClient.sendText({
              number: phone,
              text: `💳 *Pagamento via PIX*\n\n📦 *Produto:* ${description}\n💰 *Valor:* R$ ${price.toFixed(2)}\n⏰ *Vence em:* ${config.expirationMinutes || 30} minutos`,
            });
            // Enviar código PIX isolado para fácil cópia
            await evolutionClient.sendText({
              number: phone,
              text: pix.pixCopyPaste,
            });
            // Mensagem de instrução opcional (ex: "Copie e cole no app do banco")
            if (config.instructionMessage) {
              await evolutionClient.sendText({
                number: phone,
                text: config.instructionMessage,
              });
            }
            if (paymentMode === "both" && checkoutUrl) {
              await evolutionClient.sendText({
                number: phone,
                text: `💻 *Ou pague pelo link:*\n${checkoutUrl}`,
              });
            }
          }

          // Polling via BullMQ: apenas Mercado Pago (InfinitePay confirma via webhook)
          if (!isInfinitePay) {
            try {
              const { flowTimeoutQueue } = await import("./queue");
              const expMinutes = config.expirationMinutes || 30;
              const iterations = Math.ceil((expMinutes * 60) / 30); // a cada 30 segundos
              for (let i = 1; i <= iterations; i++) {
                await flowTimeoutQueue.add(
                  "pix-poll",
                  { paymentId: pix.id, tenantId },
                  { delay: i * 30000, jobId: `pix-poll-${pix.id}-${i}` }
                );
              }
            } catch (err: any) {
              console.error(`[PIX-POLL] failed to schedule:`, err.message);
            }
          }

          // Agendar lembretes de remarketing (opcionais)
          const reminder1Min = config.reminder1Minutes;
          const reminder2Min = config.reminder2Minutes;
          try {
            const { flowTimeoutQueue } = await import("./queue");
            if (reminder1Min && config.reminder1Message) {
              await flowTimeoutQueue.add(
                "pix-reminder",
                { sessionId: session.id, reminder: 1, message: config.reminder1Message },
                { delay: reminder1Min * 60 * 1000, jobId: `pix-reminder1-${session.id}` }
              );
              console.log(`[PIX-REMINDER] 1st reminder scheduled in ${reminder1Min}min for session ${session.id?.slice(-8)}`);
            }
            if (reminder2Min && config.reminder2Message) {
              await flowTimeoutQueue.add(
                "pix-reminder",
                { sessionId: session.id, reminder: 2, message: config.reminder2Message },
                { delay: reminder2Min * 60 * 1000, jobId: `pix-reminder2-${session.id}` }
              );
              console.log(`[PIX-REMINDER] 2nd reminder scheduled in ${reminder2Min}min for session ${session.id?.slice(-8)}`);
            }
          } catch (err: any) {
            console.error(`[PIX-REMINDER] failed to schedule:`, err.message);
          }

          // Registrar venda
          await prisma.sale.create({
            data: {
              tenantId,
              flowId: session.flowId,
              sessionId: session.id,
              productId: step.productId || "unknown",
              customerPhone: phone,
              customerName: session.customerName,
              amount: price,
              status: "PENDING",
              externalId: pix.id,
              pixCopyPaste: pix.pixCopyPaste,
              pixQrCode: pix.pixQrCodeBase64,
              pixExpiresAt: isInfinitePay ? null : new Date(pix.pixExpiration),
              metadata: {
                stepId: step.id,
                pixStepId: step.id,
                nextStepId: hasGraphEdges(allSteps as any[])
                  ? resolveOutgoing(allSteps as any[], step as any, PORT_NEXT)
                  : step.nextStepId,
                gateway: isInfinitePay ? "infinitepay" : "mercadopago",
                ...(linkRef ? { linkRef } : {}),
              },
            },
          });

          variables["pixId"] = pix.id;
          variables["pixStatus"] = "pending";

          return {
            nextStepId: step.id, // Aguarda pagamento neste passo
            status: "waiting_pix",
            variables,
            loopCounters,
            pixId: pix.id,
            response: pix.pixCopyPaste,
          };
        } catch (err: any) {
          console.error("Mercado Pago error:", err);
          // Enviar mensagem de erro ao cliente
          try {
            await evolutionClient.sendText({
              number: phone,
              text: "Opa! Tive um problema ao gerar o PIX. Vou tentar de novo em instantes. Se o problema persistir, entre em contato com o suporte.",
            });
          } catch {}

          return {
            nextStepId: step.altNextStepId || null,
            status: "failed",
            variables,
            loopCounters,
            failureReason: err.message,
          };
        }
      }

      case "DELIVER_PRODUCT": {
        // SEGURANÇA: nunca entregar sem uma venda PAID nesta sessão
        // (sessões zumbis retomadas por jobs antigos desembocavam aqui)
        const sessionId = (session as any)?.id;
        if (sessionId) {
          const paidSale = await prisma.sale.findFirst({
            where: { sessionId, status: "PAID" },
            select: { id: true },
          });
          if (!paidSale) {
            console.warn(`[DELIVER] no PAID sale for session ${sessionId?.slice(-8)} — skipping delivery (safety)`);
            return {
              nextStepId: hasGraphEdges(allSteps as any[])
                ? resolveOutgoing(allSteps as any[], step as any, PORT_NEXT)
                : step.nextStepId || allSteps.find(s => s.order === step.order + 1)?.id || null,
              status: "active",
              variables,
              loopCounters,
            };
          }
        }
        const fileUrl = variables["product.fileUrl"] || config.fileUrl || "";
        const productName = variables["product.name"] || "seu produto";
        const deliveryMsg = renderTemplate(
          config.message || "Aqui está seu produto! Obrigado pela compra.",
          variables
        );

        // Enviar mensagem de entrega
        await evolutionClient.sendText({
          number: phone,
          text: `✅ *Pagamento confirmado!*\n\n${deliveryMsg}`,
        });

        // Enviar arquivo(s)
        const sendOne = async (url: string, name: string) => {
          const ext = (url.split(".").pop() || "").toLowerCase();
          const type = ["mp3","m4a","ogg","wav"].includes(ext) ? "audio" : ["mp4","avi","mov"].includes(ext) ? "video" : ["jpg","jpeg","png","gif"].includes(ext) ? "image" : "document";
          console.log(`[DELIVER] sending ${type} file: ${url} (${name})`);

          // Se é arquivo local (/uploads/...), converte pra base64
          let mediaUrl = url;
          if (url.startsWith("/uploads/")) {
            try {
              const fs = await import("fs/promises");
              const path = await import("path");
              const filePath = path.join(process.cwd(), "public", url);
              const buffer = await fs.readFile(filePath);
              const b64 = buffer.toString("base64");
              const mimeMap: Record<string, string> = { pdf: "application/pdf", mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav", mp4: "video/mp4", mov: "video/quicktime", avi: "video/x-msvideo", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
              const mimeType = mimeMap[ext] || "application/octet-stream";
              mediaUrl = b64;
              console.log(`[DELIVER] converted ${url} to base64 (${(buffer.length/1024).toFixed(0)}KB)`);
            } catch (err: any) {
              console.error(`[DELIVER] failed to read local file ${url}:`, err.message);
              return;
            }
          }
          try { await evolutionClient.sendMedia({ number: phone, mediaType: type as any, mediaUrl, fileName: name, caption: `📎 ${name}` }); console.log(`[DELIVER] sent OK: ${name}`); } catch (err: any) { console.error(`[DELIVER] sendMedia failed for ${name}:`, err.message); }
        };
        const filesToSend: { url: string; name: string }[] = [];
        // Extra files primeiro (inclui todos os arquivos com nomes originais)
        try { const extra = JSON.parse(variables["product.extraFiles"] || "[]"); (extra as any[]).forEach((f: any) => filesToSend.push({ url: f.url, name: f.name || "Arquivo" })); } catch {}
        // Arquivo principal: só adiciona se não está nos extraFiles (backward compat)
        if (fileUrl && !filesToSend.some(f => f.url === fileUrl)) {
          const ext = fileUrl.split(".").pop() || "";
          filesToSend.push({ url: fileUrl, name: productName.endsWith(`.${ext}`) ? productName : `${productName}.${ext}` });
        }
        for (const f of filesToSend) { await sendOne(f.url, f.name); }

        // Atualizar venda como entregue
        await prisma.sale.updateMany({
          where: {
            sessionId: session.id,
            status: "PAID",
            deliveryStatus: null,
          },
          data: {
            deliveredAt: new Date(),
            deliveryStatus: "sent",
          },
        });

        return {
          nextStepId: step.nextStepId, // Geralmente null (fim do fluxo)
          status: "completed",
          variables,
          loopCounters,
          response: deliveryMsg,
        };
      }

      case "CONDITION": {
        // CONDITION é processado em continueSession quando chega a resposta
        // Aqui apenas avança (não deve acontecer — CONDITION sempre segue WAIT_RESPONSE)
        return {
          nextStepId: step.nextStepId || allSteps.find(s => s.order === step.order + 1)?.id || null,
          status: "active",
          variables,
          loopCounters,
        };
      }

      case "SEND_AUDIO": {
        const audioUrl = config.audioUrl || "";
        const caption = config.caption || "";
        const audioName = config.audioName || audioUrl.split("/").pop() || "audio.m4a";

        if (audioUrl) {
          let mediaUrl = audioUrl;
          if (audioUrl.startsWith("/uploads/")) {
            try {
              const { readFile } = await import("fs/promises");
              const path = await import("path");
              const filePath = path.join(process.cwd(), "public", audioUrl);
              const buffer = await readFile(filePath);
              mediaUrl = buffer.toString("base64");
            } catch {}
          }
          try {
            await evolutionClient.sendMedia({
              number: phone,
              mediaType: "audio" as any,
              mediaUrl,
              caption: caption || undefined,
              fileName: audioName,
            });
          } catch (err: any) { console.error("sendAudio failed:", err.message); }
        }

        const nextByOrder = allSteps.find(s => s.order === step.order + 1);
        return { nextStepId: step.nextStepId || nextByOrder?.id || null, status: "active", variables, loopCounters };
      }

      case "SEND_FILE": {
        const fileUrl = config.fileUrl || "";
        const caption = config.caption || "";
        const fileName = config.fileName || fileUrl.split("/").pop() || "arquivo";
        const ext = (fileUrl.split(".").pop() || "").toLowerCase();
        const type = ["mp3","m4a","ogg","wav"].includes(ext) ? "audio" : ["mp4","avi","mov"].includes(ext) ? "video" : ["jpg","jpeg","png","gif","webp"].includes(ext) ? "image" : "document";

        if (fileUrl) {
          let mediaUrl = fileUrl;
          if (fileUrl.startsWith("/uploads/")) {
            try {
              const { readFile } = await import("fs/promises");
              const path = await import("path");
              const filePath = path.join(process.cwd(), "public", fileUrl);
              const buffer = await readFile(filePath);
              mediaUrl = buffer.toString("base64");
            } catch {}
          }
          try {
            await evolutionClient.sendMedia({
              number: phone,
              mediaType: type as any,
              mediaUrl,
              caption: caption || undefined,
              fileName,
            });
          } catch (err: any) { console.error("sendFile failed:", err.message); }
        }

        const nextByOrder = allSteps.find(s => s.order === step.order + 1);
        return { nextStepId: step.nextStepId || nextByOrder?.id || null, status: "active", variables, loopCounters };
      }

      case "DELAY": {
        const seconds = config.seconds || 2;
        const graphMode = hasGraphEdges(allSteps as any[]);
        if (graphMode) {
          // Grafo: pausa assíncrona via job BullMQ (não bloqueia o worker)
          const target = resolveOutgoing(allSteps as any[], step as any, PORT_NEXT);
          return {
            nextStepId: target,
            status: "waiting_delay",
            delayMs: seconds * 1000,
            variables,
            loopCounters,
          } as any;
        }
        // Legado: comportamento atual (sleep síncrono)
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        const nextByOrder = allSteps.find(s => s.order === step.order + 1);
        return {
          nextStepId: step.nextStepId || nextByOrder?.id || null,
          status: "active",
          variables,
          loopCounters,
        };
      }

      case "LOOP": {
        const maxIter = config.maxIterations || 3;
        // Namespace "loop:" evita colisão com retries de WAIT_RESPONSE;
        // chave legada nua é lida como fallback para sessões antigas em voo
        const loopKey = `loop:${step.id}`;
        const currentIter = loopCounters[loopKey] ?? loopCounters[step.id] ?? 0;
        const exitCond = config.exitCondition || "";

        // Verificar condição de saída
        let shouldExit = currentIter >= maxIter;
        if (exitCond) {
          // Formato: "variable:nome=valor"
          const match = exitCond.match(/variable:(\w+)=(.+)/);
          if (match) {
            const [, varName, expectedValue] = match;
            if (variables[varName] === expectedValue) {
              shouldExit = true;
            }
          }
        }

        if (shouldExit) {
          return {
            nextStepId: step.nextStepId, // Sai do loop
            status: "active",
            variables,
            loopCounters,
          };
        }

        // Continua loop: volta para o passo indicado
        loopCounters[loopKey] = currentIter + 1;
        const graphLoop = hasGraphEdges(allSteps as any[]);
        const backToStepId = graphLoop
          ? resolveOutgoing(allSteps as any[], step as any, PORT_BACK)
          : config.backToStepId ||
            allSteps[config.backToStepIndex || 0]?.id ||
            step.nextStepId;

        return {
          nextStepId: backToStepId,
          status: "active",
          variables,
          loopCounters,
        };
      }

      default:
        return {
          nextStepId: step.nextStepId || allSteps.find(s => s.order === step.order + 1)?.id || null,
          status: "active",
          variables,
          loopCounters,
        };
    }
  }

  /**
   * Processa webhook de confirmação de pagamento do Mercado Pago
   */
  static async handlePixPayment(
    paymentId: string,
    tenantId: string,
    verify?: { transactionNsu?: string; slug?: string },
    skipVerification = false,
    skipDeliveryDedupe = false
  ): Promise<{ success: boolean; delivered: boolean }> {
    try {
      // Buscar venda pelo externalId (PIX direto) — ou pelo linkRef do
      // Checkout Pro (o webhook traz o id do pagamento do LINK, que é
      // diferente do id do PIX; a external_reference casa os dois)
      let sale = await prisma.sale.findFirst({
        where: { externalId: paymentId, tenantId },
        include: { session: { include: { flow: { include: { steps: true } } } } },
      });

      if (!sale) {
        try {
          const tenantTmp = await prisma.tenant.findUnique({
            where: { id: tenantId },
          });
          if (tenantTmp?.mercadopagoToken) {
            const mpTmp = new MercadoPagoClient(tenantTmp.mercadopagoToken);
            const payTmp = await mpTmp.getPaymentStatus(paymentId);
            if (payTmp.externalReference) {
              sale = await prisma.sale.findFirst({
                where: {
                  tenantId,
                  metadata: { path: ["linkRef"], equals: payTmp.externalReference },
                },
                include: {
                  session: { include: { flow: { include: { steps: true } } } },
                },
              });
              if (sale) {
                console.log(`[DELIVER] matched checkout-link payment via linkRef ${payTmp.externalReference}`);
              }
            }
          }
        } catch (err: any) {
          console.log(`[DELIVER] link payment lookup failed: ${err.message}`);
        }
      }

      if (!sale) {
        console.log(`Sale not found for payment ${paymentId}`);
        return { success: false, delivered: false };
      }

      // Evitar entrega duplicada (retry manual já "reivindicou" a entrega
      // com deliveryStatus=sending — skipDeliveryDedupe pula este guard)
      if (
        !skipDeliveryDedupe &&
        (sale.deliveryStatus === "sent" || sale.deliveryStatus === "sending")
      ) {
        console.log(`[DELIVER] Sale ${sale.id} already ${sale.deliveryStatus}, skipping`);
        return { success: true, delivered: true };
      }

      // Buscar tenant config
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant?.mercadopagoToken) {
        return { success: false, delivered: false };
      }

      // Gateway usado na criação da venda (gravado no metadata) —
      // trocar o token nas configurações não afeta vendas já pendentes
      const saleMetaGw = (sale.metadata as any)?.gateway;
      const gateway =
        saleMetaGw === "infinitepay" || saleMetaGw === "mercadopago"
          ? saleMetaGw
          : detectPixProvider(tenant.mercadopagoToken);

      let paid = false;
      let gatewayStatus = "";
      let gatewayDetail = "";

      // Retry manual (admin): confia no status PAID da venda, sem consultar
      // o gateway — usado quando o cliente pagou por outro meio (ex: link)
      if (skipVerification) {
        paid = true;
        gatewayStatus = "manual";
      } else if (gateway === "infinitepay") {
        const { InfinitePayClient } = await import("./infinitepay");
        const ip = new InfinitePayClient(tenant.mercadopagoToken);
        const check = await ip.checkPayment({
          orderNsu: paymentId,
          transactionNsu: verify?.transactionNsu,
          slug: verify?.slug,
        });
        if (!check.paid) {
          // Ainda pendente (ou sem dados do webhook para conferir)
          return { success: true, delivered: false };
        }
        gatewayStatus = "paid";
        gatewayDetail = check.captureMethod || "";
        paid = true;
      } else {
        const mp = new MercadoPagoClient(tenant.mercadopagoToken);
        const payment = await mp.getPaymentStatus(paymentId);
        gatewayStatus = payment.status;
        gatewayDetail = payment.statusDetail || "";
        paid = payment.status === "approved";
      }

      if (paid) {
        // Atualizar venda
        await prisma.sale.update({
          where: { id: sale.id },
          data: {
            status: "PAID",
            paidAt: new Date(),
            metadata: {
              ...(sale.metadata as any),
              gateway,
              mpStatus: gatewayStatus,
              mpDetail: gatewayDetail,
            },
          },
        });

        // Se tem sessão ativa, entregar produto
        const session = sale.session;

        // Se é venda do módulo confiança, só envia agradecimento
        const saleMeta = sale.metadata as any;
        if (saleMeta?.trustMode) {
          const waUrl = process.env.EZFLOW_WA_URL || "http://evolution:8080";
          const waKey = process.env.EZFLOW_WA_KEY || process.env.EVOLUTION_API_KEY || "ezflow-master-key";
          const evo = new EvolutionClient({ baseUrl: waUrl, apikey: waKey, instance: "default" });
          const thankMsg = `Muito obrigado pela sua contribuição de R$${sale.amount.toFixed(2)}! 🙏\n\nSua generosidade mantém esse projeto vivo. Deus abençoe! ❤️`;
          try { await evo.sendText({ number: sale.customerPhone, text: thankMsg }); } catch {}
          await prisma.sale.update({ where: { id: sale.id }, data: { deliveryStatus: "sent", deliveredAt: new Date() } });
          if (session) {
            await prisma.flowSession.update({ where: { id: session.id }, data: { status: "completed", completedAt: new Date() } });
          }
          return { success: true, delivered: true };
        }
        console.log(`[DELIVER] session=${session?.id} status=${session?.status}`);
        // "completed" também pode entregar: sessões fechadas por mensagens
        // avulsas durante a espera do PIX (comportamento legado) não podem
        // perder a entrega — o dedupe por deliveryStatus acima evita duplicar
        if (session && (session.status === "waiting_pix" || session.status === "completed")) {
          // Marca como "sending" pra evitar race condition com polling
          await prisma.sale.update({ where: { id: sale.id }, data: { deliveryStatus: "sending" } });

          const metadata = sale.metadata as any;
          const deliverStepId = metadata?.nextStepId;
          console.log(`[DELIVER] metadata=${JSON.stringify(metadata)}`);

          const waUrl = process.env.EZFLOW_WA_URL || "http://evolution:8080";
          const waKey = process.env.EZFLOW_WA_KEY || process.env.EVOLUTION_API_KEY || "ezflow-master-key";

          const steps = session.flow?.steps || [];
          let deliverStep = deliverStepId ? steps.find((s: any) => s.id === deliverStepId) : null;
          console.log(`[DELIVER] deliverStepId=${deliverStepId} foundById=${!!deliverStep} stepsCount=${steps.length}`);

          if (!deliverStep) {
            const currentStep = steps.find((s: any) => s.id === session.currentStepId);
            deliverStep = steps.find((s: any) => s.type === "DELIVER_PRODUCT" && (!currentStep || s.order >= currentStep.order));
            console.log(`[DELIVER] fallback search: currentStep=${currentStep?.type} deliverFound=${!!deliverStep}`);
          }

          // Grafo: retoma a CADEIA do ramo a partir do passo seguinte ao PIX
          // (entrega + mensagens de pós-venda do ramo, com seus timers)
          if (deliverStepId && hasGraphEdges(steps as any[])) {
            console.log(`[DELIVER] graph mode — resuming chain from ${deliverStepId}`);
            await FlowEngine.resumeGraph(session.id, deliverStepId);
            return { success: true, delivered: true };
          }

          if (deliverStep) {
            const evolutionClient = new EvolutionClient({
              baseUrl: waUrl,
              apikey: waKey,
              instance: "default",
            });

            console.log(`[DELIVER] executing delivery step ${deliverStep.type}...`);
            await FlowEngine.executeStep(
              deliverStep as FlowStepData,
              session,
              session.customerPhone,
              tenantId,
              evolutionClient,
              steps as FlowStepData[]
            );

            // Atualizar sessão
            await prisma.flowSession.update({
              where: { id: session.id },
              data: {
                status: "completed",
                completedAt: new Date(),
                currentStepId: deliverStepId,
              },
            });

            return { success: true, delivered: true };
          }
        }

        return { success: true, delivered: false };
      } else if (
        gateway === "infinitepay"
          ? ["cancelled", "canceled", "refused", "chargeback", "reversed", "failed"].includes(gatewayStatus)
          : ["cancelled", "refunded", "charged_back"].includes(gatewayStatus)
      ) {
        await prisma.sale.update({
          where: { id: sale.id },
          data: { status: "CANCELLED" },
        });

        // Se tem sessão, voltar ou encerrar
        if (sale.session) {
          await prisma.flowSession.update({
            where: { id: sale.session.id },
            data: { status: "failed", failureReason: "payment_cancelled" },
          });
        }

        return { success: true, delivered: false };
      }

      // PIX expirado
      if (
        gateway === "infinitepay"
          ? ["expired"].includes(gatewayStatus)
          : ["expired", "rejected"].includes(gatewayStatus)
      ) {
        await prisma.sale.update({ where: { id: sale.id }, data: { status: "CANCELLED" } });
        if (session) {
          // Multi-ramo: usa o step exato que gerou o PIX (metadata.pixStepId),
          // com fallback no primeiro GENERATE_PIX para vendas legadas
          const pixStep =
            session.flow?.steps?.find((s: any) => s.id === (sale.metadata as any)?.pixStepId) ||
            session.flow?.steps?.find((s: any) => s.type === "GENERATE_PIX");
          const pixConfig = (pixStep?.config || {}) as Record<string, any>;
          const onExpired = pixConfig.onExpired || "exit";
          const flowKeyword = session.flow?.triggerKeyword || "iniciar";

          const waUrl = process.env.EZFLOW_WA_URL || "http://evolution:8080";
          const waKey = process.env.EZFLOW_WA_KEY || process.env.EVOLUTION_API_KEY || "ezflow-master-key";
          const evo = new EvolutionClient({ baseUrl: waUrl, apikey: waKey, instance: "default" });

          // Mensagem de expiração imediata
          if (onExpired === "retry") {
            try { await evo.sendText({ number: session.customerPhone, text: `Seu PIX expirou, mas ainda dá tempo! 😊 Digite *${flowKeyword}* para receber um novo código.` }); } catch {}
          } else {
            try { await evo.sendText({ number: session.customerPhone, text: `Seu PIX expirou. Se ainda tiver interesse, envie *${flowKeyword}* para começar novamente. 👋` }); } catch {}
          }

          // Agendar follow-up pós-expiração (horas depois)
          const fupHours = pixConfig.followUpHours;
          const fupMsg = pixConfig.followUpMessage;
          if (fupHours && fupMsg) {
            try {
              const { flowTimeoutQueue } = await import("./queue");
              await flowTimeoutQueue.add(
                "pix-reminder",
                { sessionId: session.id, reminder: 3, message: fupMsg },
                { delay: fupHours * 3600 * 1000, jobId: `pix-followup-${session.id}` }
              );
              console.log(`[PIX-FOLLOWUP] scheduled in ${fupHours}h for session ${session.id?.slice(-8)}`);
            } catch {}
          }

          await prisma.flowSession.update({ where: { id: session.id }, data: { status: "failed", failureReason: "pix_expired", completedAt: new Date() } });
        }
        return { success: true, delivered: false };
      }

      // Status pending ou in_process → ainda aguardando
      return { success: true, delivered: false };
    } catch (error) {
      const err = error as any; console.error("[DELIVER-ERR]", err.message || err, err.stack?.split("\n")?.[1] || "");
      return { success: false, delivered: false };
    }
  }

  /**
   * Lida com timeout de sessão (WAIT_RESPONSE sem resposta)
   */
  /**
   * Retoma a cadeia do grafo a partir de um passo (entradas assíncronas:
   * job de delay, porta timeout do WAIT_RESPONSE, entrega pós-pagamento).
   */
  static async resumeGraph(
    sessionId: string,
    entryStepId: string | null
  ): Promise<void> {
    if (!entryStepId) {
      // DELAY sem próximo passo (aresta pendurada/removida): encerra a
      // sessão em vez de deixá-la presa em waiting_delay
      console.log(`[RESUME] no entry step for session ${sessionId?.slice(-8)} — completing`);
      await prisma.flowSession.update({
        where: { id: sessionId },
        data: { status: "completed", completedAt: new Date() },
      }).catch(() => {});
      return;
    }
    const session = await prisma.flowSession.findUnique({
      where: { id: sessionId },
      include: { flow: { include: { steps: true } }, tenant: true },
    });
    if (!session) {
      console.log(`[RESUME] session not found: ${sessionId}`);
      return;
    }
    if (!["active", "waiting_pix", "waiting_delay", "completed"].includes(session.status)) {
      console.log(`[RESUME] session status=${session.status}, skipping`);
      return;
    }

    const waUrl =
      session.tenant?.evolutionUrl ||
      process.env.EZFLOW_WA_URL ||
      "http://evolution:8080";
    const waKey =
      session.tenant?.evolutionApikey ||
      process.env.EZFLOW_WA_KEY ||
      process.env.EVOLUTION_API_KEY ||
      "ezflow-master-key";
    const evolutionClient = new EvolutionClient({
      baseUrl: waUrl,
      apikey: waKey,
      instance: "default",
    });

    // Orçamento de retomadas POR SESSÃO: ciclos entre passes (via delays
    // encadeados) não podem rodar para sempre — 20 retomadas é o teto
    const counters = (session.loopCounters || {}) as Record<string, number>;
    const resumes = (counters["_resumeCount"] || 0) + 1;
    if (resumes > 20) {
      console.error(`[FLOW-GUARD] session ${sessionId?.slice(-8)} exceeded resume budget — failing`);
      await prisma.flowSession.update({
        where: { id: sessionId },
        data: { status: "failed", failureReason: "cycle_or_budget" },
      });
      return;
    }
    await prisma.flowSession.update({
      where: { id: sessionId },
      data: { loopCounters: { ...counters, _resumeCount: resumes } },
    });

    await FlowEngine.runChainFromStep(session, entryStepId, evolutionClient);
  }

  /**
   * Executa passos em sequência a partir de um passo de entrada até
   * WAIT_RESPONSE / waiting_pix / waiting_delay / fim. Com guardas.
   */
  private static async runChainFromStep(
    session: any,
    entryStepId: string,
    evolutionClient: EvolutionClient
  ): Promise<void> {
    const steps: FlowStepData[] = session.flow?.steps || [];
    const graph = hasGraphEdges(steps as any[]);
    let cs = steps.find((s: FlowStepData) => s.id === entryStepId);
    if (!cs) {
      console.log(`[RESUME] entry step not found: ${entryStepId}`);
      await prisma.flowSession.update({
        where: { id: session.id },
        data: { status: "completed", completedAt: new Date() },
      });
      return;
    }

    let allVars = (session.variables || {}) as Record<string, string>;
    const loopCounters = (session.loopCounters || {}) as Record<
      string,
      number
    >;
    let totalExec = 0;
    const execCounts: Record<string, number> = {};

    while (cs) {
      if (cs.type === "WAIT_RESPONSE") {
        await prisma.flowSession.update({
          where: { id: session.id },
          data: { currentStepId: cs.id, status: "active", variables: allVars, loopCounters },
        });
        scheduleTimeout(session.id, cs.id, allVars, loopCounters);
        return;
      }

      // Guarda de ciclo/budget
      totalExec++;
      execCounts[cs.id] = (execCounts[cs.id] || 0) + 1;
      if (
        totalExec > MAX_STEPS_PER_PASS ||
        execCounts[cs.id] > MAX_EXEC_PER_STEP_PER_PASS
      ) {
        console.error(`[FLOW-GUARD] resumeChain budget exceeded at ${cs.id}`);
        await prisma.flowSession.update({
          where: { id: session.id },
          data: { status: "failed", failureReason: "cycle_or_budget", variables: allVars, loopCounters },
        });
        return;
      }

      // CONDITION como entrada de retomada não tem mensagem para avaliar:
      // para com segurança (aguarda a próxima resposta do cliente)
      if (cs.type === "CONDITION") {
        await prisma.flowSession.update({
          where: { id: session.id },
          data: { currentStepId: cs.id, status: "active", variables: allVars, loopCounters },
        });
        return;
      }

      let result: any;
      try {
        result = await FlowEngine.executeStep(
          cs,
          { ...session, variables: allVars },
          session.customerPhone,
          session.tenantId,
          evolutionClient,
          steps
        );
      } catch (err: any) {
        console.error(`[FLOW-ERR] step ${cs.id} (${cs.type}) failed on resume:`, err.message);
        try {
          await evolutionClient.sendText({ number: session.customerPhone, text: "Ops! Tive um problema nessa etapa. Tente novamente em instantes. 🙏" });
        } catch {}
        const altTarget: string | null = graph
          ? resolveOutgoing(steps as any[], cs as any, PORT_ALT)
          : cs?.altNextStepId || null;
        if (altTarget) {
          cs = steps.find((s: FlowStepData) => s.id === altTarget) || undefined;
          continue;
        }
        await prisma.flowSession.update({
          where: { id: session.id },
          data: { status: "failed", failureReason: "step_error", variables: allVars, loopCounters },
        });
        return;
      }
      allVars = { ...allVars, ...result.variables };

      // Grafo: próximo passo pela aresta (LOOP é exceção — porta back)
      if (graph && result.status === "active" && cs.type !== "LOOP") {
        const gNext = resolveOutgoing(steps as any[], cs as any, PORT_NEXT);
        if (gNext) result.nextStepId = gNext;
      }

      if (result.status === "waiting_pix") {
        await prisma.flowSession.update({
          where: { id: session.id },
          data: { currentStepId: result.nextStepId || cs.id, status: "waiting_pix", variables: allVars, loopCounters, currentPixId: result.pixId || null },
        });
        return;
      }

      if (result.status === "waiting_delay") {
        const delayMs = (result as any).delayMs || 5000;
        await prisma.flowSession.update({
          where: { id: session.id },
          data: { currentStepId: cs.id, status: "waiting_delay", variables: allVars, loopCounters },
        });
        const { flowTimeoutQueue } = await import("./queue");
        await flowTimeoutQueue.add(
          "delay",
          { sessionId: session.id, stepId: cs.id, toStepId: result.nextStepId },
          { delay: delayMs, jobId: `delay-${session.id}-${cs.id}` }
        );
        console.log(`[FLOW-DELAY] (resume) scheduled ${delayMs}ms for step ${cs.id}`);
        return;
      }

      if (!result.nextStepId) break;
      cs = steps.find((s: FlowStepData) => s.id === result.nextStepId) || undefined;
    }

    await prisma.flowSession.update({
      where: { id: session.id },
      data: {
        currentStepId: cs?.id || null,
        status: cs?.id ? "active" : "completed",
        completedAt: cs?.id ? undefined : new Date(),
        variables: allVars,
        loopCounters,
      },
    });
  }

  static async handleTimeout(sessionId: string): Promise<void> {
    console.log(`[TIMEOUT] handleTimeout called for session ${sessionId?.slice(-8)}`);
    const session = await prisma.flowSession.findUnique({
      where: { id: sessionId },
      include: { flow: { include: { steps: true } }, tenant: true },
    });

    if (!session) { console.log(`[TIMEOUT] session not found: ${sessionId?.slice(-8)}`); return; }
    if (session.status !== "active") { console.log(`[TIMEOUT] session status=${session.status}, skipping`); return; }

    const steps = session.flow?.steps || [];
    const currentStep = steps.find(
      (s: any) => s.id === session.currentStepId
    );

    if (!currentStep) { console.log(`[TIMEOUT] currentStep not found for session ${sessionId?.slice(-8)}`); return; }

    const config = (currentStep.config || {}) as Record<string, any>;
    const onTimeout = config.onTimeout || "exit";
    console.log(`[TIMEOUT] session=${sessionId?.slice(-8)} step=${currentStep.type} onTimeout=${onTimeout}`);
    const loopCounters = (session.loopCounters || {}) as Record<
      string,
      number
    >;

    const graphTimeout = hasGraphEdges(steps as any[]);

    if (onTimeout === "retry") {
      // Namespace "retry:" (fallback na chave legada para sessões em voo)
      const retryKey = `retry:${currentStep.id}`;
      const retryCount = loopCounters[retryKey] ?? loopCounters[currentStep.id] ?? 0;
      if (retryCount < (config.maxRetries || 2) && config.retryMessage) {
        // Reenviar mensagem — usa config do tenant ou fallback global
        const waUrl = session.tenant.evolutionUrl || process.env.EZFLOW_WA_URL || "http://evolution:8080";
        const waKey = session.tenant.evolutionApikey || process.env.EZFLOW_WA_KEY || process.env.EVOLUTION_API_KEY || "ezflow-master-key";
        const evolutionClient = new EvolutionClient({
          baseUrl: waUrl,
          apikey: waKey,
          instance: "default",
        });

        await evolutionClient.sendText({
          number: session.customerPhone,
          text: config.retryMessage,
        });

        loopCounters[retryKey] = retryCount + 1;
        await prisma.flowSession.update({
          where: { id: sessionId },
          data: {
            loopCounters,
            lastActivityAt: new Date(),
          },
        });
        // Reagendar próximo timeout
        await scheduleTimeout(sessionId, currentStep.id, (session.variables || {}) as Record<string, string>, loopCounters);
        return;
      }

      // Retries esgotadas — grafo com porta "timeout" segue a aresta (follow-up do ramo)
      if (graphTimeout) {
        const timeoutTarget = resolveOutgoing(
          steps as any[],
          currentStep as any,
          PORT_TIMEOUT
        );
        if (timeoutTarget) {
          console.log(`[TIMEOUT] graph timeout edge → ${timeoutTarget}`);
          await FlowEngine.resumeGraph(sessionId, timeoutTarget);
          return;
        }
      }
    }

    // Encerrar como timeout
    await prisma.flowSession.update({
      where: { id: sessionId },
      data: {
        status: "timed_out",
        failureReason: "timeout",
        completedAt: new Date(),
      },
    });

    // Mensagem de despedida com keyword para reiniciar
    try {
      const waUrl = session.tenant?.evolutionUrl || process.env.EZFLOW_WA_URL || "http://evolution:8080";
      const waKey = session.tenant?.evolutionApikey || process.env.EZFLOW_WA_KEY || process.env.EVOLUTION_API_KEY || "ezflow-master-key";
      const evolutionClient = new EvolutionClient({
        baseUrl: waUrl,
        apikey: waKey,
        instance: "default",
      });

      const flowKeyword = session.flow?.triggerKeyword || "iniciar";
      const defaultMsg = `😔 Não recebemos mais sua resposta e vou encerrar esta conversa.\n\nSe ainda tiver interesse, é só me mandar a palavra *${flowKeyword}* novamente que eu começo do início. Até logo! 👋`;
      const finalMsg = (config.finalMessage || defaultMsg)
        .replace(/\\n/g, "\n")
        .replace(/\{\{keyword\}\}/g, flowKeyword)
        .replace(/\$\{flowKeyword\}/g, flowKeyword);
      await evolutionClient.sendText({ number: session.customerPhone, text: finalMsg });

      // Agendar follow-up pós-timeout (horas depois)
      const fupHours = config.followUpHours;
      const fupMsg = config.followUpMessage;
      if (fupHours && fupMsg) {
        const { flowTimeoutQueue } = await import("./queue");
        await flowTimeoutQueue.add(
          "pix-reminder",
          { sessionId: sessionId, reminder: 3, message: fupMsg },
          { delay: fupHours * 3600 * 1000, jobId: `conv-followup-${sessionId}` }
        );
        console.log(`[CONV-FOLLOWUP] scheduled in ${fupHours}h for session ${sessionId?.slice(-8)}`);
      }
    } catch (err) {
      console.error("Timeout message error:", err);
    }
  }
}
