import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addEdge, applyEdgeChanges, applyNodeChanges, Background, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, type Connection, type Edge, type EdgeChange, type Node, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Bot, Braces, Check, CheckCircle2, FileInput, FlaskConical, GitBranch, Loader2, Play, Save, Send, TableProperties, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthContext } from "@/context/AuthContext";
import { WorkflowInspector } from "@/features/workflows/WorkflowInspector";
import { WorkflowNodeCard, type WorkflowCanvasNodeData } from "@/features/workflows/WorkflowNodeCard";
import { workflowApi } from "@/lib/workflowApi";
import type { CodingWorkflow, WorkflowDefinition, WorkflowEdgeDefinition, WorkflowNodeDefinition, WorkflowNodeKind, WorkflowValidationResult } from "@/types/workflow";

type CanvasNode = Node<WorkflowCanvasNodeData>;
const nodeTypes = { workflowNode: WorkflowNodeCard };

const PALETTE: Array<{ kind: WorkflowNodeKind; label: string; icon: typeof Bot; description: string }> = [
  { kind: "document_input", label: "Document input", icon: FileInput, description: "Controlled source text" },
  { kind: "llm", label: "AI analysis", icon: Bot, description: "Prompt + typed outputs" },
  { kind: "condition", label: "Condition", icon: GitBranch, description: "Branch on prior values" },
  { kind: "set_value", label: "Set value", icon: Braces, description: "Deterministic assignment" },
  { kind: "validation", label: "Validation", icon: CheckCircle2, description: "Cross-field consistency" },
  { kind: "output", label: "Dashboard output", icon: TableProperties, description: "Expose final fields" },
];

function toCanvasNodes(definition: WorkflowDefinition): CanvasNode[] {
  return definition.nodes.map((item) => ({ id: item.id, type: "workflowNode", position: item.position, data: { definition: item } }));
}
function toCanvasEdges(definition: WorkflowDefinition): Edge[] {
  return definition.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.source_handle, targetHandle: edge.target_handle, label: edge.label, markerEnd: { type: MarkerType.ArrowClosed }, animated: edge.source_handle === "true" || edge.source_handle === "false" }));
}

