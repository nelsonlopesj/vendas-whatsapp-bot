"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, X, Plus, Upload, Pencil, Trash2, Power, PowerOff, Loader2 } from "lucide-react";

export interface FlowSummary {
  id: string;
  name: string;
  isActive: boolean;
  hidden: boolean;
  triggerKeyword: string;
  stepsCount: number;
}

/**
 * Célula da coluna Fluxos no Admin → Clientes: clique no número abre o modal
 * de gestão de fluxos do cliente (criar, importar JSON, editar, ativar/pausar,
 * excluir) — modo suporte do owner, tudo via ?tenantId= nas APIs.
 */
export function FlowsModal({
  tenantId,
  tenantName,
  flows: initialFlows,
}: {
  tenantId: string;
  tenantName: string;
  flows: FlowSummary[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [flows, setFlows] = useState<FlowSummary[]>(initialFlows);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const api = (path: string) =>
    `/api/flows${path}${path.includes("?") ? "&" : "?"}tenantId=${tenantId}`;

  const fetchFlows = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(api(""));
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.flows)) {
        setFlows(
          data.flows.map((f: any) => ({
            id: f.id,
            name: f.name,
            isActive: f.isActive,
            hidden: f.hidden === true,
            triggerKeyword: f.triggerKeyword,
            stepsCount: f.steps?.length || 0,
          }))
        );
      } else {
        setError(data.error || "Erro ao carregar fluxos");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  // Ao abrir, sempre busca a lista atual (outras abas/sessões podem ter mudado)
  useEffect(() => {
    if (open) fetchFlows();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const toggleActive = async (f: FlowSummary) => {
    setBusyId(f.id);
    try {
      const res = await fetch(api(`/${f.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !f.isActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erro ao alterar status");
        return;
      }
      setFlows((prev) =>
        prev.map((x) => (x.id === f.id ? { ...x, isActive: !f.isActive } : x))
      );
    } catch {
      setError("Erro de conexão");
    } finally {
      setBusyId(null);
    }
  };

  const removeFlow = async (f: FlowSummary) => {
    if (
      !window.confirm(
        `Excluir o fluxo "${f.name}" de ${tenantName}?\n\nEssa ação não pode ser desfeita.`
      )
    ) {
      return;
    }
    setBusyId(f.id);
    try {
      const res = await fetch(api(`/${f.id}`), { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erro ao excluir");
        return;
      }
      setFlows((prev) => prev.filter((x) => x.id !== f.id));
    } catch {
      setError("Erro de conexão");
    } finally {
      setBusyId(null);
    }
  };

  const handleImport = async (file: File) => {
    setImportMsg(null);
    const text = await file.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      setImportMsg({ ok: false, text: "Arquivo inválido — não é um JSON de fluxo." });
      return;
    }
    setImporting(true);
    try {
      const res = await fetch(api(""), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name || "Fluxo Importado",
          triggerKeyword: data.triggerKeyword || "",
          triggerMode: data.triggerMode || "contains",
          steps: (data.steps || []).map((s: any) => ({
            id: s.id || undefined,
            type: s.type,
            label: s.label || s.type,
            config: s.config || {},
            productId: null,
            positionX: s.positionX ?? null,
            positionY: s.positionY ?? null,
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setImportMsg({ ok: true, text: `✅ "${data.name || "Fluxo"}" importado para ${tenantName}!` });
        await fetchFlows();
      } else {
        setImportMsg({ ok: false, text: `❌ Falha ao importar: ${body.error || res.status}` });
      }
    } catch (err: any) {
      setImportMsg({ ok: false, text: `❌ Falha ao importar: ${err.message}` });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const activeCount = flows.filter((f) => f.isActive).length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
        title={`Gerenciar os fluxos de ${tenantName}`}
      >
        {initialFlows.length}
        <Layers className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <p className="font-bold">{tenantName}</p>
                <p className="text-xs text-muted-foreground">
                  {flows.length} fluxo{flows.length !== 1 ? "s" : ""} •{" "}
                  {activeCount} ativo{activeCount !== 1 ? "s" : ""}
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

            <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/20">
              <button
                onClick={() => router.push(`/dashboard/flows/new?tenantId=${tenantId}`)}
                className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo fluxo
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={importing}
                className="inline-flex items-center gap-1.5 border border-input px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-secondary transition-colors disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Importar JSON
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImport(f);
                }}
              />
            </div>

            {importMsg && (
              <p
                className={`mx-5 mt-3 text-xs ${
                  importMsg.ok ? "text-green-600" : "text-destructive"
                }`}
              >
                {importMsg.text}
              </p>
            )}
            {error && <p className="mx-5 mt-3 text-xs text-destructive">{error}</p>}

            <div className="overflow-y-auto p-4 space-y-2">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Carregando...
                </p>
              ) : flows.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Layers className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm font-medium mb-1">Nenhum fluxo ainda</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Crie um fluxo novo ou importe um arquivo JSON — sem o
                    cliente precisar fazer nada.
                  </p>
                </div>
              ) : (
                flows.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/40 border border-border/60"
                  >
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full flex-none ${
                        f.isActive ? "bg-green-500" : "bg-muted-foreground/40"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
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
                    <div className="flex items-center gap-1 flex-none">
                      <button
                        onClick={() =>
                          router.push(`/dashboard/flows/${f.id}?tenantId=${tenantId}`)
                        }
                        title="Editar no canvas"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleActive(f)}
                        disabled={busyId === f.id}
                        title={f.isActive ? "Pausar fluxo" : "Ativar fluxo"}
                        className={`p-1.5 rounded-md transition-colors disabled:opacity-50 ${
                          f.isActive
                            ? "text-green-600 hover:bg-green-50"
                            : "text-muted-foreground hover:bg-secondary"
                        }`}
                      >
                        {f.isActive ? (
                          <Power className="w-3.5 h-3.5" />
                        ) : (
                          <PowerOff className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => removeFlow(f)}
                        disabled={busyId === f.id}
                        title="Excluir fluxo"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
