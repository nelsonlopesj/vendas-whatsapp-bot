import Link from "next/link";
import { ArrowRight, Zap, Shield, BarChart3 } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-6 h-16 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
            ez
          </div>
          <span className="font-semibold text-xl tracking-tight">ezflow</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Entrar
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            Começar agora <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="py-24 px-6 max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-sm font-medium px-4 py-1.5 rounded-full mb-8">
          <Zap className="w-3.5 h-3.5" />
          Vendas automatizadas no WhatsApp
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-6">
          Venda no automático pelo{" "}
          <span className="text-primary">WhatsApp</span>
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
          Conecte seu WhatsApp Business, suba seus produtos digitais, monte
          fluxos de venda e receba via PIX — tudo automatizado. Sem mensalidade
          cara, sem código.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-medium px-8 py-3.5 rounded-xl hover:opacity-90 transition-all text-lg shadow-lg shadow-primary/25"
          >
            Criar minha conta grátis
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Já tenho conta
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6 max-w-5xl mx-auto">
        <div className="grid sm:grid-cols-3 gap-8">
          {[
            {
              icon: Zap,
              title: "Fluxos inteligentes",
              desc: "Monte fluxos de venda com caixinhas: saudação, preço, PIX e entrega automática.",
            },
            {
              icon: Shield,
              title: "PIX automático",
              desc: "Integração nativa com Mercado Pago. Gere PIX, acompanhe pagamentos, entregue na hora.",
            },
            {
              icon: BarChart3,
              title: "Dashboard de vendas",
              desc: "Acompanhe suas vendas em tempo real. Saiba o que vendeu, quando e quanto.",
            },
          ].map((feature, i) => (
            <div
              key={i}
              className="p-6 rounded-xl border border-border bg-card hover:shadow-lg transition-shadow"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <feature.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 text-center text-sm text-muted-foreground border-t border-border">
        © {new Date().getFullYear()} ezflow.com.br — Todos os direitos
        reservados.
      </footer>
    </div>
  );
}
