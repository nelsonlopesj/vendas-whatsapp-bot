/**
 * flow-graph — resolvedor puro do modelo de grafo de fluxos.
 *
 * Sem imports de Prisma/Next: testável em Node puro (vitest).
 * Regras centrais:
 * - Fluxo com `config.outgoingEdges` em algum passo = modo GRAFO: transições
 *   acontecem apenas por arestas; aresta pendurada = fim de fluxo.
 * - Fluxo sem arestas = modo LEGADO: replica exatamente o comportamento atual
 *   do motor (nextStepId/altNextStepId + fallback por `order`).
 */

import {
  FlowStepGraph,
  OutgoingEdge,
  ConditionRoute,
  ROUTE_PORT_PREFIX,
  PORT_NEXT,
  PORT_ALT,
  PORT_TIMEOUT,
  PORT_BACK,
  PAUSING_STEP_TYPES,
} from "./flow-types";

/** Teto de passos por passagem síncrona (protege contra ciclos infinitos) */
export const MAX_STEPS_PER_PASS = 200;
/** Teto de execuções de um mesmo passo dentro de uma passagem */
export const MAX_EXEC_PER_STEP_PER_PASS = 50;

// ===== Arestas =====

export function hasGraphEdges(steps: FlowStepGraph[]): boolean {
  return steps.some(
    (s) => Array.isArray(s.config?.outgoingEdges) && s.config.outgoingEdges.length > 0
  );
}

export function getEdges(step: FlowStepGraph): OutgoingEdge[] {
  const edges = step.config?.outgoingEdges;
  return Array.isArray(edges) ? (edges as OutgoingEdge[]) : [];
}

export function getEdgeForPort(
  step: FlowStepGraph,
  port: string
): OutgoingEdge | undefined {
  return getEdges(step).find((e) => e.port === port);
}

/** Mapa stepId → (porta → alvo) para resolução rápida */
export function buildEdgeMap(
  steps: FlowStepGraph[]
): Map<string, Map<string, string | null>> {
  const map = new Map<string, Map<string, string | null>>();
  for (const s of steps) {
    const byPort = new Map<string, string | null>();
    for (const e of getEdges(s)) {
      byPort.set(e.port, e.targetStepId);
    }
    map.set(s.id, byPort);
  }
  return map;
}

// ===== Helpers de ordem (paridade legada) =====

export function nextByOrder(
  steps: FlowStepGraph[],
  step: FlowStepGraph
): string | null {
  const next = steps.find((s) => s.order === step.order + 1);
  return next?.id ?? null;
}

export function prevByOrder(
  steps: FlowStepGraph[],
  step: FlowStepGraph
): string | null {
  const prev = steps.find((s) => s.order === step.order - 1);
  return prev?.id ?? null;
}

// ===== Matching de respostas (paridade com matchResponse do motor) =====

export function matchValues(
  message: string,
  values: string[],
  operator: string = "contains_any"
): boolean {
  // Paridade com o motor: minúsculas + sem acentos
  const norm = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  const msg = norm(message);
  const vals = values.map((v) => norm(v));

  switch (operator) {
    case "equals":
      return vals.some((v) => msg === v);
    case "not_contains":
      return !vals.some((v) => msg.includes(v));
    case "contains_any":
    default:
      return vals.some((v) => msg.includes(v));
  }
}

export function routeMatches(
  route: ConditionRoute,
  message: string,
  operator: string = "contains_any"
): boolean {
  const values = route.values || [];
  if (values.includes("*")) return true;
  return matchValues(message, values, operator);
}

// ===== Resolução legada (paridade exata com o motor atual) =====

export function resolveLegacy(
  steps: FlowStepGraph[],
  step: FlowStepGraph,
  port: string
): string | null {
  switch (port) {
    case PORT_NEXT:
      return step.nextStepId || nextByOrder(steps, step);
    case PORT_ALT:
      return step.altNextStepId || nextByOrder(steps, step);
    case PORT_BACK: {
      // Paridade com o motor legado: `backToStepIndex || 0` → sempre cai no 0
      const idx = step.config?.backToStepIndex;
      const byIndex = steps[idx || 0]?.id ?? undefined;
      return step.config?.backToStepId || byIndex || step.nextStepId || null;
    }
    case PORT_TIMEOUT:
      // Legado: sem porta de timeout — o motor usa o comportamento global
      return null;
    default:
      return null;
  }
}

