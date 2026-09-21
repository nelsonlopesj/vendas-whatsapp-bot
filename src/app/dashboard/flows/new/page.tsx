import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { FlowEditor } from "@/components/flows/flow-editor";

export default async function NewFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const { tenantId: requested } = await searchParams;

  // Modo suporte: owner criando fluxo para OUTRO tenant (?tenantId=)
  let supportTenantId: string | undefined;
  let supportTenantName: string | undefined;
  if (requested) {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    const ownTenantId = (session?.user as any)?.tenantId;
    if (role === "owner" && requested !== ownTenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: requested },
        select: { name: true },
      });
      if (tenant) {
        supportTenantId = requested;
        supportTenantName = tenant.name;
      }
    }
  }

  return (
    <div className="space-y-6 h-full">
      <div>
        <h1 className="text-2xl font-bold">Criar Fluxo</h1>
        <p className="text-sm text-muted-foreground">
          Monte sua automação de venda conectando caixinhas
        </p>
      </div>
      {supportTenantName && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700">
          👑 <b>Modo suporte:</b> este fluxo será criado na conta de{" "}
          <b>{supportTenantName}</b>.
        </div>
      )}
      <FlowEditor tenantId={supportTenantId} />
    </div>
  );
}
