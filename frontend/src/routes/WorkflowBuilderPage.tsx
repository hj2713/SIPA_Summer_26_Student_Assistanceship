import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  addEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Bot,
  Braces,
  CheckCircle2,
  Copy,
  FileInput,
  GitBranch,
  ListOrdered,
  Loader2,
  Rocket,
  Save,
  Send,
  TableProperties,
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/constants";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthContext } from "@/context/AuthContext";
import { ensureDiscretionBuilder } from "@/features/workflows/discretionBuilder";
import { WorkflowInspector } from "@/features/workflows/WorkflowInspector";
import { WorkflowNodeCard, type WorkflowCanvasNodeData } from "@/features/workflows/WorkflowNodeCard";
import { workflowApi } from "@/lib/workflowApi";
import type {
  CodingWorkflow,
  DiscretionBuilderConfig,
  WorkflowDefinition,
  WorkflowNodeDefinition,
  WorkflowNodeKind,
} from "@/types/workflow";

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
  return definition.nodes.map((item) => ({
    id: item.id,
    type: "workflowNode",
    position: item.position,
    data: { definition: item },
  }));
}

function toCanvasEdges(definition: WorkflowDefinition): Edge[] {
  return definition.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.source_handle,
    targetHandle: edge.target_handle,
    label: edge.label,
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: edge.source_handle === "true" || edge.source_handle === "false",
  }));
}

function getDiscretionBuilder(definition: WorkflowDefinition | null | undefined): DiscretionBuilderConfig | null {
  const builder = definition?.metadata?.builder;
  if (!builder || typeof builder !== "object" || (builder as DiscretionBuilderConfig).kind !== "discretion_workflow")
    return null;
  return builder as DiscretionBuilderConfig;
}

