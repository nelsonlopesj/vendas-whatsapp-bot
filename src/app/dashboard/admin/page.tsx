import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Users, CreditCard, Clock, CheckCircle2, XCircle, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "owner") redirect("/dashboard");

  const tenants = await prisma.tenant.findMany({
    include: { users: { select: { email: true, name: true } }, _count: { select: { sales: true, flows: true } } },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const totalTenants = tenants.length;
  const activeSubs = tenants.filter(t => t.subscriptionStatus === "active").length;
  const trialUsers = tenants.filter(t => t.subscriptionStatus === "trial" && t.trialEndsAt && new Date(t.trialEndsAt) > now).length;
  const expiredUsers = tenants.filter(t => {
    if (t.subscriptionStatus === "active") return false;
    if (t.subscriptionStatus === "trial" && t.trialEndsAt && new Date(t.trialEndsAt) > now) return false;
    return true;
  }).length;

  const totalRevenue = await prisma.sale.aggregate({ where: { status: "PAID" }, _sum: { amount: true } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin — Todos os Clientes</h1>
        <p className="text-sm text-muted-foreground">Visão geral da plataforma</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total clientes", value: totalTenants, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
          { label: "Ativos (Pro)", value: activeSubs, icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10" },
          { label: "Em trial", value: trialUsers, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
          { label: "Expirados", value: expiredUsers, icon: XCircle, color: "text-red-500", bg: "bg-red-500/10" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className={`p-1.5 rounded-lg ${s.bg} inline-flex mb-2`}><s.icon className={`w-4 h-4 ${s.color}`} /></div>
            <p className="text-xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Revenue */}
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-sm font-semibold">Faturamento total da plataforma</p>
        <p className="text-2xl font-bold text-green-600">R$ {(totalRevenue._sum.amount || 0).toFixed(2)}</p>
      </div>

      {/* Tenants table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Email</th>
                <th className="text-left px-4 py-3 font-medium">Plano</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Vendas</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Fluxos</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const isOwner = t.users[0]?.role === "owner" || t.users[0]?.email === session?.user?.email;
                const isActive = t.subscriptionStatus === "active";
                const isExpired = !isActive && !(t.subscriptionStatus === "trial" && t.trialEndsAt && new Date(t.trialEndsAt) > now);
                const daysLeft = t.trialEndsAt
                  ? Math.ceil((new Date(t.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                  : 0;

                return (
                  <tr key={t.id} className="border-b border-border hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">
                      {t.name}
                      {isOwner && <span className="ml-2 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">MASTER</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{t.users[0]?.email || "-"}</td>
                    <td className="px-4 py-3">
                      {isOwner ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full"><Sparkles className="w-3 h-3" /> Master</span>
                      ) : isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Pro</span>
                      ) : isExpired ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-red-500/10 text-red-600 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" /> Expirado</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" /> {daysLeft}d</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">{t._count.sales}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">{t._count.flows}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(t.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
