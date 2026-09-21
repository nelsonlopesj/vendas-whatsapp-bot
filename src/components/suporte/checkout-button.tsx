"use client";

import { useState } from "react";

/**
 * Botão de assinatura: POST /api/stripe/checkout (mesmo fluxo do banner do
 * dashboard, que devolve a URL do checkout do Stripe) e redireciona.
 */
export function StripeCheckoutButton() {
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handle}
      disabled={loading}
      className="inline-flex items-center gap-2 mt-3 px-4 py-2.5 rounded-lg border border-input text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50"
    >
      {loading ? "Abrindo..." : "Ver planos e assinatura"}
    </button>
  );
}