function WorkflowBuilderPageInner() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isTemplate = searchParams.get("type") === "template";
  const { session, activeWorkspace } = useAuthContext();
  const jwt = session?.access_token || "";
  const workspaceId = activeWorkspace?.id || "";

  const [workflow, setWorkflow] = useState<CodingWorkflow | null>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [changelog, setChangelog] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [launchingCampaign, setLaunchingCampaign] = useState(false);

  const duplicateAndEdit = async () => {
    if (!workflow) return;
    setDuplicating(true);
    try {
      const copy = await workflowApi.create(
        {
          name: `${workflow.name} (Custom)`,
          description: workflow.description || "Customized from official frozen benchmark.",
          template_id: workflow.id,
        },
        jwt,
        workspaceId,
      );
      toast.success("Created editable copy in My Workflows");
      navigate(`/workflows/${copy.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to duplicate workflow");
    } finally {
      setDuplicating(false);
    }
  };

  const launchCampaignFromTemplate = async () => {
    if (!workflow || !id) return;
    setLaunchingCampaign(true);
    toast.info("Preparing turnkey campaign: replicating benchmark & publishing v1...", { duration: 3000 });
    try {
      const copy = await workflowApi.create(
        {
          name: `${workflow.name} (Custom)`,
          description: workflow.description || "Replicated from official library benchmark.",
          template_id: id,
        },
        jwt,
        workspaceId
      );
      await workflowApi.publish(copy.id, "Turnkey benchmark replication", jwt, workspaceId);
      const res = await fetch(`${API_BASE_URL}/api/dashboards?workspace_id=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          name: `${workflow.name} Evaluation`,
          description: `Turnkey empirical benchmark run using ${workflow.name}`,
          prompt: "Workflow evaluation benchmark run",
          model: "gemini-1.5-flash,gpt-4o-mini",
          dashboard_type: "model_comparison",
          campaign_flow: "Workflow Evaluation",
          workflow_id: copy.id,
          workflow_source: "published",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to create evaluation campaign");
      }
      const campaign = await res.json();
      toast.success("Turnkey campaign ready! Attach statutes and select models.");
      navigate(`/evaluation/${campaign.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to launch campaign");
    } finally {
      setLaunchingCampaign(false);
    }
  };

  const launchCampaignFromWorkflow = async () => {
    if (!workflow || !id) return;
    setLaunchingCampaign(true);
    try {
      // 1. If dirty, save first
      if (dirty && !(await save())) {
        setLaunchingCampaign(false);
        return;
      }
      // 2. If draft or no version yet, publish
      let workflowVersion = workflow.latest_version;
      if (!workflowVersion || workflow.status === "draft") {
        toast.info("Publishing workflow revision before launching campaign...", { duration: 2500 });
        const publishedVer = await workflowApi.publish(id, "Campaign release", jwt, workspaceId);
        workflowVersion = publishedVer.version;
      }
      // 3. Create campaign
      const res = await fetch(`${API_BASE_URL}/api/dashboards?workspace_id=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          name: `${workflow.name} Evaluation`,
          description: `Evaluation campaign using ${workflow.name} (v${workflowVersion})`,
          prompt: "Workflow evaluation benchmark run",
          model: "gemini-1.5-flash,gpt-4o-mini",
          dashboard_type: "model_comparison",
          campaign_flow: "Workflow Evaluation",
          workflow_id: id,
          workflow_source: "published",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to create evaluation campaign");
      }
      const campaign = await res.json();
      toast.success("Turnkey campaign ready! Attach statutes and select models.");
      navigate(`/evaluation/${campaign.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to launch campaign");
    } finally {
      setLaunchingCampaign(false);
    }
  };

  const hydrateWorkflow = useCallback((data: CodingWorkflow) => {
    const builder = getDiscretionBuilder(data.definition);
    const compiledDefinition = builder ? ensureDiscretionBuilder(data.definition) : data.definition;
    const hydrated = { ...data, definition: compiledDefinition };
    setWorkflow(hydrated);
    setNodes(toCanvasNodes(compiledDefinition));
    setEdges(toCanvasEdges(compiledDefinition));
  }, []);

  useEffect(() => {
    if (!jwt || !id || !workspaceId) return;
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
  const graphReadOnly = Boolean(builder) || isTemplate;

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      if (isTemplate) {
        setNodes((current) => applyNodeChanges(changes, current));
        return;
      }
      setNodes((current) => applyNodeChanges(changes, current));
      setDirty(true);
    },
    [isTemplate],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (graphReadOnly) return;
      setEdges((current) => applyEdgeChanges(changes, current));
      setDirty(true);
    },
    [graphReadOnly],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (graphReadOnly) return;
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: connection.sourceHandle === "true" || connection.sourceHandle === "false",
          },
          current,
        ),
      );
      setDirty(true);
    },
    [graphReadOnly],
  );

  const assembleDefinition = useCallback((): WorkflowDefinition => {
    const nextNodes: WorkflowNodeDefinition[] = nodes.map((node) => ({
      ...node.data.definition,
      id: node.id,
      position: node.position,
    }));
    const nextEdges = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      source_handle: edge.sourceHandle || undefined,
      target_handle: edge.targetHandle || undefined,
      label: typeof edge.label === "string" ? edge.label : undefined,
    }));
    return {
      schema_version: workflow?.definition.schema_version ?? 1,
      outputs: workflow?.definition.outputs ?? [],
      viewport: workflow?.definition.viewport ?? { x: 0, y: 0, zoom: 1 },
      metadata: workflow?.definition.metadata,
      nodes: nextNodes,
      edges: nextEdges,
    };
  }, [nodes, edges, workflow?.definition]);

  const save = async (): Promise<boolean> => {
    if (!workflow) return false;
    setSaving(true);
    const definition = assembleDefinition();
    try {
      if (isTemplate) {
        await workflowApi.updateTemplate(
          id,
          { name: workflow.name, definition, revision: workflow.revision },
          jwt,
          workspaceId,
        );
        toast.success("Saved workflow template");
      } else {
        const updated = await workflowApi.update(
          id,
          {
            name: workflow.name,
            description: workflow.description || "",
            definition,
            revision: workflow.revision,
          },
          jwt,
          workspaceId,
        );
        hydrateWorkflow(updated as any);
        toast.success("Saved workflow draft");
      }
      setDirty(false);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (dirty && !(await save())) return;
    setPublishing(true);
    try {
      const version = await workflowApi.publish(id, changelog, jwt, workspaceId);
      const refreshed = await workflowApi.get(id, jwt, workspaceId);
      hydrateWorkflow(refreshed as any);
      setShowPublish(false);
      setChangelog("");
      toast.success(`Published workflow version ${version.version}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publishing failed");
    } finally {
      setPublishing(false);
    }
  };

  const addNode = (kind: WorkflowNodeKind) => {
    if (graphReadOnly) return;
    const baseId = `${kind}_${nodes.length + 1}`;
    let idPart = baseId;
    let suffix = 2;
    while (nodes.some((node) => node.id === idPart)) idPart = `${baseId}_${suffix++}`;
    const meta = PALETTE.find((item) => item.kind === kind)!;
    const config: Record<string, unknown> =
      kind === "llm"
        ? { document_context: "source_text", instructions: "", input_fields: [], outputs: [] }
        : kind === "condition"
          ? { expression: { op: "eq", left: { field: "" }, right: { literal: false } } }
          : kind === "set_value"
            ? { assignments: [] }
            : kind === "document_input"
              ? { source_policy: "campaign_source" }
              : kind === "output"
                ? { fields: [] }
                : kind === "rank_descriptor"
                  ? { rank: 1, instructions: "" }
                  : { rules: [] };
    const definition: WorkflowNodeDefinition = {
      id: idPart,
      kind,
      name: meta.label,
      description: meta.description,
      position: { x: 360 + (nodes.length % 3) * 80, y: 160 + (nodes.length % 5) * 90 },
      config,
    };
    setNodes((current) => [
      ...current,
      { id: idPart, type: "workflowNode", position: definition.position, data: { definition } },
    ]);
    setSelectedNodeId(idPart);
    setDirty(true);
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
      if (node.data.definition.kind === "rank_descriptor") return [];
      const outputs = (node.data.definition.config.outputs as Array<{ key: string }> | undefined) || [];
      const assignments = (node.data.definition.config.assignments as Array<{ field: string }> | undefined) || [];
      return [...outputs.map((output) => `${node.id}.${output.key}`), ...assignments.map((assignment) => assignment.field)].filter(
        Boolean,
      );
    });
  }, [nodes, edges, selectedNodeId]);

  const changeSelected = (definition: WorkflowNodeDefinition) => {
    if (graphReadOnly) return;
    setNodes((current) => (current.map((node) => (node.id === definition.id ? { ...node, data: { definition } } : node))));
    setDirty(true);
  };

  const deleteSelected = () => {
    if (graphReadOnly || !selectedNodeId) return;
    setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
    setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    setSelectedNodeId(null);
    setDirty(true);
  };

  if (loading || !workflow) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/workflows")}>
            <ArrowLeft size={16} />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {isTemplate ? (
                <span className="min-w-0 max-w-lg text-sm font-bold text-foreground truncate">
                  {workflow.name}
                </span>
              ) : (
                <input
                  value={workflow.name}
                  onChange={(event) => {
                    setWorkflow({ ...workflow, name: event.target.value });
                    setDirty(true);
                  }}
                  className="min-w-0 max-w-lg bg-transparent text-sm font-bold outline-none text-foreground"
                />
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                  isTemplate
                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                    : workflow.status === "published"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-amber-500/10 text-amber-600"
                }`}
              >
                {isTemplate ? "Frozen Benchmark" : workflow.status}
                {!isTemplate && workflow.latest_version ? ` · v${workflow.latest_version}` : ""}
              </span>
            </div>
            <p className="truncate text-[10px] text-muted-foreground">
              {isTemplate
                ? "Official Frozen Benchmark · Read-only reference graph. Duplicate to customize."
                : "Reusable research method · evaluate across models in Campaigns"}
            </p>
          </div>
        </div>

        {/* Clean, Streamlined Header Actions */}
        <div className="flex items-center gap-2.5">
          {isTemplate ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={duplicating}
                onClick={() => void duplicateAndEdit()}
                className="h-8 gap-1.5 text-xs font-semibold rounded-lg shadow-xs"
              >
                {duplicating ? <Loader2 className="animate-spin" size={13} /> : <Copy size={13} />}
                Duplicate to Edit
              </Button>
              <Button
                size="sm"
                disabled={launchingCampaign}
                onClick={() => void launchCampaignFromTemplate()}
                className="h-8 gap-1.5 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
              >
                {launchingCampaign ? <Loader2 className="animate-spin" size={13} /> : <Rocket size={13} />}
                Run in Campaign
              </Button>
            </>
          ) : (
            <>
              <span className="text-[10px] font-medium text-muted-foreground mr-1">
                {dirty ? "Unsaved changes" : "All changes saved"}
              </span>

              <Button
                variant="outline"
                size="sm"
                disabled={saving || !dirty}
                onClick={() => void save()}
                className="h-8 gap-1.5 text-xs font-semibold rounded-lg"
              >
                {saving ? <Loader2 className="animate-spin" size={13} /> : <Save size={13} />}
                Save Draft
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPublish(true)}
                className="h-8 gap-1.5 text-xs font-semibold rounded-lg"
              >
                <Send size={13} /> Publish
              </Button>

              <Button
                size="sm"
                disabled={launchingCampaign}
                onClick={() => void launchCampaignFromWorkflow()}
                className="h-8 gap-1.5 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
              >
                {launchingCampaign ? <Loader2 className="animate-spin" size={13} /> : <Rocket size={13} />}
                Run in Campaign
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Visual Graph View - The ONLY and default view */}
      <div className="flex min-h-0 flex-1 relative overflow-hidden">
        {/* Node Palette (Only for non-template, custom workflows) */}
        {!isTemplate && !builder && !graphReadOnly && (
          <aside className="w-56 shrink-0 overflow-y-auto border-r bg-card p-3 shadow-xs z-10">
            <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Add Workflow Step
            </p>
            <div className="space-y-1">
              {PALETTE.map(({ kind, label, icon: Icon, description }) => (
                <button
                  key={kind}
                  onClick={() => addNode(kind)}
                  className="flex w-full items-start gap-2.5 rounded-lg border border-transparent p-2 text-left hover:border-border hover:bg-muted/50 transition-colors"
                >
                  <span className="rounded-md bg-muted p-1 text-primary">
                    <Icon size={13} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold text-foreground">{label}</span>
                    <span className="block text-[9px] leading-relaxed text-muted-foreground truncate">
                      {description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* ReactFlow Visual DAG Canvas */}
        <div className="min-w-0 flex-1 h-full relative bg-muted/10">
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
            deleteKeyCode={builder || isTemplate ? null : ["Backspace", "Delete"]}
            nodesDraggable={!builder && !isTemplate}
            nodesConnectable={!builder && !isTemplate}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={18} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeStrokeWidth={2} />
          </ReactFlow>
        </div>

        {/* Node Inspector Drawer on Selection */}
        {selectedNode && (
          <WorkflowInspector
            node={selectedNode}
            availableFields={availableFields}
            onChange={changeSelected}
            onDelete={isTemplate ? undefined : deleteSelected}
            onClose={() => setSelectedNodeId(null)}
            readOnly={isTemplate}
          />
        )}
      </div>

      {/* Publish Dialog */}
      <Dialog open={showPublish} onOpenChange={setShowPublish}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Publish immutable workflow version</DialogTitle>
          </DialogHeader>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Publishing creates version {(workflow.latest_version || 0) + 1}. Future campaigns will pin this
            exact definition; later edits will create another draft.
          </p>
          <textarea
            value={changelog}
            onChange={(event) => setChangelog(event.target.value)}
            rows={4}
            placeholder="What changed in this version?"
            className="w-full rounded-md border bg-background p-3 text-xs outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => setShowPublish(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={publishing} onClick={() => void publish()}>
              {publishing ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />} Validate and publish
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function WorkflowBuilderPage() {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderPageInner />
    </ReactFlowProvider>
  );
}
