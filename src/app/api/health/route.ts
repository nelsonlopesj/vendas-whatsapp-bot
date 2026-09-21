import { NextResponse } from "next/server";

// Healthcheck leve (sem banco): usado pelo Coolify/Traefik para rotear
// tráfego somente quando o servidor estiver pronto — evita Bad Gateway
// durante a janela de boot (db push + instrumentation).
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, time: new Date().toISOString() });
}
