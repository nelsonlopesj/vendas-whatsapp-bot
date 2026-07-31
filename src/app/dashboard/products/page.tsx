"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Package, Trash2, Pencil, DollarSign, Hash, X, Save } from "lucide-react";

interface Product {
  id: string;
  name: string;
  keyword: string;
  price: number;
  description: string | null;
  fileUrl: string;
  active: boolean;
  _count: { sales: number };
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({ name: "", keyword: "", price: "", fileUrl: "", description: "" });
  const [saving, setSaving] = useState(false);

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

  const openEdit = (p: Product) => {
    setEditing(p);
    setEditForm({
      name: p.name,
      keyword: p.keyword,
      price: String(p.price),
      fileUrl: p.fileUrl || "",
      description: p.description || "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    await fetch(`/api/products/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name,
        keyword: editForm.keyword,
        price: parseFloat(editForm.price),
        fileUrl: editForm.fileUrl,
        description: editForm.description,
      }),
    });
    setSaving(false);
    setEditing(null);
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
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(p)} className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => deleteProduct(p.id, p.name)} className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors text-muted-foreground">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditing(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Editar Produto</h3>
              <button onClick={() => setEditing(null)} className="p-1 rounded-lg hover:bg-secondary"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Nome</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Keyword</label>
                <input type="text" value={editForm.keyword} onChange={e => setEditForm({...editForm, keyword: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Preço (R$)</label>
                <input type="number" step="0.01" value={editForm.price} onChange={e => setEditForm({...editForm, price: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">URL do Arquivo</label>
                <input type="text" value={editForm.fileUrl} onChange={e => setEditForm({...editForm, fileUrl: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground" />
              </div>
              <button onClick={saveEdit} disabled={saving} className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
                <Save className="w-4 h-4" /> {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
