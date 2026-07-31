"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShoppingCart,
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  Package,
} from "lucide-react";

interface Sale {
  id: string;
  amount: number;
  status: string;
  customerPhone: string;
  customerName: string | null;
  createdAt: string;
  paidAt: string | null;
  product: { name: string } | null;
  flow: { name: string } | null;
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const fetchSales = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter) params.set("status", filter);
    const res = await fetch(`/api/sales?${params}`);
    if (res.ok) {
      const data = await res.json();
      setSales(data.sales || []);
      setTotal(data.total || 0);
      setRevenue(data.revenue || 0);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "PAID": return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "PENDING": return <Clock className="w-4 h-4 text-amber-500" />;
      case "CANCELLED": return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "PAID": return "Pago";
      case "PENDING": return "Pendente";
      case "CANCELLED": return "Cancelado";
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vendas</h1>
          <p className="text-sm text-muted-foreground">
            {total} transação{total !== 1 ? "ões" : ""} • R${" "}
            {revenue.toFixed(2)} em vendas
          </p>
        </div>
        <div className="flex items-center gap-2">
          {["", "PAID", "PENDING", "CANCELLED"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === s
                  ? "bg-primary text-primary-foreground"
                  : "border border-input hover:bg-secondary"
              }`}
            >
              {s || "Todos"}
            </button>
          ))}
        </div>
      </div>

      {sales.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Nenhuma venda ainda</h2>
          <p className="text-sm text-muted-foreground">
            As vendas aparecerão aqui quando clientes pagarem via PIX nos seus fluxos.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium">Produto</th>
                  <th className="text-left px-4 py-3 font-medium">Cliente</th>
                  <th className="text-left px-4 py-3 font-medium">Valor</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-b border-border hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <span>{sale.product?.name || "Produto"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {sale.customerName || sale.customerPhone}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      R$ {sale.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        {statusIcon(sale.status)}
                        <span className="text-xs">{statusLabel(sale.status)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(sale.createdAt).toLocaleDateString("pt-BR")} {new Date(sale.createdAt).toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
