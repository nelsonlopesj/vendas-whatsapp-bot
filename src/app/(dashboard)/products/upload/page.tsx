"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Loader2,
  ArrowLeft,
  FileText,
  DollarSign,
  Tag,
  File,
} from "lucide-react";
import Link from "next/link";

export default function UploadProductPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    keyword: "",
    price: "",
    description: "",
    fileUrl: "",
    fileType: "",
    fileSize: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setForm({
        ...form,
        fileType: f.type,
        fileSize: String(f.size),
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.name || !form.keyword || !form.price) {
      setError("Nome, keyword e preço são obrigatórios.");
      return;
    }

    setLoading(true);

    let fileUrl = form.fileUrl;

    // Upload file if selected
    if (file) {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        setError("Erro ao enviar arquivo.");
        setLoading(false);
        setUploading(false);
        return;
      }

      const uploadData = await uploadRes.json();
      fileUrl = uploadData.url;
      setUploading(false);
    }

    // Create product
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        keyword: form.keyword,
        price: parseFloat(form.price),
        description: form.description || null,
        fileUrl: fileUrl || form.fileUrl,
        fileType: form.fileType || null,
        fileSize: form.fileSize ? parseInt(form.fileSize) : null,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Erro ao criar produto.");
      return;
    }

    router.push("/dashboard/products");
    router.refresh();
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Link
        href="/dashboard/products"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Voltar para produtos
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Subir Produto</h1>
        <p className="text-sm text-muted-foreground">
          Adicione um produto digital para vender nos seus fluxos
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-5">
        {/* Nome */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-1.5">
            <Tag className="w-3.5 h-3.5 text-muted-foreground" />
            Nome do produto
          </label>
          <input
            name="name"
            type="text"
            value={form.name}
            onChange={handleChange}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Ex: Ebook Bobbie Goods Religioso"
          />
        </div>

        {/* Keyword */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-1.5">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            Keyword (palavra que dispara o fluxo)
          </label>
          <input
            name="keyword"
            type="text"
            value={form.keyword}
            onChange={handleChange}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Ex: colorir"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Quando o cliente enviar esta palavra no WhatsApp, o fluxo será
            ativado
          </p>
        </div>

        {/* Preço */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-1.5">
            <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
            Preço (R$)
          </label>
          <input
            name="price"
            type="number"
            step="0.01"
            min="0.01"
            value={form.price}
            onChange={handleChange}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="9.90"
          />
        </div>

        {/* Descrição */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Descrição (opcional)
          </label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            rows={2}
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder="Descrição curta do produto..."
          />
        </div>

        {/* Arquivo upload */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-1.5">
            <File className="w-3.5 h-3.5 text-muted-foreground" />
            Arquivo do produto
          </label>
          <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors">
            <input
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.mp3,.m4a,.epub,.zip,.doc,.docx"
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <div className="p-3 rounded-xl bg-primary/10">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              {file ? (
                <div>
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium">
                    Clique para selecionar o arquivo
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF, MP3, EPUB, ZIP (até 50MB)
                  </p>
                </div>
              )}
            </label>
          </div>
        </div>

        {/* ou URL externa */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">
              ou use um link externo
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            URL do arquivo (Google Drive, Dropbox, etc.)
          </label>
          <input
            name="fileUrl"
            type="url"
            value={form.fileUrl}
            onChange={handleChange}
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="https://drive.google.com/..."
            disabled={!!file}
          />
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-medium px-4 py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {uploading ? "Enviando arquivo..." : "Criar produto"}
        </button>
      </form>
    </div>
  );
}
