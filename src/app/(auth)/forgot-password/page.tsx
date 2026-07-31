"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Mail, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [resetUrl, setResetUrl] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setLoading(false);
    setDone(true);
    if (data.resetUrl) setResetUrl(data.resetUrl);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar
        </Link>
        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          <h1 className="text-2xl font-bold mb-2">Recuperar senha</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Digite seu email para receber o link de recuperação.
          </p>

          {done ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                <CheckCircle2 className="w-5 h-5 text-green-500 mb-2" />
                <p className="text-sm text-green-700">Link gerado!</p>
              </div>
              {resetUrl && (
                <div className="p-4 rounded-xl bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground mb-2">Link de recuperação (MVP):</p>
                  <a href={resetUrl} className="text-xs text-primary break-all hover:underline">{resetUrl}</a>
                </div>
              )}
              <Link href="/login" className="block text-center text-sm text-primary hover:underline">Voltar ao login</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Email</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="seu@email.com"
                />
              </div>
              {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
              <button type="submit" disabled={loading} className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-medium px-4 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Enviar link
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
