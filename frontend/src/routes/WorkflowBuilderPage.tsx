import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { addEdge, applyEdgeChanges, applyNodeChanges, Background, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, type Connection, type Edge, type EdgeChange, type Node, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Bot, Braces, Check, CheckCircle2, FileInput, FlaskConical, GitBranch, ListOrdered, Loader2, Play, Save, Send, TableProperties, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthContext } from "@/context/AuthContext";
import { createDefaultDiscretionBuilder, ensureDiscretionBuilder, getPromptPreview } from "@/features/workflows/discretionBuilder";
import { WorkflowInspector } from "@/features/workflows/WorkflowInspector";
import { WorkflowNodeCard, type WorkflowCanvasNodeData } from "@/features/workflows/WorkflowNodeCard";
import { workflowApi, type WorkflowTestResult } from "@/lib/workflowApi";
import type { CodingWorkflow, DiscretionBuilderConfig, WorkflowBuilderSummary, WorkflowDefinition, WorkflowEdgeDefinition, WorkflowNodeDefinition, WorkflowNodeKind, WorkflowOutputField, WorkflowValidationResult } from "@/types/workflow";

type CanvasNode = Node<WorkflowCanvasNodeData>;
const nodeTypes = { workflowNode: WorkflowNodeCard };

const PALETTE: Array<{ kind: WorkflowNodeKind; label: string; icon: typeof Bot; description: string }> = [
  { kind: "document_input", label: "Document input", icon: FileInput, description: "Controlled source text" },
  { kind: "llm", label: "AI analysis", icon: Bot, description: "Prompt + typed outputs" },
  { kind: "condition", label: "Condition", icon: GitBranch, description: "Branch on prior values" },
  { kind: "set_value", label: "Set value", icon: Braces, description: "Deterministic assignment" },
  { kind: "validation", label: "Validation", icon: CheckCircle2, description: "Cross-field consistency" },
  { kind: "output", label: "Dashboard output", icon: TableProperties, description: "Expose final fields" },
  { kind: "rank_descriptor", label: "Rank descriptor", icon: ListOrdered, description: "System prompt for one rank" },
];

function toCanvasNodes(definition: WorkflowDefinition): CanvasNode[] {
  return definition.nodes.map((item) => ({ id: item.id, type: "workflowNode", position: item.position, data: { definition: item } }));
}
function toCanvasEdges(definition: WorkflowDefinition): Edge[] {
  return definition.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.source_handle, targetHandle: edge.target_handle, label: edge.label, markerEnd: { type: MarkerType.ArrowClosed }, animated: edge.source_handle === "true" || edge.source_handle === "false" }));
}

function getDiscretionBuilder(definition: WorkflowDefinition | null | undefined): DiscretionBuilderConfig | null {
  const builder = definition?.metadata?.builder;
  if (!builder || typeof builder !== "object" || (builder as DiscretionBuilderConfig).kind !== "discretion_workflow") return null;
  return builder as DiscretionBuilderConfig;
}

function getBuilderSummary(definition: WorkflowDefinition | null | undefined): WorkflowBuilderSummary | null {
  const summary = definition?.metadata?.builder_summary;
  if (!summary || typeof summary !== "object") return null;
  return summary as WorkflowBuilderSummary;
}

function relevantStages(builder: DiscretionBuilderConfig | null): string[] {
  if (!builder) return [];
  const byMode: Record<DiscretionBuilderConfig["mode"], string[]> = {
    cascade: ["delegation", "inventory", "decision", ...(builder.calibration_enabled ? ["calibration"] : [])],
    multiclass: ["delegation", "multiclass", ...(builder.calibration_enabled ? ["calibration"] : [])],
    binary: ["delegation", "binary_split", "low_rank", "high_rank", ...(builder.calibration_enabled ? ["calibration"] : [])],
  };
  return byMode[builder.mode];
}

