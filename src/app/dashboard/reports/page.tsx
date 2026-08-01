"use client";

import { useState, useEffect, useCallback } from "react";
import { BarChart3, DollarSign, ShoppingCart, TrendingUp, Filter, ArrowLeftRight } from "lucide-react";

export default function ReportsPage() {
  const [period, setPeriod] = useState("30");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const start = new Date(now.getTime() - parseInt(period) * 24 * 60 * 60 * 1000);

    const res = await fetch(`/api/sales?limit=1000`);
    const all = await res.json();

    const sales = (all.sales || []).filter((s: any) => new Date(s.createdAt) >= start);

    // Agrupar por produto
    const byProduct: Record<string, { name: string; count: number; revenue: number }> = {};
    // Agrupar por dia
    const byDay: Record<string, { paid: number; pending: number }> = {};

    sales.forEach((s: any) => {
      const pName = s.product?.name || "Sem produto";
      if (!byProduct[pName]) byProduct[pName] = { name: pName, count: 0, revenue: 0 };
      byProduct[pName].count++;
      if (s.status === "PAID") byProduct[pName].revenue += s.amount;

      const day = new Date(s.createdAt).toLocaleDateString("pt-BR");
      if (!byDay[day]) byDay[day] = { paid: 0, pending: 0 };
      if (s.status === "PAID") byDay[day].paid++;
      else byDay[day].pending++;
    });

    // Funil
    const sessionsRes = await fetch("/api/flows");
    const flowsData = await sessionsRes.json();
    const totalSessions = (flowsData.flows || []).reduce((acc: number, f: any) => acc + (f._count?.sessions || 0), 0);

    const paidSales = sales.filter((s: any) => s.status === "PAID").length;
    const conversionRate = totalSessions > 0 ? Math.round((paidSales / totalSessions) * 100) : 0;

    setData({
      totalSales: sales.length,
      paidSales,
      totalRevenue: sales.filter((s: any) => s.status === "PAID").reduce((acc: number, s: any) => acc + s.amount, 0),
      byProduct: Object.values(byProduct).sort((a: any, b: any) => b.revenue - a.revenue),
      byDay: Object.entries(byDay).slice(-14).map(([day, d]) => ({ day, ...d })),
      funnel: { sessions: totalSessions, sales: paidSales, rate: conversionRate },
    });
    setLoading(false);
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Análise detalhada de vendas</p>
        </div>
        <select value={period} onChange={e => setPeriod(e.target.value)} className="px-3 py-2 rounded-lg border border-input bg-background text-sm">
          <option value="7">7 dias</option>
          <option value="30">30 dias</option>
          <option value="90">90 dias</option>
          <option value="365">1 ano</option>
        </select>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Vendas no período", value: data.totalSales, sub: `${data.paidSales} pagas`, icon: ShoppingCart, color: "text-blue-500", bg: "bg-blue-500/10" },
          { label: "Faturamento", value: `R$ ${data.totalRevenue.toFixed(2)}`, sub: `${period} dias`, icon: DollarSign, color: "text-green-500", bg: "bg-green-500/10" },
          { label: "Ticket médio", value: `R$ ${data.paidSales > 0 ? (data.totalRevenue / data.paidSales).toFixed(2) : "0.00"}`, sub: "por venda", icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
          { label: "Conversão", value: `${data.funnel.rate}%`, sub: `${data.funnel.sessions} sessões`, icon: ArrowLeftRight, color: "text-purple-500", bg: "bg-purple-500/10" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className={`p-1.5 rounded-lg ${s.bg} inline-flex mb-2`}><s.icon className={`w-4 h-4 ${s.color}`} /></div>
            <p className="text-xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-[10px] text-muted-foreground/60">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Vendas por produto */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4">Vendas por produto</h2>
          {data.byProduct.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma venda no período</p>
          ) : (
            <div className="space-y-3">
              {data.byProduct.map((p: any) => (
                <div key={p.name} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{p.count} venda{p.count !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">R$ {p.revenue.toFixed(2)}</p>
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${data.totalRevenue > 0 ? (p.revenue / data.totalRevenue) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Funil */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4">Funil de vendas</h2>
          <div className="space-y-4">
            {[
              { label: "Conversas iniciadas", value: data.funnel.sessions, color: "bg-blue-500", pct: "100%" },
              { label: "Vendas concluídas", value: data.funnel.sales, color: "bg-green-500", pct: `${data.funnel.rate}%` },
            ].map((step, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{step.label}</span>
                  <span className="text-muted-foreground">{step.value} ({step.pct})</span>
                </div>
                <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${step.color} rounded-full`} style={{ width: step.pct }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Vendas por dia */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-4">Vendas por dia</h2>
        <div className="flex items-end gap-1 h-24">
          {data.byDay.map((d: any) => {
            const max = Math.max(...data.byDay.map((x: any) => x.paid + x.pending), 1);
            return (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5">
                <span className="text-[10px] font-medium">{d.paid + d.pending}</span>
                <div className="w-full flex gap-px">
                  <div className="flex-1 bg-green-500 rounded-t-sm" style={{ height: `${(d.paid / max) * 80}px`, minHeight: d.paid > 0 ? "2px" : 0 }} />
                  <div className="flex-1 bg-amber-500 rounded-t-sm" style={{ height: `${(d.pending / max) * 80}px`, minHeight: d.pending > 0 ? "2px" : 0 }} />
                </div>
                <span className="text-[9px] text-muted-foreground truncate w-full text-center">{d.day.slice(0, 5)}</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded-sm" /> Pagas</span>
          <span className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-500 rounded-sm" /> Pendentes</span>
        </div>
      </div>
    </div>
  );
}
