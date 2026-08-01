// Inicializa workers BullMQ no startup do servidor
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/queue");
    console.log("[INSTR] BullMQ workers initialized via instrumentation");
  }
}
