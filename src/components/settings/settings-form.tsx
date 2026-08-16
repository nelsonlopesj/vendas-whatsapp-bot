"use client";

import { useState, useEffect } from "react";
import {
  Save,
  Loader2,
  QrCode,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  Copy,
  Smartphone,
  ArrowRight,
} from "lucide-react";

interface SettingsFormProps {
  tenant: {
    mercadopagoToken: string | null;
  };
}

export function SettingsForm({ tenant }: SettingsFormProps) {
  const detectProvider = (v: string): "mercadopago" | "infinitepay" =>
    v &&
    !v.startsWith("APP_USR-") &&
    !v.startsWith("TEST-") &&
    v.trim() !== ""
      ? "infinitepay"
      : "mercadopago";

  const [mercadopagoToken, setMercadopagoToken] = useState(
    tenant.mercadopagoToken || ""
  );
  // Token efetivamente salvo no banco (para mostrar o gateway ATIVO)
  const [savedToken, setSavedToken] = useState(tenant.mercadopagoToken || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [provider, setProvider] = useState<"mercadopago" | "infinitepay">(
    detectProvider(tenant.mercadopagoToken || "")
  );

  const activeProvider = detectProvider(savedToken);

  // Troca o provedor selecionado; limpa o campo se o token atual não servir
  const switchProvider = (p: "mercadopago" | "infinitepay") => {
    setProvider(p);
    if (detectProvider(mercadopagoToken) !== p || mercadopagoToken.trim() === "") {
      setMercadopagoToken("");
      setMessage(
        `Agora cole ${
          p === "mercadopago"
            ? "o Access Token do Mercado Pago (APP_USR-...)"
            : "sua InfiniteTag (sem o $)"
        } no campo abaixo e clique em Salvar.`
      );
    } else {
      setMessage("");
    }
  };

  // WhatsApp state
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [waConnected, setWaConnected] = useState(false);
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrError, setQrError] = useState("");

  const fetchQrCode = async () => {
    setLoadingQr(true);
    setQrError("");
    try {
      const res = await fetch("/api/evolution/qrcode");
      const data = await res.json();

      if (data.connected) {
        setWaConnected(true);
        setQrCode(null);
        setLoadingQr(false);
      } else if (data.qrcode) {
        setQrCode(data.qrcode);
        setWaConnected(false);
        setLoadingQr(false);
      } else if (data.state === "starting") {
        setQrError("Iniciando serviço WhatsApp...");
        setLoadingQr(false);
        setTimeout(() => fetchQrCode(), 3000);
      } else if (data.error) {
        setQrError(data.error);
        setLoadingQr(false);
      } else {
        setLoadingQr(false);
      }
    } catch {
      setQrError("Erro ao conectar. Tente novamente.");
      setLoadingQr(false);
    }
  };

  useEffect(() => {
    fetchQrCode();
    const interval = setInterval(fetchQrCode, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveMP = async () => {
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/tenant/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mercadopagoToken }),
    });
    setSaving(false);
    if (res.ok) {
      setSavedToken(mercadopagoToken);
      const active =
        mercadopagoToken.trim() === ""
          ? "nenhum (pagamentos desativados)"
          : detectProvider(mercadopagoToken) === "mercadopago"
            ? "Mercado Pago"
            : "InfinitePay";
      setMessage(`✅ Salvo! Gateway ativo: ${active}.`);
    } else {
      setMessage("❌ Erro ao salvar.");
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
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
            Escaneie o QR Code com seu WhatsApp Business. Leva 30 segundos.
          </p>

          <div className="ml-8">
            {waConnected ? (
              <div className="p-6 rounded-xl bg-green-500/5 border-2 border-green-500/20 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="text-lg font-semibold text-green-700 mb-1">
                  WhatsApp Conectado!
                </p>
                <p className="text-sm text-muted-foreground">
                  Seu número está pronto para receber mensagens e processar
                  vendas.
                </p>
              </div>
            ) : qrCode ? (
              <div className="p-6 rounded-xl bg-primary/5 border-2 border-primary/20 text-center">
                <p className="text-sm font-semibold mb-4 flex items-center justify-center gap-2">
                  <QrCode className="w-5 h-5 text-primary" />
                  Escaneie com seu WhatsApp
                </p>
                <img
                  src={`data:image/png;base64,${qrCode}`}
                  alt="QR Code WhatsApp"
                  className="mx-auto w-56 h-56 rounded-xl border-2 border-border bg-white p-2"
                />
                <p className="text-xs text-muted-foreground mt-4 space-y-1">
                  <span className="block">
                    1. Abra o <strong>WhatsApp</strong> no celular
                  </span>
                  <span className="block">
                    2. Vá em <strong>Aparelhos Conectados</strong>
                  </span>
                  <span className="block">
                    3. Toque em <strong>Conectar um aparelho</strong>
                  </span>
                  <span className="block">
                    4. Aponte a câmera para o QR Code
                  </span>
                </p>
                <button
                  type="button"
                  onClick={fetchQrCode}
                  className="inline-flex items-center gap-1.5 mt-4 text-xs text-primary hover:underline"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${loadingQr ? "animate-spin" : ""}`}
                  />
                  Atualizar QR Code
                </button>
              </div>
            ) : qrError ? (
              <div className="p-6 rounded-xl bg-amber-500/5 border-2 border-amber-500/20 text-center">
                <XCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                <p className="text-sm text-amber-700 mb-3">{qrError}</p>
                <button
                  type="button"
                  onClick={fetchQrCode}
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
                >
                  <RefreshCw className="w-4 h-4" />
                  Tentar novamente
                </button>
              </div>
            ) : (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
                <p className="text-sm text-muted-foreground">
                  Conectando à Evolution API...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== PASSO 2: Gateway de pagamento ===== */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
              2
            </div>
            <h2 className="font-semibold text-lg">Configurar PIX</h2>
          </div>
          <p className="text-sm text-muted-foreground ml-8 mb-5">
            Escolha o gateway para receber via PIX. O ezflow detecta o
            provedor automaticamente pelo prefixo do token.
          </p>

          <div className="ml-8 space-y-4">
            {/* Seletor de provedor */}
            <div className="inline-flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => switchProvider("mercadopago")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  provider === "mercadopago"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                Mercado Pago
              </button>
              <button
                type="button"
                onClick={() => switchProvider("infinitepay")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  provider === "infinitepay"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                InfinitePay
              </button>
            </div>

            {/* Status do gateway ativo */}
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-xs">
                {savedToken.trim() === "" ? (
                  <span className="text-amber-600">
                    ⚠️ Nenhum gateway configurado — pagamentos desativados
                  </span>
                ) : (
                  <>
                    Gateway ativo agora:{" "}
                    <strong>
                      {activeProvider === "mercadopago"
                        ? "Mercado Pago"
                        : "InfinitePay"}
                    </strong>
                  </>
                )}
                {savedToken.trim() !== "" && provider !== activeProvider && (
                  <span className="block text-amber-600 mt-1">
                    Para trocar para{" "}
                    {provider === "mercadopago"
                      ? "Mercado Pago"
                      : "InfinitePay"}, cole o token dele no campo abaixo e
                    clique em Salvar.
                  </span>
                )}
              </p>
            </div>

            {provider === "mercadopago" ? (
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <p className="text-sm font-semibold mb-2">
                  📋 Como obter seu token:
                </p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>
                    Acesse{" "}
                    <a
                      href="https://www.mercadopago.com.br/settings/account/credentials"
                      target="_blank"
                      className="text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      Mercado Pago → Credenciais
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </li>
                  <li>Selecione &ldquo;Produção&rdquo;</li>
                  <li>
                    Copie o <strong>Access Token</strong> (APP_USR-...)
                  </li>
                  <li>Cole abaixo e salve</li>
                </ol>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <p className="text-sm font-semibold mb-2">
                  📋 Como configurar a InfinitePay (Checkout Integrado):
                </p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>
                    No app InfinitePay, ative o{" "}
                    <strong>Checkout Integrado</strong> (painel → Checkout
                    Integrado → Configurações → Habilitar)
                  </li>
                  <li>
                    Sua <strong>InfiniteTag</strong> é seu nome de usuário no
                    app (sem o símbolo $ do início) — ex:{" "}
                    <code className="bg-muted px-1 rounded">seu-nome-de-usuario</code>
                  </li>
                  <li>Cole abaixo e salve</li>
                  <li>
                    A notificação de pagamento é automática: o ezflow envia o
                    webhook junto com cada link — nada para configurar no painel
                  </li>
                </ol>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1">
                {provider === "mercadopago"
                  ? "Access Token (Mercado Pago)"
                  : "InfiniteTag (InfinitePay)"}
              </label>
              <div className="flex gap-2">
                <input
                  type={provider === "mercadopago" ? "password" : "text"}
                  value={mercadopagoToken}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMercadopagoToken(v);
                    if (v.startsWith("APP_USR-") || v.startsWith("TEST-")) {
                      setProvider("mercadopago");
                    } else if (v.trim() !== "") {
                      setProvider("infinitepay");
                    }
                  }}
                  className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  placeholder={
                    provider === "mercadopago"
                      ? "APP_USR-..."
                      : "sua-infinite-tag"
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {mercadopagoToken ? (
                  provider === "infinitepay" ? (
                    "✅ Gateway detectado: InfinitePay (InfiniteTag)"
                  ) : (
                    "✅ Gateway detectado: Mercado Pago"
                  )
                ) : (
                  "Tokens APP_USR-/TEST- = Mercado Pago; qualquer outro valor = InfinitePay"
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={handleSaveMP}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar token
            </button>
          </div>
        </div>
      </div>

      {/* ===== PASSO 3 ===== */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-muted-foreground/30 text-foreground text-xs font-bold flex items-center justify-center">
              3
            </div>
            <h2 className="font-semibold text-lg">Próximos passos</h2>
          </div>
          <div className="ml-8 mt-3 space-y-2">
            {[
              ["Suba seus produtos", "Adicione ebooks, PDFs e audiobooks na seção Produtos"],
              ["Crie fluxos de venda", "Monte automações: saudação → preço → PIX → entrega"],
              ["Conecte ao Meta Ads", "Crie anúncios que levam ao WhatsApp com a keyword do fluxo"],
            ].map(([title, desc]) => (
              <div key={title} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <ArrowRight className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-sm ${message.startsWith("✅") ? "bg-green-500/10 text-green-700" : "bg-destructive/10 text-destructive"}`}>
          {message}
        </div>
      )}
    </div>
  );
}
