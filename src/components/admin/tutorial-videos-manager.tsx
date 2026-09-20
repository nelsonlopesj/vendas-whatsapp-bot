"use client";

import { useState } from "react";
import { Trash2, ArrowUp, ArrowDown, Plus, Film } from "lucide-react";
import { uploadFileWithProgress } from "@/lib/upload";

interface TutorialVideo {
  id: string;
  title: string;
  fileUrl: string;
  order: number;
}

export function TutorialVideosManager({ initial }: { initial: TutorialVideo[] }) {
  const [videos, setVideos] = useState<TutorialVideo[]>(initial);
  const [newTitle, setNewTitle] = useState("");
  const [newFileUrl, setNewFileUrl] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(null);
    setUploadPercent(0);
    try {
      const data = await uploadFileWithProgress(file, (p) => setUploadPercent(p));
      setNewFileUrl(data.url);
      setNewFileName(data.originalName || file.name);
      setMsg({ ok: true, text: `✅ Vídeo enviado: ${data.originalName || file.name}` });
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || "Erro ao enviar o vídeo" });
    } finally {
      setUploadPercent(null);
    }
    e.target.value = "";
  };

  const addVideo = async () => {
    if (!newTitle.trim() || !newFileUrl) {
      setMsg({ ok: false, text: "Envie um vídeo e dê um título primeiro." });
      return;
    }
    setBusy(true);
    const res = await fetch("/api/tutorial-videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), fileUrl: newFileUrl }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.video) {
      setVideos([...videos, data.video]);
      setNewTitle("");
      setNewFileUrl("");
      setNewFileName("");
      setMsg({ ok: true, text: "✅ Vídeo adicionado ao tutorial!" });
    } else {
      setMsg({ ok: false, text: data.error || "Erro ao adicionar vídeo" });
    }
    setBusy(false);
  };

  const updateTitle = async (id: string, title: string) => {
    if (!title.trim()) return;
    const res = await fetch(`/api/tutorial-videos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });
    if (!res.ok) setMsg({ ok: false, text: "Erro ao salvar título" });
    setVideos(videos.map((v) => (v.id === id ? { ...v, title: title.trim() } : v)));
  };

  const move = async (id: string, dir: -1 | 1) => {
    const idx = videos.findIndex((v) => v.id === id);
    const other = videos[idx + dir];
    if (!other) return;
    const [a, b] = [videos[idx], other];
    const next = videos.map((v) =>
      v.id === a.id ? { ...v, order: b.order } : v.id === b.id ? { ...v, order: a.order } : v
    );
    setVideos([...next].sort((x, y) => x.order - y.order));
    await Promise.all([
      fetch(`/api/tutorial-videos/${a.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: b.order }),
      }),
      fetch(`/api/tutorial-videos/${b.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: a.order }),
      }),
    ]);
  };

  const remove = async (id: string) => {
    if (!confirm("Remover este vídeo do tutorial?")) return;
    await fetch(`/api/tutorial-videos/${id}`, { method: "DELETE" });
    setVideos(videos.filter((v) => v.id !== id));
    setMsg({ ok: true, text: "🗑️ Vídeo removido." });
  };

  return (
    <div className="space-y-6">
      {/* Adicionar novo */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" /> Adicionar vídeo
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="file"
              accept=".mp4,.mov,.avi,.m4v,.mkv,.webm,.3gp"
              disabled={uploadPercent !== null}
              onChange={handleUpload}
              className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-primary file:text-primary-foreground hover:file:opacity-80"
            />
            {uploadPercent !== null && (
              <div className="mt-2">
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${uploadPercent}%` }} />
                </div>
                <p className="text-xs text-blue-500 mt-1">Enviando... {uploadPercent}%</p>
              </div>
            )}
            {newFileName && (
              <p className="text-xs text-green-600 mt-1">📹 {newFileName}</p>
            )}
          </div>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Título exibido no guia (ex: Conectando seu WhatsApp)"
            className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm"
          />
          <button
            onClick={addVideo}
            disabled={busy || uploadPercent !== null}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Adicionar
          </button>
        </div>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.ok ? "bg-green-500/10 text-green-700" : "bg-destructive/10 text-destructive"}`}>
          {msg.text}
        </div>
      )}

      {/* Lista */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Film className="w-4 h-4 text-primary" /> Vídeos no tutorial ({videos.length})
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ordem de cima para baixo = ordem no guia. Alterações aparecem na hora para o cliente.
          </p>
        </div>
        {videos.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhum vídeo ainda — adicione o primeiro acima. Sem vídeos, a seção não aparece no guia.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {videos.map((v, i) => (
              <li key={v.id} className="flex items-center gap-3 p-3">
                <span className="text-xs text-muted-foreground w-6 text-center shrink-0">{i + 1}</span>
                <input
                  type="text"
                  defaultValue={v.title}
                  onBlur={(e) => {
                    if (e.target.value !== v.title) updateTitle(v.id, e.target.value);
                  }}
                  className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm"
                />
                <span className="text-xs text-muted-foreground hidden sm:block max-w-[180px] truncate">
                  {v.fileUrl.split("/").pop()}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => move(v.id, -1)} disabled={i === 0} className="p-1.5 rounded hover:bg-secondary text-muted-foreground disabled:opacity-30" title="Subir">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => move(v.id, 1)} disabled={i === videos.length - 1} className="p-1.5 rounded hover:bg-secondary text-muted-foreground disabled:opacity-30" title="Descer">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(v.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Remover">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
