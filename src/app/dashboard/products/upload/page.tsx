"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, ArrowLeft, DollarSign, File, X, Plus } from "lucide-react";
import Link from "next/link";

export default function UploadProductPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileUrls, setFileUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    setFiles([...files, ...newFiles]);
  };

  const removeFile = (idx: number) => {
    setFiles(files.filter((_, i) => i !== idx));
    setFileUrls(fileUrls.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name || !price) { setError("Nome e preço são obrigatórios."); return; }
    if (files.length === 0) { setError("Selecione pelo menos 1 arquivo."); return; }

    setLoading(true);
    setUploading(true);

    // Upload de todos os arquivos
    const urls: string[] = [];
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) { const errData = await res.json().catch(() => ({})); setError(`Erro ao enviar ${file.name}: ${errData.error || res.status}`); setLoading(false); setUploading(false); return; }
      const data = await res.json();
      urls.push(data.url);
    }
    setUploading(false);
    setFileUrls(urls);

    // Criar produto: todos os arquivos em extraFiles (incluindo o primeiro)
    const extraFiles = urls.map((url, i) => ({
      url,
      name: files[i]?.name || `Arquivo ${i + 1}`,
    }));

    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        keyword: name.toLowerCase().replace(/\s+/g, "-"),
        price: parseFloat(price),
        description: description || null,
        fileUrl: urls[0] || "",
        extraFiles,
        fileType: files[0]?.type || null,
        fileSize: files[0]?.size || null,
      }),
    });

    setLoading(false);
    if (!res.ok) { const d = await res.json(); setError(d.error || "Erro ao criar"); return; }
    router.push("/dashboard/products");
    router.refresh();
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Link href="/dashboard/products" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-3.5 h-3.5" /> Voltar</Link>

      <div>
        <h1 className="text-2xl font-bold">Subir Produto</h1>
        <p className="text-sm text-muted-foreground">Adicione um ou mais arquivos para vender</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5">Nome do produto</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm" placeholder="Ex: Guia da Noiva" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Preço (R$)</label>
          <input type="number" step="0.01" min="0.01" value={price} onChange={e => setPrice(e.target.value)} required className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm" placeholder="19.90" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Descrição (opcional)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm resize-none" placeholder="Breve descrição..." />
        </div>

        {/* Arquivos */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Arquivos do produto</label>
          <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors">
            <input type="file" onChange={addFiles} accept=".pdf,.mp3,.m4a,.epub,.zip,.doc,.docx,.jpg,.png" multiple className="hidden" id="multi-upload" />
            <label htmlFor="multi-upload" className="cursor-pointer flex flex-col items-center gap-2">
              <div className="p-3 rounded-xl bg-primary/10"><Upload className="w-6 h-6 text-primary" /></div>
              <p className="text-sm font-medium">Clique para selecionar os arquivos</p>
              <p className="text-xs text-muted-foreground">PDF, MP3, EPUB, ZIP — múltiplos arquivos</p>
            </label>
          </div>

          {/* Lista de arquivos */}
          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{files.length} arquivo{files.length !== 1 ? "s" : ""} selecionado{files.length !== 1 ? "s" : ""} (serão entregues nesta ordem):</p>
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-sm">
                  <span className="w-5 h-5 rounded bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button type="button" onClick={() => removeFile(i)} className="p-0.5 hover:bg-red-100 rounded"><X className="w-3.5 h-3.5 text-red-500" /></button>
                </div>
              ))}
              <button type="button" onClick={() => document.getElementById("multi-upload")?.click()} className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="w-3 h-3" /> Adicionar mais arquivos</button>
            </div>
          )}
        </div>

        {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

        <button type="submit" disabled={loading} className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-medium px-4 py-3 rounded-xl hover:opacity-90 disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? "Enviando arquivos..." : "Criar produto"}
        </button>
      </form>
    </div>
  );
}
