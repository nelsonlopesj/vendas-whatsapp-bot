import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { EvolutionClient } from "@/lib/evolution";
import { getTenantInstance } from "@/lib/evolution-webhook";

export const dynamic = "force-dynamic";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

// Owner-only: estado de conexão do WhatsApp de todos os tenants (Admin → Clientes)
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "owner") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const waUrl = process.env.EZFLOW_WA_URL || "http://localhost:8080";
  const waKey = process.env.EZFLOW_WA_KEY || "";

  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  const results = await Promise.allSettled(
    tenants.map(async (t) => {
      const instance = await getTenantInstance(t.id);
      const client = new EvolutionClient({
        baseUrl: waUrl,
        apikey: waKey,
        instance,
      });
      const st = await withTimeout(client.getInstanceStatus(), 4000);
      return { tenantId: t.id, state: st?.instance?.state || "unknown" };
    })
  );

  const statuses: Record<string, { state: string }> = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      statuses[r.value.tenantId] = { state: r.value.state };
    }
  }

  return NextResponse.json({ statuses });
}
