"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Package, Trash2, DollarSign, Hash } from "lucide-react";

interface Product {
  id: string;
  name: string;
  keyword: string;
  price: number;
  fileUrl: string;
  _count: { sales: number };
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    const res = await fetch("/api/products");
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const deleteProduct = async (id: string, name: string) => {
    if (!confirm(`Deletar "${name}"?`)) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    fetchProducts();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            {products.length} produto{products.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/dashboard/products/upload" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90">
          <Plus className="w-4 h-4" /> Subir Produto
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Nenhum produto ainda</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Suba seu primeiro produto digital e vincule-o aos seus fluxos.
          </p>
          <Link href="/dashboard/products/upload" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl text-sm font-medium hover:opacity-90">
            <Plus className="w-4 h-4" /> Subir produto
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {products.map((p) => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-xl bg-blue-500/10">
                  <Package className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-0.5"><Hash className="w-3 h-3" /> {p.keyword}</span>
                    <span className="flex items-center gap-0.5"><DollarSign className="w-3 h-3" /> R$ {p.price.toFixed(2)}</span>
                    <span>{p._count?.sales || 0} vendas</span>
                  </div>
                </div>
              </div>
              <button onClick={() => deleteProduct(p.id, p.name)} className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors text-muted-foreground">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
