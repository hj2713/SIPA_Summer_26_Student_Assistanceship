import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Bot, Braces, CheckCircle2, FileInput, GitBranch, ListOrdered, TableProperties } from "lucide-react";

import { WorkflowNodeCard, type WorkflowCanvasNodeData } from "@/features/workflows/WorkflowNodeCard";
import type { WorkflowDefinition, WorkflowNodeDefinition } from "@/types/workflow";

type TraceItem = {
  node_id: string;
  name?: string;
  kind?: string;
  status?: string;
  outputs?: Record<string, unknown>;
  message?: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
};

type TraceGraphProps = {
  definition: WorkflowDefinition;
  trace: TraceItem[];
  context: Record<string, unknown>;
};

type CanvasNode = Node<WorkflowCanvasNodeData>;

const nodeTypes = { workflowNode: WorkflowNodeCard };

const KIND_LABELS: Record<string, string> = {
  document_input: "Document input",
  llm: "AI analysis",
  condition: "Condition",
  set_value: "Set value",
  validation: "Validation",
  output: "Dashboard output",
  rank_descriptor: "Rank descriptor",
};

function expressionFields(expression: unknown): string[] {
  if (!expression || typeof expression !== "object") return [];
  const expr = expression as Record<string, unknown>;
  const fields = typeof expr.field === "string" ? [expr.field] : [];
  for (const value of Object.values(expr)) {
    if (Array.isArray(value)) {
      for (const item of value) fields.push(...expressionFields(item));
    } else if (value && typeof value === "object") {
      fields.push(...expressionFields(value));
    }
  }
  return fields;
}

function sliceContextValue(value: unknown): unknown {
  if (typeof value === "string" && value.length > 1200) {
    return `${value.slice(0, 1200)}...`;
  }
  return value;
}

function getNodeInputs(node: WorkflowNodeDefinition, context: Record<string, unknown>): Record<string, unknown> {
  const config = node.config || {};
  const refs = new Set<string>();

  const inputFields = Array.isArray(config.input_fields) ? config.input_fields : [];
  for (const field of inputFields) {
    if (typeof field === "string") refs.add(field);
  }

  for (const field of expressionFields(config.expression)) refs.add(field);

  if (Array.isArray(config.rules)) {
    for (const rule of config.rules) {
      if (rule && typeof rule === "object") {
        for (const field of expressionFields((rule as Record<string, unknown>).expression)) refs.add(field);
      }
    }
  }

  if (node.kind === "output") {
    const outputFields = Array.isArray(config.fields) ? config.fields : [];
    for (const field of outputFields) {
      if (field && typeof field === "object") {
        const source = (field as Record<string, unknown>).source;
        if (typeof source === "string") refs.add(source);
      }
    }
  }

  const snapshot: Record<string, unknown> = {};
  for (const ref of refs) snapshot[ref] = sliceContextValue(context[ref]);

  if (node.kind === "llm") {
    const documentContext = typeof config.document_context === "string" ? config.document_context : "source_text";
    if (documentContext !== "none") {
      snapshot["document.text"] = sliceContextValue(context["document.text"]);
    }
  }

  return snapshot;
}

function getNodePathState(traceItem?: TraceItem): "active" | "inactive" | "pending" {
  if (!traceItem) return "pending";
  return traceItem.status === "skipped" ? "inactive" : "active";
}

