/**
 * Flow Engine — Máquina de Estados Unificada
 *
 * Um único loop de execução para iniciar E continuar fluxos.
 * Passos interativos (WAIT_RESPONSE, GENERATE_PIX) pausam o loop.
 * Passos não-interativos (SEND_MESSAGE, DELAY, DELIVER_PRODUCT, CONDITION, LOOP) executam e avançam.
 */

import prisma from "./prisma";
import { EvolutionClient } from "./evolution";
import { MercadoPagoClient } from "./mercadopago";

// ===== Tipos =====
export interface FlowSession {
  id: string; flowId: string; tenantId: string;
  currentStepId: string | null; customerPhone: string; customerName?: string | null;
  status: "active" | "waiting_pix" | "timed_out" | "completed" | "failed";
  variables: Record<string, string>; loopCounters: Record<string, number>;
  currentPixId?: string | null; failureReason?: string | null;
}

interface FlowStepData {
  id: string; type: string; order: number; label: string | null;
  config: Record<string, any>; productId: string | null;
  nextStepId: string | null; altNextStepId: string | null;
}

// ===== Helpers =====
function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, k) => vars[k] || `{{${k}}}`);
}

function matchKeyword(msg: string, kw: string, mode: string): boolean {
  const m = msg.toLowerCase().trim(); const k = kw.toLowerCase().trim();
  if (mode === "exact") return m === k;
  if (mode === "regex") { try { return new RegExp(k, "i").test(m); } catch { return m.includes(k); } }
  return m.includes(k);
}

function matchResponse(msg: string, expected: string[]): boolean {
  const m = msg.toLowerCase().trim();
  return expected.some(e => m.includes(e.toLowerCase().trim()));
}

async function fetchWithTimeout(url: string, opts: RequestInit, ms = 5000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); } finally { clearTimeout(t); }
}

// Passos que precisam de input externo
const INTERACTIVE = ["WAIT_RESPONSE", "GENERATE_PIX"];

// ===== Motor Principal =====
export class FlowEngine {

