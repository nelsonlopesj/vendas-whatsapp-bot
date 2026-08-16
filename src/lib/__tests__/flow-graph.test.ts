import { describe, it, expect } from "vitest";
import {
  hasGraphEdges,
  getEdgeForPort,
  resolveOutgoing,
  resolveConditionTarget,
  matchValues,
  migrateLegacyToGraph,
  detectUnsafeCycles,
  autoLayout,
  MAX_STEPS_PER_PASS,
} from "../flow-graph";
import { FlowStepGraph, OutgoingEdge } from "../flow-types";

function step(
  partial: Partial<FlowStepGraph> & { id: string; order: number }
): FlowStepGraph {
  return { type: "SEND_MESSAGE", config: {}, ...partial } as FlowStepGraph;
}

function withEdges(
  s: FlowStepGraph,
  edges: OutgoingEdge[]
): FlowStepGraph {
  return { ...s, config: { ...s.config, outgoingEdges: edges } };
}

const edge = (port: string, targetStepId: string | null): OutgoingEdge => ({
  id: `${port}-${targetStepId}`,
  port,
  targetStepId,
});

// ===== Legado: paridade com o comportamento atual do motor =====

describe("resolução legada (sem arestas)", () => {
  const steps = [
    step({ id: "a", order: 1 }),
    step({ id: "b", order: 2, nextStepId: null }),
    step({ id: "c", order: 3 }),
  ];

  it("next: usa nextStepId explícito", () => {
    const s = step({ id: "a", order: 1, nextStepId: "c" });
    expect(resolveOutgoing(steps, s, "next")).toBe("c");
  });

  it("next: fallback por ordem quando nextStepId é null", () => {
    expect(resolveOutgoing(steps, steps[0], "next")).toBe("b");
  });

  it("next: fim do fluxo quando é o último", () => {
    expect(resolveOutgoing(steps, steps[2], "next")).toBeNull();
  });

  it("alt: usa altNextStepId explícito", () => {
    const s = step({ id: "a", order: 1, altNextStepId: "c" });
    expect(resolveOutgoing(steps, s, "alt")).toBe("c");
  });

  it("alt: fallback por ordem quando altNextStepId é null", () => {
    expect(resolveOutgoing(steps, steps[1], "alt")).toBe("c");
  });

  it("timeout: null no legado (comportamento global do motor)", () => {
    expect(resolveOutgoing(steps, steps[0], "timeout")).toBeNull();
  });

  it("back (LOOP): backToStepId → backToStepIndex → nextStepId", () => {
    const byId = step({
      id: "l",
      order: 2,
      type: "LOOP",
      config: { backToStepId: "a" },
    });
    expect(resolveOutgoing(steps, byId, "back")).toBe("a");

    const byIdx = step({
      id: "l",
      order: 2,
      type: "LOOP",
      config: { backToStepIndex: 0 },
    });
    expect(resolveOutgoing(steps, byIdx, "back")).toBe("a");

    const byNext = step({ id: "l", order: 2, type: "LOOP", config: {} });
    // paridade: `backToStepIndex || 0` do motor → steps[0]
    expect(resolveOutgoing(steps, byNext, "back")).toBe("a");
  });
});

describe("CONDITION legado (paridade com o motor)", () => {
  const steps = [
    step({ id: "q", order: 1, type: "WAIT_RESPONSE", config: {} }),
    step({ id: "c", order: 2, type: "CONDITION", nextStepId: "pix", altNextStepId: "bye", config: { routes: [] } }),
    step({ id: "pix", order: 3 }),
    step({ id: "bye", order: 4 }),
  ];

  const routes = [
    { id: "r1", name: "Sim", values: ["sim", "quero"], goToType: "next" },
    { id: "r2", name: "Não", values: ["não", "no"], goToType: "alt" },
    { id: "r3", name: "Dúvidas", values: ["*"], goToType: "prev", message: "É um PDF! Digite SIM" },
  ];

  it("rota next → nextStepId", () => {
    const cond = step({ id: "c", order: 2, type: "CONDITION", nextStepId: "pix", altNextStepId: "bye", config: { routes } });
    const r = resolveConditionTarget(steps, cond, "sim");
    expect(r.targetStepId).toBe("pix");
  });

  it("rota alt → altNextStepId", () => {
    const cond = step({ id: "c", order: 2, type: "CONDITION", nextStepId: "pix", altNextStepId: "bye", config: { routes } });
    const r = resolveConditionTarget(steps, cond, "não");
    expect(r.targetStepId).toBe("bye");
  });

  it("rota prev → passo anterior por ordem, com reply", () => {
    const cond = step({ id: "c", order: 2, type: "CONDITION", nextStepId: "pix", altNextStepId: "bye", config: { routes } });
    const r = resolveConditionTarget(steps, cond, "é pdf?");
    expect(r.targetStepId).toBe("q");
    expect(r.reply).toBe("É um PDF! Digite SIM");
  });

  it("sem match → nextStepId (paridade com o motor)", () => {
    const cond = step({ id: "c", order: 2, type: "CONDITION", nextStepId: "pix", config: { routes: [{ id: "r1", name: "Sim", values: ["sim"], goToType: "next" }] } });
    const r = resolveConditionTarget(steps, cond, "outra coisa");
    expect(r.targetStepId).toBe("pix");
  });
});

