import Link from "next/link";
import { Plus, Package } from "lucide-react";

export default function ProductsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie seus produtos digitais (ebooks, PDFs, audiobooks)
          </p>
        </div>
        <Link
          href="/dashboard/products/upload"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Subir Produto
        </Link>
      </div>

      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
          <Package className="w-8 h-8 text-blue-500" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Nenhum produto ainda</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
          Suba seu primeiro produto digital — ebook, PDF, audiobook — e
          vincule-o aos seus fluxos de venda.
        </p>
        <Link
          href="/dashboard/products/upload"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Subir produto
        </Link>
      </div>
    </div>
  );
}