function WorkflowBuilderInner() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isTemplate = searchParams.get("type") === "template";
  const { session, activeWorkspace } = useAuthContext();
  const jwt = session?.access_token || "";
  const workspaceId = activeWorkspace?.id || "TEST";
  const [workflow, setWorkflow] = useState<CodingWorkflow | null>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editorView, setEditorView] = useState<"builder" | "graph">("graph");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState<WorkflowValidationResult | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [changelog, setChangelog] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [testName, setTestName] = useState("");
  const [testSource, setTestSource] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Awaited<ReturnType<typeof workflowApi.test>> | null>(null);

  const hydrateWorkflow = useCallback((data: CodingWorkflow) => {
    const builder = getDiscretionBuilder(data.definition);
    const compiledDefinition = builder ? ensureDiscretionBuilder(data.definition) : data.definition;
    const hydrated = { ...data, definition: compiledDefinition };
    setWorkflow(hydrated);
    setNodes(toCanvasNodes(compiledDefinition));
    setEdges(toCanvasEdges(compiledDefinition));
    setEditorView(builder ? "builder" : "graph");
  }, []);

  useEffect(() => {
    if (!jwt || !id) return;
    const loadPromise = isTemplate 
      ? workflowApi.getTemplate(id, jwt, workspaceId) 
      : workflowApi.get(id, jwt, workspaceId);
      
    loadPromise
      .then((data) => hydrateWorkflow(data as any))
      .catch((error) => { 
        toast.error(error.message); 
        navigate("/workflows"); 
      })
      .finally(() => setLoading(false));
  }, [id, jwt, workspaceId, navigate, isTemplate, hydrateWorkflow]);

  const builder = getDiscretionBuilder(workflow?.definition);
  const builderSummary = getBuilderSummary(workflow?.definition);
  const promptPreviews = useMemo(() => (workflow ? getPromptPreview(workflow.definition) : []), [workflow]);
  const [selectedPreviewId, setSelectedPreviewId] = useState<string>("");
  const activePreview = promptPreviews.find((item) => item.id === selectedPreviewId) || promptPreviews[0] || null;
  const graphReadOnly = Boolean(builder);

  useEffect(() => {
    if (!promptPreviews.length) {
      setSelectedPreviewId("");
      return;
    }
    setSelectedPreviewId((current) => (promptPreviews.some((item) => item.id === current) ? current : promptPreviews[0].id));
  }, [promptPreviews]);

  const syncDefinition = useCallback((nextDefinition: WorkflowDefinition) => {
    const compiled = getDiscretionBuilder(nextDefinition) ? ensureDiscretionBuilder(nextDefinition) : nextDefinition;
    setWorkflow((current) => (current ? { ...current, definition: compiled } : current));
    setNodes(toCanvasNodes(compiled));
    setEdges(toCanvasEdges(compiled));
    setDirty(true);
  }, []);

  const updateBuilder = useCallback((updater: (draft: DiscretionBuilderConfig) => void) => {
    if (!workflow) return;
    const currentBuilder = getDiscretionBuilder(workflow.definition) || createDefaultDiscretionBuilder();
    const nextBuilder = JSON.parse(JSON.stringify(currentBuilder)) as DiscretionBuilderConfig;
    updater(nextBuilder);
    syncDefinition({
      ...workflow.definition,
      metadata: {
        ...(workflow.definition.metadata || {}),
        builder: nextBuilder,
      },
    });
  }, [workflow, syncDefinition]);

  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    if (graphReadOnly) return;
    setNodes((current) => applyNodeChanges(changes, current));
    setDirty(true);
  }, [graphReadOnly]);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (graphReadOnly) return;
    setEdges((current) => applyEdgeChanges(changes, current));
    setDirty(true);
  }, [graphReadOnly]);
  const onConnect = useCallback((connection: Connection) => {
    if (graphReadOnly) return;
    setEdges((current) => addEdge({ ...connection, id: `edge_${crypto.randomUUID()}`, label: connection.sourceHandle === "true" ? "True" : connection.sourceHandle === "false" ? "False" : undefined, markerEnd: { type: MarkerType.ArrowClosed } }, current));
    setDirty(true);
  }, [graphReadOnly]);

  const definitionFromCanvas = (): WorkflowDefinition => {
    if (workflow && builder) {
      return workflow.definition;
    }
    return {
      schema_version: 1,
      nodes: nodes.map((node) => ({ ...node.data.definition, position: node.position })),
      edges: edges.map((edge): WorkflowEdgeDefinition => ({ id: edge.id, source: edge.source, target: edge.target, source_handle: edge.sourceHandle || undefined, target_handle: edge.targetHandle || undefined, label: typeof edge.label === "string" ? edge.label : undefined })),
      outputs: workflow?.definition.outputs || [],
      viewport: workflow?.definition.viewport || { x: 0, y: 0, zoom: 1 },
      metadata: workflow?.definition.metadata || {},
    };
  };

  const save = async () => {
    if (!workflow) return null;
    setSaving(true);
    try {
      const updated = isTemplate
        ? await workflowApi.updateTemplate(workflow.id, { name: workflow.name, description: workflow.description, definition: definitionFromCanvas(), revision: workflow.revision }, jwt, workspaceId)
        : await workflowApi.update(workflow.id, { name: workflow.name, description: workflow.description, definition: definitionFromCanvas(), revision: workflow.revision }, jwt, workspaceId);
      hydrateWorkflow(updated as any);
      setDirty(false); 
      toast.success(isTemplate ? "Workflow template saved" : "Workflow draft saved"); 
      return updated;
    } catch (error) { 
      toast.error(error instanceof Error ? error.message : "Failed to save workflow"); 
      return null; 
    } finally { 
      setSaving(false); 
    }
  };

  const validate = async () => {
    if (dirty && !(await save())) return;
    try { const result = await workflowApi.validate(id, jwt, workspaceId); setValidation(result); setShowValidation(true); if (result.valid) toast.success("Workflow is valid"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Validation failed"); }
  };

  const publish = async () => {
    if (dirty && !(await save())) return;
    setPublishing(true);
    try { const version = await workflowApi.publish(id, changelog, jwt, workspaceId); const refreshed = await workflowApi.get(id, jwt, workspaceId); hydrateWorkflow(refreshed as any); setShowPublish(false); setChangelog(""); toast.success(`Published workflow version ${version.version}`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Publishing failed"); }
    finally { setPublishing(false); }
  };

  const runTest = async () => {
    if (!testSource.trim()) return;
    if (!testName.trim()) { toast.error("Give this pasted-text run a name first."); return; }
    if (dirty && !(await save())) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await workflowApi.runTextToDashboard(id, { name: testName.trim(), source_text: testSource.trim() }, jwt, workspaceId);
      toast.success("Saved workflow result to dashboard");
      const row = result.row as { workflow_trace?: WorkflowTestResult["trace"]; coded_values?: Record<string, unknown>; workflow_context?: Record<string, unknown> } | null;
      setTestResult({ trace: row?.workflow_trace || [], outputs: row?.coded_values || {}, context: row?.workflow_context || {} });
    }
    catch (error) {
      const message = error instanceof Error ? error.message : "Workflow test failed";
      if (message.toLowerCase().includes("already exists") && window.confirm(`${message}\n\nRe-run and overwrite this dashboard row?`)) {
        try {
          const result = await workflowApi.runTextToDashboard(id, { name: testName.trim(), source_text: testSource.trim(), rerun: true }, jwt, workspaceId);
          const row = result.row as { workflow_trace?: WorkflowTestResult["trace"]; coded_values?: Record<string, unknown>; workflow_context?: Record<string, unknown> } | null;
          setTestResult({ trace: row?.workflow_trace || [], outputs: row?.coded_values || {}, context: row?.workflow_context || {} });
          toast.success("Re-ran workflow result");
        } catch (rerunError) {
          toast.error(rerunError instanceof Error ? rerunError.message : "Workflow rerun failed");
        }
      } else {
        toast.error(message);
      }
    }
    finally { setTesting(false); }
  };

  const runFileTest = async (file: File | null | undefined) => {
    if (!file) return;
    if (dirty && !(await save())) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await workflowApi.runFilesToDashboard(id, [file], jwt, workspaceId);
      const row = result.rows[0] as { workflow_trace?: WorkflowTestResult["trace"]; coded_values?: Record<string, unknown>; workflow_context?: Record<string, unknown> } | undefined;
      setTestResult({ trace: row?.workflow_trace || [], outputs: row?.coded_values || {}, context: row?.workflow_context || {} });
      if (result.skipped.includes(file.name)) toast.info(`${file.name} already exists in the results dashboard. Open the dashboard to rerun duplicates.`);
      else toast.success(`Saved ${file.name} to workflow dashboard`);
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "Workflow file test failed"); }
    finally { setTesting(false); }
  };

  const openResultsDashboard = async () => {
    if (dirty && !(await save())) return;
    try {
      const dashboard = await workflowApi.resultsDashboard(id, jwt, workspaceId, { source: "draft" });
      navigate(`/campaigns/${dashboard.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open results dashboard");
    }
  };

  const addNode = (kind: WorkflowNodeKind) => {
    if (graphReadOnly) return;
    const baseId = `${kind}_${nodes.length + 1}`;
    let idPart = baseId;
    let suffix = 2;
    while (nodes.some((node) => node.id === idPart)) idPart = `${baseId}_${suffix++}`;
    const meta = PALETTE.find((item) => item.kind === kind)!;
    const config: Record<string, unknown> = kind === "llm" ? { document_context: "source_text", instructions: "", input_fields: [], outputs: [] } : kind === "condition" ? { expression: { op: "eq", left: { field: "" }, right: { literal: false } } } : kind === "set_value" ? { assignments: [] } : kind === "document_input" ? { source_policy: "campaign_source" } : kind === "output" ? { fields: [] } : kind === "rank_descriptor" ? { rank: 1, instructions: "" } : { rules: [] };
    const definition: WorkflowNodeDefinition = { id: idPart, kind, name: meta.label, description: meta.description, position: { x: 360 + (nodes.length % 3) * 80, y: 160 + (nodes.length % 5) * 90 }, config };
    setNodes((current) => [...current, { id: idPart, type: "workflowNode", position: definition.position, data: { definition } }]); setSelectedNodeId(idPart); setDirty(true);
  };

  const enableStageBuilder = () => {
    if (!workflow) return;
    syncDefinition(ensureDiscretionBuilder(workflow.definition));
    setEditorView("builder");
  };

  const updateStageField = (stageKey: string, index: number, updater: (field: WorkflowOutputField) => WorkflowOutputField) => {
    updateBuilder((draft) => {
      const stage = draft.stages[stageKey];
      if (!stage) return;
      stage.outputs = stage.outputs.map((field, fieldIndex) => (fieldIndex === index ? updater(field) : field));
    });
  };

  const selectedNode = nodes.find((node) => node.id === selectedNodeId)?.data.definition || null;
  const availableFields = useMemo(() => {
    if (!selectedNodeId) return [];
    const ancestorIds = new Set<string>();
    const pending = edges.filter((edge) => edge.target === selectedNodeId).map((edge) => edge.source);
    while (pending.length) {
      const current = pending.pop()!;
      if (ancestorIds.has(current)) continue;
      ancestorIds.add(current);
      pending.push(...edges.filter((edge) => edge.target === current).map((edge) => edge.source));
    }
    return nodes.flatMap((node) => {
    if (!ancestorIds.has(node.id)) return [];
    // rank_descriptor nodes produce no outputs — skip them in the field list
    if (node.data.definition.kind === "rank_descriptor") return [];
    const outputs = (node.data.definition.config.outputs as Array<{ key: string }> | undefined) || [];
    const assignments = (node.data.definition.config.assignments as Array<{ field: string }> | undefined) || [];
    return [...outputs.map((output) => `${node.id}.${output.key}`), ...assignments.map((assignment) => assignment.field)].filter(Boolean);
    });
  }, [nodes, edges, selectedNodeId]);

  const changeSelected = (definition: WorkflowNodeDefinition) => {
    if (graphReadOnly) return;
    setNodes((current) => current.map((node) => node.id === definition.id ? { ...node, data: { definition } } : node));
    setDirty(true);
  };
  const deleteSelected = () => {
    if (graphReadOnly || !selectedNodeId) return;
    setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
    setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    setSelectedNodeId(null);
    setDirty(true);
  };

  if (loading || !workflow) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate("/workflows")}>
            <ArrowLeft size={16} />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <input 
                value={workflow.name} 
                onChange={(event) => { setWorkflow({ ...workflow, name: event.target.value }); setDirty(true); }} 
                className="min-w-0 max-w-lg bg-transparent text-sm font-bold outline-none" 
              />
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${isTemplate ? "bg-indigo-500/10 text-indigo-600" : workflow.status === "published" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                {isTemplate ? `template · rev ${workflow.revision}` : workflow.status}
                {!isTemplate && workflow.latest_version ? ` · v${workflow.latest_version}` : ""}
              </span>
            </div>
            <p className="truncate text-[10px] text-muted-foreground">
              {isTemplate ? "System Workflow Template · edits save directly to this template" : "Reusable research method · campaigns are not connected yet"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {builder ? (
            <div className="mr-2 flex items-center rounded-lg border bg-background p-1">
              <Button variant={editorView === "builder" ? "default" : "ghost"} size="sm" onClick={() => setEditorView("builder")}>
                Stage Builder
              </Button>
              <Button variant={editorView === "graph" ? "default" : "ghost"} size="sm" onClick={() => setEditorView("graph")}>
                Graph
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={enableStageBuilder}>
              <ListOrdered size={14} /> Enable Stage Builder
            </Button>
          )}
          <span className="mr-1 text-[10px] text-muted-foreground">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <Button variant="outline" onClick={() => void openResultsDashboard()}>
            <TableProperties size={14} /> Results Dashboard
          </Button>
          <Button variant="outline" onClick={() => setShowTest(true)}>
            <FlaskConical size={14} /> Test
          </Button>
          <Button variant="outline" onClick={() => void validate()}>
            <Check size={14} /> Validate
          </Button>
          <Button variant="outline" disabled={saving || !dirty} onClick={() => void save()}>
            {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} 
            {isTemplate ? "Save template" : "Save draft"}
          </Button>
          {!isTemplate && (
            <Button onClick={() => setShowPublish(true)}>
              <Send size={14} /> Publish
            </Button>
          )}
        </div>
      </header>

      {builder && editorView === "builder" ? (
        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-h-0 overflow-y-auto p-5">
            <div className="mb-4 rounded-xl border bg-card p-4">
              <p className="text-sm font-semibold">Stage-based workflow builder</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Edit the legal coding logic as explicit stages. The node graph remains available as a compiled preview in the Graph tab, but this builder is the source of truth for builder-backed workflows.
              </p>
            </div>

            <div className="space-y-4">
              <section className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">Workflow Settings</p>
                    <p className="mt-1 text-xs text-muted-foreground">Set the evaluation mode, source text policy, calibration behavior, and binary/cascade class labels.</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase text-primary">{builder.mode}</span>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Source Policy</label>
                    <select
                      value={builder.source_policy}
                      onChange={(event) => updateBuilder((draft) => { draft.source_policy = event.target.value as DiscretionBuilderConfig["source_policy"]; })}
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-xs"
                    >
                      <option value="campaign_source">Selected by campaign</option>
                      <option value="cq_summary">CQ summary only</option>
                      <option value="major_provisions">Major provisions</option>
                      <option value="full_text">Full statutory text</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Evaluation Mode</label>
                    <select
                      value={builder.mode}
                      onChange={(event) => updateBuilder((draft) => { draft.mode = event.target.value as DiscretionBuilderConfig["mode"]; })}
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-xs"
                    >
                      <option value="cascade">Cascade</option>
                      <option value="multiclass">Multiclass</option>
                      <option value="binary">Binary decomposition</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={builder.calibration_enabled}
                      onChange={(event) => updateBuilder((draft) => { draft.calibration_enabled = event.target.checked; })}
                    />
                    <span>Enable optional calibration review stage</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-muted-foreground">Lower Class Label</label>
                      <input
                        value={builder.label_overrides.binary_low_class}
                        onChange={(event) => updateBuilder((draft) => { draft.label_overrides.binary_low_class = event.target.value; })}
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-muted-foreground">Higher Class Label</label>
                      <input
                        value={builder.label_overrides.binary_high_class}
                        onChange={(event) => updateBuilder((draft) => { draft.label_overrides.binary_high_class = event.target.value; })}
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {relevantStages(builder).map((stageKey) => {
                const stage = builder.stages[stageKey];
                return (
                  <section key={stageKey} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{stage.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{stageKey.replaceAll("_", " ")}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setSelectedPreviewId(stageKey === "delegation" ? "law_delegation" : stageKey === "inventory" ? "discretion_inventory" : stageKey === "decision" ? "discretion_decision" : stageKey === "multiclass" ? "discretion_analysis" : stageKey === "binary_split" ? "binary_split" : stageKey === "low_rank" ? "low_rank_classifier" : stageKey === "high_rank" ? "high_rank_classifier" : "recalibration_review")}>
                        Preview Prompt
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="space-y-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-muted-foreground">Purpose</label>
                          <textarea
                            value={stage.purpose}
                            onChange={(event) => updateBuilder((draft) => { draft.stages[stageKey].purpose = event.target.value; })}
                            rows={3}
                            className="mt-1 w-full rounded-md border bg-background p-3 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-muted-foreground">Prompt Text</label>
                          <textarea
                            value={stage.instructions}
                            onChange={(event) => updateBuilder((draft) => { draft.stages[stageKey].instructions = event.target.value; })}
                            rows={7}
                            className="mt-1 w-full rounded-md border bg-background p-3 text-xs leading-relaxed outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border bg-muted/15 p-3">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Generated Fields</p>
                        <div className="mt-2 space-y-2">
                          {stage.outputs.map((output, index) => (
                            <div key={`${stageKey}-${output.key}-${index}`} className="rounded-lg border bg-card p-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[10px] font-semibold">{output.key}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase ${output.visibility === "final" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                                  {output.visibility || "internal"}
                                </span>
                              </div>
                              <div className="mt-2 space-y-2">
                                <input
                                  value={output.label || ""}
                                  onChange={(event) => updateStageField(stageKey, index, (field) => ({ ...field, label: event.target.value }))}
                                  placeholder="Field label"
                                  className="w-full rounded-md border bg-background px-2 py-1.5 text-[10px] outline-none focus:ring-2 focus:ring-primary/30"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <select
                                    value={output.type}
                                    onChange={(event) => updateStageField(stageKey, index, (field) => ({ ...field, type: event.target.value }))}
                                    className="rounded-md border bg-background px-2 py-1.5 text-[10px]"
                                  >
                                    <option value="boolean">boolean</option>
                                    <option value="integer">integer</option>
                                    <option value="decimal">decimal</option>
                                    <option value="string">string</option>
                                    <option value="enum">enum</option>
                                    <option value="object">object</option>
                                    <option value="list[string]">list[string]</option>
                                    <option value="evidence[]">evidence[]</option>
                                  </select>
                                  <select
                                    value={output.visibility || "internal"}
                                    onChange={(event) => updateStageField(stageKey, index, (field) => ({ ...field, visibility: event.target.value as "internal" | "final" }))}
                                    className="rounded-md border bg-background px-2 py-1.5 text-[10px]"
                                  >
                                    <option value="internal">internal trace field</option>
                                    <option value="final">final campaign field</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <aside className="min-h-0 overflow-y-auto border-l bg-card p-5">
            <section className="rounded-xl border bg-muted/15 p-4">
              <p className="text-sm font-semibold">Workflow Summary</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg border bg-card px-3 py-2">
                  <p className="font-bold uppercase text-muted-foreground">Mode</p>
                  <p className="mt-1">{builderSummary?.mode || builder.mode}</p>
                </div>
                <div className="rounded-lg border bg-card px-3 py-2">
                  <p className="font-bold uppercase text-muted-foreground">Calibration</p>
                  <p className="mt-1">{(builderSummary?.calibration_enabled ?? builder.calibration_enabled) ? "Enabled" : "Off"}</p>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Final Outputs</p>
                <div className="mt-2 space-y-2">
                  {(builderSummary?.final_outputs || []).map((item) => (
                    <div key={`${item.key}-${item.source}`} className="rounded-lg border bg-card px-3 py-2">
                      <p className="text-[11px] font-semibold">{item.label}</p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">{item.source}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Internal Audit Outputs</p>
                <div className="mt-2 space-y-2">
                  {(builderSummary?.internal_outputs || []).length === 0 ? (
                    <p className="rounded-lg border bg-card px-3 py-2 text-[11px] text-muted-foreground">No internal summary fields are currently exposed.</p>
                  ) : (
                    (builderSummary?.internal_outputs || []).map((item) => (
                      <div key={`${item.key}-${item.source}`} className="rounded-lg border bg-card px-3 py-2">
                        <p className="text-[11px] font-semibold">{item.label}</p>
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground">{item.source}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="mt-4 rounded-xl border bg-muted/15 p-4">
              <p className="text-sm font-semibold">Live Prompt Preview</p>
              <p className="mt-1 text-xs text-muted-foreground">This is the compiled prompt sent into the workflow node for the selected stage.</p>
              <div className="mt-3 space-y-2">
                {promptPreviews.map((preview) => (
                  <button
                    key={preview.id}
                    onClick={() => setSelectedPreviewId(preview.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${activePreview?.id === preview.id ? "border-primary bg-primary/5" : "bg-card"}`}
                  >
                    <p className="font-semibold">{preview.name}</p>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">{preview.id}</p>
                  </button>
                ))}
              </div>
              <pre className="mt-3 max-h-[50vh] overflow-auto rounded-lg border bg-card p-3 text-[10px] whitespace-pre-wrap leading-relaxed">
                {activePreview?.instructions || "Select a stage to preview the compiled prompt."}
              </pre>
            </section>
          </aside>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {!builder && (
            <aside className="w-56 shrink-0 overflow-y-auto border-r bg-card p-3">
              <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Add workflow step</p>
              <div className="space-y-1">
                {PALETTE.map(({ kind, label, icon: Icon, description }) => (
                  <button key={kind} onClick={() => addNode(kind)} className="flex w-full items-start gap-2.5 rounded-lg border border-transparent p-2.5 text-left hover:border-border hover:bg-muted/50">
                    <span className="rounded-md bg-muted p-1.5"><Icon size={14} /></span>
                    <span><span className="block text-[11px] font-semibold">{label}</span><span className="block text-[9px] leading-relaxed text-muted-foreground">{description}</span></span>
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-dashed p-3 text-[9px] leading-relaxed text-muted-foreground">Connect nodes from right to left. Conditions expose separate TRUE and FALSE paths. Save and validate before publishing.</div>
            </aside>
          )}

          <div className="min-w-0 flex-1 bg-muted/15">
            {builder && (
              <div className="border-b bg-card px-4 py-3 text-xs text-muted-foreground">
                The graph view is a compiled preview for this builder-backed workflow. Edit stages in the Stage Builder tab; use this tab to inspect execution flow and field lineage.
              </div>
            )}
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onPaneClick={() => setSelectedNodeId(null)}
              fitView
              minZoom={0.25}
              maxZoom={1.5}
              deleteKeyCode={builder ? null : ["Backspace", "Delete"]}
              nodesDraggable={!builder}
              nodesConnectable={!builder}
              elementsSelectable
            >
              <Background gap={20} size={1} />
              <Controls />
              <MiniMap pannable zoomable nodeStrokeWidth={2} />
            </ReactFlow>
          </div>

          {!builder && (
            <WorkflowInspector node={selectedNode} availableFields={availableFields} onChange={changeSelected} onDelete={deleteSelected} onClose={() => setSelectedNodeId(null)} />
          )}
        </div>
      )}

      <Dialog open={showValidation} onOpenChange={setShowValidation}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2">{validation?.valid ? <CheckCircle2 className="text-emerald-600" /> : <TriangleAlert className="text-amber-600" />} Workflow validation</DialogTitle></DialogHeader><div className="flex gap-3 rounded-lg bg-muted/40 p-3 text-xs"><span className="font-semibold">{validation?.errors || 0} errors</span><span className="font-semibold">{validation?.warnings || 0} warnings</span></div><div className="max-h-[55vh] space-y-2 overflow-y-auto">{validation?.issues.length === 0 ? <div className="py-8 text-center text-sm text-emerald-600">This workflow is structurally valid and ready to publish.</div> : validation?.issues.map((issue, index) => <button key={`${issue.code}-${index}`} onClick={() => { if (issue.node_id) setSelectedNodeId(issue.node_id); setShowValidation(false); }} className={`w-full rounded-lg border p-3 text-left ${issue.severity === "error" ? "border-destructive/30 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5"}`}><div className="flex items-center gap-2"><span className="text-[9px] font-bold uppercase">{issue.severity}</span>{issue.node_id && <span className="font-mono text-[9px] text-muted-foreground">{issue.node_id}</span>}</div><p className="mt-1 text-xs">{issue.message}</p></button>)}</div></DialogContent></Dialog>

      <Dialog open={showPublish} onOpenChange={setShowPublish}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Publish immutable workflow version</DialogTitle></DialogHeader><p className="text-xs leading-relaxed text-muted-foreground">Publishing creates version {workflow.latest_version + 1}. Future campaigns will be able to pin this exact definition; later edits will create another draft.</p><textarea value={changelog} onChange={(event) => setChangelog(event.target.value)} rows={4} placeholder="What changed in this version?" className="w-full rounded-md border bg-background p-3 text-xs outline-none focus:ring-2 focus:ring-primary/30" /><div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={() => setShowPublish(false)}>Cancel</Button><Button disabled={publishing} onClick={() => void publish()}>{publishing ? <Loader2 className="animate-spin" /> : <Send />} Validate and publish</Button></div></DialogContent></Dialog>

      <Dialog open={showTest} onOpenChange={setShowTest}><DialogContent className="w-[94vw] sm:max-w-4xl max-h-[90vh] overflow-hidden"><DialogHeader><DialogTitle className="flex items-center gap-2"><FlaskConical className="text-primary" /> Test workflow draft</DialogTitle></DialogHeader><div className="grid min-h-0 gap-4 md:grid-cols-2"><div className="space-y-3"><p className="text-xs leading-relaxed text-muted-foreground">Runs are saved to this workflow's Results Dashboard. Paste text requires a row name; uploaded files use the filename.</p><label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-3 text-xs font-semibold hover:bg-muted/40"><Upload size={14} /> Upload law file for test<input type="file" accept=".txt,.md,.html,.pdf,.docx,text/plain,text/markdown,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" disabled={testing} onChange={(event) => { const file = event.target.files?.[0]; void runFileTest(file); event.currentTarget.value = ""; }} /></label><div className="flex items-center gap-2 text-[10px] uppercase text-muted-foreground"><span className="h-px flex-1 bg-border" /> or paste text <span className="h-px flex-1 bg-border" /></div><input value={testName} onChange={(event) => setTestName(event.target.value)} placeholder="Required row name, e.g. PL92-221 Credit Unions" className="w-full rounded-lg border bg-background p-3 text-xs outline-none focus:ring-2 focus:ring-primary/30" /><textarea value={testSource} onChange={(event) => setTestSource(event.target.value)} rows={13} placeholder="Paste a law file, CQ summary, or short test document…" className="w-full resize-none rounded-lg border bg-background p-3 text-xs leading-relaxed outline-none focus:ring-2 focus:ring-primary/30" /><Button className="w-full" disabled={testing || !testSource.trim() || !testName.trim()} onClick={() => void runTest()}>{testing ? <Loader2 className="animate-spin" /> : <Play />} Run and save pasted-text test</Button></div><div className="min-h-0 rounded-lg border bg-muted/20"><div className="border-b px-3 py-2"><p className="text-xs font-semibold">Execution trace</p></div><div className="max-h-[58vh] space-y-2 overflow-y-auto p-3">{!testResult ? <div className="py-16 text-center text-xs text-muted-foreground">The saved row trace and final values will appear here.</div> : testResult.trace.map((item, index) => <div key={`${item.node_id}-${index}`} className={`rounded-lg border p-3 ${item.status === "skipped" ? "opacity-60" : "bg-card"}`}><div className="flex items-center justify-between gap-2"><div><span className="text-[9px] font-bold uppercase text-primary">{item.kind.replace("_", " ")}</span><p className="text-xs font-semibold">{item.name}</p></div><span className={`rounded px-2 py-1 text-[9px] font-bold uppercase ${item.status === "completed" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{item.status}</span></div>{item.message && <p className="mt-2 text-[10px] text-muted-foreground">{item.message}</p>}<pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted/60 p-2 text-[9px]">{JSON.stringify(item.outputs, null, 2)}</pre></div>)}</div>{testResult && <div className="border-t bg-card p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Final outputs</p><pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-[9px]">{JSON.stringify(testResult.outputs, null, 2)}</pre></div>}</div></div></DialogContent></Dialog>
    </div>
  );
}

export function WorkflowBuilderPage() { return <ReactFlowProvider><WorkflowBuilderInner /></ReactFlowProvider>; }
