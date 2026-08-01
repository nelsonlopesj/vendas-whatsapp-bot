/**
 * Flow Engine — Máquina de Estados para Automação de Vendas
 *
 * Gerencia sessões de fluxo, processa mensagens recebidas, executa passos
 * (mensagem, espera, PIX, entrega, condição, loop) e gerencia timeouts/retry.
 */

import prisma from "./prisma";
import { EvolutionClient } from "./evolution";
import { MercadoPagoClient } from "./mercadopago";

// ===== Tipos =====

export interface FlowSession {
  id: string;
  flowId: string;
  tenantId: string;
  currentStepId: string | null;
  customerPhone: string;
  customerName?: string | null;
  status: "active" | "waiting_pix" | "timed_out" | "completed" | "failed";
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

    while (currentStep && evolutionClient) {
      console.log(`[FLOW-STEP] executing step type=${currentStep.type} label=${currentStep.label}`);
      // Parar ANTES de executar WAIT_RESPONSE (depende de resposta do cliente)
      if (currentStep.type === "WAIT_RESPONSE") { console.log("[FLOW-STOP] breaking at WAIT_RESPONSE"); break; }

      // GENERATE_PIX: executa e depois pausa
      const result = await FlowEngine.executeStep(
        currentStep as FlowStepData,
        { ...session, variables: allVars },
        phone,
        tenantId,
        evolutionClient,
        flow.steps as FlowStepData[]
      );
      allVars = { ...allVars, ...result.variables };
      pixId = result.pixId || pixId;
      lastStatus = result.status;
      nextId = result.nextStepId;

      // Se gerou PIX, pausa para aguardar pagamento
      if (result.status === "waiting_pix") { console.log("[FLOW-STOP] breaking at GENERATE_PIX (waiting_pix)"); break; }

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
      },
    });

    const loopCounters: Record<string, number> = {};
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
      const timeoutJob = await flowTimeoutQueue.getJob(`timeout-${session.id}`);
      if (timeoutJob) {
        await timeoutJob.remove();
        console.log(`[TIMEOUT] cancelled for session ${session.id} (customer responded)`);
      }
    } catch {} // Ignora erro — timeout que não existe ou Redis fora

    // Determinar próximo passo baseado no tipo do passo atual
    let nextStepId: string | null = null;
    let responseText: string | undefined;

    if (currentStep.type === "GENERATE_PIX" && session.status === "waiting_pix") {
      // Aguardando pagamento — fecha sessão velha pra permitir nova keyword match
      console.log(`[FLOW-CONT] GENERATE_PIX waiting_pix — closing session to allow keyword match`);
      await prisma.flowSession.update({ where: { id: session.id }, data: { status: "completed", completedAt: new Date() } });
      return { action: "continue_session", session: { ...session, status: "completed" as any } };
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
        if (expected.length > 0 && matchResponse(message, expected)) {
          nextStepId = currentStep.nextStepId || steps.find((s: FlowStepData) => s.order === currentStep.order + 1)?.id || null;
        } else {
          // Resposta não esperada — tenta retry ou fica aguardando
          const maxR = config.maxRetries || 0;
          const retryCount = loopCounters[currentStep.id] || 0;
          if (maxR > 0 && retryCount < maxR && config.retryMessage) {
            // Reenviar pergunta
            loopCounters[currentStep.id] = retryCount + 1;
            if (evolutionClient) {
              await evolutionClient.sendText({ number: session.customerPhone, text: config.retryMessage });
            }
            nextStepId = currentStep.id; // Fica no mesmo passo aguardando
          } else if (currentStep.altNextStepId) {
            nextStepId = currentStep.altNextStepId; // Caminho alternativo
          } else {
            nextStepId = currentStep.id; // Fica aguardando (não encerra!)
          }
        }
      } else if (currentStep.type === "CONDITION") {
        // Avaliar condição e decidir rota
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
    while (cs && evolutionClient) {
      if (cs.type === "WAIT_RESPONSE") {
        // WAIT_RESPONSE: pausa e espera input do cliente
        await prisma.flowSession.update({ where: { id: session.id }, data: { currentStepId: cs.id, status: "active", variables: allVars, loopCounters } });
        return { action: "continue_session", session: { id: session.id, flowId: session.flowId, tenantId: session.tenantId, currentStepId: cs.id, customerPhone: session.customerPhone, customerName: session.customerName || undefined, status: "active", variables: allVars, loopCounters } };
      }

      // GENERATE_PIX e outros: executa normalmente
      const result = await FlowEngine.executeStep(cs, session, session.customerPhone, session.tenantId, evolutionClient, steps);
      allVars = { ...allVars, ...result.variables };

      // Se gerou PIX, salva e pausa para aguardar pagamento
      if (result.status === "waiting_pix") {
        await prisma.flowSession.update({ where: { id: session.id }, data: { currentStepId: result.nextStepId || cs.id, status: "waiting_pix", variables: allVars, loopCounters, currentPixId: result.pixId || null } });
        return { action: "continue_session", session: { id: session.id, flowId: session.flowId, tenantId: session.tenantId, currentStepId: result.nextStepId || cs.id, customerPhone: session.customerPhone, customerName: session.customerName || undefined, status: "waiting_pix", variables: allVars, loopCounters, currentPixId: result.pixId || null } };
      }

      if (!result.nextStepId) break;
      cs = steps.find((s: FlowStepData) => s.id === result.nextStepId) || undefined;
    }

    // Atualizar sessão
    if (cs?.id) {
      await prisma.flowSession.update({ where: { id: session.id }, data: { currentStepId: cs.id, status: "active", variables: allVars, loopCounters } });
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
        // A resposta será processada em continueSession
        variables._waitStartedAt = String(Date.now());

        // Agendar timeout via BullMQ delayed job (lazy import evita circular dependency)
        const timeoutSeconds = config.timeout || 3600;
        const retryCount = loopCounters[step.id] || 0;
        try {
          const { flowTimeoutQueue } = await import("./queue");
          await flowTimeoutQueue.add(
            "timeout",
            { sessionId: session.id, stepId: step.id, retryCount },
            { delay: timeoutSeconds * 1000, jobId: `timeout-${session.id}` }
          );
          console.log(`[TIMEOUT] scheduled for session ${session.id} in ${timeoutSeconds}s (retry ${retryCount})`);
        } catch (err: any) {
          console.error(`[TIMEOUT] failed to schedule for session ${session.id}:`, err.message);
        }

        return {
          nextStepId: step.id, // Aguarda no mesmo passo
          status: "active",
          variables,
          loopCounters,
        };
      }

      case "GENERATE_PIX": {
        // Buscar tenant config para Mercado Pago
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
        });
        const token = tenant?.mercadopagoToken || "";
        if (!token) {
          console.error(`[PIX-ERR] No Mercado Pago token for tenant ${tenantId}`);
          try {
            await evolutionClient.sendText({
              number: phone,
              text: "❌ *Erro ao gerar PIX*\n\nO token do Mercado Pago não foi configurado. Por favor, entre em contato com o suporte.",
            });
          } catch {}
          return {
            nextStepId: step.altNextStepId || null,
            status: "failed",
            variables,
            loopCounters,
            response: "Erro: token Mercado Pago não configurado",
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
          let pix: { id: string; pixCopyPaste: string; pixQrCodeBase64: string; pixExpiration: string };
          if (token.startsWith("inf_")) {
            const { InfinitePayClient } = await import("./infinitepay");
            const ip = new InfinitePayClient(token);
            const r = await ip.createPixPayment({ amount: price, description, expirationMinutes: config.expirationMinutes || 30 });
            pix = { id: r.id, pixCopyPaste: r.pixCopyPaste, pixQrCodeBase64: r.pixQrCodeBase64, pixExpiration: r.pixExpiration };
          } else {
            const mp = new MercadoPagoClient(token);
            const r = await mp.createPixPayment({ amount: price, description, expirationMinutes: config.expirationMinutes || 30 });
            pix = { id: r.id, pixCopyPaste: r.pixCopyPaste, pixQrCodeBase64: r.pixQrCodeBase64, pixExpiration: r.pixExpiration };
          }

          // Enviar PIX para o cliente
          // Enviar resumo primeiro
          await evolutionClient.sendText({
            number: phone,
            text: `💳 *Pagamento via PIX*\n\n📦 *Produto:* ${description}\n💰 *Valor:* R$ ${price.toFixed(2)}\n⏰ *Vence em:* ${config.expirationMinutes || 30} minutos`,
          });
          // Enviar código PIX isolado para fácil cópia
          await evolutionClient.sendText({
            number: phone,
            text: pix.pixCopyPaste,
          });

          // Iniciar polling de status do PIX (backup, webhook é primary)
          setTimeout(async () => {
            try {
              await FlowEngine.handlePixPayment(pix.id, tenantId);
            } catch {}
          }, 10000); // verifica após 10 segundos
          setTimeout(async () => {
            try {
              await FlowEngine.handlePixPayment(pix.id, tenantId);
            } catch {}
          }, 30000); // verifica novamente após 30 segundos

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
              pixExpiresAt: new Date(pix.pixExpiration),
              metadata: { stepId: step.id, nextStepId: step.nextStepId },
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
          filesToSend.push({ url: fileUrl, name: productName });
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

      case "DELAY": {
        const seconds = config.seconds || 2;
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
        const currentIter = loopCounters[step.id] || 0;
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
        loopCounters[step.id] = currentIter + 1;
        const backToStepId =
          config.backToStepId ||
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
    tenantId: string
  ): Promise<{ success: boolean; delivered: boolean }> {
    try {
      // Buscar venda pelo externalId
      const sale = await prisma.sale.findFirst({
        where: { externalId: paymentId, tenantId },
        include: { session: { include: { flow: { include: { steps: true } } } } },
      });

      if (!sale) {
        console.log(`Sale not found for payment ${paymentId}`);
        return { success: false, delivered: false };
      }

      // Evitar entrega duplicada
      if (sale.deliveryStatus === "sent" || sale.deliveryStatus === "sending") {
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

      // Consultar status no Mercado Pago
      const mp = new MercadoPagoClient(tenant.mercadopagoToken);
      const payment = await mp.getPaymentStatus(paymentId);

      if (payment.status === "approved") {
        // Atualizar venda
        await prisma.sale.update({
          where: { id: sale.id },
          data: {
            status: "PAID",
            paidAt: new Date(),
            metadata: {
              ...(sale.metadata as any),
              mpStatus: payment.status,
              mpDetail: payment.statusDetail,
            },
          },
        });

        // Se tem sessão ativa, entregar produto
        const session = sale.session;
        console.log(`[DELIVER] session=${session?.id} status=${session?.status}`);
        if (session && session.status === "waiting_pix") {
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
        ["cancelled", "refunded", "charged_back"].includes(payment.status)
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
  static async handleTimeout(sessionId: string): Promise<void> {
    const session = await prisma.flowSession.findUnique({
      where: { id: sessionId },
      include: { flow: { include: { steps: true } }, tenant: true },
    });

    if (!session || session.status !== "active") return;

    const steps = session.flow?.steps || [];
    const currentStep = steps.find(
      (s: any) => s.id === session.currentStepId
    );

    if (!currentStep) return;

    const config = (currentStep.config || {}) as Record<string, any>;
    const onTimeout = config.onTimeout || "exit";
    const loopCounters = (session.loopCounters || {}) as Record<
      string,
      number
    >;

    if (onTimeout === "retry") {
      const retryCount = loopCounters[currentStep.id] || 0;
      if (retryCount < (config.maxRetries || 2) && config.retryMessage) {
        // Reenviar mensagem
        if (
          session.tenant.evolutionUrl &&
          session.tenant.evolutionApikey
        ) {
          const evolutionClient = new EvolutionClient({
            baseUrl: session.tenant.evolutionUrl,
            apikey: session.tenant.evolutionApikey,
            instance: "default",
          });

          await evolutionClient.sendText({
            number: session.customerPhone,
            text: config.retryMessage,
          });
        }

        loopCounters[currentStep.id] = retryCount + 1;
        await prisma.flowSession.update({
          where: { id: sessionId },
          data: {
            loopCounters,
            lastActivityAt: new Date(),
          },
        });
        return;
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

    // Mensagem de despedida se Evolution configurado
    if (
      session.tenant?.evolutionUrl &&
      session.tenant?.evolutionApikey
    ) {
      try {
        const evolutionClient = new EvolutionClient({
          baseUrl: session.tenant.evolutionUrl,
          apikey: session.tenant.evolutionApikey,
          instance: "default",
        });

        await evolutionClient.sendText({
          number: session.customerPhone,
          text: "😔 Não recebemos sua resposta. Se quiser continuar, é só mandar outra mensagem. Até logo!",
        });
      } catch (err) {
        console.error("Timeout message error:", err);
      }
    }
  }
}
