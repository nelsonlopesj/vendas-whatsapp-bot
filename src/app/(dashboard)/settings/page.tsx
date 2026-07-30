import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { SettingsForm } from "@/components/settings/settings-form";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    return <div>Erro ao carregar configurações.</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Configure seu WhatsApp e gateway de pagamento
        </p>
      </div>

      <SettingsForm tenant={tenant} />
    </div>
  );
}