/** Resolução principal: grafo → aresta; legado → comportamento atual */
export function resolveOutgoing(
  steps: FlowStepGraph[],
  step: FlowStepGraph,
  port: string
): string | null {
  if (hasGraphEdges(steps)) {
    return getEdgeForPort(step, port)?.targetStepId ?? null;
  }
  return resolveLegacy(steps, step, port);
}

// ===== CONDITION =====

/**
 * Resolve a rota do CONDITION para uma mensagem.
 * Grafo: primeira rota que casa (com "*" fallback) → aresta `route:<id>`.
 * Legado: goToType next/alt/prev com os mesmos alvos de hoje; sem match →
 * nextStepId (paridade com o motor).
 */
export function resolveConditionTarget(
  steps: FlowStepGraph[],
  step: FlowStepGraph,
  message: string
): { targetStepId: string | null; reply?: string; routeId?: string } {
  const routes: ConditionRoute[] = step.config?.routes || [];
  const operator: string = step.config?.operator || "contains_any";

  if (hasGraphEdges(steps)) {
    for (const route of routes) {
      if (!routeMatches(route, message, operator)) continue;
      const routeId = route.id || String(routes.indexOf(route));
      const edge = getEdgeForPort(step, `${ROUTE_PORT_PREFIX}${routeId}`);
      return {
        targetStepId: edge?.targetStepId ?? null,
        reply: route.message || undefined,
        routeId,
      };
    }
    // Sem rota correspondente (nem "*") = fim do fluxo
    return { targetStepId: null };
  }

  // Legado — idêntico ao motor atual
  for (const route of routes) {
    const routeValues = route.values || [];
    if (
      !routeValues.includes("*") &&
      !matchValues(message, routeValues, operator)
    ) {
      continue;
    }
    if (route.goToType === "next") {
      return {
        targetStepId: step.nextStepId || nextByOrder(steps, step),
        reply: route.message || undefined,
      };
    }
    if (route.goToType === "alt") {
      return {
        targetStepId: step.altNextStepId || nextByOrder(steps, step),
        reply: route.message || undefined,
      };
    }
    if (route.goToType === "prev") {
      return {
        targetStepId: prevByOrder(steps, step),
        reply: route.message || undefined,
      };
    }
    break;
  }
  return { targetStepId: step.nextStepId || null };
}

// ===== Migração legado → grafo =====

/**
 * Sintetiza arestas a partir de um fluxo legado (colunas + ordem + rotas).
 * Não muta os passos — devolve o mapa de arestas para conversão/auto-layout.
 */
export function migrateLegacyToGraph(
  steps: FlowStepGraph[]
): Map<string, OutgoingEdge[]> {
  const out = new Map<string, OutgoingEdge[]>();
  for (const step of steps) {
    const edges: OutgoingEdge[] = [];
    const add = (port: string, target: string | null) => {
      if (!target) return;
      edges.push({ id: `${step.id}->${port}`, port, targetStepId: target });
    };

    if (step.type === "CONDITION") {
      const routes: ConditionRoute[] = step.config?.routes || [];
      for (const route of routes) {
        const routeId = route.id || `r${routes.indexOf(route)}`;
        let target: string | null = null;
        if (route.goToType === "next") {
          target = step.nextStepId || nextByOrder(steps, step);
        } else if (route.goToType === "alt") {
          target = step.altNextStepId || nextByOrder(steps, step);
        } else if (route.goToType === "prev") {
          target = prevByOrder(steps, step);
        }
        add(`${ROUTE_PORT_PREFIX}${routeId}`, target);
      }
    } else if (step.type === "LOOP") {
      add(PORT_NEXT, resolveLegacy(steps, step, PORT_NEXT));
      const idx = step.config?.backToStepIndex;
      const backTarget =
        step.config?.backToStepId ||
        (idx != null ? steps[idx]?.id ?? null : null) ||
        step.nextStepId ||
        null;
      if (backTarget) add(PORT_BACK, backTarget);
    } else {
      add(PORT_NEXT, resolveLegacy(steps, step, PORT_NEXT));
      if (step.altNextStepId) add(PORT_ALT, step.altNextStepId);
    }

    if (edges.length > 0) out.set(step.id, edges);
  }
  return out;
}

