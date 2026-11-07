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
} from "lucide-react";
import { toast } from "sonner";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
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
    <div className="flex h-screen bg-[#F7F3EE] text-stone-900 overflow-hidden">
      <ThreadSidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header Bar */}
        <div className="bg-white border-b border-stone-200 px-8 py-6 shadow-sm">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[#0B3B36] font-semibold text-xs tracking-wider uppercase mb-1">
                <Workflow className="h-4 w-4 text-[#E6AA4C]" />
                <span>Multi-Agent Workflow Pipelines</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-stone-900">
                Coding Workflows
              </h1>
              <p className="text-xs text-stone-500 mt-1 max-w-2xl">
                Chain prompts and deterministic evaluation rules into multi-step pipelines to automate empirical legislative analysis.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-stone-300 text-stone-700 hover:bg-stone-100 text-xs gap-1.5 h-9 font-medium"
                onClick={() => setShowImport(true)}
              >
                <Upload className="h-3.5 w-3.5 text-stone-500" />
                Import JSON
              </Button>
              <Button
                size="sm"
                className="rounded-xl bg-[#0B3B36] hover:bg-[#0B3B36]/90 text-white text-xs gap-1.5 h-9 font-medium shadow-sm"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="h-3.5 w-3.5 text-[#E6AA4C]" />
                Create Workflow
              </Button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 max-w-7xl w-full mx-auto px-8 py-6 space-y-6">
          {/* Controls Bar: Search & DARE 3-Tab Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
            {/* 3 Tabs matching DARE */}
            <div className="flex items-center gap-1 bg-stone-200/60 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab("library")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
                  activeTab === "library"
                    ? "bg-white text-[#0B3B36] shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                )}
              >
                <BookOpen className="h-3.5 w-3.5 text-[#E6AA4C]" />
                <span>Library</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-100 text-stone-600 font-mono">
                  {templates.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("my_workflows")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
                  activeTab === "my_workflows"
                    ? "bg-white text-[#0B3B36] shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                )}
              >
                <GitBranch className="h-3.5 w-3.5 text-[#0B3B36]" />
                <span>My Workflows</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-100 text-stone-600 font-mono">
                  {workflows.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("shared")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
                  activeTab === "shared"
                    ? "bg-white text-[#0B3B36] shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                )}
              >
                <Share2 className="h-3.5 w-3.5 text-stone-500" />
                <span>Shared With Me</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
              <input
                type="text"
                placeholder="Search workflows & templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-stone-200 bg-white text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#0B3B36]"
              />
            </div>
          </div>

          {/* TAB 1: LIBRARY (Official Frozen Benchmarks) */}
          {activeTab === "library" && (
            <div className="space-y-6">
              {/* Featured Frozen Benchmark Card */}
              <div className="rounded-2xl border-2 border-[#0B3B36]/20 bg-gradient-to-r from-white via-white to-[#F4ECE2] p-6 shadow-md relative overflow-hidden">
                <div className="absolute right-4 -top-8 w-40 h-40 bg-[#E6AA4C]/10 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="space-y-2 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-[#0B3B36] text-white text-[10px] font-bold tracking-wide uppercase flex items-center gap-1">
                        <Lock className="h-3 w-3 text-[#E6AA4C]" />
                        Official Frozen Benchmark v1.0
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-[#E6AA4C]/20 text-[#A26D19] border border-[#E6AA4C]/40 text-[10px] font-bold tracking-wide uppercase flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified Peer-Review Standard
                      </span>
                    </div>

                    <h2 className="text-xl font-bold text-stone-900 tracking-tight">
                      O'Halloran Administrative Delegation & Discretion Coder
                    </h2>

                    <p className="text-xs text-stone-600 leading-relaxed">
                      Deterministic 2-stage directed pipeline: Node 1 screens statutory text for administrative delegation (<code className="bg-stone-100 px-1 py-0.5 rounded text-stone-800 font-mono">delegate_law</code>). If zero, Node 2 deterministically branches to set <code className="bg-stone-100 px-1 py-0.5 rounded text-stone-800 font-mono">discretion_rank = 0</code> with zero LLM waste. If one, evaluates statutory discretion constraints on a 1–5 scale.
                    </p>

                    {/* Node Chaining Preview */}
                    <div className="pt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-700">
                      <span className="px-2.5 py-1 rounded-lg bg-stone-100 border border-stone-200 font-medium">
                        1. Statute Ingestion
                      </span>
                      <ArrowRight className="h-3 w-3 text-stone-400" />
                      <span className="px-2.5 py-1 rounded-lg bg-[#0B3B36]/10 text-[#0B3B36] border border-[#0B3B36]/20 font-bold">
                        2. Delegation Screening
                      </span>
                      <ArrowRight className="h-3 w-3 text-stone-400" />
                      <span className="px-2.5 py-1 rounded-lg bg-[#E6AA4C]/20 text-[#8C590E] border border-[#E6AA4C]/30 font-bold">
                        3. Branch Logic (delegate==1)
                      </span>
                      <ArrowRight className="h-3 w-3 text-stone-400" />
                      <span className="px-2.5 py-1 rounded-lg bg-[#785D7B]/15 text-[#5A415D] border border-[#785D7B]/30 font-bold">
                        4. Discretion Classifier (1–5)
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="rounded-xl bg-[#0B3B36] hover:bg-[#0B3B36]/90 text-white text-xs font-bold gap-2 h-10 px-5 shadow-sm"
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
                      <Sparkles className="h-4 w-4 text-[#E6AA4C]" />
                      Replicate & Run
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-stone-300 text-stone-700 hover:bg-stone-50 text-xs font-semibold gap-1.5 h-10 px-4"
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
                  <div className="rounded-2xl border border-stone-200 bg-white py-16 text-center text-xs text-stone-500">
                    Loading workflow templates…
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-center text-xs text-stone-500">
                    No matching templates found.
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredTemplates.map((template) => (
                      <Card
                        key={template.id}
                        className="rounded-2xl border border-stone-200 bg-white hover:border-[#0B3B36]/40 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                        onClick={() => navigate(`/workflows/${template.id}?type=template`)}
                      >
                        <CardHeader className="pb-3 border-b border-stone-100">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <CardTitle className="text-sm font-bold text-stone-900">
                                {template.name}
                              </CardTitle>
                              <CardDescription className="text-xs text-stone-500 line-clamp-2">
                                {template.description || "No description provided."}
                              </CardDescription>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-[#0B3B36]/10 text-[#0B3B36] text-[9px] font-bold tracking-wider uppercase shrink-0">
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
                                  className="rounded-md bg-stone-100 px-2 py-0.5 text-[9px] font-medium text-stone-600 uppercase"
                                >
                                  {kind.replace("_", " ")}
                                </span>
                              )
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-[10px] text-stone-500">
                            <span>{template.definition.nodes.length} nodes · rev {template.revision}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-stone-500 hover:text-stone-900"
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
                                className="h-7 w-7 p-0 text-stone-500 hover:text-stone-900"
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
                                className="h-7 w-7 p-0 text-stone-500 hover:text-red-600"
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
                  <h2 className="text-base font-bold text-stone-900">Workspace Workflows</h2>
                  <p className="text-xs text-stone-500">
                    Draft and published workflow pipelines editable inside this workspace.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="rounded-xl bg-[#0B3B36] hover:bg-[#0B3B36]/90 text-white text-xs gap-1.5 h-8 font-medium"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus className="h-3.5 w-3.5 text-[#E6AA4C]" />
                  New Draft
                </Button>
              </div>

              {loading ? (
                <div className="rounded-2xl border border-stone-200 bg-white py-16 text-center text-xs text-stone-500">
                  Loading workspace workflows…
                </div>
              ) : filteredWorkflows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-center space-y-3">
                  <Sparkles className="h-8 w-8 text-[#E6AA4C] mx-auto" />
                  <h3 className="text-sm font-bold text-stone-800">No custom workflows yet</h3>
                  <p className="text-xs text-stone-500 max-w-md mx-auto">
                    Start by replicating the official O'Halloran template or create a new blank graph.
                  </p>
                  <Button
                    size="sm"
                    className="rounded-xl bg-[#0B3B36] hover:bg-[#0B3B36]/90 text-white text-xs"
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
                        className="rounded-2xl border border-stone-200 bg-white hover:border-[#0B3B36]/40 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                        onClick={() => navigate(`/workflows/${workflow.id}`)}
                      >
                        <CardHeader className="pb-3 border-b border-stone-100">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <CardTitle className="text-sm font-bold text-stone-900">
                                {workflow.name}
                              </CardTitle>
                              <CardDescription className="text-xs text-stone-500 line-clamp-2">
                                {workflow.description || "No description provided."}
                              </CardDescription>
                            </div>
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase shrink-0",
                                workflow.status === "published"
                                  ? "bg-emerald-500/10 text-emerald-700"
                                  : "bg-[#E6AA4C]/20 text-[#A26D19]"
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
                                className="rounded-md bg-stone-100 px-2 py-0.5 text-[9px] font-medium text-stone-600 uppercase"
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
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-center space-y-3">
              <Share2 className="h-8 w-8 text-stone-400 mx-auto" />
              <h3 className="text-sm font-bold text-stone-800">No shared pipelines</h3>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                Workflows shared across your lab or invited collaborators will appear here.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Create Workflow Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-xl rounded-2xl border-stone-200 bg-white text-stone-900 p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-stone-900">
              Create New Workflow
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Configure a research pipeline draft by cloning a standard template.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4 pt-2" onSubmit={createWorkflow}>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
                Workflow Name
              </label>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 1990s Banking Act Delegation Analysis"
                className="mt-1 rounded-xl text-xs bg-stone-50"
                required
              />
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What research hypothesis or legislative corpus does this analyze?"
                rows={2}
                className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-stone-800 outline-none focus:ring-2 focus:ring-[#0B3B36]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
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
                        ? "border-[#0B3B36] bg-[#0B3B36]/5 ring-1 ring-[#0B3B36]"
                        : "border-stone-200 hover:bg-stone-50"
                    )}
                  >
                    <div className="font-bold text-xs text-stone-900">{template.name}</div>
                    <div className="text-[10px] text-stone-500 mt-1 line-clamp-2">
                      {template.description || `${template.definition.nodes.length} node template`}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
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
                className="rounded-xl bg-[#0B3B36] hover:bg-[#0B3B36]/90 text-white text-xs font-semibold"
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
        <DialogContent className="sm:max-w-2xl rounded-2xl border-stone-200 bg-white text-stone-900 p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-stone-900">
              Import Workflow Template JSON
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Paste an exported workflow template JSON definition to import into your workspace.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4 pt-2" onSubmit={importTemplate}>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              rows={12}
              placeholder='{"name":"Custom Pipeline","definition":{"schema_version":1,"nodes":[],"edges":[]}}'
              className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 font-mono text-xs text-stone-800 outline-none focus:ring-2 focus:ring-[#0B3B36]"
              required
            />
            <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
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
                className="rounded-xl bg-[#0B3B36] hover:bg-[#0B3B36]/90 text-white text-xs font-semibold"
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
    </div>
  );
}
