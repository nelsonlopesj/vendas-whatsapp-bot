import { ShoppingCart } from "lucide-react";

export default function SalesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vendas</h1>
        <p className="text-sm text-muted-foreground">
          Histórico de transações e status dos pagamentos
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
          <ShoppingCart className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Nenhuma venda ainda</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          As vendas aparecerão aqui assim que seus clientes comprarem via PIX
          nos fluxos automatizados.
        </p>
      </div>
    </div>
  );
}
