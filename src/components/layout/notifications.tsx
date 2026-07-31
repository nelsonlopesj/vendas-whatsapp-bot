"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, ShoppingCart, X } from "lucide-react";

interface Sale {
  id: string;
  amount: number;
  customerName: string | null;
  status: string;
  createdAt: string;
  product: { name: string } | null;
}

export function Notifications() {
  const [open, setOpen] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [unread, setUnread] = useState(0);

  const fetchRecent = useCallback(async () => {
    const res = await fetch("/api/sales?limit=5");
    if (res.ok) {
      const data = await res.json();
      setSales(data.sales || []);
      const paid = (data.sales || []).filter((s: Sale) => s.status === "PAID").length;
      setUnread(paid);
    }
  }, []);

  useEffect(() => {
    fetchRecent();
    const interval = setInterval(fetchRecent, 15000);
    return () => clearInterval(interval);
  }, [fetchRecent]);

  // Browser notification for new sales
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
    const lastCount = sales.filter(s => s.status === "PAID").length;
    if (lastCount > 0 && Notification.permission === "granted") {
      const latest = sales.find(s => s.status === "PAID");
      if (latest) {
        try {
          new Notification("💰 Nova venda!", {
            body: `${latest.product?.name || "Produto"} — R$ ${latest.amount.toFixed(2)}`,
            icon: "/icon-192.png",
          });
        } catch {}
      }
    }
  }, [sales.length]);

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); if (open) setUnread(0); }}
        className="p-2 rounded-lg hover:bg-secondary transition-colors relative"
        title="Notificações"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-[10px] font-bold text-white flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-card border border-border rounded-xl shadow-2xl z-50">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h3 className="text-sm font-semibold">Notificações</h3>
            <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-secondary">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {sales.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">
                Nenhuma venda ainda
              </p>
            ) : (
              sales.map((sale) => (
                <div key={sale.id} className="flex items-center gap-3 p-3 border-b border-border last:border-0 hover:bg-muted/20">
                  <div className={`p-1.5 rounded-lg ${sale.status === "PAID" ? "bg-green-500/10" : "bg-amber-500/10"}`}>
                    <ShoppingCart className={`w-4 h-4 ${sale.status === "PAID" ? "text-green-500" : "text-amber-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {sale.product?.name || "Produto"} — R$ {sale.amount.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(sale.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} •{" "}
                      {sale.status === "PAID" ? "✅ Pago" : "⏳ Pendente"}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