// ===== Grafo: arestas explícitas =====

describe("resolução em grafo (com arestas)", () => {
  const steps = [
    withEdges(step({ id: "a", order: 1 }), [edge("next", "b")]),
    withEdges(step({ id: "b", order: 2, type: "WAIT_RESPONSE", config: {} }), [
      edge("next", "c"),
      edge("alt", "bye"),
      edge("timeout", "fu"),
    ]),
    step({ id: "c", order: 3 }),
    step({ id: "bye", order: 4 }),
    step({ id: "fu", order: 5 }),
  ];

  it("detecta modo grafo", () => {
    expect(hasGraphEdges(steps)).toBe(true);
  });

  it("próximo pela aresta da porta", () => {
    expect(resolveOutgoing(steps, steps[0], "next")).toBe("b");
  });

  it("porta alt e timeout do WAIT_RESPONSE", () => {
    expect(resolveOutgoing(steps, steps[1], "alt")).toBe("bye");
    expect(resolveOutgoing(steps, steps[1], "timeout")).toBe("fu");
  });

  it("não recai em ordem quando a aresta está pendurada", () => {
    const dangling = withEdges(step({ id: "a", order: 1 }), [edge("next", null)]);
    const all = [dangling, step({ id: "b", order: 2 })];
    expect(resolveOutgoing(all, dangling, "next")).toBeNull();
  });

  it("CONDITION com 3 rotas nomeadas → arestas route:<id>", () => {
    const cond = withEdges(
      step({
        id: "dec",
        order: 2,
        type: "CONDITION",
        config: {
          routes: [
            { id: "pos", name: "Positivas", values: ["sim"] },
            { id: "neg", name: "Negativas", values: ["não"] },
            { id: "duv", name: "Dúvidas", values: ["*"], message: "Dúvida! Digite SIM" },
          ],
        },
      }),
      [edge("route:pos", "pix"), edge("route:neg", "bye"), edge("route:duv", "q")]
    );
    const all = [
      step({ id: "q", order: 1 }),
      cond,
      step({ id: "pix", order: 3 }),
      step({ id: "bye", order: 4 }),
    ];
    expect(resolveConditionTarget(all, cond, "sim").targetStepId).toBe("pix");
    expect(resolveConditionTarget(all, cond, "não").targetStepId).toBe("bye");
    const duv = resolveConditionTarget(all, cond, "é pdf?");
    expect(duv.targetStepId).toBe("q");
    expect(duv.reply).toBe("Dúvida! Digite SIM");
  });

  it("rota sem aresta = fim do fluxo (não recai em ordem)", () => {
    const cond = withEdges(
      step({
        id: "dec",
        order: 1,
        type: "CONDITION",
        config: { routes: [{ id: "pos", name: "Positivas", values: ["sim"] }] },
      }),
      []
    );
    const all = [cond, step({ id: "pix", order: 2 })];
    expect(resolveConditionTarget(all, cond, "sim").targetStepId).toBeNull();
  });
});

// ===== Matching =====

describe("matchValues", () => {
  it("contains_any (default)", () => {
    expect(matchValues("Sim por favor", ["sim", "quero"])).toBe(true);
    expect(matchValues("quero não", ["sim"])).toBe(false);
  });

  it("equals", () => {
    expect(matchValues("sim", ["sim"], "equals")).toBe(true);
    expect(matchValues("sim!", ["sim"], "equals")).toBe(false);
  });

  it("not_contains", () => {
    expect(matchValues("sim", ["não", "pdf"], "not_contains")).toBe(true);
    expect(matchValues("é um pdf", ["pdf"], "not_contains")).toBe(false);
  });
});

// ===== Migração legado → grafo =====

