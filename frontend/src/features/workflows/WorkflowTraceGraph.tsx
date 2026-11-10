import { useMemo, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle,
  Bot,
  Braces,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  FileInput,
  GitBranch,
  ListOrdered,
  Sparkles,
  TableProperties,
  X,
} from "lucide-react";

import { WorkflowNodeCard, type WorkflowCanvasNodeData } from "@/features/workflows/WorkflowNodeCard";
import type { WorkflowDefinition, WorkflowNodeDefinition } from "@/types/workflow";
import { Button } from "@/components/ui/button";

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
  if (typeof value === "string" && value.length > 2000) {
    return `${value.slice(0, 2000)}... [truncated]`;
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
  // Starts with NO node selected by default so the graph canvas occupies 100% full width
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"outputs" | "inputs" | "error">("outputs");
  const [showRawJson, setShowRawJson] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, content: string) => {
    try {
      void navigator.clipboard.writeText(content);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // fallback
    }
  };

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
    return (definition.nodes || []).map((node) => {
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
    return (definition.edges || []).map((edge) => {
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

  // Selected node & data
  const selectedNode = (definition.nodes || []).find((node) => node.id === selectedNodeId) || null;
  const selectedTrace = selectedNode ? traceById.get(selectedNode.id) : undefined;
  const selectedInputs = selectedNode ? getNodeInputs(selectedNode, context) : {};

  // Hovered node & data (for thinking box)
  const hoveredNode = hoveredNodeId ? (definition.nodes || []).find((n) => n.id === hoveredNodeId) : null;
  const hoveredTrace = hoveredNode ? traceById.get(hoveredNode.id) : undefined;
  const hoveredInputs = hoveredNode ? getNodeInputs(hoveredNode, context) : {};

  return (
    <div className="relative flex flex-1 h-full w-full min-h-0 overflow-hidden bg-card">
      {/* Visual Canvas Area */}
      <div className="flex-1 h-full min-h-0 w-full relative flex flex-col overflow-hidden">
        {/* Instruction Sub-header Bar */}
        <div className="border-b bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground flex items-center justify-between shrink-0">
          <span className="flex items-center gap-2">
            <span>Click any node to inspect inputs &amp; outputs</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline text-primary/80 font-medium">Hover for thinking box preview</span>
          </span>
          {selectedNode && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedNodeId(null)}
              className="h-6 px-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              Hide Inspector (Full Graph)
            </Button>
          )}
        </div>

        {/* The ReactFlow Diagram */}
        <div className="flex-1 h-full min-h-0 w-full relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            nodesConnectable={false}
            nodesDraggable={false}
            elementsSelectable
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
              setActiveTab("outputs");
            }}
            onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
            onNodeMouseLeave={() => setHoveredNodeId(null)}
            onPaneClick={() => setSelectedNodeId(null)}
            proOptions={{ hideAttribution: true }}
          >
            <MiniMap pannable zoomable />
            <Controls showInteractive={false} />
            <Background gap={18} size={1} />
          </ReactFlow>

          {/* Floating "Thinking Box" HUD on Node Hover (when inspector is not open or inspecting different node) */}
          {hoveredNode && hoveredNodeId !== selectedNodeId && (
            <div className="pointer-events-none absolute top-4 left-4 z-40 w-96 max-w-[calc(100%-2rem)] rounded-xl border border-violet-500/30 bg-card/95 p-3.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2 mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0 animate-pulse" />
                  <span className="text-xs font-bold truncate text-foreground">{hoveredNode.name}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {hoveredTrace?.status && (
                    <span
                      className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                        hoveredTrace.status === "completed"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                          : hoveredTrace.status === "failed"
                            ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                            : hoveredTrace.status === "skipped"
                              ? "bg-slate-500/10 text-slate-500 border-slate-500/30"
                              : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {hoveredTrace.status}
                    </span>
                  )}
                  {hoveredTrace?.duration_ms !== undefined && hoveredTrace.duration_ms !== null && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      ⚡ {formatDuration(hoveredTrace.duration_ms)}
                    </span>
                  )}
                </div>
              </div>

              {/* Node Details Body */}
              <div className="space-y-2 text-[11px]">
                {hoveredNode.description && (
                  <p className="text-muted-foreground text-[10px] line-clamp-2">
                    {hoveredNode.description}
                  </p>
                )}

                {/* Condition Branch Outcome */}
                {hoveredNode.kind === "condition" && typeof hoveredTrace?.outputs?.result === "boolean" && (
                  <div className="flex items-center gap-1.5 font-semibold text-[10px] p-1.5 rounded-lg bg-muted/40 border border-border/30">
                    <span className="text-muted-foreground">Branch Decision:</span>
                    <span className={hoveredTrace.outputs.result ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                      {hoveredTrace.outputs.result ? "TRUE Branch Chosen" : "FALSE Branch Chosen"}
                    </span>
                  </div>
                )}

                {/* Inputs Preview */}
                {Object.keys(hoveredInputs).length > 0 && (
                  <div className="rounded-lg bg-muted/30 border border-border/40 p-2 space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Node Inputs ({Object.keys(hoveredInputs).length})
                    </span>
                    <div className="font-mono text-[10px] text-foreground truncate">
                      {Object.keys(hoveredInputs).slice(0, 3).join(", ")}
                      {Object.keys(hoveredInputs).length > 3 && ` (+${Object.keys(hoveredInputs).length - 3} more)`}
                    </div>
                  </div>
                )}

                {/* Outputs Preview */}
                {hoveredTrace?.outputs && Object.keys(hoveredTrace.outputs).length > 0 ? (
                  <div className="rounded-lg bg-violet-500/5 border border-violet-500/20 p-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400">
                      <span>Node Outputs Preview</span>
                      <span>{Object.keys(hoveredTrace.outputs).length} fields</span>
                    </div>
                    <div className="space-y-1 max-h-28 overflow-hidden text-[10px]">
                      {Object.entries(hoveredTrace.outputs).slice(0, 2).map(([k, v]) => (
                        <div key={k} className="flex items-start gap-1">
                          <span className="font-semibold text-foreground shrink-0">{k}:</span>
                          <span className="text-muted-foreground font-mono truncate">
                            {typeof v === "object" ? JSON.stringify(v) : String(v)}
                          </span>
                        </div>
                      ))}
                      {Object.keys(hoveredTrace.outputs).length > 2 && (
                        <div className="text-[9px] text-muted-foreground italic">
                          +{Object.keys(hoveredTrace.outputs).length - 2} additional output fields...
                        </div>
                      )}
                    </div>
                  </div>
                ) : hoveredTrace?.message ? (
                  <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2 text-[10px] text-rose-600">
                    {hoveredTrace.message}
                  </div>
                ) : null}

                {/* Tip */}
                <div className="pt-1 text-[9px] text-muted-foreground flex items-center justify-between border-t border-border/30">
                  <span>💡 Click node to lock &amp; inspect full outputs</span>
                  <span className="font-semibold text-primary">Click to inspect →</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Side Inspector Panel (Shown ONLY when a node is clicked) */}
      {selectedNode && (
        <div className="w-full sm:w-[380px] xl:w-[440px] border-l border-border bg-card flex flex-col h-full shrink-0 shadow-xl z-30 animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="p-3.5 border-b border-border flex items-center justify-between gap-3 shrink-0 bg-muted/10">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
                Node Inspector
              </div>
              <h3 className="text-sm font-bold truncate text-foreground">{selectedNode.name}</h3>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSelectedNodeId(null)}
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              title="Close Inspector (Full Graph View)"
            >
              <X size={15} />
            </Button>
          </div>

          {/* Meta Bar */}
          <div className="px-3.5 py-2.5 border-b border-border/60 bg-muted/20 flex flex-wrap items-center gap-2 text-[11px] shrink-0">
            <span className="font-semibold text-foreground">
              {KIND_LABELS[selectedNode.kind] || selectedNode.kind}
            </span>
            <span>•</span>
            {selectedTrace?.status && (
              <span
                className={`font-bold uppercase text-[9px] px-2 py-0.5 rounded-full border ${
                  selectedTrace.status === "completed"
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                    : selectedTrace.status === "failed"
                      ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                      : selectedTrace.status === "skipped"
                        ? "bg-slate-500/10 text-slate-500 border-slate-500/30"
                        : "bg-muted text-muted-foreground border-border"
                }`}
              >
                {selectedTrace.status}
              </span>
            )}
            {selectedTrace?.duration_ms !== undefined && selectedTrace.duration_ms !== null && (
              <>
                <span>•</span>
                <span className="font-mono text-muted-foreground">
                  ⚡ {formatDuration(selectedTrace.duration_ms)}
                </span>
              </>
            )}
          </div>

          {/* Condition Branch Notice */}
          {selectedNode.kind === "condition" && typeof selectedTrace?.outputs?.result === "boolean" && (
            <div className="px-3.5 py-2 border-b border-border text-xs flex items-center gap-2 bg-muted/30">
              <GitBranch size={13} className="text-primary" />
              <span className="text-muted-foreground">Decision:</span>
              <span className={`font-bold ${selectedTrace.outputs.result ? "text-emerald-600" : "text-rose-600"}`}>
                {selectedTrace.outputs.result ? "TRUE branch chosen" : "FALSE branch chosen"}
              </span>
            </div>
          )}

          {/* Tab Selector */}
          <div className="flex border-b border-border shrink-0 bg-muted/10 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("outputs")}
              className={`flex-1 py-2 font-bold border-b-2 text-center transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === "outputs"
                  ? "border-primary text-primary bg-background"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles size={12} />
              Outputs
              {selectedTrace?.outputs && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary">
                  {Object.keys(selectedTrace.outputs).length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("inputs")}
              className={`flex-1 py-2 font-bold border-b-2 text-center transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === "inputs"
                  ? "border-primary text-primary bg-background"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileInput size={12} />
              Inputs
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground">
                {Object.keys(selectedInputs).length}
              </span>
            </button>
            {(selectedTrace?.message || selectedNode.description) && (
              <button
                type="button"
                onClick={() => setActiveTab("error")}
                className={`flex-1 py-2 font-bold border-b-2 text-center transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === "error"
                    ? "border-primary text-primary bg-background"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {selectedTrace?.status === "failed" ? (
                  <AlertTriangle size={12} className="text-rose-500" />
                ) : (
                  <Code2 size={12} />
                )}
                Details
              </button>
            )}
          </div>

          {/* Tab Content - Generously Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === "outputs" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">Node Execution Results</span>
                  <div className="flex items-center gap-1.5">
                    {selectedTrace?.outputs && Object.keys(selectedTrace.outputs).length > 0 && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowRawJson(!showRawJson)}
                          className="h-6 px-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                        >
                          {showRawJson ? "Structured View" : "Raw JSON"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleCopy("outputs", JSON.stringify(selectedTrace.outputs, null, 2))
                          }
                          className="h-6 px-2 text-[10px] font-semibold gap-1"
                        >
                          {copiedKey === "outputs" ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                          {copiedKey === "outputs" ? "Copied" : "Copy Outputs"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {!selectedTrace?.outputs || Object.keys(selectedTrace.outputs).length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
                    No outputs recorded for this node.
                  </div>
                ) : showRawJson ? (
                  <pre className="whitespace-pre-wrap break-words rounded-xl bg-muted/30 border border-border/50 p-3 text-[11px] font-mono leading-relaxed">
                    {JSON.stringify(selectedTrace.outputs, null, 2)}
                  </pre>
                ) : (
                  <div className="space-y-2.5">
                    {Object.entries(selectedTrace.outputs).map(([key, val]) => (
                      <div key={key} className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-foreground font-mono">{key}</span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(key, typeof val === "object" ? JSON.stringify(val, null, 2) : String(val))
                            }
                            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            {copiedKey === key ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                            {copiedKey === key ? "Copied" : "Copy"}
                          </button>
                        </div>
                        {typeof val === "string" ? (
                          <div className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed font-sans bg-background/50 p-2.5 rounded-lg border border-border/30 max-h-96 overflow-y-auto">
                            {val}
                          </div>
                        ) : typeof val === "boolean" ? (
                          <span
                            className={`inline-block font-mono font-bold text-xs px-2 py-0.5 rounded ${
                              val ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
                            }`}
                          >
                            {String(val)}
                          </span>
                        ) : (
                          <pre className="whitespace-pre-wrap break-words rounded-lg bg-background/50 border border-border/30 p-2.5 text-[11px] font-mono leading-relaxed max-h-96 overflow-y-auto">
                            {JSON.stringify(val, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "inputs" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">Node Upstream Inputs</span>
                  {Object.keys(selectedInputs).length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleCopy("inputs", JSON.stringify(selectedInputs, null, 2))
                      }
                      className="h-6 px-2 text-[10px] font-semibold gap-1"
                    >
                      {copiedKey === "inputs" ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                      {copiedKey === "inputs" ? "Copied" : "Copy Inputs"}
                    </Button>
                  )}
                </div>

                {Object.keys(selectedInputs).length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
                    No explicit upstream inputs recorded for this node.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {Object.entries(selectedInputs).map(([key, val]) => (
                      <div key={key} className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-foreground font-mono">{key}</span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(key, typeof val === "object" ? JSON.stringify(val, null, 2) : String(val))
                            }
                            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            {copiedKey === key ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                            {copiedKey === key ? "Copied" : "Copy"}
                          </button>
                        </div>
                        <pre className="whitespace-pre-wrap break-words rounded-lg bg-background/50 border border-border/30 p-2.5 text-[11px] font-mono leading-relaxed max-h-80 overflow-y-auto">
                          {typeof val === "object" ? JSON.stringify(val, null, 2) : String(val)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "error" && (
              <div className="space-y-3">
                {selectedNode.description && (
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Description
                    </span>
                    <p className="text-xs leading-relaxed text-foreground">{selectedNode.description}</p>
                  </div>
                )}

                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Execution Log / Error Message
                  </span>
                  <div className="whitespace-pre-wrap break-words rounded-lg bg-background/50 border border-border/30 p-2.5 text-[11px] font-mono leading-relaxed max-h-80 overflow-y-auto text-foreground">
                    {selectedTrace?.message || "No execution message or error logged for this node."}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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
