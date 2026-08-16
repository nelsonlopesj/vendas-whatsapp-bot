/**
 * Tipos compartilhados do modelo de grafo de fluxos (editor, motor e testes).
 *
 * Modelo v2 (grafo): arestas vivem em `step.config.outgoingEdges` —
 * [{ id, port, targetStepId }]. Portas por tipo:
 * - next (passos simples), alt + timeout (WAIT_RESPONSE),
 * - back (LOOP), route:<routeId> (CONDITION, uma por rota)
 *
 * Modelo v1 (legado): colunas nextStepId/altNextStepId + ordem linear.
 * Fluxos legados NÃO têm outgoingEdges e continuam resolvendo como hoje.
 */

export interface FlowStepGraph {
  id: string;
  type: string;
  label?: string | null;
  order: number;
  config: Record<string, any>;
  productId?: string | null;
  nextStepId?: string | null;
  altNextStepId?: string | null;
  positionX?: number | null;
  positionY?: number | null;
}

export interface OutgoingEdge {
  id: string;
  port: string;
  targetStepId: string | null;
}

export interface ConditionRoute {
  id: string;
  name: string;
  values: string[];
  message?: string;
  /** legado: "next" | "alt" | "prev" — ignorado quando há arestas */
  goToType?: string;
}

/** Porta de saída padrão dos passos simples */
export const PORT_NEXT = "next";
/** Porta alternativa do WAIT_RESPONSE (resposta fora do esperado/recusa) */
export const PORT_ALT = "alt";
/** Porta de timeout do WAIT_RESPONSE (retries esgotadas → follow-up) */
export const PORT_TIMEOUT = "timeout";
/** Porta de retorno do LOOP */
export const PORT_BACK = "back";
/** Prefixo das portas de rota do CONDITION: `route:<routeId>` */
export const ROUTE_PORT_PREFIX = "route:";

/** Tipos de passo que pausam para interação (quebram ciclos de execução) */
export const PAUSING_STEP_TYPES = ["WAIT_RESPONSE", "GENERATE_PIX"];
