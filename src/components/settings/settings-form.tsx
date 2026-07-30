"use client";

import { useState } from "react";
import { MessageCircle, CreditCard, Save, Loader2, QrCode } from "lucide-react";

interface SettingsFormProps {
  tenant: {
    id: string;
    name: string;
    slug: string;
    whatsappNumber: string | null;
    evolutionUrl: string | null;
    evolutionApikey: string | null;
    mercadopagoToken: string | null;
  };
}

export function SettingsForm({ tenant }: SettingsFormProps) {
  const [form, setForm] = useState({
    whatsappNumber: tenant.whatsappNumber || "",
    evolutionUrl: tenant.evolutionUrl || "",
    evolutionApikey: tenant.evolutionApikey || "",
    mercadopagoToken: tenant.mercadopagoToken || "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const res = await fetch("/api/tenant/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setSaving(false);

    if (res.ok) {
      setMessage("Configurações salvas com sucesso!");
    } else {
      setMessage("Erro ao salvar. Tente novamente.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* WhatsApp / Evolution API */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-green-500/10">
            <MessageCircle className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <h2 className="font-semibold">WhatsApp — Evolution API</h2>
            <p className="text-xs text-muted-foreground">
              Conecte seu WhatsApp Business via Evolution API
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Número do WhatsApp
            </label>
            <input
              type="text"
              value={form.whatsappNumber}
              onChange={(e) =>
                setForm({ ...form, whatsappNumber: e.target.value })
              }
              className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="5531999999999"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              URL da Evolution API
            </label>
            <input
              type="url"
              value={form.evolutionUrl}
              onChange={(e) =>
                setForm({ ...form, evolutionUrl: e.target.value })
              }
              className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="http://localhost:8080"
            />
            <p className="text-xs text-muted-foreground mt-1">
              URL onde a Evolution API está rodando (ex:
              http://evolution:8080)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              API Key da Evolution
            </label>
            <input
              type="password"
              value={form.evolutionApikey}
              onChange={(e) =>
                setForm({ ...form, evolutionApikey: e.target.value })
              }
              className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="sua-api-key-aqui"
            />
          </div>

          {form.evolutionUrl && form.evolutionApikey && (
            <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
              <div className="flex items-center gap-2 mb-2">
                <QrCode className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-green-700">
                  Escaneie o QR Code para conectar
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Após salvar, acesse a Evolution API para gerar o QR Code e
                conectar seu WhatsApp Business.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mercado Pago */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <CreditCard className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h2 className="font-semibold">Mercado Pago — PIX</h2>
            <p className="text-xs text-muted-foreground">
              Configure o token para gerar cobranças PIX
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Access Token do Mercado Pago
          </label>
          <input
            type="password"
            value={form.mercadopagoToken}
            onChange={(e) =>
              setForm({ ...form, mercadopagoToken: e.target.value })
            }
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            placeholder="APP_USR-..."
          />
          <p className="text-xs text-muted-foreground mt-1">
            Gere seu token em{" "}
            <a
              href="https://www.mercadopago.com.br/settings/account/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Mercado Pago → Credenciais
            </a>
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg text-sm ${
            message.includes("Erro")
              ? "bg-destructive/10 text-destructive"
              : "bg-green-500/10 text-green-700"
          }`}
        >
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        Salvar configurações
      </button>
    </form>
  );
}
