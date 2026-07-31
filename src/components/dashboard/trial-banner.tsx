"use client";

import { useState } from "react";
import { Sparkles, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Props {
  subscriptionStatus: string;
  trialEndsAt: string | null;
}

export function TrialBanner({ subscriptionStatus, trialEndsAt }: Props) {
  const [loading, setLoading] = useState(false);

  const trialEnd = trialEndsAt ? new Date(trialEndsAt) : null;
  const daysLeft = trialEnd
    ? Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  const handleSubscribe = async () => {
    setLoading(true);
    const res = await fetch("/api/stripe/checkout", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    setLoading(false);
  };

  if (subscriptionStatus === "active") {
    return (
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-700">Assinatura Ativa</p>
          <p className="text-xs text-green-600">Todos os recursos liberados</p>
        </div>
      </div>
    );
  }

  if (daysLeft <= 0 && subscriptionStatus === "trial") {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-700">Trial Expirado</p>
          <p className="text-xs text-red-600">Assine para continuar vendendo</p>
        </div>
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "..." : "Assinar R$ 59,90/mês"}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center gap-3 flex-wrap">
      <Sparkles className="w-5 h-5 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">
          Trial — <span className="text-primary">{daysLeft} dias restantes</span>
        </p>
        <p className="text-xs text-muted-foreground">Depois R$ 59,90/mês (promocional)</p>
      </div>
      <button
        onClick={handleSubscribe}
        disabled={loading}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "..." : "Assinar agora"}
      </button>
    </div>
  );
}
