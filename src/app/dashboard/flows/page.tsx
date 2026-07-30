import Link from "next/link";
import { Plus, ArrowLeftRight, GripVertical, Power } from "lucide-react";

export default function FlowsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fluxos de Venda</h1>
          <p className="text-sm text-muted-foreground">
            Crie e gerencie suas automações de venda no WhatsApp
          </p>
        </div>
        <Link
          href="/dashboard/flows/new"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Novo Fluxo
        </Link>
      </div>

      {/* Empty state */}
      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <ArrowLeftRight className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Nenhum fluxo ainda</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
          Crie seu primeiro fluxo de venda automatizada. Defina a keyword que
          dispara o fluxo, monte a sequência de mensagens e conecte ao PIX.
        </p>
        <Link
          href="/dashboard/flows/new"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Criar meu primeiro fluxo
        </Link>
      </div>
    </div>
  );
}
