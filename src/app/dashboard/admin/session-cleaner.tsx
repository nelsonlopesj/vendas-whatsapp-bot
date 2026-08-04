"use client";

import { useState } from "react";
import { Trash2, RefreshCw, MessageSquare, Eye, X } from "lucide-react";

interface FlowSession {
  id: string;
  customerPhone: string;
  customerName: string | null;
  status: string;
  lastActivityAt: string;
  flow: { name: string } | null;
}

interface LogEntry {
  direction: string;
  type: string;
  content: string;
  createdAt: string;
}

export function SessionCleaner() {
  const [sessions, setSessions] = useState<FlowSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logModal, setLogModal] = useState<FlowSession | null>(null);

  const viewLogs = async (s: FlowSession) => {
    setLogModal(s);
    setLogs([]);
    const res = await fetch(`/api/sessions?sessionId=${s.id}&action=logs`);
    const data = await res.json();
    setLogs(data.logs || []);
  };

  const [filter, setFilter] = useState("active,waiting_pix,timed_out,failed");

  const loadSessions = async () => {
    setLoading(true);
    const res = await fetch(`/api/sessions?status=${filter}`);
    const data = await res.json();
    setSessions(data.sessions || []);
    setLoading(false);
  };

  const resetStuck = async () => {
    if (!confirm("Fechar todas as sessões travadas (+1h sem atividade)?")) return;
    setLoading(true);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close_all_stuck" }),
    });
    const data = await res.json();
    setMessage(`${data.closed} sessões fechadas.`);
    setLoading(false);
    loadSessions();
  };

  const resetAll = async () => {
    if (!confirm("ATENÇÃO: Fechar TODAS as sessões ativas? Isso vai interromper conversas em andamento.")) return;
    setLoading(true);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close_all" }),
    });
    const data = await res.json();
    setMessage(`${data.closed} sessões fechadas.`);
    setLoading(false);
    loadSessions();
  };

  const closeOne = async (id: string) => {
    setLoading(true);
    await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close", sessionId: id }),
    });
    setLoading(false);
    loadSessions();
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Sessões</h2>
          <select
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setTimeout(() => loadSessions(), 50); }}
            className="text-xs px-2 py-1 rounded-lg border border-input bg-background"
          >
            <option value="active,waiting_pix">Ativas / Aguardando PIX</option>
            <option value="active,waiting_pix,timed_out">+ Expiradas</option>
            <option value="active,waiting_pix,timed_out,failed">Todas</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadSessions}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 disabled:opacity-50 flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Listar
          </button>
          <button
            onClick={resetStuck}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 disabled:opacity-50 flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            Travadas (+1h)
          </button>
          <button
            onClick={async () => {
              if (!confirm("Ocultar sessões expiradas automaticamente?")) return;
              setLoading(true);
              const res = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "close_all_expired" }) });
              const data = await res.json();
              setMessage(`${data.closed} sessões expiradas ocultadas.`);
              setLoading(false);
              loadSessions();
            }}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 disabled:opacity-50 flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            Expiradas (auto)
          </button>
          <button
            onClick={resetAll}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20 disabled:opacity-50 flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            Resetar Todas
          </button>
        </div>
      </div>

      {message && (
        <div className="px-4 py-2 bg-green-500/10 text-green-600 text-xs">{message}</div>
      )}

      {sessions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 font-medium text-xs">Cliente</th>
                <th className="text-left px-4 py-2 font-medium text-xs">Fluxo</th>
                <th className="text-left px-4 py-2 font-medium text-xs">Status</th>
                <th className="text-left px-4 py-2 font-medium text-xs hidden sm:table-cell">Última atividade</th>
                <th className="text-right px-4 py-2 font-medium text-xs">Ação</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-border hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <p className="font-medium text-xs">{s.customerName || s.customerPhone}</p>
                    {s.customerName && <p className="text-[10px] text-muted-foreground">{s.customerPhone}</p>}
                  </td>
                  <td className="px-4 py-2 text-xs">{s.flow?.name || "-"}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      s.status === "waiting_pix" ? "bg-purple-500/20 text-purple-400" :
                      s.status === "active" ? "bg-blue-500/20 text-blue-400" :
                      s.status === "timed_out" ? "bg-amber-500/20 text-amber-400" :
                      "bg-red-500/20 text-red-400"
                    }`}>
                      {s.status === "timed_out" ? "expirada" : s.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground hidden sm:table-cell">
                    {new Date(s.lastActivityAt).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-2 text-right flex items-center gap-1 justify-end">
                    <button
                      onClick={() => viewLogs(s)}
                      className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"
                    >
                      <Eye className="w-3 h-3 inline mr-0.5" />Ver
                    </button>
                    <button
                      onClick={() => closeOne(s.id)}
                      className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-600 hover:bg-red-500/20"
                    >
                      Fechar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-muted-foreground">
          {loading ? "Carregando..." : 'Clique em "Listar" para ver as sessões ativas.'}
        </div>
      )}

      {/* Modal de Histórico */}
      {logModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setLogModal(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[80vh] mx-4 flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-semibold text-sm">{logModal.customerName || logModal.customerPhone}</h3>
                <p className="text-xs text-muted-foreground">{logModal.flow?.name} · {logModal.status}</p>
              </div>
              <button onClick={() => setLogModal(null)} className="p-1 rounded hover:bg-secondary"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {logs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Carregando...</p>
              ) : (
                [...logs].reverse().map((l, i) => (
                  <div key={i} className={`flex ${l.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${
                      l.direction === "outbound"
                        ? "bg-emerald-500 text-white rounded-br-sm"
                        : "bg-card border border-border rounded-bl-sm"
                    }`}>
                      <p className="whitespace-pre-wrap">{l.content?.slice(0, 500)}</p>
                      <p className="text-[10px] opacity-50 mt-1">{new Date(l.createdAt).toLocaleTimeString("pt-BR")}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
