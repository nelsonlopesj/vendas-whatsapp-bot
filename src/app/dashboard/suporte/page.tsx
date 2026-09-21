import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { BookOpen, MessageCircle, Lock, ExternalLink } from "lucide-react";
import { StripeCheckoutButton } from "@/components/suporte/checkout-button";

export default async function SuportePage() {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) return <div>Erro ao carregar.</div>;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const status = tenant?.subscriptionStatus || "trial";
  // "Pro" = assinatura vigente (ativa ou em regularização)
  const isPro = status === "active" || status === "past_due";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Suporte</h1>
        <p className="text-sm text-muted-foreground">
          Tudo o que você precisa para tirar o máximo da EZFlow.
        </p>
      </div>

      {/* Guia + vídeos — sempre disponível */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold">Guia de primeiros passos</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Passo a passo completo — do cadastro ao seu robô vendendo no
              WhatsApp — com vídeos curtos de cada configuração. Sem
              complicação, escrito para quem está começando.
            </p>
            <Link
              href="/tutorial.html"
              target="_blank"
              className="inline-flex items-center gap-2 mt-3 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Abrir o guia <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Atendimento direto — só assinantes Pro */}
      {isPro ? (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <MessageCircle className="w-5 h-5 text-green-500" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold">Atendimento direto</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Você é assinante Pro e tem atendimento direto com a gente no
                WhatsApp. Chame para dúvidas, fluxos sob medida ou qualquer
                configuração especial.
              </p>
              <a
                href="https://wa.me/5511952482267?text=Ol%C3%A1!%20Preciso%20de%20suporte%20com%20a%20EZFlow."
                target="_blank"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition-colors"
              >
                <MessageCircle className="w-4 h-4" /> Chamar no WhatsApp (11) 95248-2267
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-6 opacity-90">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Lock className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold">Atendimento direto por WhatsApp</h2>
              <p className="text-sm text-muted-foreground mt-1">
                O atendimento direto com a nossa equipe pelo WhatsApp é
                exclusivo do plano <b>Pro</b>. No plano Pro você também tem
                prioridade no suporte e acompanhamento personalizado.
              </p>
              <StripeCheckoutButton />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
