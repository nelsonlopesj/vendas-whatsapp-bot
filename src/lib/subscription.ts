import prisma from "./prisma";

export async function checkSubscription(tenantId: string): Promise<{
  allowed: boolean;
  status: string;
  reason?: string;
}> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { allowed: false, status: "error", reason: "Tenant não encontrado" };

  // Master/owner nunca expira
  const owner = await prisma.user.findFirst({ where: { tenantId, role: "owner" } });
  if (owner) return { allowed: true, status: "master" };

  // Assinatura ativa
  if (tenant.subscriptionStatus === "active") {
    return { allowed: true, status: "active" };
  }

  // Trial ativo
  if (tenant.subscriptionStatus === "trial" && tenant.trialEndsAt) {
    const now = new Date();
    if (now < new Date(tenant.trialEndsAt)) {
      const daysLeft = Math.ceil((new Date(tenant.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return {
        allowed: true,
        status: "trial",
        reason: `${daysLeft} dias restantes no trial`,
      };
    }
  }

  // Expirado ou cancelado
  return {
    allowed: false,
    status: tenant.subscriptionStatus,
    reason: tenant.subscriptionStatus === "trial" ? "Trial expirado. Assine para continuar." : "Assinatura cancelada.",
  };
}

export async function canCreateFlow(tenantId: string): Promise<boolean> {
  const { allowed, status } = await checkSubscription(tenantId);
  if (!allowed) return false;

  // Trial: limitado a 1 fluxo
  if (status === "trial") {
    const count = await prisma.flow.count({ where: { tenantId } });
    return count < 1;
  }

  return true; // assinante: ilimitado
}