function formatDuration(durationMs?: number | null): string {
  if (durationMs === undefined || durationMs === null) return "—";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)} s`;
}

function WorkflowTraceGraphInner({ definition, trace, context }: TraceGraphProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const traceById = useMemo(() => {
    const map = new Map<string, TraceItem>();
    for (const item of trace || []) map.set(item.node_id, item);
    return map;
  }, [trace]);

  const conditionResults = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const item of trace || []) {
      if (typeof item.outputs?.result === "boolean") {
        map.set(item.node_id, item.outputs.result);
      }
    }
    return map;
  }, [trace]);

  const nodes = useMemo<CanvasNode[]>(() => {
    return definition.nodes.map((node) => {
      const traceItem = traceById.get(node.id);
      return {
        id: node.id,
        type: "workflowNode",
        position: node.position,
        draggable: false,
        selectable: true,
        data: {
          definition: node,
          traceItem,
          pathState: getNodePathState(traceItem),
        },
      };
    });
  }, [definition.nodes, traceById]);

  const edges = useMemo<Edge[]>(() => {
    return definition.edges.map((edge) => {
      const sourceTrace = traceById.get(edge.source);
      const targetTrace = traceById.get(edge.target);
      let active = sourceTrace?.status === "completed" && targetTrace?.status === "completed";
      if (edge.source_handle === "true" || edge.source_handle === "false") {
        const result = conditionResults.get(edge.source);
        active = result !== undefined && ((edge.source_handle === "true" && result) || (edge.source_handle === "false" && !result));
      }

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.source_handle,
        targetHandle: edge.target_handle,
        label: edge.label,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: active,
        style: {
          stroke: active ? "#7c3aed" : "#cbd5e1",
          strokeWidth: active ? 2.5 : 1.2,
          opacity: active ? 1 : 0.65,
        },
        labelStyle: {
          fill: active ? "#6d28d9" : "#64748b",
          fontWeight: active ? 700 : 500,
          fontSize: 10,
        },
      };
    });
  }, [definition.edges, traceById, conditionResults]);

  useEffect(() => {
    if (!selectedNodeId && trace.length > 0) {
      setSelectedNodeId(trace[0]?.node_id || null);
    }
  }, [trace, selectedNodeId]);

  const selectedNode = definition.nodes.find((node) => node.id === selectedNodeId) || definition.nodes[0] || null;
  const selectedTrace = selectedNode ? traceById.get(selectedNode.id) : undefined;
  const selectedInputs = selectedNode ? getNodeInputs(selectedNode, context) : {};

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_360px]">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          Click any node to inspect its inputs, outputs, branch state, and error messages.
        </div>
        <div className="h-[560px]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            nodesConnectable={false}
            nodesDraggable={false}
            elementsSelectable
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            proOptions={{ hideAttribution: true }}
          >
            <MiniMap pannable zoomable />
            <Controls showInteractive={false} />
            <Background gap={18} size={1} />
          </ReactFlow>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Selected Node
              </div>
              <div className="text-sm font-semibold">{selectedNode?.name || "No node selected"}</div>
            </div>
            {selectedTrace?.status && (
              <span className="rounded-full border bg-muted px-2 py-1 text-[10px] font-bold uppercase">
                {selectedTrace.status}
              </span>
            )}
          </div>
          <div className="space-y-2 text-[11px] text-muted-foreground">
            <div>Kind: <span className="font-semibold text-foreground">{selectedNode ? (KIND_LABELS[selectedNode.kind] || selectedNode.kind) : "—"}</span></div>
            <div>Description: <span className="text-foreground">{selectedNode?.description || "—"}</span></div>
            <div>Duration: <span className="font-semibold text-foreground">{formatDuration(selectedTrace?.duration_ms)}</span></div>
            {selectedNode?.kind === "condition" && typeof selectedTrace?.outputs?.result === "boolean" && (
              <div>Branch chosen: <span className="font-semibold text-foreground">{selectedTrace.outputs.result ? "TRUE path" : "FALSE path"}</span></div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Node Inputs</div>
          {Object.keys(selectedInputs).length === 0 ? (
            <div className="text-[11px] text-muted-foreground">No explicit upstream inputs recorded for this node.</div>
          ) : (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/20 p-3 text-[11px]">
              {JSON.stringify(selectedInputs, null, 2)}
            </pre>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Node Outputs</div>
          {selectedTrace?.outputs && Object.keys(selectedTrace.outputs).length > 0 ? (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/20 p-3 text-[11px]">
              {JSON.stringify(selectedTrace.outputs, null, 2)}
            </pre>
          ) : (
            <div className="text-[11px] text-muted-foreground">No outputs recorded for this node.</div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Node Message / Error</div>
          <div className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/20 p-3 text-[11px]">
            {selectedTrace?.message || "No message logged for this node."}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkflowTraceGraph(props: TraceGraphProps) {
  return (
    <ReactFlowProvider>
      <WorkflowTraceGraphInner {...props} />
    </ReactFlowProvider>
  );
}

export const WORKFLOW_TRACE_ICONS = {
  document_input: FileInput,
  llm: Bot,
  condition: GitBranch,
  set_value: Braces,
  validation: CheckCircle2,
  output: TableProperties,
  rank_descriptor: ListOrdered,
};