describe("migrateLegacyToGraph", () => {
  it("converte colunas em arestas de porta única", () => {
    const steps = [
      step({ id: "a", order: 1, nextStepId: "b" }),
      step({ id: "b", order: 2, nextStepId: null }),
    ];
    const map = migrateLegacyToGraph(steps);
    expect(map.get("a")).toEqual([
      { id: "a->next", port: "next", targetStepId: "b" },
    ]);
    expect(map.get("b")).toBeUndefined();
  });

  it("converte CONDITION legado em rotas com arestas", () => {
    const steps = [
      step({ id: "q", order: 1 }),
      step({
        id: "c",
        order: 2,
        type: "CONDITION",
        nextStepId: "pix",
        altNextStepId: "bye",
        config: {
          routes: [
            { id: "r1", name: "Sim", values: ["sim"], goToType: "next" },
            { id: "r2", name: "Não", values: ["não"], goToType: "alt" },
            { id: "r3", name: "Dúvidas", values: ["*"], goToType: "prev" },
          ],
        },
      }),
      step({ id: "pix", order: 3 }),
      step({ id: "bye", order: 4 }),
    ];
    const map = migrateLegacyToGraph(steps);
    const edges = map.get("c") || [];
    expect(edges.map((e) => e.port).sort()).toEqual([
      "route:r1",
      "route:r2",
      "route:r3",
    ]);
    const byPort = Object.fromEntries(edges.map((e) => [e.port, e.targetStepId]));
    expect(byPort["route:r1"]).toBe("pix");
    expect(byPort["route:r2"]).toBe("bye");
    expect(byPort["route:r3"]).toBe("q"); // prev = passo anterior
  });

  it("LOOP vira portas next + back", () => {
    const steps = [
      step({ id: "s", order: 1 }),
      step({ id: "l", order: 2, type: "LOOP", nextStepId: null, config: { backToStepId: "s" } }),
    ];
    const map = migrateLegacyToGraph(steps);
    const edges = map.get("l") || [];
    expect(edges.find((e) => e.port === "back")?.targetStepId).toBe("s");
  });
});

// ===== Ciclos =====

describe("detectUnsafeCycles", () => {
  it("ciclo sem pausa assíncrona é detectado", () => {
    const a = withEdges(step({ id: "a", order: 1 }), [edge("next", "b")]);
    const b = withEdges(step({ id: "b", order: 2 }), [edge("next", "a")]);
    const cycles = detectUnsafeCycles([a, b]);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it("ciclo com WAIT_RESPONSE no caminho é seguro", () => {
    const a = withEdges(step({ id: "a", order: 1, type: "WAIT_RESPONSE", config: {} }), [edge("next", "b")]);
    const b = withEdges(step({ id: "b", order: 2 }), [edge("next", "a")]);
    expect(detectUnsafeCycles([a, b])).toHaveLength(0);
  });

  it("fluxo legado linear não tem ciclos", () => {
    const steps = [
      step({ id: "a", order: 1, nextStepId: "b" }),
      step({ id: "b", order: 2, nextStepId: null }),
    ];
    expect(detectUnsafeCycles(steps)).toHaveLength(0);
  });
});

// ===== Auto-layout =====

describe("autoLayout", () => {
  it("distribui por camadas BFS de forma determinística", () => {
    const steps = [
      withEdges(step({ id: "a", order: 1 }), [
        edge("next", "b"),
        edge("alt", "c"),
      ]),
      step({ id: "b", order: 2 }),
      step({ id: "c", order: 3 }),
    ];
    const pos = autoLayout(steps);
    expect(pos.get("a")!.x).toBe(0);
    expect(pos.get("b")!.x).toBe(280);
    expect(pos.get("c")!.x).toBe(280);
    expect(pos.get("b")!.y).not.toBe(pos.get("c")!.y);
  });

  it("é determinístico", () => {
    const steps = [
      step({ id: "a", order: 1, nextStepId: "b" }),
      step({ id: "b", order: 2, nextStepId: "c" }),
      step({ id: "c", order: 3 }),
    ];
    const p1 = autoLayout(steps);
    const p2 = autoLayout(steps);
    expect(p1).toEqual(p2);
  });
});

// ===== Constantes =====

describe("constantes de proteção", () => {
  it("teto de passos por passagem é razoável", () => {
    expect(MAX_STEPS_PER_PASS).toBeGreaterThan(0);
    expect(MAX_STEPS_PER_PASS).toBeLessThan(1000);
  });
});
