"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Connection,
  Edge,
  Node,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FlowNode } from "./FlowNode";

export interface GraphStep {
  id: string;
  type: string;
  label?: string | null;
  config: Record<string, any>;
  positionX?: number | null;
  positionY?: number | null;
}

export interface StepTypeDef {
  type: string;
  label: string;
  icon: any;
  colorLight: string;
  colorText: string;
}

interface FlowCanvasProps {
  steps: GraphStep[];
  stepTypes: StepTypeDef[];
  selectedStepId: string | null;
  onSelectStep: (id: string | null) => void;
  onAddStep: (type: string, x: number, y: number) => void;
  onMoveStep: (id: string, x: number, y: number) => void;
  onConnectEdge: (fromId: string, port: string, toId: string) => void;
  onRemoveEdge: (edgeId: string) => void;
}

const nodeTypes = { flow: FlowNode };

function FlowCanvasInner({
  steps,
  stepTypes,
  selectedStepId,
  onSelectStep,
  onAddStep,
  onMoveStep,
  onConnectEdge,
  onRemoveEdge,
}: FlowCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();

  const nodes: Node[] = useMemo(
    () =>
      steps.map((s) => ({
        id: s.id,
        type: "flow",
        position: { x: s.positionX ?? 0, y: s.positionY ?? 0 },
        data: {
          step: s,
          selected: s.id === selectedStepId,
          typeDef: stepTypes.find((t) => t.type === s.type),
        },
      })),
    [steps, selectedStepId, stepTypes]
  );

  const edges: Edge[] = useMemo(() => {
    const out: Edge[] = [];
    for (const s of steps) {
      const edgesList = Array.isArray(s.config?.outgoingEdges)
        ? (s.config.outgoingEdges as any[])
        : [];
      for (const e of edgesList) {
        if (!e.targetStepId) continue;
        out.push({
          id: e.id || `${s.id}:${e.port}`,
          source: s.id,
          target: e.targetStepId,
          sourceHandle: e.port,
          label: e.port.replace(/^route:/, ""),
          style: { stroke: "#94a3b8" },
        });
      }
    }
    return out;
  }, [steps]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const port = connection.sourceHandle || "next";
      onConnectEdge(connection.source, port, connection.target);
    },
    [onConnectEdge]
  );

  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      onMoveStep(node.id, node.position.x, node.position.y);
    },
    [onMoveStep]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/ezflow-type");
      if (!type) return;
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      onAddStep(type, position.x, position.y);
    },
    [screenToFlowPosition, onAddStep]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  return (
    <div className="w-full h-full" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_, node) => onSelectStep(node.id)}
        onPaneClick={() => onSelectStep(null)}
        onEdgesDelete={(deleted) =>
          deleted.forEach((e) => onRemoveEdge(e.id))
        }
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.25}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <Controls />
        <MiniMap pannable zoomable className="bg-card" />
      </ReactFlow>
    </div>
  );
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
