import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  GitBranch,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Download,
  Copy,
  Search,
  CheckCircle2,
  Lock,
  ArrowRight,
  Sliders,
  Workflow,
  BookOpen,
  Share2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { ShareWorkspaceModal } from "@/components/workspace/ShareWorkspaceModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useAuthContext } from "@/context/AuthContext";
import { workflowApi } from "@/lib/workflowApi";
import type { CodingWorkflow, WorkflowTemplate } from "@/types/workflow";
import { cn } from "@/lib/utils";

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function WorkflowLibraryPage() {
  const navigate = useNavigate();
  const { session, activeWorkspace } = useAuthContext();
  const jwt = session?.access_token || "";
  const workspaceId = activeWorkspace?.id || "";

  const [activeTab, setActiveTab] = useState<"library" | "my_workflows" | "shared">("library");
  const [searchQuery, setSearchQuery] = useState("");
  const [workflows, setWorkflows] = useState<CodingWorkflow[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [importJson, setImportJson] = useState("");
  const [deleteWorkflowTarget, setDeleteWorkflowTarget] = useState<CodingWorkflow | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<WorkflowTemplate | null>(null);

  useEffect(() => {
    if (!jwt || !activeWorkspace?.id) return;
    const currentWorkspaceId = activeWorkspace.id;
    let active = true;
    Promise.all([
      workflowApi.list(jwt, currentWorkspaceId),
      workflowApi.listTemplates(jwt, currentWorkspaceId),
    ])
      .then(([workflowItems, templateItems]) => {
        if (!active) return;
        setWorkflows(workflowItems);
        setTemplates(templateItems);
        setTemplateId((current) => current || templateItems[0]?.id || "");
      })
      .catch((error) => {
        if (active) toast.error(error instanceof Error ? error.message : "Failed to load coding workflows");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [jwt, activeWorkspace?.id]);

  const createWorkflow = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !templateId) return;
    setCreating(true);
    try {
      const workflow = await workflowApi.create(
        { name: name.trim(), description: description.trim(), template_id: templateId },
        jwt,
        workspaceId
      );
      toast.success("Workflow draft created");
      setShowCreate(false);
      navigate(`/workflows/${workflow.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create workflow");
    } finally {
      setCreating(false);
    }
  };

  const deleteWorkflow = async () => {
    if (!deleteWorkflowTarget) return;
    try {
      await workflowApi.remove(deleteWorkflowTarget.id, jwt, workspaceId);
      setWorkflows((current) => current.filter((item) => item.id !== deleteWorkflowTarget.id));
      setDeleteWorkflowTarget(null);
      toast.success("Workflow deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete workflow");
    }
  };

  const duplicateWorkflow = async (workflow: CodingWorkflow) => {
    try {
      const copy = await workflowApi.duplicate(workflow.id, jwt, workspaceId);
      setWorkflows((current) => [copy, ...current]);
      toast.success("Workflow duplicated");
      navigate(`/workflows/${copy.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to duplicate workflow");
    }
  };

  const deleteTemplate = async () => {
    if (!deleteTemplateTarget) return;
    try {
      await workflowApi.removeTemplate(deleteTemplateTarget.id, jwt, workspaceId);
      setTemplates((current) => current.filter((item) => item.id !== deleteTemplateTarget.id));
      setDeleteTemplateTarget(null);
      toast.success("Template deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete template");
    }
  };

  const replicateAndEditTemplate = async (template: WorkflowTemplate) => {
    try {
      const workflow = await workflowApi.create(
        {
          name: `${template.name} (Copy)`,
          description: template.description || "Replicated from official library benchmark.",
          template_id: template.id,
        },
        jwt,
        workspaceId
      );
      toast.success(`Workflow created from ${template.name}`);
      navigate(`/workflows/${workflow.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to duplicate workflow");
    }
  };

  const exportTemplate = async (template: WorkflowTemplate) => {
    try {
      const fullTemplate = await workflowApi.exportTemplate(template.id, jwt, workspaceId);
      downloadJson(`${template.slug || template.id}.workflow-template.json`, fullTemplate);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export template");
    }
  };

  const exportWorkflow = (workflow: CodingWorkflow) => {
    try {
      const slug = workflow.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "workflow";
      downloadJson(`${slug}.workflow.json`, workflow);
      toast.success(`Exported ${workflow.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export workflow");
    }
  };

  const importTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    setImporting(true);
    try {
      const parsed = JSON.parse(importJson);
      const template = await workflowApi.importTemplate(
        {
          name: parsed.name || "Imported Workflow Template",
          description: parsed.description || "",
          category: parsed.category || "Imported",
          definition: parsed.definition || parsed,
        },
        jwt,
        workspaceId
      );
      setTemplates((current) => [template, ...current]);
      setImportJson("");
      setShowImport(false);
      toast.success("Template imported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import template JSON");
    } finally {
      setImporting(false);
    }
  };

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredWorkflows = workflows.filter(
    (w) =>
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <ThreadSidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header Bar */}
        <div className="bg-card border-b border-border px-8 py-6 shadow-xs">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase mb-1">
                <Workflow className="h-4 w-4 text-accent" />
                <span>Multi-Agent Workflow Pipelines</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Coding Workflows
              </h1>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                Chain prompts and deterministic evaluation rules into multi-step pipelines to automate empirical legislative analysis.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-border text-foreground hover:bg-muted text-xs gap-1.5 h-9 font-medium"
                onClick={() => navigate("/docs?tab=pipeline")}
              >
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                Pipeline Guide
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-border text-foreground hover:bg-muted text-xs gap-1.5 h-9 font-medium"
                onClick={() => setShowShareModal(true)}
              >
                <Users className="h-3.5 w-3.5 text-primary" />
                Share Workspace
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-border text-foreground hover:bg-muted text-xs gap-1.5 h-9 font-medium"
                onClick={() => setShowImport(true)}
              >
                <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                Import JSON
              </Button>
              <Button
                size="sm"
                className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs gap-1.5 h-9 font-medium shadow-xs"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="h-3.5 w-3.5 text-accent" />
                Create Workflow
              </Button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 max-w-7xl w-full mx-auto px-8 py-6 space-y-6">
          {/* Controls Bar: Search & DARE 3-Tab Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
            {/* 3 Tabs matching DARE */}
            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab("library")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
                  activeTab === "library"
                    ? "bg-card text-primary shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <BookOpen className="h-3.5 w-3.5 text-accent" />
                <span>Library</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground font-mono">
                  {templates.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("my_workflows")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
                  activeTab === "my_workflows"
                    ? "bg-card text-primary shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <GitBranch className="h-3.5 w-3.5 text-primary" />
                <span>My Workflows</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground font-mono">
                  {workflows.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("shared")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
                  activeTab === "shared"
                    ? "bg-card text-primary shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Shared With Me</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search workflows & templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-border bg-card text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* TAB 1: LIBRARY (Official Frozen Benchmarks) */}
          {activeTab === "library" && (
            <div className="space-y-6">
              {/* Featured Frozen Benchmark Card */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-xs relative overflow-hidden">
                <div className="absolute right-4 -top-8 w-40 h-40 bg-accent/10 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="space-y-2 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold tracking-wide uppercase flex items-center gap-1">
                        <Lock className="h-3 w-3 text-accent" />
                        Official Frozen Benchmark v1.0
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-accent/20 text-accent-foreground border border-accent/40 text-[10px] font-bold tracking-wide uppercase flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified Peer-Review Standard
                      </span>
                    </div>

                    <h2 className="text-xl font-bold text-foreground tracking-tight">
                      O'Halloran Administrative Delegation & Discretion Coder
                    </h2>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Deterministic 2-stage directed pipeline: Node 1 screens statutory text for administrative delegation (<code className="bg-muted px-1 py-0.5 rounded text-foreground font-mono">delegate_law</code>). If zero, Node 2 deterministically branches to set <code className="bg-muted px-1 py-0.5 rounded text-foreground font-mono">discretion_rank = 0</code> with zero LLM waste. If one, evaluates statutory discretion constraints on a 1–5 scale.
                    </p>

                    {/* Node Chaining Preview */}
                    <div className="pt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="px-2.5 py-1 rounded-lg bg-muted border border-border font-medium text-foreground">
                        1. Statute Ingestion
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 font-bold">
                        2. Delegation Screening
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="px-2.5 py-1 rounded-lg bg-accent/20 text-accent-foreground border border-accent/30 font-bold">
                        3. Branch Logic (delegate==1)
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="px-2.5 py-1 rounded-lg bg-accent-plum/15 text-accent-plum border border-accent-plum/30 font-bold">
                        4. Discretion Classifier (1–5)
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold gap-2 h-10 px-5 shadow-xs"
                      onClick={() => {
                        const standardTemplate = templates.find((t) =>
                          t.name.toLowerCase().includes("delegation")
                        ) || templates[0];
                        if (standardTemplate) {
                          void replicateAndEditTemplate(standardTemplate);
                        } else {
                          setShowCreate(true);
                        }
                      }}
                    >
                      <Sparkles className="h-4 w-4 text-accent" />
                      Replicate & Run
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-border text-foreground hover:bg-muted text-xs font-semibold gap-1.5 h-10 px-4"
                      onClick={() => {
                        const standardTemplate = templates.find((t) =>
                          t.name.toLowerCase().includes("delegation")
                        ) || templates[0];
                        if (standardTemplate) {
                          navigate(`/workflows/${standardTemplate.id}?type=template`);
                        }
                      }}
                    >
                      <Sliders className="h-3.5 w-3.5 text-stone-500" />
                      Inspect Graph
                    </Button>
                  </div>
                </div>
              </div>

              {/* Template Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-stone-900 tracking-tight">
                    All Reusable Templates ({filteredTemplates.length})
                  </h3>
                  <span className="text-xs text-stone-500">
                    Imported or seeded DB templates
                  </span>
                </div>

                {loading ? (
                  <div className="rounded-2xl border border-border bg-card py-16 text-center text-xs text-muted-foreground">
                    Loading workflow templates…
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center text-xs text-muted-foreground">
                    No matching templates found.
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredTemplates.map((template) => (
                      <Card
                        key={template.id}
                        className="rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between shadow-xs"
                        onClick={() => navigate(`/workflows/${template.id}?type=template`)}
                      >
                        <CardHeader className="pb-3 border-b border-border/50">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <CardTitle className="text-sm font-bold text-foreground">
                                {template.name}
                              </CardTitle>
                              <CardDescription className="text-xs text-muted-foreground line-clamp-2">
                                {template.description || "No description provided."}
                              </CardDescription>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold tracking-wider uppercase shrink-0">
                              {template.category}
                            </span>
                          </div>
                        </CardHeader>

                        <CardContent className="pt-3 pb-3 space-y-3">
                          <div className="flex flex-wrap gap-1">
                            {Array.from(new Set(template.definition.nodes.map((n) => n.kind))).map(
                              (kind) => (
                                <span
                                  key={kind}
                                  className="rounded-md bg-muted px-2 py-0.5 text-[9px] font-medium text-foreground uppercase"
                                >
                                  {kind.replace("_", " ")}
                                </span>
                              )
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
                            <span>{template.definition.nodes.length} nodes · rev {template.revision}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                title="Duplicate into Workflows"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void replicateAndEditTemplate(template);
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                title="Export JSON"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void exportTemplate(template);
                                }}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                title="Delete Template"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTemplateTarget(template);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: MY WORKFLOWS (Custom editable drafts) */}
          {activeTab === "my_workflows" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-foreground">Workspace Workflows</h2>
                  <p className="text-xs text-muted-foreground">
                    Draft and published workflow pipelines editable inside this workspace.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs gap-1.5 h-8 font-medium shadow-xs"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus className="h-3.5 w-3.5 text-accent" />
                  New Draft
                </Button>
              </div>

              {loading ? (
                <div className="rounded-2xl border border-border bg-card py-16 text-center text-xs text-muted-foreground">
                  Loading workspace workflows…
                </div>
              ) : filteredWorkflows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center space-y-3">
                  <Sparkles className="h-8 w-8 text-accent mx-auto" />
                  <h3 className="text-sm font-bold text-foreground">No custom workflows yet</h3>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Start by replicating the official O'Halloran template or create a new blank graph.
                  </p>
                  <Button
                    size="sm"
                    className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs"
                    onClick={() => setShowCreate(true)}
                  >
                    Create Workflow
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredWorkflows.map((workflow) => {
                    const kinds = new Set(workflow.definition.nodes.map((n) => n.kind));
                    return (
                      <Card
                        key={workflow.id}
                        className="rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between shadow-xs"
                        onClick={() => navigate(`/workflows/${workflow.id}`)}
                      >
                        <CardHeader className="pb-3 border-b border-border/50">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <CardTitle className="text-sm font-bold text-foreground">
                                {workflow.name}
                              </CardTitle>
                              <CardDescription className="text-xs text-muted-foreground line-clamp-2">
                                {workflow.description || "No description provided."}
                              </CardDescription>
                            </div>
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase shrink-0",
                                workflow.status === "published"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                  : "bg-accent/20 text-accent-foreground border border-accent/40"
                              )}
                            >
                              {workflow.status}
                            </span>
                          </div>
                        </CardHeader>

                        <CardContent className="pt-3 pb-3 space-y-3">
                          <div className="flex flex-wrap gap-1">
                            {Array.from(kinds).map((kind) => (
                              <span
                                key={kind}
                                className="rounded-md bg-muted px-2 py-0.5 text-[9px] font-medium text-foreground uppercase"
                              >
                                {kind.replace("_", " ")}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-[10px] text-stone-500">
                            <span>
                              {workflow.definition.nodes.length} nodes · v{workflow.latest_version || "draft"}
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-stone-500 hover:text-stone-900"
                                title="Duplicate"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void duplicateWorkflow(workflow);
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-stone-500 hover:text-red-600"
                                title="Delete"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteWorkflowTarget(workflow);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SHARED WITH ME */}
          {activeTab === "shared" && (
            <div className="space-y-6">
              {/* Workspace Collaboration Banner */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold tracking-wider uppercase">
                      Workspace Collaboration
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-foreground">
                    Shared Pipelines in {activeWorkspace?.name || "Workspace"}
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-xl">
                    Invite colleagues by university email or share a direct 1-click link. Collaborators can build, test, and run coding pipelines together.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowShareModal(true)}
                  className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold gap-1.5 h-9 shrink-0 shadow-xs"
                >
                  <Users className="h-3.5 w-3.5 text-accent" />
                  Invite & Manage Team
                </Button>
              </div>

              {filteredWorkflows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center space-y-4">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                    <Users className="h-6 w-6" />
                  </div>
                  <div className="space-y-1 max-w-md mx-auto">
                    <h3 className="text-sm font-bold text-foreground">
                      No Shared Workflows Yet
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Share this workspace with colleagues to collaborate on workflows, prompt codebooks, and empirical datasets.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => setShowShareModal(true)}
                      className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold gap-1.5 h-9 shadow-xs"
                    >
                      <Users className="h-3.5 w-3.5 text-accent" />
                      Invite Collaborator by Email / Link
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCreate(true)}
                      className="rounded-xl border-border text-foreground text-xs font-semibold h-9"
                    >
                      Create Workflow
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredWorkflows.map((workflow) => {
                    const kinds = new Set(workflow.definition.nodes.map((n) => n.kind));
                    return (
                      <Card
                        key={workflow.id}
                        className="rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between shadow-xs"
                        onClick={() => navigate(`/workflows/${workflow.id}`)}
                      >
                        <CardHeader className="pb-3 border-b border-border/50">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <CardTitle className="text-sm font-bold text-foreground">
                                {workflow.name}
                              </CardTitle>
                              <CardDescription className="text-xs text-muted-foreground line-clamp-2">
                                {workflow.description || "No description provided."}
                              </CardDescription>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase shrink-0 bg-primary/10 text-primary border border-primary/20">
                              Shared
                            </span>
                          </div>
                        </CardHeader>

                        <CardContent className="pt-3 pb-3 space-y-3">
                          <div className="flex flex-wrap gap-1">
                            {Array.from(kinds).map((kind) => (
                              <span
                                key={kind}
                                className="rounded-md bg-muted px-2 py-0.5 text-[9px] font-medium text-foreground uppercase"
                              >
                                {kind.replace("_", " ")}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
                            <span>
                              {workflow.definition.nodes.length} nodes · v{workflow.latest_version || "draft"}
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                title="Duplicate"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void duplicateWorkflow(workflow);
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                title="Export JSON"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void exportWorkflow(workflow);
                                }}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Create Workflow Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-xl rounded-2xl border-border bg-card text-foreground p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              Create New Workflow
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure a research pipeline draft by cloning a standard template.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4 pt-2" onSubmit={createWorkflow}>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Workflow Name
              </label>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 1990s Banking Act Delegation Analysis"
                className="mt-1 rounded-xl text-xs bg-muted"
                required
              />
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What research hypothesis or legislative corpus does this analyze?"
                rows={2}
                className="mt-1 w-full rounded-xl border border-border bg-muted p-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Starting Template
              </label>
              <div className="mt-1.5 grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setTemplateId(template.id)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all",
                      templateId === template.id
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <div className="font-bold text-xs text-foreground">{template.name}</div>
                    <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                      {template.description || `${template.definition.nodes.length} node template`}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl text-xs"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs"
                disabled={creating || !templateId}
              >
                {creating ? "Creating…" : "Create Draft"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Template Dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="sm:max-w-2xl rounded-2xl border-border bg-card text-foreground p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              Import Workflow Template JSON
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Paste an exported workflow template JSON definition to import into your workspace.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4 pt-2" onSubmit={importTemplate}>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              rows={12}
              placeholder='{"name":"Custom Pipeline","definition":{"schema_version":1,"nodes":[],"edges":[]}}'
              className="w-full rounded-xl border border-border bg-muted p-3 font-mono text-xs text-foreground outline-none focus:ring-2 focus:ring-primary"
              required
            />
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl text-xs"
                onClick={() => setShowImport(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs"
                disabled={importing || !importJson.trim()}
              >
                {importing ? "Importing…" : "Import Template"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={deleteWorkflowTarget !== null}
        onOpenChange={(open) => !open && setDeleteWorkflowTarget(null)}
        title="Delete coding workflow"
        description={`Delete “${deleteWorkflowTarget?.name || "this workflow"}”? Its published versions will also be removed.`}
        confirmText="Delete workflow"
        variant="destructive"
        onConfirm={deleteWorkflow}
      />
      <ConfirmationDialog
        open={deleteTemplateTarget !== null}
        onOpenChange={(open) => !open && setDeleteTemplateTarget(null)}
        title="Delete workflow template"
        description={`Delete “${deleteTemplateTarget?.name || "this template"}”? Existing workflow drafts copied from it are unaffected.`}
        confirmText="Delete template"
        variant="destructive"
        onConfirm={deleteTemplate}
      />

      <ShareWorkspaceModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
      />
    </div>
  );
}
