import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ShoppingCart, ArrowLeftRight, Package, DollarSign, TrendingUp, Percent } from "lucide-react";
import Link from "next/link";
import { TrialBanner } from "@/components/dashboard/trial-banner";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) return <div>Erro ao carregar tenant.</div>;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [totalSales, paidSales, pendingSales, totalProducts, activeFlows, monthlyRevenue, weeklyRevenue, recentSales, weeklyData] =
    await Promise.all([
      prisma.sale.count({ where: { tenantId } }),
      prisma.sale.count({ where: { tenantId, status: "PAID" } }),
      prisma.sale.count({ where: { tenantId, status: "PENDING" } }),
      prisma.product.count({ where: { tenantId, active: true } }),
      prisma.flow.count({ where: { tenantId, isActive: true } }),
      prisma.sale.aggregate({ where: { tenantId, status: "PAID", createdAt: { gte: monthAgo } }, _sum: { amount: true } }),
      prisma.sale.aggregate({ where: { tenantId, status: "PAID", createdAt: { gte: weekAgo } }, _sum: { amount: true } }),
      prisma.sale.findMany({ where: { tenantId, status: "PAID" }, orderBy: { createdAt: "desc" }, take: 5, include: { product: true } }),
      // Últimos 7 dias por dia
      Promise.all(Array.from({ length: 7 }, (_, i) => {
        const day = new Date(now); day.setDate(day.getDate() - i); day.setHours(0, 0, 0, 0);
        const next = new Date(day); next.setDate(next.getDate() + 1);
        return prisma.sale.count({ where: { tenantId, status: "PAID", createdAt: { gte: day, lt: next } } });
      })),
    ]);

  const conversionRate = totalSales > 0 ? Math.round((paidSales / totalSales) * 100) : 0;

  const stats = [
    { label: "Vendas pagas", value: paidSales.toString(), sub: `${totalSales} total`, icon: ShoppingCart, color: "text-green-500", bg: "bg-green-500/10" },
    { label: "Faturamento (mês)", value: `R$ ${(monthlyRevenue._sum.amount || 0).toFixed(2)}`, sub: `R$ ${(weeklyRevenue._sum.amount || 0).toFixed(2)} na semana`, icon: DollarSign, color: "text-primary", bg: "bg-primary/10" },
    { label: "Taxa de conversão", value: `${conversionRate}%`, sub: `${pendingSales} pendentes`, icon: Percent, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Produtos ativos", value: totalProducts.toString(), sub: `${activeFlows} fluxos`, icon: Package, color: "text-purple-500", bg: "bg-purple-500/10" },
  ];

  const maxDayCount = Math.max(...weeklyData.reverse(), 1);
  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString("pt-BR", { weekday: "short" });
  });

  return (
    <div className="space-y-6">
      {(session?.user as any)?.role !== "owner" && (
        <TrialBanner subscriptionStatus={tenant?.subscriptionStatus || "trial"} trialEndsAt={tenant?.trialEndsAt?.toISOString() || null} />
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
            <div className={`p-1.5 rounded-lg ${stat.bg} inline-flex mb-2`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className="text-xl lg:text-2xl font-bold">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Chart */}
        <div className="lg:col-span-3 bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4">Vendas nos últimos 7 dias</h2>
          <div className="flex items-end gap-2 h-32">
            {weeklyData.map((count, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-medium">{count}</span>
                <div
                  className="w-full bg-primary rounded-t-md transition-all"
                  style={{ height: `${maxDayCount > 0 ? (count / maxDayCount) * 100 : 0}%`, minHeight: count > 0 ? "4px" : "0" }}
                />
                <span className="text-[10px] text-muted-foreground">{dayLabels[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent sales + Quick actions */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Últimas vendas</h2>
            <Link href="/dashboard/sales" className="text-xs text-primary hover:underline">Ver todas</Link>
          </div>
          {recentSales.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Nenhuma venda ainda
            </div>
          ) : (
            <div className="space-y-2">
              {recentSales.slice(0, 4).map((sale) => (
                <div key={sale.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{sale.product?.name || "Produto"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(sale.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                    </p>
                  </div>
                  <span className="font-semibold text-green-600 text-sm shrink-0">R$ {sale.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
