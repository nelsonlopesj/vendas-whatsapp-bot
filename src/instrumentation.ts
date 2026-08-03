// Inicializa workers BullMQ no startup do servidor + recupera timeouts pendentes
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { default: prisma } = await import("./lib/prisma");
  const { flowTimeoutQueue } = await import("./lib/queue");
  console.log("[INSTR] BullMQ workers initialized via instrumentation");

  // Recuperar timeouts pendentes (perdidos após restart/deploy)
  try {
    const activeSessions = await prisma.flowSession.findMany({
      where: { status: "active" },
      include: { flow: { include: { steps: true } } },
    });

    let recovered = 0;
    for (const session of activeSessions) {
      const currentStep = session.flow?.steps?.find((s: any) => s.id === session.currentStepId);
      if (!currentStep || currentStep.type !== "WAIT_RESPONSE") continue;

      const config = (currentStep.config || {}) as Record<string, any>;
      if (config.onTimeout !== "retry") continue;

      const timeoutSeconds = config.timeout || 3600;
      const loopCounters = (session.loopCounters || {}) as Record<string, number>;
      const retryCount = loopCounters[currentStep.id] || 0;

      if (retryCount >= (config.maxRetries || 2)) continue; // já esgotou

      // Calcular tempo restante baseado na última atividade
      const elapsed = (Date.now() - new Date(session.lastActivityAt).getTime()) / 1000;
      const remaining = Math.max(30, timeoutSeconds - elapsed); // mínimo 30s
      const delay = Math.round(remaining * 1000);

      try {
        const jobId = `timeout-${session.id}`;
        const existing = await flowTimeoutQueue.getJob(jobId);
        if (!existing) {
          await flowTimeoutQueue.add("timeout", { sessionId: session.id, retryCount }, { delay, jobId });
          recovered++;
        }
      } catch {}
    }

    if (recovered > 0) console.log(`[INSTR] Recovered ${recovered} pending timeouts after restart`);
  } catch (err: any) {
    console.error("[INSTR] Failed to recover timeouts:", err.message);
  }
}
