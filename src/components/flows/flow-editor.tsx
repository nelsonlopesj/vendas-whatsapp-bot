"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  MessageSquare,
  Clock,
  QrCode,
  Package,
  GitBranch,
  RotateCcw,
  Save,
  Play,
  ArrowRight,
  Trash2,
  GripVertical,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Download,
  Upload,
} from "lucide-react";
import { clsx } from "clsx";

// Tipos de passo disponíveis
const STEP_TYPES = [
  {
    type: "SEND_MESSAGE",
    label: "Enviar Mensagem",
    icon: MessageSquare,
    color: "bg-blue-500",
    colorLight: "bg-blue-500/10",
    colorText: "text-blue-500",
    description: "Envia uma mensagem de texto para o cliente",
  },
  {
    type: "WAIT_RESPONSE",
    label: "Esperar Resposta",
    icon: Clock,
    color: "bg-orange-500",
    colorLight: "bg-orange-500/10",
    colorText: "text-orange-500",
    description: "Aguarda a resposta do cliente (Sim/Não/texto)",
  },
  {
    type: "GENERATE_PIX",
    label: "Gerar PIX",
    icon: QrCode,
    color: "bg-green-500",
    colorLight: "bg-green-500/10",
    colorText: "text-green-500",
    description: "Gera cobrança PIX via Mercado Pago",
  },
  {
    type: "DELIVER_PRODUCT",
    label: "Entregar Produto",
    icon: Package,
    color: "bg-purple-500",
    colorLight: "bg-purple-500/10",
    colorText: "text-purple-500",
    description: "Envia o arquivo do produto ao cliente",
  },
  {
    type: "CONDITION",
    label: "Condição",
    icon: GitBranch,
    color: "bg-yellow-500",
    colorLight: "bg-yellow-500/10",
    colorText: "text-yellow-500",
    description: "Bifurca o fluxo baseado na resposta",
  },
  {
    type: "LOOP",
    label: "Loop",
    icon: RotateCcw,
    color: "bg-red-500",
    colorLight: "bg-red-500/10",
    colorText: "text-red-500",
    description: "Repete passos anteriores (com limite)",
  },
  {
    type: "SEND_AUDIO",
    label: "Enviar Áudio",
    icon: MessageSquare,
    color: "bg-cyan-500",
    colorLight: "bg-cyan-500/10",
    colorText: "text-cyan-500",
    description: "Envia um arquivo de áudio (MP3, OGG) com legenda opcional",
  },
  {
    type: "SEND_FILE",
    label: "Enviar Arquivo",
    icon: Package,
    color: "bg-indigo-500",
    colorLight: "bg-indigo-500/10",
    colorText: "text-indigo-500",
    description: "Envia um arquivo (PDF, imagem) com legenda opcional",
  },
  {
    type: "DELAY",
    label: "Delay",
    icon: Clock,
    color: "bg-slate-500",
    colorLight: "bg-slate-500/10",
    colorText: "text-slate-500",
    description: "Pausa entre mensagens (parece mais natural)",
  },
];

const EXIT_NODES = [
  {
    type: "EXIT_SUCCESS",
    label: "Saída (Sucesso)",
    icon: CheckCircle2,
    color: "text-green-500",
    description: "Fluxo concluído com sucesso",
  },
  {
    type: "EXIT_FAILURE",
    label: "Saída (Falha)",
    icon: XCircle,
    color: "text-red-500",
    description: "Timeout, resposta inesperada, PIX expirado",
  },
];

interface FlowStep {
  id: string;
  type: string;
  label: string;
  config: Record<string, any>;
  productId?: string | null;
  nextStepId?: string | null;
  altNextStepId?: string | null;
}

interface FlowEditorProps {
  flowId?: string;
}

