import Link from "next/link";
import { ArrowRight, Zap, Shield, BarChart3, Check, Clock, CreditCard } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 lg:px-6 h-16 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">ez</div>
          <span className="font-semibold text-xl tracking-tight">ezflow</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Entrar</Link>
          <Link href="/register" className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity">
            Teste grátis <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 lg:py-24 px-4 max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-green-500/10 text-green-600 text-sm font-medium px-4 py-1.5 rounded-full mb-8">
          🎉 7 dias grátis — sem cartão de crédito
        </div>
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-6">
          Venda no automático pelo{" "}
          <span className="text-primary">WhatsApp</span>
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
          Conecte seu WhatsApp Business, suba seus produtos digitais, monte fluxos de venda e receba via PIX — <strong>tudo automatizado.</strong> Sem código, sem mensalidade cara.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/register" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-medium px-8 py-3.5 rounded-xl hover:opacity-90 transition-all text-lg shadow-lg shadow-primary/25">
            Começar grátis <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-sm text-muted-foreground">7 dias grátis • Cancele quando quiser</p>
        </div>
      </section>

      {/* Como funciona */}
      <section className="py-16 px-4 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-12">Em 3 passos você está vendendo</h2>
        <div className="grid sm:grid-cols-3 gap-8">
          {[
            { step: "1", title: "Conecte o WhatsApp", desc: "Leia o QR Code com seu celular. Pronto, seu número vira um robô de vendas." },
            { step: "2", title: "Suba seu produto", desc: "PDF, ebook, audiobook... defina preço e suba o arquivo em segundos." },
            { step: "3", title: "Ative o fluxo", desc: "Escolha um template ou monte o seu. O bot vende sozinho — 24h por dia." },
          ].map((item, i) => (
            <div key={i} className="text-center p-6 rounded-xl border border-border bg-card">
              <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center mx-auto mb-4 text-lg">{item.step}</div>
              <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 px-4 max-w-2xl mx-auto text-center">
        <h2 className="text-2xl font-bold mb-2">Simples e acessível</h2>
        <p className="text-muted-foreground mb-10">Comece grátis. Escale quando quiser.</p>
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="p-8 rounded-2xl border-2 border-border bg-card text-left">
            <div className="text-sm font-medium text-primary mb-2">TRIAL</div>
            <div className="text-4xl font-bold mb-2">Grátis</div>
            <div className="text-sm text-muted-foreground mb-6">7 dias</div>
            <ul className="space-y-3 text-sm">
              {["1 número WhatsApp", "1 fluxo de venda", "1 produto digital", "PIX via Mercado Pago"].map((f, i) => (
                <li key={i} className="flex items-start gap-2"><Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />{f}</li>
              ))}
            </ul>
            <Link href="/register" className="block text-center mt-8 w-full py-3 rounded-xl border-2 border-primary text-primary font-medium hover:bg-primary/5 transition-colors">Começar grátis</Link>
          </div>
          <div className="p-8 rounded-2xl border-2 border-primary bg-primary/5 text-left relative">
            <div className="absolute -top-3 right-4 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">PROMO</div>
            <div className="text-sm font-medium text-primary mb-2">PRO</div>
            <div className="text-4xl font-bold mb-1">R$59<span className="text-lg font-normal text-muted-foreground">,90</span></div>
            <div className="text-sm text-muted-foreground mb-6">/mês • 30 primeiros</div>
            <ul className="space-y-3 text-sm">
              {["Tudo do Trial", "Fluxos ilimitados", "Produtos ilimitados", "InfinitePay incluso", "Prioridade no suporte"].map((f, i) => (
                <li key={i} className="flex items-start gap-2"><Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />{f}</li>
              ))}
            </ul>
            <Link href="/register" className="block text-center mt-8 w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">Testar 7 dias</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 text-center text-sm text-muted-foreground border-t border-border">
        © 2026 ezflow.com.br — Vendas automatizadas no WhatsApp.
      </footer>
    </div>
  );
}
