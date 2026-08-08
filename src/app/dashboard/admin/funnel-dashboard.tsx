"use client";

import { useState, useEffect } from "react";
import { TrendingUp, Users, CreditCard, DollarSign, BarChart3 } from "lucide-react";

interface DashboardData {
  visitors: number;
  sessionsCreated: number;
  reachedPix: number;
  paid: number;
  revenue: number;
  byFlow: Array<{ name: string; sessions: number; reachedPix: number; paid: number }>;
}

export function FunnelDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">Carregando...</div>;
  if (!data) return null;

  const steps = [
    { label: "Visitantes", value: data.visitors, icon: Users, color: "text-slate-500", bg: "bg-slate-500/10" },
    { label: "Iniciaram fluxo", value: data.sessionsCreated, icon: TrendingUp, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Chegaram ao PIX", value: data.reachedPix, icon: CreditCard, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Pagaram", value: data.paid, icon: BarChart3, color: "text-green-500", bg: "bg-green-500/10" },
  ];

  const convRate = (a: number, b: number) => b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "-";

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className={`p-1.5 rounded-lg ${s.bg} inline-flex mb-2`}><s.icon className={`w-4 h-4 ${s.color}`} /></div>
            <p className="text-xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Conversion funnel */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-green-500" />
          Receita (7 dias): <span className="text-green-600 font-bold">R$ {data.revenue.toFixed(2)}</span>
        </h3>
        <div className="space-y-2">
          <FunnelBar label="Visitantes → Iniciaram" from={data.visitors} to={data.sessionsCreated} />
          <FunnelBar label="Iniciaram → PIX" from={data.sessionsCreated} to={data.reachedPix} />
          <FunnelBar label="PIX → Pagaram" from={data.reachedPix} to={data.paid} />
          <FunnelBar label="Visitantes → Pagaram" from={data.visitors} to={data.paid} color="text-green-500" />
        </div>
      </div>

      {/* By flow */}
      {data.byFlow.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Por Fluxo (7 dias)</h3>
          <div className="space-y-2">
            {data.byFlow.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border last:border-0">
                <span className="font-medium">{f.name}</span>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{f.sessions} iniciaram</span>
                  <span>{f.reachedPix} PIX</span>
                  <span className="text-green-600 font-medium">{f.paid} pagaram</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FunnelBar({ label, from, to, color = "text-blue-500" }: { label: string; from: number; to: number; color?: string }) {
  const pct = from > 0 ? (to / from) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-40 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color.replace("text", "bg")}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs font-mono w-12 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}
