"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  ArrowLeftRight,
  Upload,
  Download,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Sparkles,
  ShoppingBag,
} from "lucide-react";

interface Flow {
  id: string;
  name: string;
  triggerKeyword: string;
  isActive: boolean;
  _count: { sessions: number; sales: number };
  steps: any[];
  createdAt: string;
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const fetchFlows = useCallback(async () => {
    const res = await fetch("/api/flows");
    const data = await res.json();
    setFlows(data.flows || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  const deleteFlow = async (id: string, name: string) => {
    if (!confirm(`Deletar o fluxo "${name}"?`)) return;
    await fetch(`/api/flows/${id}`, { method: "DELETE" });
    fetchFlows();
  };

  const toggleFlow = async (id: string, active: boolean) => {
    await fetch(`/api/flows/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !active }),
    });
    fetchFlows();
  };

  const importFlow = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        setImportMsg({ ok: false, text: "Arquivo inválido — não é um JSON de fluxo." });
        return;
      }
      setImporting("Arquivo");
      setImportMsg(null);
      try {
        const res = await fetch("/api/flows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name || "Fluxo Importado",
            triggerKeyword: data.triggerKeyword || "",
            triggerMode: data.triggerMode || "contains",
            steps: (data.steps || []).map((s: any, i: number) => ({
              // ids estáveis permitem remapear arestas (v2)
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
          setImportMsg({ ok: true, text: `✅ "${data.name || "Fluxo"}" importado com sucesso!` });
          await fetchFlows();
        } else {
          setImportMsg({ ok: false, text: `❌ Falha ao importar: ${body.error || res.status}` });
        }
      } catch (err: any) {
        setImportMsg({ ok: false, text: `❌ Falha ao importar: ${err.message}` });
      } finally {
        setImporting(null);
      }
    };
    input.click();
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
          <h1 className="text-2xl font-bold">Fluxos de Venda</h1>
          <p className="text-sm text-muted-foreground">
            {flows.length} fluxo{flows.length !== 1 ? "s" : ""} • Crie, importe
            e gerencie suas automações
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={importFlow}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-input hover:bg-secondary transition-colors"
          >
            <Upload className="w-4 h-4" />
            Importar
          </button>
          <Link
            href="/dashboard/flows/new"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Novo Fluxo
          </Link>
        </div>
      </div>

      {importing && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
          <span className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
          Importando &quot;{importing}&quot;...
        </div>
      )}
      {importMsg && (
        <div
          className={`p-3 rounded-lg text-sm ${
            importMsg.ok
              ? "bg-green-500/10 text-green-700"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {importMsg.text}
        </div>
      )}

      {flows.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <ArrowLeftRight className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Nenhum fluxo ainda</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Crie seu primeiro fluxo ou importe um template pronto.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={importFlow}
              className="inline-flex items-center gap-2 border border-input px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-secondary transition-colors"
            >
              <Upload className="w-4 h-4" />
              Importar template
            </button>
            <Link
              href="/dashboard/flows/new"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Criar do zero
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {flows.map((flow) => (
            <div
              key={flow.id}
              className="bg-card border border-border rounded-xl p-5 flex items-center justify-between hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-2 h-2 rounded-full ${
                    flow.isActive ? "bg-green-500" : "bg-muted-foreground/30"
                  }`}
                />
                <div>
                  <Link
                    href={`/dashboard/flows/${flow.id}`}
                    className="font-semibold hover:text-primary transition-colors"
                  >
                    {flow.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Keyword: &ldquo;{flow.triggerKeyword}&rdquo; •{" "}
                    {flow.steps?.length || 0} passos •{" "}
                    {flow._count?.sales || 0} vendas
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleFlow(flow.id, flow.isActive)}
                  className={`p-2 rounded-lg transition-colors ${
                    flow.isActive
                      ? "text-green-600 hover:bg-green-50"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                  title={flow.isActive ? "Desativar" : "Ativar"}
                >
                  {flow.isActive ? (
                    <Power className="w-4 h-4" />
                  ) : (
                    <PowerOff className="w-4 h-4" />
                  )}
                </button>
                <Link
                  href={`/dashboard/flows/${flow.id}`}
                  className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
                >
                  <Pencil className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => deleteFlow(flow.id, flow.name)}
                  className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors text-muted-foreground"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Templates Marketplace */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-lg">Templates Prontos</h2>
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Grátis</span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Importe com 1 clique. Depois é só ajustar o produto e o token PIX.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { name: "Guia da Noiva", desc: "Noivas • R$ 19,90", file: "guia-da-noiva.ezflow.json", color: "bg-pink-500" },
            { name: "Desenhos Bíblicos", desc: "Colorir • R$ 9,90", file: "desenhos-biblicos.ezflow.json", color: "bg-blue-500" },
            { name: "Audiobook Meditação", desc: "Bem-estar • R$ 14,90", file: "audiobook-meditacao.ezflow.json", color: "bg-purple-500" },
          ].map((tpl) => (
            <button
              key={tpl.file}
              onClick={async () => {
                setImporting(tpl.name);
                setImportMsg(null);
                try {
                  const res = await fetch(`/templates/${tpl.file}`);
                  const data = await res.json();
                  const created = await fetch("/api/flows", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                  });
                  const body = await created.json().catch(() => ({}));
                  if (created.ok) {
                    setImportMsg({
                      ok: true,
                      text: `✅ Template "${tpl.name}" importado com sucesso!`,
                    });
                    await fetchFlows();
                  } else {
                    setImportMsg({
                      ok: false,
                      text: `❌ Falha ao importar: ${body.error || created.status}`,
                    });
                  }
                } catch (err: any) {
                  setImportMsg({ ok: false, text: `❌ Falha ao importar: ${err.message}` });
                } finally {
                  setImporting(null);
                }
              }}
              className="flex items-start gap-3 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left"
            >
              <div className={`w-10 h-10 rounded-lg ${tpl.color} flex items-center justify-center shrink-0`}>
                <ShoppingBag className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold">{tpl.name}</p>
                <p className="text-xs text-muted-foreground">{tpl.desc}</p>
                <p className="text-xs text-primary mt-1 font-medium">Importar grátis →</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
