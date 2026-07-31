import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ShoppingCart, ArrowLeftRight, Package, TrendingUp, DollarSign, Activity } from "lucide-react";
import Link from "next/link";
import { TrialBanner } from "@/components/dashboard/trial-banner";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) return <div>Erro ao carregar tenant.</div>;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  const [totalSales, totalProducts, activeFlows, recentSales] =
    await Promise.all([
      prisma.sale.count({ where: { tenantId } }),
      prisma.product.count({ where: { tenantId, active: true } }),
      prisma.flow.count({ where: { tenantId, isActive: true } }),
      prisma.sale.findMany({
        where: { tenantId, status: "PAID" },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { product: true },
      }),
    ]);

  const totalRevenue = await prisma.sale.aggregate({
    where: { tenantId, status: "PAID" },
    _sum: { amount: true },
  });

  const stats = [
    {
      label: "Vendas concluídas",
      value: totalSales.toString(),
      icon: ShoppingCart,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      label: "Faturamento",
      value: `R$ ${(totalRevenue._sum.amount || 0).toFixed(2)}`,
      icon: DollarSign,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Produtos ativos",
      value: totalProducts.toString(),
      icon: Package,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Fluxos ativos",
      value: activeFlows.toString(),
      icon: ArrowLeftRight,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
  ];

  return (
    <div className="space-y-8">
      <TrialBanner subscriptionStatus={tenant?.subscriptionStatus || "trial"} trialEndsAt={tenant?.trialEndsAt?.toISOString() || null} />
      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-card border border-border rounded-xl p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions + Recent sales */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Quick actions */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold text-lg mb-4">Ações rápidas</h2>
          <div className="space-y-2">
            <Link
              href="/dashboard/flows/new"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary transition-colors"
            >
              <div className="p-2 rounded-lg bg-purple-500/10">
                <ArrowLeftRight className="w-4 h-4 text-purple-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Criar novo fluxo</p>
                <p className="text-xs text-muted-foreground">
                  Monte uma automação de venda
                </p>
              </div>
            </Link>
            <Link
              href="/dashboard/products/upload"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary transition-colors"
            >
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Package className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Subir produto</p>
                <p className="text-xs text-muted-foreground">
                  Adicione um ebook, PDF ou audiobook
                </p>
              </div>
            </Link>
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary transition-colors"
            >
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Activity className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Conectar WhatsApp</p>
                <p className="text-xs text-muted-foreground">
                  Configure seu número e comece a vender
                </p>
              </div>
            </Link>
          </div>
        </div>

        {/* Recent sales */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Vendas recentes</h2>
            <Link
              href="/dashboard/sales"
              className="text-sm text-primary hover:underline"
            >
              Ver todas
            </Link>
          </div>
          {recentSales.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma venda ainda.</p>
              <p className="text-xs mt-1">
                Configure um fluxo e comece a vender!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {sale.product?.name || "Produto"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sale.customerPhone} •{" "}
                      {new Date(sale.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-green-600">
                      R$ {sale.amount.toFixed(2)}
                    </p>
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                      <TrendingUp className="w-3 h-3" />
                      Pago
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
