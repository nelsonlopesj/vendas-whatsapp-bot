"use client";

import { useEffect, useState } from "react";
import { Layers, X } from "lucide-react";

export interface FlowSummary {
  id: string;
  name: string;
  isActive: boolean;
  hidden: boolean;
  triggerKeyword: string;
  stepsCount: number;
}

/** Célula da coluna Fluxos: clique no número abre um modal com os fluxos do cliente */
export function FlowsModal({
  tenantName,
  flows,
}: {
  tenantName: string;
  flows: FlowSummary[];
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (flows.length === 0) return <span className="text-muted-foreground">0</span>;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
        title={`Ver os ${flows.length} fluxos de ${tenantName}`}
      >
        {flows.length}
        <Layers className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <p className="font-bold">{tenantName}</p>
                <p className="text-xs text-muted-foreground">
                  {flows.length} fluxo{flows.length !== 1 ? "s" : ""} •{" "}
                  {flows.filter((f) => f.isActive).length} ativo
                  {flows.filter((f) => f.isActive).length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 space-y-2">
              {flows.map((f) => (
                <div
                  key={f.id}
                  className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/40 border border-border/60"
                >
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full flex-none ${
                      f.isActive ? "bg-green-500" : "bg-muted-foreground/40"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      {f.hidden && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full flex-none">
                          Interno
                        </span>
                      )}
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full flex-none ${
                          f.isActive
                            ? "bg-green-500/10 text-green-600"
                            : "bg-muted-foreground/10 text-muted-foreground"
                        }`}
                      >
                        {f.isActive ? "Ativo" : "Pausado"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      Gatilho: {f.triggerKeyword} • {f.stepsCount} passos
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
