import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { FlowEditor } from "@/components/flows/flow-editor";

export default async function EditFlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const { id } = await params;
  const { tenantId: requested } = await searchParams;

  // Modo suporte: owner editando fluxo de OUTRO tenant (?tenantId=).
  // Só repassa o tenantId quando o tenant existe — senão o editor cai no próprio.
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
        <h1 className="text-2xl font-bold">Editar Fluxo</h1>
        <p className="text-sm text-muted-foreground">
          Modifique os passos da sua automação
        </p>
      </div>
      {supportTenantName && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700">
          👑 <b>Modo suporte:</b> você está editando um fluxo de{" "}
          <b>{supportTenantName}</b>. Ao salvar, as alterações valem para este
          cliente.
        </div>
      )}
      <FlowEditor flowId={id} tenantId={supportTenantId} />
    </div>
  );
}