function WorkflowBuilderInner() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { session, activeWorkspace } = useAuthContext();
  const jwt = session?.access_token || "";
  const workspaceId = activeWorkspace?.id || "TEST";
  const [workflow, setWorkflow] = useState<CodingWorkflow | null>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState<WorkflowValidationResult | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [changelog, setChangelog] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [testSource, setTestSource] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Awaited<ReturnType<typeof workflowApi.test>> | null>(null);

  useEffect(() => {
    if (!jwt || !id) return;
    workflowApi.get(id, jwt, workspaceId).then((data) => { setWorkflow(data); setNodes(toCanvasNodes(data.definition)); setEdges(toCanvasEdges(data.definition)); }).catch((error) => { toast.error(error.message); navigate("/workflows"); }).finally(() => setLoading(false));
  }, [id, jwt, workspaceId, navigate]);

  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => { setNodes((current) => applyNodeChanges(changes, current)); setDirty(true); }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => { setEdges((current) => applyEdgeChanges(changes, current)); setDirty(true); }, []);
  const onConnect = useCallback((connection: Connection) => { setEdges((current) => addEdge({ ...connection, id: `edge_${crypto.randomUUID()}`, label: connection.sourceHandle === "true" ? "True" : connection.sourceHandle === "false" ? "False" : undefined, markerEnd: { type: MarkerType.ArrowClosed } }, current)); setDirty(true); }, []);

  const definitionFromCanvas = (): WorkflowDefinition => ({
    schema_version: 1,
    nodes: nodes.map((node) => ({ ...node.data.definition, position: node.position })),
    edges: edges.map((edge): WorkflowEdgeDefinition => ({ id: edge.id, source: edge.source, target: edge.target, source_handle: edge.sourceHandle || undefined, target_handle: edge.targetHandle || undefined, label: typeof edge.label === "string" ? edge.label : undefined })),
    outputs: workflow?.definition.outputs || [],
    viewport: workflow?.definition.viewport || { x: 0, y: 0, zoom: 1 },
    metadata: workflow?.definition.metadata || {},
  });

  const save = async () => {
    if (!workflow) return null;
    setSaving(true);
    try {
      const updated = await workflowApi.update(workflow.id, { name: workflow.name, description: workflow.description, definition: definitionFromCanvas(), revision: workflow.revision }, jwt, workspaceId);
      setWorkflow(updated); setDirty(false); toast.success("Workflow draft saved"); return updated;
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to save workflow"); return null; }
    finally { setSaving(false); }
  };

  const validate = async () => {
    if (dirty && !(await save())) return;
    try { const result = await workflowApi.validate(id, jwt, workspaceId); setValidation(result); setShowValidation(true); if (result.valid) toast.success("Workflow is valid"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Validation failed"); }
  };

  const publish = async () => {
    if (dirty && !(await save())) return;
    setPublishing(true);
    try { const version = await workflowApi.publish(id, changelog, jwt, workspaceId); const refreshed = await workflowApi.get(id, jwt, workspaceId); setWorkflow(refreshed); setShowPublish(false); setChangelog(""); toast.success(`Published workflow version ${version.version}`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Publishing failed"); }
    finally { setPublishing(false); }
  };

  const runTest = async () => {
    if (!testSource.trim()) return;
    if (dirty && !(await save())) return;
    setTesting(true);
    setTestResult(null);
    try { setTestResult(await workflowApi.test(id, testSource.trim(), jwt, workspaceId)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Workflow test failed"); }
    finally { setTesting(false); }
  };

  const runFileTest = async (file: File | null | undefined) => {
    if (!file) return;
    if (dirty && !(await save())) return;
    setTesting(true);
    setTestResult(null);
    try { setTestResult(await workflowApi.testFile(id, file, jwt, workspaceId)); toast.success(`Tested ${file.name}`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Workflow file test failed"); }
    finally { setTesting(false); }
  };

  const addNode = (kind: WorkflowNodeKind) => {
    const baseId = `${kind}_${nodes.length + 1}`;
    let idPart = baseId;
    let suffix = 2;
    while (nodes.some((node) => node.id === idPart)) idPart = `${baseId}_${suffix++}`;
    const meta = PALETTE.find((item) => item.kind === kind)!;
    const config: Record<string, unknown> = kind === "llm" ? { document_context: "source_text", instructions: "", input_fields: [], outputs: [] } : kind === "condition" ? { expression: { op: "eq", left: { field: "" }, right: { literal: false } } } : kind === "set_value" ? { assignments: [] } : kind === "document_input" ? { source_policy: "campaign_source" } : kind === "output" ? { fields: [] } : { rules: [] };
    const definition: WorkflowNodeDefinition = { id: idPart, kind, name: meta.label, description: meta.description, position: { x: 360 + (nodes.length % 3) * 80, y: 160 + (nodes.length % 5) * 90 }, config };
    setNodes((current) => [...current, { id: idPart, type: "workflowNode", position: definition.position, data: { definition } }]); setSelectedNodeId(idPart); setDirty(true);
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
    const outputs = (node.data.definition.config.outputs as Array<{ key: string }> | undefined) || [];
    const assignments = (node.data.definition.config.assignments as Array<{ field: string }> | undefined) || [];
    return [...outputs.map((output) => `${node.id}.${output.key}`), ...assignments.map((assignment) => assignment.field)].filter(Boolean);
    });
  }, [nodes, edges, selectedNodeId]);

  const changeSelected = (definition: WorkflowNodeDefinition) => { setNodes((current) => current.map((node) => node.id === definition.id ? { ...node, data: { definition } } : node)); setDirty(true); };
  const deleteSelected = () => { if (!selectedNodeId) return; setNodes((current) => current.filter((node) => node.id !== selectedNodeId)); setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId)); setSelectedNodeId(null); setDirty(true); };

  if (loading || !workflow) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-4">
        <div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon-sm" onClick={() => navigate("/workflows")}><ArrowLeft size={16} /></Button><div className="min-w-0"><div className="flex items-center gap-2"><input value={workflow.name} onChange={(event) => { setWorkflow({ ...workflow, name: event.target.value }); setDirty(true); }} className="min-w-0 max-w-lg bg-transparent text-sm font-bold outline-none" /><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${workflow.status === "published" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>{workflow.status}{workflow.latest_version ? ` · v${workflow.latest_version}` : ""}</span></div><p className="truncate text-[10px] text-muted-foreground">Reusable research method · campaigns are not connected yet</p></div></div>
        <div className="flex items-center gap-2"><span className="mr-1 text-[10px] text-muted-foreground">{dirty ? "Unsaved changes" : "All changes saved"}</span><Button variant="outline" onClick={() => setShowTest(true)}><FlaskConical size={14} /> Test</Button><Button variant="outline" onClick={() => void validate()}><Check size={14} /> Validate</Button><Button variant="outline" disabled={saving || !dirty} onClick={() => void save()}>{saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Save draft</Button><Button onClick={() => setShowPublish(true)}><Send size={14} /> Publish</Button></div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 overflow-y-auto border-r bg-card p-3"><p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Add workflow step</p><div className="space-y-1">{PALETTE.map(({ kind, label, icon: Icon, description }) => <button key={kind} onClick={() => addNode(kind)} className="flex w-full items-start gap-2.5 rounded-lg border border-transparent p-2.5 text-left hover:border-border hover:bg-muted/50"><span className="rounded-md bg-muted p-1.5"><Icon size={14} /></span><span><span className="block text-[11px] font-semibold">{label}</span><span className="block text-[9px] leading-relaxed text-muted-foreground">{description}</span></span></button>)}</div><div className="mt-4 rounded-lg border border-dashed p-3 text-[9px] leading-relaxed text-muted-foreground">Connect nodes from right to left. Conditions expose separate TRUE and FALSE paths. Save and validate before publishing.</div></aside>

        <div className="min-w-0 flex-1 bg-muted/15"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => setSelectedNodeId(node.id)} onPaneClick={() => setSelectedNodeId(null)} fitView minZoom={0.25} maxZoom={1.5} deleteKeyCode={["Backspace", "Delete"]}><Background gap={20} size={1} /><Controls /><MiniMap pannable zoomable nodeStrokeWidth={2} /></ReactFlow></div>

        <WorkflowInspector node={selectedNode} availableFields={availableFields} onChange={changeSelected} onDelete={deleteSelected} onClose={() => setSelectedNodeId(null)} />
      </div>

      <Dialog open={showValidation} onOpenChange={setShowValidation}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2">{validation?.valid ? <CheckCircle2 className="text-emerald-600" /> : <TriangleAlert className="text-amber-600" />} Workflow validation</DialogTitle></DialogHeader><div className="flex gap-3 rounded-lg bg-muted/40 p-3 text-xs"><span className="font-semibold">{validation?.errors || 0} errors</span><span className="font-semibold">{validation?.warnings || 0} warnings</span></div><div className="max-h-[55vh] space-y-2 overflow-y-auto">{validation?.issues.length === 0 ? <div className="py-8 text-center text-sm text-emerald-600">This workflow is structurally valid and ready to publish.</div> : validation?.issues.map((issue, index) => <button key={`${issue.code}-${index}`} onClick={() => { if (issue.node_id) setSelectedNodeId(issue.node_id); setShowValidation(false); }} className={`w-full rounded-lg border p-3 text-left ${issue.severity === "error" ? "border-destructive/30 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5"}`}><div className="flex items-center gap-2"><span className="text-[9px] font-bold uppercase">{issue.severity}</span>{issue.node_id && <span className="font-mono text-[9px] text-muted-foreground">{issue.node_id}</span>}</div><p className="mt-1 text-xs">{issue.message}</p></button>)}</div></DialogContent></Dialog>

      <Dialog open={showPublish} onOpenChange={setShowPublish}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Publish immutable workflow version</DialogTitle></DialogHeader><p className="text-xs leading-relaxed text-muted-foreground">Publishing creates version {workflow.latest_version + 1}. Future campaigns will be able to pin this exact definition; later edits will create another draft.</p><textarea value={changelog} onChange={(event) => setChangelog(event.target.value)} rows={4} placeholder="What changed in this version?" className="w-full rounded-md border bg-background p-3 text-xs outline-none focus:ring-2 focus:ring-primary/30" /><div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={() => setShowPublish(false)}>Cancel</Button><Button disabled={publishing} onClick={() => void publish()}>{publishing ? <Loader2 className="animate-spin" /> : <Send />} Validate and publish</Button></div></DialogContent></Dialog>

      <Dialog open={showTest} onOpenChange={setShowTest}><DialogContent className="w-[94vw] sm:max-w-4xl max-h-[90vh] overflow-hidden"><DialogHeader><DialogTitle className="flex items-center gap-2"><FlaskConical className="text-primary" /> Test workflow draft</DialogTitle></DialogHeader><div className="grid min-h-0 gap-4 md:grid-cols-2"><div className="space-y-3"><p className="text-xs leading-relaxed text-muted-foreground">Paste law text or upload a law file. This executes the saved draft and may make real LLM calls for AI Analysis nodes; deterministic and skipped branches do not call the model.</p><label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-3 text-xs font-semibold hover:bg-muted/40"><Upload size={14} /> Upload law file for test<input type="file" accept=".txt,.md,.html,.pdf,.docx,text/plain,text/markdown,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" disabled={testing} onChange={(event) => { const file = event.target.files?.[0]; void runFileTest(file); event.currentTarget.value = ""; }} /></label><div className="flex items-center gap-2 text-[10px] uppercase text-muted-foreground"><span className="h-px flex-1 bg-border" /> or paste text <span className="h-px flex-1 bg-border" /></div><textarea value={testSource} onChange={(event) => setTestSource(event.target.value)} rows={15} placeholder="Paste a law file, CQ summary, or short test document…" className="w-full resize-none rounded-lg border bg-background p-3 text-xs leading-relaxed outline-none focus:ring-2 focus:ring-primary/30" /><Button className="w-full" disabled={testing || !testSource.trim()} onClick={() => void runTest()}>{testing ? <Loader2 className="animate-spin" /> : <Play />} Run pasted-text test</Button></div><div className="min-h-0 rounded-lg border bg-muted/20"><div className="border-b px-3 py-2"><p className="text-xs font-semibold">Execution trace</p></div><div className="max-h-[58vh] space-y-2 overflow-y-auto p-3">{!testResult ? <div className="py-16 text-center text-xs text-muted-foreground">The path, node outputs, hidden audit details, skipped branches, and final values will appear here.</div> : testResult.trace.map((item, index) => <div key={`${item.node_id}-${index}`} className={`rounded-lg border p-3 ${item.status === "skipped" ? "opacity-60" : "bg-card"}`}><div className="flex items-center justify-between gap-2"><div><span className="text-[9px] font-bold uppercase text-primary">{item.kind.replace("_", " ")}</span><p className="text-xs font-semibold">{item.name}</p></div><span className={`rounded px-2 py-1 text-[9px] font-bold uppercase ${item.status === "completed" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{item.status}</span></div>{item.message && <p className="mt-2 text-[10px] text-muted-foreground">{item.message}</p>}<pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted/60 p-2 text-[9px]">{JSON.stringify(item.outputs, null, 2)}</pre></div>)}</div>{testResult && <div className="border-t bg-card p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Final outputs</p><pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-[9px]">{JSON.stringify(testResult.outputs, null, 2)}</pre></div>}</div></div></DialogContent></Dialog>
    </div>
  );
}

export function WorkflowBuilderPage() { return <ReactFlowProvider><WorkflowBuilderInner /></ReactFlowProvider>; }