  /** Processa uma mensagem recebida do WhatsApp */
  static async processIncoming(phone: string, message: string, tenantId: string, pushName?: string, evolutionClient?: EvolutionClient) {
    try {
      // Buscar sessão ativa
      const session = await prisma.flowSession.findFirst({
        where: { tenantId, customerPhone: phone, status: { in: ["active", "waiting_pix"] } },
        include: { flow: { include: { steps: { orderBy: { order: "asc" } } } } },
        orderBy: { createdAt: "desc" },
      });

      if (session) {
        return await FlowEngine.runFlow(session, message, evolutionClient, pushName);
      }

      // Buscar fluxo por keyword
      const flows = await prisma.flow.findMany({ where: { tenantId, isActive: true }, include: { steps: { orderBy: { order: "asc" } } } });
      const flow = flows.find(f => matchKeyword(message, f.triggerKeyword, f.triggerMode));
      if (!flow) return { action: "no_match" as const };

      // Criar nova sessão
      const newSession = await prisma.flowSession.create({
        data: { tenantId, flowId: flow.id, customerPhone: phone, customerName: pushName || null, status: "active", variables: {}, loopCounters: {} },
        include: { flow: { include: { steps: { orderBy: { order: "asc" } } } } },
      });

      // Pre-carregar variáveis de produto
      const productVars: Record<string, string> = {};
      for (const step of flow.steps) {
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
      await prisma.flowSession.update({ where: { id: newSession.id }, data: { variables: productVars } });
      (newSession as any).variables = productVars;

      return await FlowEngine.runFlow(newSession, null, evolutionClient, pushName);
    } catch (error: any) {
      console.error("[FLOW-ERR]", error.message);
      return { action: "error" as const };
    }
  }

  /** Loop unificado — inicia e continua fluxos */
  private static async runFlow(
    dbSession: any, incomingMessage: string | null, evolutionClient?: EvolutionClient, pushName?: string
  ): Promise<{ action: string; session?: FlowSession; response?: string }> {
    const steps: FlowStepData[] = dbSession.flow?.steps || [];
    let currentStep: FlowStepData | undefined = steps.find((s: FlowStepData) => s.id === dbSession.currentStepId) || steps[0];
    if (!currentStep) {
      await prisma.flowSession.update({ where: { id: dbSession.id }, data: { status: "completed", completedAt: new Date() } });
      return { action: "completed" };
    }

    let vars = (dbSession.variables || {}) as Record<string, string>;
    const loopCounters = (dbSession.loopCounters || {}) as Record<string, number>;
    let pixId: string | undefined;
    let status: string = dbSession.status || "active";

    // Se tem mensagem recebida E o passo atual é interativo, processa a resposta primeiro
    console.log(`[FLOW] runFlow msg="${incomingMessage}" step=${currentStep?.type}:${currentStep?.order} session=${dbSession.id.slice(-6)}`);
    if (incomingMessage && currentStep && INTERACTIVE.includes(currentStep.type)) {
      const result = await FlowEngine.processInteractiveStep(currentStep, steps, incomingMessage, vars, loopCounters, dbSession, evolutionClient);
      vars = result.vars;
      status = result.status;
      currentStep = steps.find((s: FlowStepData) => s.id === result.nextStepId);
      if (!currentStep || status === "waiting_pix") {
        await FlowEngine.saveSession(dbSession.id, currentStep?.id || null, status, vars, loopCounters, pixId || null);
        return { action: "continue_session" };
      }
    } else if (incomingMessage && currentStep && !INTERACTIVE.includes(currentStep.type)) {
      // Mensagem recebida mas passo atual não é interativo — ignora (pode ser duplicata)
      return { action: "continue_session" };
    }

    // Loop: executar passos não-interativos em sequência
    while (currentStep && evolutionClient) {
      console.log(`[FLOW] step ${currentStep.order}: ${currentStep.type}`);

      // Parar em passos interativos
      if (INTERACTIVE.includes(currentStep.type)) {
        await FlowEngine.saveSession(dbSession.id, currentStep.id, currentStep.type === "GENERATE_PIX" ? "waiting_pix" : "active", vars, loopCounters, pixId || null);
        return { action: "continue_session" };
      }

      // Executar passo
      const result = await FlowEngine.executeStep(currentStep, dbSession, vars, loopCounters, evolutionClient, steps);
      vars = result.vars;
      pixId = result.pixId || pixId;
      status = result.status;

      if (!result.nextStepId) {
        await FlowEngine.saveSession(dbSession.id, null, "completed", vars, loopCounters, pixId || null);
        return { action: "completed" };
      }

      currentStep = steps.find((s: FlowStepData) => s.id === result.nextStepId);
    }

    await FlowEngine.saveSession(dbSession.id, currentStep?.id || null, status, vars, loopCounters, pixId || null);
    return { action: "continue_session" };
  }

  /** Processa passo interativo (WAIT_RESPONSE) com a resposta do usuário */
  private static async processInteractiveStep(
    step: FlowStepData, steps: FlowStepData[], message: string,
    vars: Record<string, string>, loopCounters: Record<string, number>,
    session: any, evolutionClient?: EvolutionClient
  ) {
    const config = (step.config || {}) as Record<string, any>;
    let nextId: string | null = null;

    if (step.type === "WAIT_RESPONSE") {
      const varName = config.variable || "resposta";
      vars[varName] = message;
      console.log(`[FLOW] WAIT_RESPONSE msg="${message}" expected=${JSON.stringify(config.expected)} matched=${matchResponse(message, config.expected || [])}`);

      if (matchResponse(message, config.expected || [])) {
        // Resposta esperada → avança
        nextId = step.nextStepId || steps.find(s => s.order === step.order + 1)?.id || null;
      } else {
        // Resposta não esperada
        const maxRetries = config.maxRetries || 0;
        const retryCount = loopCounters[step.id] || 0;
        if (maxRetries > 0 && retryCount < maxRetries && config.retryMessage) {
          loopCounters[step.id] = retryCount + 1;
          if (evolutionClient) await evolutionClient.sendText({ number: session.customerPhone, text: config.retryMessage });
          nextId = step.id; // Fica no mesmo passo
        } else if (step.altNextStepId) {
          nextId = step.altNextStepId; // Caminho alternativo
        } else {
          nextId = step.id; // Fica aguardando
        }
      }
    } else if (step.type === "CONDITION") {
      const matched = (config.routes || []).some((r: any) =>
        r.values.includes("*") || matchResponse(message, r.values || [])
      );
      if (matched) {
        nextId = step.nextStepId || steps.find(s => s.order === step.order + 1)?.id || null;
      } else {
        nextId = step.altNextStepId || step.id;
      }
    }

    return { nextStepId: nextId, vars, status: "active", loopCounters };
  }

  /** Salva estado da sessão no banco */
  private static async saveSession(id: string, stepId: string | null, status: string, vars: Record<string, string>, loops: Record<string, number>, pixId: string | null) {
    await prisma.flowSession.update({ where: { id }, data: { currentStepId: stepId, status, variables: vars, loopCounters: loops, currentPixId: pixId, lastActivityAt: new Date() } });
  }

  // ===== EXECUTE STEP =====
  static async executeStep(
    step: FlowStepData, session: any, vars: Record<string, string>, loops: Record<string, number>,
    evolutionClient: EvolutionClient, allSteps: FlowStepData[]
  ): Promise<{ nextStepId: string | null; status: string; vars: Record<string, string>; pixId?: string; response?: string }> {
    const config = (step.config || {}) as Record<string, any>;
    const phone = session.customerPhone;
    const tenantId = session.tenantId;

    const nextOrAuto = (explicitNext: string | null | undefined) =>
      explicitNext || allSteps.find(s => s.order === step.order + 1)?.id || null;

    switch (step.type) {
      case "SEND_MESSAGE": {
        const text = renderTemplate(config.text || "", { ...vars, "customer.name": session.customerName || "Cliente" });
        try { await evolutionClient.sendText({ number: phone, text }); } catch {}
        await prisma.messageLog.create({ data: { tenantId, sessionId: session.id, customerPhone: phone, direction: "outbound", type: "text", content: text } });
        return { nextStepId: nextOrAuto(step.nextStepId), status: "active", vars, response: text };
      }

      case "DELAY": {
        await new Promise(r => setTimeout(r, (config.seconds || 2) * 1000));
        return { nextStepId: nextOrAuto(step.nextStepId), status: "active", vars };
      }

      case "WAIT_RESPONSE": case "GENERATE_PIX": {
        // Interativos — pausam o loop
        return { nextStepId: step.id, status: step.type === "GENERATE_PIX" ? "waiting_pix" : "active", vars };
      }

      case "GENERATE_PIX": {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        const token = tenant?.mercadopagoToken || "";
        if (!token) return { nextStepId: step.altNextStepId || null, status: "failed", vars };

        let price = 0; let description = config.description || "Produto digital";
        if (step.productId) {
          const p = await prisma.product.findUnique({ where: { id: step.productId } });
          if (p) { price = p.price; description = p.name; vars["product.name"] = p.name; vars["product.price"] = String(p.price); vars["product.fileUrl"] = p.fileUrl || ""; vars["product.extraFiles"] = JSON.stringify(p.extraFiles || []); }
        }

        try {
          let pix: { id: string; pixCopyPaste: string; pixQrCodeBase64: string; pixExpiration: string };
          if (token.startsWith("inf_")) {
            const { InfinitePayClient } = await import("./infinitepay");
            const r = await new InfinitePayClient(token).createPixPayment({ amount: price, description, expirationMinutes: config.expirationMinutes || 30 });
            pix = { id: r.id, pixCopyPaste: r.pixCopyPaste, pixQrCodeBase64: r.pixQrCodeBase64, pixExpiration: r.pixExpiration };
          } else {
            const r = await new MercadoPagoClient(token).createPixPayment({ amount: price, description, expirationMinutes: config.expirationMinutes || 30 });
            pix = { id: r.id, pixCopyPaste: r.pixCopyPaste, pixQrCodeBase64: r.pixQrCodeBase64, pixExpiration: r.pixExpiration };
          }

          await evolutionClient.sendText({ number: phone, text: `💳 *Pagamento via PIX*\n\n📦 ${description}\n💰 R$ ${price.toFixed(2)}\n⏰ Vence em ${config.expirationMinutes || 30}min` });
          await evolutionClient.sendText({ number: phone, text: pix.pixCopyPaste });

          setTimeout(() => FlowEngine.handlePixPayment(pix.id, tenantId).catch(() => {}), 10000);
          setTimeout(() => FlowEngine.handlePixPayment(pix.id, tenantId).catch(() => {}), 30000);

          await prisma.sale.create({ data: { tenantId, flowId: session.flowId, sessionId: session.id, productId: step.productId || "unknown", customerPhone: phone, customerName: session.customerName, amount: price, status: "PENDING", externalId: pix.id, pixCopyPaste: pix.pixCopyPaste, pixQrCode: pix.pixQrCodeBase64, pixExpiresAt: new Date(pix.pixExpiration), metadata: { stepId: step.id, nextStepId: step.nextStepId } } });

          vars["pixId"] = pix.id;
          return { nextStepId: step.id, status: "waiting_pix", vars, pixId: pix.id, response: pix.pixCopyPaste };
        } catch (err: any) {
          try { await evolutionClient.sendText({ number: phone, text: "Erro ao gerar PIX. Tente novamente." }); } catch {}
          return { nextStepId: step.altNextStepId || null, status: "failed", vars };
        }
      }

      case "DELIVER_PRODUCT": {
        const deliveryMsg = renderTemplate(config.message || "Aqui está seu produto! Obrigado.", vars);
        await evolutionClient.sendText({ number: phone, text: `✅ *Pagamento confirmado!*\n\n${deliveryMsg}` });

        const sendOne = async (url: string, name: string) => {
          const full = url.startsWith("http") ? url : `http://portal:3000${url}`;
          const ext = (url.split(".").pop() || "").toLowerCase();
          const type = ["mp3","m4a","ogg","wav"].includes(ext) ? "audio" : ["mp4","avi","mov"].includes(ext) ? "video" : ["jpg","jpeg","png","gif"].includes(ext) ? "image" : "document";
          try { await evolutionClient.sendMedia({ number: phone, mediaType: type as any, mediaUrl: full, fileName: name, caption: `📎 ${name}` }); } catch {}
        };

        const files: { url: string; name: string }[] = [];
        const mainUrl = vars["product.fileUrl"] || config.fileUrl || "";
        const productName = vars["product.name"] || "produto";
        if (mainUrl) files.push({ url: mainUrl, name: productName });
        try { JSON.parse(vars["product.extraFiles"] || "[]").forEach((f: any) => files.push({ url: f.url, name: f.name || "Arquivo" })); } catch {}
        for (const f of files) await sendOne(f.url, f.name);

        if (files.length === 0 && mainUrl) {
          await evolutionClient.sendText({ number: phone, text: `📎 Link: ${mainUrl.startsWith("http") ? mainUrl : `https://ezflow.com.br${mainUrl}`}` });
        }

        await prisma.sale.updateMany({ where: { sessionId: session.id, status: "PAID", deliveryStatus: null }, data: { deliveredAt: new Date(), deliveryStatus: "sent" } });
        return { nextStepId: nextOrAuto(step.nextStepId), status: "completed", vars, response: deliveryMsg };
      }

      case "CONDITION": {
        return { nextStepId: nextOrAuto(step.nextStepId), status: "active", vars };
      }

      case "LOOP": {
        const max = config.maxIterations || 3;
        const count = loops[step.id] || 0;
        if (count >= max) return { nextStepId: nextOrAuto(step.nextStepId), status: "active", vars };

        const exitCond = config.exitCondition || "";
        if (exitCond) { const m = exitCond.match(/variable:(\w+)=(.+)/); if (m && vars[m[1]] === m[2]) return { nextStepId: nextOrAuto(step.nextStepId), status: "active", vars }; }

        loops[step.id] = count + 1;
        const backId = config.backToStepId || allSteps[config.backToStepIndex || 0]?.id || step.nextStepId;
        return { nextStepId: backId || step.id, status: "active", vars };
      }

      default:
        return { nextStepId: nextOrAuto(step.nextStepId), status: "active", vars };
    }
  }

  // ===== PIX Payment Handling =====
  static async handlePixPayment(paymentId: string, tenantId: string): Promise<{ success: boolean; delivered: boolean }> {
    try {
      const sale = await prisma.sale.findFirst({ where: { externalId: paymentId, tenantId }, include: { session: { include: { flow: { include: { steps: true } } } } } });
      if (!sale) { console.log(`Sale not found: ${paymentId}`); return { success: false, delivered: false }; }

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant?.mercadopagoToken) return { success: false, delivered: false };

      const mp = new MercadoPagoClient(tenant.mercadopagoToken);
      const payment = await mp.getPaymentStatus(paymentId);

      if (payment.status === "approved") {
        await prisma.sale.update({ where: { id: sale.id }, data: { status: "PAID", paidAt: new Date() } });

        const session = sale.session;
        if (session && session.status === "waiting_pix") {
          const steps = session.flow?.steps || [];
          const deliverStep = steps.find((s: any) => s.type === "DELIVER_PRODUCT") || null;

          if (deliverStep) {
            const waUrl = process.env.EZFLOW_WA_URL || "http://evolution:8080";
            const waKey = process.env.EZFLOW_WA_KEY || process.env.EVOLUTION_API_KEY || "ezflow-master-key";
            const client = new EvolutionClient({ baseUrl: waUrl, apikey: waKey, instance: "default" });
            await FlowEngine.executeStep(deliverStep as any, session, (session.variables || {}) as any, {}, client, steps as any);
            await prisma.flowSession.update({ where: { id: session.id }, data: { status: "completed", completedAt: new Date() } });
            return { success: true, delivered: true };
          }
        }
        return { success: true, delivered: false };
      }

      if (["cancelled", "refunded"].includes(payment.status)) {
        await prisma.sale.update({ where: { id: sale.id }, data: { status: "CANCELLED" } });
      }
      return { success: true, delivered: false };
    } catch (err) { console.error("[PIX-ERR]", err); return { success: false, delivered: false }; }
  }

  static async handleTimeout(sessionId: string): Promise<void> {
    const session = await prisma.flowSession.findUnique({ where: { id: sessionId }, include: { tenant: true } });
    if (!session || session.status !== "active") return;
    await prisma.flowSession.update({ where: { id: sessionId }, data: { status: "timed_out", failureReason: "timeout", completedAt: new Date() } });
    if (session.tenant?.evolutionUrl && session.tenant?.evolutionApikey) {
      try {
        const client = new EvolutionClient({ baseUrl: session.tenant.evolutionUrl, apikey: session.tenant.evolutionApikey, instance: "default" });
        await client.sendText({ number: session.customerPhone, text: "😔 Não recebemos sua resposta. Até logo!" });
      } catch {}
    }
  }
}
