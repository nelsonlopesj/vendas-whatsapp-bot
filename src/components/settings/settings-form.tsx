"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Save,
  Loader2,
  QrCode,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  Copy,
  AlertCircle,
  ArrowRight,
  Smartphone,
} from "lucide-react";

interface SettingsFormProps {
  tenant: {
    evolutionUrl: string | null;
    evolutionApikey: string | null;
    mercadopagoToken: string | null;
  };
}

export function SettingsForm({ tenant }: SettingsFormProps) {
  const [evolutionUrl, setEvolutionUrl] = useState(
    tenant.evolutionUrl || "http://evolution:8080"
  );
  const [evolutionApikey, setEvolutionApikey] = useState(
    tenant.evolutionApikey || ""
  );
  const [mercadopagoToken, setMercadopagoToken] = useState(
    tenant.mercadopagoToken || ""
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // WhatsApp connection state
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [waConnected, setWaConnected] = useState(false);
  const [waState, setWaState] = useState<string>("");
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrError, setQrError] = useState("");

  const fetchQrCode = useCallback(async () => {
    setLoadingQr(true);
    setQrError("");
    try {
      const res = await fetch("/api/evolution/qrcode");
      const data = await res.json();

      if (data.connected) {
        setWaConnected(true);
        setWaState("Conectado!");
        setQrCode(null);
      } else if (data.qrcode) {
        setQrCode(data.qrcode);
        setWaConnected(false);
        setWaState("Aguardando scan do QR Code");
      } else if (data.error) {
        setQrError(data.error);
      }
    } catch {
      setQrError("Erro ao buscar QR Code. Evolution API está rodando?");
    }
    setLoadingQr(false);
  }, []);

  // Auto-refresh QR code a cada 30s
  useEffect(() => {
    if (evolutionUrl && evolutionApikey) {
      fetchQrCode();
      const interval = setInterval(fetchQrCode, 30000);
      return () => clearInterval(interval);
    }
  }, [evolutionUrl, evolutionApikey, fetchQrCode]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const res = await fetch("/api/tenant/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evolutionUrl,
        evolutionApikey,
        mercadopagoToken,
        whatsappNumber: "", // mantendo compatibilidade
      }),
    });

    setSaving(false);
    if (res.ok) {
      setMessage("✅ Configurações salvas!");
    } else {
      setMessage("❌ Erro ao salvar.");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copiado!");
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
      {/* ===== PASSO 1: WhatsApp ===== */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
              1
            </div>
            <h2 className="font-semibold text-lg">Conectar WhatsApp</h2>
          </div>
          <p className="text-sm text-muted-foreground ml-8 mb-5">
            Seu WhatsApp Business conectado via QR Code. Você só precisa fazer
            isso uma vez.
          </p>

          {/* Evolution API config */}
          <div className="ml-8 space-y-4 bg-muted/30 rounded-xl p-4 mb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Configuração da Evolution API
            </p>
            <div>
              <label className="block text-xs font-medium mb-1">
                URL da Evolution API
              </label>
              <input
                type="text"
                value={evolutionUrl}
                onChange={(e) => setEvolutionUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                placeholder="http://evolution:8080"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Padrão: http://evolution:8080 (já funciona com Docker Compose)
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                API Key
              </label>
              <input
                type="text"
                value={evolutionApikey}
                onChange={(e) => setEvolutionApikey(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                placeholder="Sua chave API da Evolution"
              />
            </div>
          </div>

          {/* QR Code */}
          <div className="ml-8">
            {!evolutionUrl || !evolutionApikey ? (
              <div className="p-4 rounded-xl bg-muted/30 text-center">
                <Smartphone className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Preencha a URL e API Key acima, depois salve para gerar o QR
                  Code
                </p>
              </div>
            ) : waConnected ? (
              <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span className="font-medium text-green-700">
                    WhatsApp Conectado!
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Seu WhatsApp Business está pronto para receber mensagens.
                </p>
              </div>
            ) : qrCode ? (
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-center">
                <p className="text-sm font-medium mb-3 flex items-center justify-center gap-2">
                  <QrCode className="w-4 h-4 text-primary" />
                  Escaneie o QR Code com seu WhatsApp
                </p>
                <img
                  src={`data:image/png;base64,${qrCode}`}
                  alt="QR Code WhatsApp"
                  className="mx-auto w-48 h-48 rounded-xl border border-border bg-white p-2"
                />
                <div className="flex items-center justify-center gap-2 mt-3">
                  <RefreshCw
                    className={`w-4 h-4 text-muted-foreground ${
                      loadingQr ? "animate-spin" : ""
                    }`}
                  />
                  <button
                    type="button"
                    onClick={fetchQrCode}
                    className="text-xs text-primary hover:underline"
                  >
                    Atualizar QR Code
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  1. Abra o WhatsApp no seu celular
                  <br />
                  2. Vá em Aparelhos Conectados → Conectar um aparelho
                  <br />
                  3. Escaneie o QR Code acima
                </p>
              </div>
            ) : qrError ? (
              <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-600">{qrError}</span>
                </div>
                <button
                  type="button"
                  onClick={fetchQrCode}
                  className="text-xs text-primary hover:underline mt-1"
                >
                  Tentar novamente
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-muted/30 text-center">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Buscando QR Code...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== PASSO 2: Mercado Pago ===== */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
              2
            </div>
            <h2 className="font-semibold text-lg">Configurar PIX</h2>
          </div>
          <p className="text-sm text-muted-foreground ml-8 mb-5">
            Conecte sua conta Mercado Pago para receber pagamentos via PIX.
          </p>

          <div className="ml-8 space-y-4">
            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                📋 Como obter seu token:
              </p>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>
                  Acesse{" "}
                  <a
                    href="https://www.mercadopago.com.br/settings/account/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    Mercado Pago → Credenciais
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
                <li>Clique em &ldquo;Produção&rdquo;</li>
                <li>
                  Copie o <strong>Access Token</strong> (começa com APP_USR-)
                </li>
                <li>Cole no campo abaixo</li>
              </ol>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Access Token do Mercado Pago
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={mercadopagoToken}
                  onChange={(e) => setMercadopagoToken(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  placeholder="APP_USR-xxxxxxxxxxxxx-xxxxxxxxxxxxx-xxxxxxxxxxxxx-xxxxxxxxxxxxx"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(mercadopagoToken)}
                  className="p-2 rounded-lg border border-input hover:bg-secondary transition-colors"
                  title="Copiar"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            {mercadopagoToken && (
              <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-700">
                    Token configurado! Os PIX serão gerados automaticamente nos
                    seus fluxos.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== PASSO 3: Próximos passos ===== */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-muted-foreground/30 text-foreground text-xs font-bold flex items-center justify-center">
              3
            </div>
            <h2 className="font-semibold text-lg">Próximos passos</h2>
          </div>
          <p className="text-sm text-muted-foreground ml-8">
            Depois de salvar as configurações acima:
          </p>
          <div className="ml-8 mt-3 space-y-2">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
              <ArrowRight className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Suba seus produtos</p>
                <p className="text-xs text-muted-foreground">
                  Adicione ebooks, PDFs, audiobooks na seção Produtos
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
              <ArrowRight className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Crie seus fluxos de venda</p>
                <p className="text-xs text-muted-foreground">
                  Monte a automação: saudação → preço → PIX → entrega
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
              <ArrowRight className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Conecte ao Meta Ads</p>
                <p className="text-xs text-muted-foreground">
                  Crie anúncios que levam ao WhatsApp com a keyword do seu fluxo
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save button */}
      {message && (
        <div
          className={`p-4 rounded-xl text-sm ${
            message.startsWith("✅")
              ? "bg-green-500/10 text-green-700"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3.5 rounded-xl text-base font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-primary/20"
      >
        {saving ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Save className="w-5 h-5" />
        )}
        Salvar configurações
      </button>
    </form>
  );
}
