"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import clsx from "clsx";
import { ConditionRoute } from "@/lib/flow-types";

/** Portas de saída por tipo de passo */
export function getStepPorts(step: {
  type: string;
  config: Record<string, any>;
}): { id: string; label: string }[] {
  switch (step.type) {
    case "CONDITION": {
      const routes: ConditionRoute[] = step.config?.routes || [];
      return routes.map((r, i) => ({
        id: `route:${r.id || String(i)}`,
        label: r.name || `Rota ${i + 1}`,
      }));
    }
    case "WAIT_RESPONSE":
      return [
        { id: "next", label: "Esperado" },
        { id: "alt", label: "Alternativo" },
        { id: "timeout", label: "Timeout" },
      ];
    case "LOOP":
      return [
        { id: "next", label: "Sair" },
        { id: "back", label: "Voltar" },
      ];
    default:
      return [{ id: "next", label: "Próximo" }];
  }
}

function FlowNodeInner({ data, selected }: NodeProps) {
  const step = (data as any)?.step;
  // typeDef vem do canvas (evita dependência circular com o editor)
  const typeDef = (data as any)?.typeDef;
  const Icon = typeDef?.icon || null;
  const ports = step ? getStepPorts(step) : [];

  return (
    <div
      className={clsx(
        "w-60 rounded-xl border-2 bg-card shadow-sm transition-shadow",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border"
      )}
    >
      <Handle type="target" position={Position.Left} id="in" />
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        {Icon && (
          <div className={clsx("p-1 rounded", typeDef?.colorLight)}>
            <Icon className={clsx("w-3.5 h-3.5", typeDef?.colorText)} />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate">{step?.label}</p>
          <p className="text-[10px] text-muted-foreground">{typeDef?.label}</p>
        </div>
      </div>
      {step?.config?.text && (
        <p className="px-3 py-2 text-[11px] text-muted-foreground line-clamp-2">
          {String(step.config.text)}
        </p>
      )}
      {step?.config?.audioUrl && (
        <p className="px-3 py-2 text-[11px] text-muted-foreground">
          🎵 {String(step.config.audioUrl).split("/").pop()}
        </p>
      )}
      {/* Uma handle-fonte por porta, à direita */}
      <div className="relative pb-1">
        {ports.map((p, i) => (
          <div key={p.id} className="flex items-center justify-end pr-0">
            <Handle
              type="source"
              position={Position.Right}
              id={p.id}
              style={{ position: "absolute", right: -8, top: 14 + i * 22 }}
            />
            <span className="text-[10px] text-muted-foreground pr-4 py-0.5">
              {p.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const FlowNode = memo(FlowNodeInner);
