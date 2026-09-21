"use client";

import { useState } from "react";
import { Pencil, Check, X, MessageCircle } from "lucide-react";

function formatBR(d: string): string {
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return d;
}

/** Coluna WhatsApp: número do cliente com link wa.me + edição inline (owner) */
export function PhoneCell({
  tenantId,
  value,
  tenantName,
}: {
  tenantId: string;
  value: string | null;
  tenantName: string;
}) {
  const [phone, setPhone] = useState(value || "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const digits = phone.replace(/\D/g, "");
  const waDigits = digits.length <= 11 ? `55${digits}` : digits;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/whatsapp`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappNumber: digits }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao salvar");
        return;
      }
      setPhone(data.whatsappNumber);
      setEditing(false);
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          autoFocus
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="5531999999999"
          className="w-32 px-2 py-1 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={save}
          disabled={saving}
          title="Salvar"
          className="p-1 rounded-md text-green-600 hover:bg-green-50 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setPhone(value || "");
            setError("");
          }}
          title="Cancelar"
          className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        {error && <span className="text-[10px] text-destructive">{error}</span>}
      </div>
    );
  }

  if (!phone) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-muted-foreground hover:text-primary underline decoration-dotted underline-offset-2"
        title={`Adicionar WhatsApp de ${tenantName}`}
      >
        Adicionar
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={`https://wa.me/${waDigits}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-primary hover:underline"
        title={`Abrir conversa com ${tenantName}`}
      >
        <MessageCircle className="w-3.5 h-3.5 flex-none" />
        {formatBR(digits)}
      </a>
      <button
        onClick={() => setEditing(true)}
        title="Editar número"
        className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-colors"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  );
}
