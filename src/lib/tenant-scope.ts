import prisma from "@/lib/prisma";

/**
 * Resolve o tenant efetivo de uma requisição.
 *
 * O owner (master) pode operar em nome de qualquer tenant informado via
 * `?tenantId` (query) ou `body.tenantId` — usado no Admin → Clientes para
 * criar/editar fluxos dos clientes. Demais perfis ficam SEMPRE presos ao
 * próprio tenant da sessão (mesmo que passem um tenantId por conta própria).
 */
export async function resolveTenantId(
  session: any,
  requested?: string | null
): Promise<string | null> {
  const user = session?.user || {};
  if (!user.tenantId) return null;
  if (user.role === "owner" && requested && requested !== user.tenantId) {
    const exists = await prisma.tenant.findUnique({
      where: { id: requested },
      select: { id: true },
    });
    if (exists) return requested;
  }
  return user.tenantId;
}

/** True quando o owner está agindo em nome de OUTRO tenant (modo suporte) */
export function isOwnerOverride(
  session: any,
  requested: string | null | undefined,
  resolvedTenantId: string | null
): boolean {
  const user = session?.user || {};
  return (
    user.role === "owner" &&
    Boolean(requested) &&
    requested !== user.tenantId &&
    resolvedTenantId === requested
  );
}