export function FlowEditor({ flowId }: FlowEditorProps) {
  const router = useRouter();
  const [flowName, setFlowName] = useState("Novo Fluxo");
  const [triggerKeyword, setTriggerKeyword] = useState("");
  const [triggerMode, setTriggerMode] = useState("contains");
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [insertAtIdx, setInsertAtIdx] = useState<number | null>(null);

  const selectedStep = steps.find((s) => s.id === selectedStepId);

  // Drag and drop handlers
  const handleDragStart = (idx: number) => { setDragIdx(idx); };
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDrop = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
    const newSteps = [...steps];
    const [moved] = newSteps.splice(dragIdx, 1);
    newSteps.splice(idx, 0, moved);
    setSteps(newSteps.map((s, i) => ({ ...s, order: i + 1 })));
    setDragIdx(null); setDragOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  // Carregar fluxo existente ao editar
  useEffect(() => {
    if (!flowId) return;
    fetch(`/api/flows/${flowId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.flow) {
          setFlowName(data.flow.name);
          setTriggerKeyword(data.flow.triggerKeyword);
          setTriggerMode(data.flow.triggerMode);
          setSteps(
            (data.flow.steps || []).map((s: any) => ({
              id: s.id,
              type: s.type,
              label: s.label || s.type,
              config: (s.config || {}) as Record<string, any>,
              productId: s.productId,
              nextStepId: s.nextStepId,
              altNextStepId: s.altNextStepId,
            }))
          );
        }
      })
      .catch(console.error);
  }, [flowId]);

  // Adicionar novo passo (opcionalmente após um índice específico)
  const addStep = (type: string, afterIndex?: number) => {
    const typeDef = STEP_TYPES.find((t) => t.type === type);
    const newStep: FlowStep = {
      id: crypto.randomUUID(),
      type,
      label: typeDef?.label || type,
      config: getDefaultConfig(type),
      nextStepId: undefined,
      altNextStepId: undefined,
    };
    if (afterIndex !== undefined && afterIndex >= 0) {
      const newSteps = [...steps];
      newSteps.splice(afterIndex + 1, 0, newStep);
      setSteps(newSteps);
    } else {
      setSteps([...steps, newStep]);
    }
    setSelectedStepId(newStep.id);
  };

  // Remover passo
  const removeStep = (id: string) => {
    setSteps(steps.filter((s) => s.id !== id));
    if (selectedStepId === id) setSelectedStepId(null);
  };

  // Atualizar config do passo selecionado
  const updateStepConfig = (config: Record<string, any>) => {
    setSteps(
      steps.map((s) =>
        s.id === selectedStepId ? { ...s, config: { ...s.config, ...config } } : s
      )
    );
  };

  // Atualizar label do passo
  const updateStepLabel = (label: string) => {
    setSteps(
      steps.map((s) => (s.id === selectedStepId ? { ...s, label } : s))
    );
  };

  // Conectar próximo passo
  const setNextStep = (fromId: string, toId: string | undefined) => {
    setSteps(
      steps.map((s) =>
        s.id === fromId ? { ...s, nextStepId: toId } : s
      )
    );
  };

  // Conectar passo alternativo (CONDITION "não")
  const setAltNextStep = (fromId: string, toId: string | undefined) => {
    setSteps(
      steps.map((s) =>
        s.id === fromId ? { ...s, altNextStepId: toId } : s
      )
    );
  };

  // Mover passo para cima/baixo
  const moveStep = (id: string, direction: "up" | "down") => {
    const idx = steps.findIndex((s) => s.id === id);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === steps.length - 1) return;

    const newSteps = [...steps];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [newSteps[idx], newSteps[swapIdx]] = [newSteps[swapIdx], newSteps[idx]];
    setSteps(newSteps);
  };

  // Salvar fluxo
  const saveFlow = async () => {
    setSaving(true);
    setMessage("");

    const method = flowId ? "PUT" : "POST";
    const url = flowId ? `/api/flows/${flowId}` : "/api/flows";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: flowName,
        triggerKeyword,
        triggerMode,
        steps: steps.map((s, i) => ({
          type: s.type,
          label: s.label,
          config: s.config,
          productId: s.productId,
          nextStepId: s.nextStepId,
          altNextStepId: s.altNextStepId,
        })),
      }),
    });

    setSaving(false);

    if (res.ok) {
      setMessage("Fluxo salvo! Redirecionando...");
      setTimeout(() => router.push("/dashboard/flows"), 800);
    } else {
      setMessage("Erro ao salvar. Verifique os dados.");
    }
  };

  // Exportar fluxo como JSON
  const exportFlow = () => {
    const template = {
      name: flowName,
      triggerKeyword,
      triggerMode,
      steps: steps.map((s, i) => ({
        order: i + 1,
        type: s.type,
        label: s.label,
        config: s.config,
        productId: s.productId,
      })),
      exportedAt: new Date().toISOString(),
      version: "1.0",
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${flowName.replace(/\s+/g, "-").toLowerCase()}.ezflow.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Importar fluxo de JSON
  const importFlow = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          setFlowName(data.name || "Fluxo Importado");
          setTriggerKeyword(data.triggerKeyword || "");
          setTriggerMode(data.triggerMode || "contains");
          setSteps(
            (data.steps || []).map((s: any) => ({
              id: crypto.randomUUID(),
              type: s.type,
              label: s.label || s.type,
              config: s.config || {},
              productId: s.productId || null,
              nextStepId: null,
              altNextStepId: null,
            }))
          );
          setMessage("Fluxo importado! Revise e salve.");
        } catch {
          setMessage("Erro ao importar. Arquivo inválido.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-12rem)]">
      {/* Canvas principal */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-0 px-0"
              placeholder="Nome do fluxo"
            />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Keyword:</span>
              <input
                type="text"
                value={triggerKeyword}
                onChange={(e) => setTriggerKeyword(e.target.value)}
                className="w-32 px-3 py-1.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="ex: colorir"
              />
              <select
                value={triggerMode}
                onChange={(e) => setTriggerMode(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-input bg-background text-sm"
              >
                <option value="contains">Contém</option>
                <option value="exact">Exato</option>
                <option value="regex">Regex</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {message && (
              <span
                className={`text-sm ${
                  message.includes("Erro")
                    ? "text-destructive"
                    : "text-green-600"
                }`}
              >
                {message}
              </span>
            )}
            <button
              onClick={importFlow}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-input hover:bg-secondary transition-colors"
              title="Importar fluxo de um arquivo JSON"
            >
              <Upload className="w-4 h-4" />
              Importar
            </button>
            <button
              onClick={exportFlow}
              disabled={steps.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-input hover:bg-secondary transition-colors disabled:opacity-50"
              title="Exportar fluxo como template JSON"
            >
              <Download className="w-4 h-4" />
              Exportar
            </button>
            <button
              onClick={saveFlow}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              Salvar
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-card border border-border rounded-xl overflow-y-auto p-6">
          {/* Trigger node (INÍCIO) */}
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/10 border-2 border-green-500/30 text-sm font-medium text-green-700">
              <CheckCircle2 className="w-4 h-4" />
              INÍCIO
            </div>
            <div className="w-0.5 h-6 bg-muted-foreground/30" />
            <span className="text-xs text-muted-foreground mb-2">
              Keyword: &ldquo;{triggerKeyword || "..."}&rdquo;
            </span>
            <div className="w-0.5 h-6 bg-muted-foreground/30" />
          </div>

          {/* Steps */}
          {steps.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground mb-4">
                Adicione passos para construir seu fluxo de venda
              </p>
              <p className="text-xs text-muted-foreground">
                Clique nos botões ao lado para adicionar caixinhas
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              {steps.map((step, idx) => {
                const typeDef = STEP_TYPES.find((t) => t.type === step.type);
                const Icon = typeDef?.icon || MessageSquare;
                const isSelected = selectedStepId === step.id;

                return (
                  <div key={step.id} className="flex flex-col items-center">
                    {/* Botão Inserir Aqui */}
                    <div className="flex flex-col items-center group">
                      <div className="w-0.5 h-2 bg-muted-foreground/20" />
                      <div className="relative">
                        <button
                          className="w-5 h-5 rounded-full border border-dashed border-muted-foreground/30 text-[10px] text-muted-foreground/40 hover:border-primary/50 hover:text-primary hover:bg-primary/5 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                          title="Inserir passo aqui"
                          onClick={() => setInsertAtIdx(insertAtIdx === idx ? null : idx)}
                        >+</button>
                        {insertAtIdx === idx && (
                          <div className="absolute left-6 top-0 z-50 w-48 bg-card border border-border rounded-lg shadow-lg p-1.5">
                            <p className="text-[10px] text-muted-foreground px-2 py-1">Inserir após:</p>
                            <div className="max-h-48 overflow-y-auto space-y-0.5">
                              {STEP_TYPES.map((t) => (
                                <button
                                  key={t.type}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-secondary transition-colors text-left"
                                  onClick={() => { addStep(t.type, idx - 1); setInsertAtIdx(null); }}
                                >
                                  <div className={clsx("p-1 rounded", t.colorLight)}>
                                    <t.icon className={clsx("w-3 h-3", t.colorText)} />
                                  </div>
                                  {t.label}
                                </button>
                              ))}
                            </div>
                            <button
                              className="w-full text-[10px] text-muted-foreground hover:text-foreground py-1 mt-1 border-t border-border"
                              onClick={() => setInsertAtIdx(null)}
                            >Cancelar</button>
                          </div>
                        )}
                      </div>
                      <div className="w-0.5 h-2 bg-muted-foreground/20" />
                    </div>

                    {/* Conexão (seta) */}
                    {idx > 0 && (
                      <div className="flex flex-col items-center">
                        <div className="w-0.5 h-4 bg-muted-foreground/30" />
                        <ArrowRight className="w-4 h-4 text-muted-foreground/50 rotate-90" />
                        <div className="w-0.5 h-4 bg-muted-foreground/30" />
                      </div>
                    )}

                    {/* Step card */}
                    <div
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDrop={() => handleDrop(idx)}
                      onDragEnd={handleDragEnd}
                      onClick={() => setSelectedStepId(step.id)}
                      className={clsx(
                        "w-80 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all",
                        dragIdx === idx && "opacity-50",
                        dragOverIdx === idx && dragOverIdx !== dragIdx && "border-dashed border-primary/50 bg-primary/5",
                        isSelected
                          ? "border-primary shadow-lg shadow-primary/10"
                          : "border-border hover:border-primary/30"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={clsx(
                            "p-1.5 rounded-lg",
                            typeDef?.colorLight
                          )}
                        >
                          <Icon
                            className={clsx("w-4 h-4", typeDef?.colorText)}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {step.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {typeDef?.label}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveStep(step.id, "up");
                            }}
                            className="p-1 rounded hover:bg-secondary text-muted-foreground"
                            title="Mover para cima"
                          >
                            <ArrowRight className="w-3 h-3 -rotate-90" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveStep(step.id, "down");
                            }}
                            className="p-1 rounded hover:bg-secondary text-muted-foreground"
                            title="Mover para baixo"
                          >
                            <ArrowRight className="w-3 h-3 rotate-90" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeStep(step.id);
                            }}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            title="Remover passo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Indicador de conexão */}
                      {step.nextStepId && (
                        <div className="mt-2 pt-2 border-t border-border">
                          <p className="text-xs text-muted-foreground">
                            → Próximo:{" "}
                            {steps.find((s) => s.id === step.nextStepId)?.label ||
                              "Saída"}
                          </p>
                        </div>
                      )}
                      {step.altNextStepId && (
                        <div className="mt-1">
                          <p className="text-xs text-red-400">
                            ↳ Alternativo:{" "}
                            {steps.find((s) => s.id === step.altNextStepId)
                              ?.label || "Falha"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Nós de saída */}
              <div className="flex flex-col items-center mt-2">
                <div className="w-0.5 h-4 bg-muted-foreground/30" />
                <ArrowRight className="w-4 h-4 text-muted-foreground/50 rotate-90" />
                <div className="w-0.5 h-4 bg-muted-foreground/30" />
                {/* EXIT_SUCCESS */}
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/5 border border-dashed border-green-500/30 text-sm text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  SUCESSO
                </div>
                <div className="w-0.5 h-3 bg-muted-foreground/20" />
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/5 border border-dashed border-red-500/30 text-sm text-red-500">
                  <XCircle className="w-4 h-4" />
                  FALHA
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar — Adicionar passos + Config */}
      <div className="w-80 shrink-0 space-y-4 overflow-y-auto">
        {/* Adicionar passos */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Adicionar Passo
          </h3>
          <div className="space-y-1.5">
            {STEP_TYPES.map((type) => (
              <button
                key={type.type}
                onClick={() => addStep(type.type)}
                className={clsx(
                  "w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors hover:bg-secondary"
                )}
              >
                <div className={clsx("p-1.5 rounded-md", type.colorLight)}>
                  <type.icon className={clsx("w-4 h-4", type.colorText)} />
                </div>
                <div>
                  <p className="text-sm font-medium">{type.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {type.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Config do passo selecionado */}
        {selectedStep && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">
              Configurar: {selectedStep.label}
            </h3>
            <StepConfigPanel
              step={selectedStep}
              allSteps={steps}
              onUpdateConfig={updateStepConfig}
              onUpdateLabel={updateStepLabel}
              onSetNextStep={(toId) => setNextStep(selectedStep.id, toId)}
              onSetAltNextStep={(toId) =>
                setAltNextStep(selectedStep.id, toId)
              }
              onSetProductId={(pid) => {
                setSteps(steps.map(s => s.id === selectedStep.id ? {...s, productId: pid} : s));
              }}
            />
          </div>
        )}

        {!selectedStep && (
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Clique em uma caixinha no canvas para configurar
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Configuração padrão por tipo de passo
function getDefaultConfig(type: string): Record<string, any> {
  switch (type) {
    case "SEND_MESSAGE":
      return { text: "Olá! Como posso ajudar?" };
    case "WAIT_RESPONSE":
      return {
        variable: "resposta",
        expected: ["sim", "quero", "yes"],
        timeout: 3600,
        onTimeout: "exit",
        retryMessage: "Ainda está aí?",
        maxRetries: 2,
      };
    case "GENERATE_PIX":
      return {
        valueFrom: "product",
        description: "Pagamento do produto",
        expirationMinutes: 30,
        onExpired: "exit",
        onPaid: "continue",
        onCancelled: "jump_to_step:1",
      };
    case "DELIVER_PRODUCT":
      return {
        message: "Aqui está seu produto! Obrigado pela compra.",
      };
    case "CONDITION":
      return {
        variable: "resposta",
        operator: "contains_any",
        routes: [
          { values: ["sim", "yes"], goToType: "next" },
          { values: ["não", "no"], goToType: "alt" },
          { values: ["*"], goToType: "prev" },
        ],
      };
    case "LOOP":
      return {
        maxIterations: 3,
        backToStepIndex: 0,
        exitCondition: "",
      };
    case "SEND_AUDIO":
      return { audioUrl: "", caption: "" };
    case "SEND_FILE":
      return { fileUrl: "", caption: "" };
    case "DELAY":
      return { seconds: 2 };
    default:
      return {};
  }
}

// Painel de configuração por tipo de passo
function StepConfigPanel({
  step,
  allSteps,
  onUpdateConfig,
  onUpdateLabel,
  onSetNextStep,
  onSetAltNextStep,
  onSetProductId,
}: {
  step: FlowStep;
  allSteps: FlowStep[];
  onUpdateConfig: (config: Record<string, any>) => void;
  onUpdateLabel: (label: string) => void;
  onSetNextStep: (toId: string | undefined) => void;
  onSetAltNextStep: (toId: string | undefined) => void;
  onSetProductId: (productId: string | null) => void;
}) {
  const config = step.config;
  const [products, setProducts] = useState<Array<{ id: string; name: string; price: number; keyword: string }>>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [expectedRaw, setExpectedRaw] = useState<string | null>(null);
  useEffect(() => { fetch("/api/products").then(r => r.json()).then(d => { setProducts(d.products || []); setProductsLoaded(true); }).catch(() => setProductsLoaded(true)); }, []);
  // Sincronizar raw text com config quando muda de step
  useEffect(() => { setExpectedRaw(null); }, [step.id]);

  return (
    <div className="space-y-4">
      {/* Label */}
      <div>
        <label className="block text-xs font-medium mb-1">Rótulo</label>
        <input
          type="text"
          value={step.label}
          onChange={(e) => onUpdateLabel(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Passo alternativo — só para CONDITION e WAIT_RESPONSE */}
      {(step.type === "CONDITION" || step.type === "WAIT_RESPONSE") && (
        <>
        <div>
          <label className="block text-xs font-medium mb-1">
            Próximo se SIM / OK
          </label>
          <select
            value={step.nextStepId || ""}
            onChange={(e) => onSetNextStep(e.target.value || undefined)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
          >
            <option value="">Seguir ordem natural</option>
            {allSteps.filter((s) => s.id !== step.id).map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">
            Passo alternativo (recusa/falha)
          </label>
          <select
            value={step.altNextStepId || ""}
            onChange={(e) => onSetAltNextStep(e.target.value || undefined)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
          >
            <option value="">Encerrar como falha</option>
            {allSteps
              .filter((s) => s.id !== step.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
          </select>
        </div>
        </>
      )}

      {/* Configs específicas por tipo */}
      {step.type === "SEND_MESSAGE" && (
        <>
          <div>
            <label className="block text-xs font-medium mb-1">
              Texto da mensagem
            </label>
            <textarea
              value={config.text || ""}
              onChange={(e) => onUpdateConfig({ text: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Use {{product.name}} e {{product.price}} como variáveis"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Variáveis: {"{{product.name}}"}, {"{{product.price}}"},{" "}
              {"{{customer.name}}"}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 mt-3">
              Produto vinculado (para resolver as variáveis)
            </label>
            <select
              value={step.productId || ""}
              onChange={(e) => onSetProductId(e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
            >
              <option value="">Nenhum (variáveis não resolvem)</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (R$ {p.price.toFixed(2)})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Selecione um produto para que {"{{product.name}}"} e {"{{product.price}}"} sejam substituídos pelos valores reais
            </p>
          </div>
        </>
      )}

      {step.type === "SEND_AUDIO" && (
        <>
          <div>
            <label className="block text-xs font-medium mb-1">
              Upload do áudio (MP3/OGG)
            </label>
            <input
              type="file"
              accept="audio/*,.mp3,.ogg,.m4a,.wav"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const form = new FormData();
                form.append("file", file);
                const res = await fetch("/api/upload", { method: "POST", body: form });
                const data = await res.json();
                if (data.url) onUpdateConfig({ audioUrl: data.url, audioName: data.originalName || file.name });
              }}
              className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-primary file:text-primary-foreground hover:file:opacity-80"
            />
            {config.audioUrl && <p className="text-xs text-green-600 mt-1">✅ Áudio enviado: {config.audioUrl.split("/").pop()}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 mt-2">
              Legenda (opcional)
            </label>
            <textarea
              value={config.caption || ""}
              onChange={(e) => onUpdateConfig({ caption: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Ouça como funciona nosso material..."
            />
          </div>
        </>
      )}

      {step.type === "SEND_FILE" && (
        <>
          <div>
            <label className="block text-xs font-medium mb-1">
              Upload do arquivo (PDF, imagem)
            </label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const form = new FormData();
                form.append("file", file);
                const res = await fetch("/api/upload", { method: "POST", body: form });
                const data = await res.json();
                if (data.url) onUpdateConfig({ fileUrl: data.url, fileName: data.originalName || file.name });
              }}
              className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-primary file:text-primary-foreground hover:file:opacity-80"
            />
            {config.fileUrl && <p className="text-xs text-green-600 mt-1">✅ Arquivo enviado: {config.fileUrl.split("/").pop()}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 mt-2">
              Legenda (opcional)
            </label>
            <textarea
              value={config.caption || ""}
              onChange={(e) => onUpdateConfig({ caption: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Aqui está uma amostra grátis do material..."
            />
          </div>
        </>
      )}

      {step.type === "WAIT_RESPONSE" && (
        <>
          <div>
            <label className="block text-xs font-medium mb-1">
              Respostas esperadas (separadas por vírgula)
            </label>
            <input
              type="text"
              value={expectedRaw !== null ? expectedRaw : (config.expected || []).join(", ")}
              onChange={(e) => { setExpectedRaw(e.target.value); onUpdateConfig({ expected: e.target.value.split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean) }); }}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="sim, quero, yes"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Timeout (segundos)
            </label>
            <input
              type="number"
              value={config.timeout || 3600}
              onChange={(e) =>
                onUpdateConfig({ timeout: parseInt(e.target.value) || 3600 })
              }
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Ao atingir timeout
            </label>
            <select
              value={config.onTimeout || "exit"}
              onChange={(e) => onUpdateConfig({ onTimeout: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
            >
              <option value="exit">Encerrar fluxo</option>
              <option value="retry">Reenviar pergunta</option>
            </select>
          </div>
          {config.onTimeout === "retry" && (
            <div>
              <label className="block text-xs font-medium mb-1">
                Mensagem de retry
              </label>
              <textarea
                value={config.retryMessage || ""}
                onChange={(e) => onUpdateConfig({ retryMessage: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="Ainda está aí? Digite SIM para continuar..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enviada quando o cliente não responde dentro do tempo
              </p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium mb-1 mt-3">
              Resposta para mensagem inesperada
            </label>
            <textarea
              value={config.fallbackMessage || ""}
              onChange={(e) => onUpdateConfig({ fallbackMessage: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Ex: É um PDF com checklist completo! Digite SIM para adquirir 😊"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Enviada quando o cliente digita algo diferente do esperado (ex: &quot;é pdf?&quot;)
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Máximo de retentativas
            </label>
            <input
              type="number"
              value={config.maxRetries || 2}
              onChange={(e) =>
                onUpdateConfig({ maxRetries: parseInt(e.target.value) || 2 })
              }
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
            />
          </div>
        </>
      )}

      {step.type === "GENERATE_PIX" && (
        <>
          <div>
            <label className="block text-xs font-medium mb-1">
              Produto
            </label>
            <select
              value={step.productId || ""}
              onChange={(e) => onSetProductId(e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
            >
              <option value="">Selecione um produto...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (R$ {p.price.toFixed(2)})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              O preço e arquivo de entrega serão usados deste produto
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Expira em (minutos)
            </label>
            <input
              type="number"
              value={config.expirationMinutes || 30}
              onChange={(e) =>
                onUpdateConfig({
                  expirationMinutes: parseInt(e.target.value) || 30,
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 mt-3">
              Mensagem de instrução (opcional)
            </label>
            <textarea
              value={config.instructionMessage || ""}
              onChange={(e) => onUpdateConfig({ instructionMessage: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Copie o código acima e cole no app do seu banco para pagar. O pagamento é confirmado na hora!"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Mensagem separada enviada logo após o código PIX
            </p>
          </div>
          <div className="border-t border-border pt-3 mt-3">
            <label className="block text-xs font-semibold mb-2">
              🔔 Lembretes de Remarketing (opcional)
            </label>
            <label className="block text-xs font-medium mb-1">
              1º Lembrete — após (minutos)
            </label>
            <input
              type="number"
              value={config.reminder1Minutes || ""}
              onChange={(e) => onUpdateConfig({ reminder1Minutes: parseInt(e.target.value) || undefined })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm mb-1"
              placeholder="15"
            />
            <input
              type="text"
              value={config.reminder1Message || ""}
              onChange={(e) => onUpdateConfig({ reminder1Message: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm mb-2"
              placeholder="Conseguiu fazer o PIX? Se tiver dúvidas, estou aqui!"
            />

            <label className="block text-xs font-medium mb-1">
              2º Lembrete — após (minutos)
            </label>
            <input
              type="number"
              value={config.reminder2Minutes || ""}
              onChange={(e) => onUpdateConfig({ reminder2Minutes: parseInt(e.target.value) || undefined })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm mb-1"
              placeholder="25"
            />
            <input
              type="text"
              value={config.reminder2Message || ""}
              onChange={(e) => onUpdateConfig({ reminder2Message: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
              placeholder="O PIX expira em 5 min! Não perca essa oportunidade 🙏"
            />
          </div>

          <div className="border-t border-border pt-3 mt-3">
            <label className="block text-xs font-semibold mb-2">
              🤝 Módulo Confiança (opcional)
            </label>
            <label className="block text-xs font-medium mb-1">
              Palavra-chave de confiança
            </label>
            <input
              type="text"
              value={config.trustKeyword || ""}
              onChange={(e) => onUpdateConfig({ trustKeyword: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
              placeholder="confio"
            />
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              Se preenchido, ao digitar essa palavra a pessoa recebe o produto antes de pagar
            </p>

            <label className="block text-xs font-medium mb-1">
              Valor mínimo (R$)
            </label>
            <input
              type="number"
              value={config.trustMinAmount || 10}
              onChange={(e) => onUpdateConfig({ trustMinAmount: parseInt(e.target.value) || 10 })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm mb-2"
            />

            <label className="block text-xs font-medium mb-1">
              Valor máximo (R$)
            </label>
            <input
              type="number"
              value={config.trustMaxAmount || 20}
              onChange={(e) => onUpdateConfig({ trustMaxAmount: parseInt(e.target.value) || 20 })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm mb-2"
            />

            <label className="block text-xs font-medium mb-1 mt-2">
              Mensagem de boas-vindas
            </label>
            <textarea
              value={config.trustWelcomeMessage || ""}
              onChange={(e) => onUpdateConfig({ trustWelcomeMessage: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none mb-2"
              placeholder="🎁 Quero que você conheça meu trabalho. Vou liberar o material agora. Se ajudar, contribua. Você decide. ❤️"
            />

            <label className="block text-xs font-medium mb-1">
              Pergunta do valor
            </label>
            <input
              type="text"
              value={config.trustAskMessage || ""}
              onChange={(e) => onUpdateConfig({ trustAskMessage: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm mb-2"
              placeholder="Que legal! Qual valor gostaria de contribuir? (R$10 a R$20)"
            />

            <label className="block text-xs font-medium mb-1">
              Mensagem se valor inválido
            </label>
            <input
              type="text"
              value={config.trustInvalidMessage || ""}
              onChange={(e) => onUpdateConfig({ trustInvalidMessage: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm mb-2"
              placeholder="Por favor, envie um valor entre R$10 e R$20."
            />

            <label className="block text-xs font-medium mb-1">
              Mensagem pós-entrega + PIX
            </label>
            <textarea
              value={config.trustMessage || ""}
              onChange={(e) => onUpdateConfig({ trustMessage: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Aqui está seu PDF! Se gostar, contribua pelo PIX abaixo. Sua boa-fé mantém esse projeto! 🙏"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              Se PIX expirar
            </label>
            <select
              value={config.onExpired || "exit"}
              onChange={(e) => onUpdateConfig({ onExpired: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
            >
              <option value="exit">Encerrar fluxo</option>
              <option value="retry">Oferecer novo PIX</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Se PIX cancelado
            </label>
            <select
              value={config.onCancelled || "exit"}
              onChange={(e) => onUpdateConfig({ onCancelled: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
            >
              <option value="exit">Encerrar fluxo</option>
              <option value="retry">Voltar ao início</option>
            </select>
          </div>
        </>
      )}

      {step.type === "DELIVER_PRODUCT" && (
        <div>
          <label className="block text-xs font-medium mb-1">
            Mensagem de entrega
          </label>
          <textarea
            value={config.message || ""}
            onChange={(e) => onUpdateConfig({ message: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder="Aqui está seu produto! Obrigado pela compra."
          />
        </div>
      )}

      {step.type === "CONDITION" && (
        <div>
          <label className="block text-xs font-medium mb-1">
            Expressão da condição
          </label>
          <div className="space-y-2">
            <select
              value={config.operator || "contains_any"}
              onChange={(e) => onUpdateConfig({ operator: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
            >
              <option value="contains_any">Contém qualquer um</option>
              <option value="equals">Igual a</option>
              <option value="not_contains">Não contém</option>
            </select>
            <input
              type="text"
              value={(config.routes?.[0]?.values || []).join(", ")}
              onChange={(e) => {
                const values = e.target.value
                  .split(",")
                  .map((s: string) => s.trim().toLowerCase());
                onUpdateConfig({
                  routes: [
                    { values, goToType: "next" },
                    { values: ["*"], goToType: "alt" },
                  ],
                });
              }}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
              placeholder="Valores para rota SIM (ex: sim, quero, yes)"
            />
            <input
              type="text"
              value={(config.routes?.[1]?.values || [])
                .filter((v: string) => v !== "*")
                .join(", ")}
              onChange={(e) => {
                const values = e.target.value
                  .split(",")
                  .map((s: string) => s.trim().toLowerCase());
                onUpdateConfig({
                  routes: [
                    config.routes?.[0] || { values: [], goToType: "next" },
                    { values: [...values, "*"], goToType: "alt" },
                  ],
                });
              }}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
              placeholder="Valores para rota NÃO (ex: não, nao, no)"
            />
          </div>
        </div>
      )}

      {step.type === "LOOP" && (
        <>
          <div>
            <label className="block text-xs font-medium mb-1">
              Máximo de iterações
            </label>
            <input
              type="number"
              value={config.maxIterations || 3}
              onChange={(e) =>
                onUpdateConfig({
                  maxIterations: parseInt(e.target.value) || 3,
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Condição de saída (opcional)
            </label>
            <input
              type="text"
              value={config.exitCondition || ""}
              onChange={(e) => onUpdateConfig({ exitCondition: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
              placeholder="variable:confirmacao=sim"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Formato: variable:nome=valor
            </p>
          </div>
        </>
      )}

      {step.type === "DELAY" && (
        <div>
          <label className="block text-xs font-medium mb-1">
            Pausa (segundos)
          </label>
          <input
            type="number"
            value={config.seconds || 2}
            onChange={(e) => onUpdateConfig({ seconds: parseInt(e.target.value) || 2 })}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
            min="1"
            max="10"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Intervalo entre mensagens (1-10s). Evita bloqueios do WhatsApp.
          </p>
        </div>
      )}
    </div>
  );
}