// ===== Detecção de ciclos =====

/** Mapa stepId → alvos (todas as portas), usando arestas ou legado */
export function buildAdjacencyTargets(
  steps: FlowStepGraph[]
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const graph = hasGraphEdges(steps);
  const legacy = migrateLegacyToGraph(steps);

  for (const step of steps) {
    const targets = new Set<string>();
    if (graph) {
      for (const e of getEdges(step)) {
        if (e.targetStepId) targets.add(e.targetStepId);
      }
    } else {
      for (const e of legacy.get(step.id) || []) {
        if (e.targetStepId) targets.add(e.targetStepId);
      }
    }
    adj.set(step.id, targets);
  }
  return adj;
}

/**
 * Ciclos perigosos = ciclos sem nenhum passo de pausa assíncrona
 * (WAIT_RESPONSE/GENERATE_PIX). LOOP com aresta back é o único ciclo legal.
 */
export function detectUnsafeCycles(steps: FlowStepGraph[]): string[][] {
  const adj = buildAdjacencyTargets(steps);
  const byId = new Map(steps.map((s) => [s.id, s]));

  const visited = new Set<string>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const dfs = (id: string) => {
    visited.add(id);
    onStack.add(id);
    stack.push(id);
    for (const target of adj.get(id) || []) {
      if (onStack.has(target)) {
        // back edge — extrai o ciclo
        const start = stack.indexOf(target);
        if (start >= 0) cycles.push(stack.slice(start));
      } else if (!visited.has(target)) {
        dfs(target);
      }
    }
    stack.pop();
    onStack.delete(id);
  };

  for (const s of steps) {
    if (!visited.has(s.id)) dfs(s.id);
  }

  return cycles.filter(
    (cycle) =>
      !cycle.some((id) => PAUSING_STEP_TYPES.includes(byId.get(id)?.type || ""))
  );
}

// ===== Auto-layout (BFS por camadas) =====

/**
 * Layout determinístico por camadas BFS. Entradas = passos sem arestas de
 * chegada; nós inalcançáveis entram por ordem ao final.
 */
export function autoLayout(
  steps: FlowStepGraph[]
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  if (steps.length === 0) return pos;

  const adj = buildAdjacencyTargets(steps);
  const incoming = new Map<string, number>();
  for (const s of steps) incoming.set(s.id, 0);
  for (const [, targets] of adj) {
    for (const t of targets) {
      incoming.set(t, (incoming.get(t) || 0) + 1);
    }
  }

  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const entries = sorted.filter((s) => (incoming.get(s.id) || 0) === 0);
  const startIds = new Set(entries.map((s) => s.id));

  const layerOf = new Map<string, number>();
  const queue: string[] = [...entries.map((s) => s.id)];
  for (const id of queue) layerOf.set(id, 0);

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const nextLayer = (layerOf.get(cur) || 0) + 1;
    for (const target of adj.get(cur) || []) {
      if (!layerOf.has(target)) {
        layerOf.set(target, nextLayer);
        queue.push(target);
      }
    }
  }

  // Nós inalcançáveis: empilham no final, por ordem
  let maxLayer = Math.max(0, ...queue.map((id) => layerOf.get(id) || 0));
  for (const s of sorted) {
    if (!layerOf.has(s.id)) {
      layerOf.set(s.id, ++maxLayer);
      queue.push(s.id);
    }
  }

  const indexInLayer = new Map<string, number>();
  for (const id of queue) {
    const layer = layerOf.get(id) || 0;
    const idx = indexInLayer.get(String(layer)) || 0;
    indexInLayer.set(String(layer), idx + 1);
    pos.set(id, { x: layer * 280, y: idx * 160 });
  }

  // Entradas sem camada de origem ficam na camada 0 (acima da origem)
  for (const s of sorted) {
    if (!pos.has(s.id)) {
      const idx = (indexInLayer.get("0") || 0);
      indexInLayer.set("0", idx + 1);
      pos.set(s.id, { x: 0, y: idx * 160 });
    }
  }

  // Garante que haja um passo na camada 0 (referência do startSession)
  if (!sorted.some((s) => (layerOf.get(s.id) || 0) === 0) && startIds.size === 0) {
    const first = sorted[0];
    pos.set(first.id, { x: 0, y: 0 });
  }

  return pos;
}
