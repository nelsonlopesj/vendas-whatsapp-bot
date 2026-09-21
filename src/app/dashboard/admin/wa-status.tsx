"use client";

import { useEffect, useState } from "react";

interface WaStatuses {
  [tenantId: string]: { state: string };
}

// Cache em memória (módulo): todas as células da tabela compartilham UMA
// chamada à API por ~30s, em vez de uma por linha.
let cache: { at: number; data: WaStatuses } | null = null;
let inflight: Promise<WaStatuses> | null = null;

function loadStatuses(): Promise<WaStatuses> {
  if (cache && Date.now() - cache.at < 30_000) {
    return Promise.resolve(cache.data);
  }
  if (!inflight) {
    inflight = fetch("/api/admin/whatsapp-status")
      .then((r) => r.json().catch(() => ({})))
      .then((d) => d.statuses || {})
      .finally(() => {
        inflight = null;
      });
  }
  inflight.then((data) => {
    cache = { at: Date.now(), data };
  });
  return inflight;
}

const LABELS: Record<string, { label: string; cls: string }> = {
  open: { label: "Conectado", cls: "bg-green-500/10 text-green-600" },
  connecting: { label: "Conectando", cls: "bg-amber-500/10 text-amber-600" },
  close: { label: "Desconectado", cls: "bg-muted-foreground/10 text-muted-foreground" },
  refused: { label: "Desconectado", cls: "bg-muted-foreground/10 text-muted-foreground" },
};

/** Coluna WA: estado de conexão do WhatsApp do cliente (via Evolution) */
export function WaStatusCell({ tenantId }: { tenantId: string }) {
  const [statuses, setStatuses] = useState<WaStatuses>(cache?.data || {});
  const state = statuses[tenantId]?.state;

  useEffect(() => {
    loadStatuses().then((d) => setStatuses(d));
  }, []);

  if (!state) {
    return <span className="text-[10px] text-muted-foreground/60">…</span>;
  }

  const cfg = LABELS[state] || {
    label: "Desconhecido",
    cls: "bg-muted-foreground/10 text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${cfg.cls}`}
      title={`Status do WhatsApp (${state})`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-none ${
          state === "open"
            ? "bg-green-500"
            : state === "connecting"
              ? "bg-amber-500"
              : "bg-muted-foreground/40"
        }`}
      />
      {cfg.label}
    </span>
  );
}
