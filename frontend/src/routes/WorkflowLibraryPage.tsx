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
  Sliders,
  Workflow,
  BookOpen,
  Share2,
  Users,
  FileInput,
  Layers,
  HelpCircle,
  Loader2,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { ShareWorkspaceModal } from "@/components/workspace/ShareWorkspaceModal";
import { TechniquesGuideModal } from "@/components/workflows/TechniquesGuideModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useAuthContext } from "@/context/AuthContext";
import { workflowApi } from "@/lib/workflowApi";
import type { CodingWorkflow, WorkflowTemplate } from "@/types/workflow";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/constants";

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
  const [showTechniquesGuide, setShowTechniquesGuide] = useState(false);
  const [techniquesGuideInitialStep, setTechniquesGuideInitialStep] = useState<1 | 2 | 3>(1);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [importJson, setImportJson] = useState("");
  const [deleteWorkflowTarget, setDeleteWorkflowTarget] = useState<CodingWorkflow | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<WorkflowTemplate | null>(null);
  const [replicateLoading, setReplicateLoading] = useState(false);

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
        const standardTpl =
          templateItems.find(
            (t) =>
              t.id === "2055d255-10db-426a-a215-fe6181b36ea7" ||
              t.slug === "professor_discretion_prompt_suite_detailed" ||
              t.slug.includes("detailed")
          ) || templateItems[0];
        setTemplateId((current) => current || standardTpl?.id || "");
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

  const replicateAndLaunchCampaign = async (template: WorkflowTemplate) => {
    setReplicateLoading(true);
    toast.info("Preparing turnkey campaign: duplicating workflow & publishing v1...", { duration: 3000 });
    try {
      // 1. Create a user-owned workflow from this library template
      const workflow = await workflowApi.create(
        {
          name: `${template.name} (Custom)`,
          description: template.description || "Replicated from official library benchmark.",
          template_id: template.id,
        },
        jwt,
        workspaceId
      );

      // 2. Publish revision 1 so it is a valid, immutable engine version for campaigns
      await workflowApi.publish(
        workflow.id,
        "Turnkey evaluation campaign deployment",
        jwt,
        workspaceId
      );

      // 3. Create the Evaluation Campaign dashboard linked to this published workflow
      const res = await fetch(`${API_BASE_URL}/api/dashboards?workspace_id=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          name: `${template.name} Evaluation`,
          description: `Turnkey empirical benchmark run using ${template.name}`,
          prompt: "Workflow evaluation benchmark run",
          model: "gemini-1.5-flash,gpt-4o-mini",
          dashboard_type: "model_comparison",
          campaign_flow: "Workflow Evaluation",
          workflow_id: workflow.id,
          workflow_source: "published",
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to create evaluation campaign");
      }

      const campaign = await res.json();
      toast.success("Turnkey campaign ready! Attach statutes and run your multi-model evaluation.");
      navigate(`/evaluation/${campaign.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to launch campaign");
    } finally {
      setReplicateLoading(false);
    }
  };

  const launchCampaignFromUserWorkflow = async (workflow: CodingWorkflow) => {
    setReplicateLoading(true);
    toast.info("Preparing campaign for this workflow...", { duration: 3000 });
    try {
      let workflowVersion = workflow.latest_version;
      if (!workflowVersion || workflow.status === "draft") {
        const publishedVer = await workflowApi.publish(workflow.id, "Campaign deployment", jwt, workspaceId);
        workflowVersion = publishedVer.version;
      }
      const res = await fetch(`${API_BASE_URL}/api/dashboards?workspace_id=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          name: `${workflow.name} Evaluation`,
          description: `Empirical evaluation run using ${workflow.name} (v${workflowVersion})`,
          prompt: "Workflow evaluation benchmark run",
          model: "gemini-1.5-flash,gpt-4o-mini",
          dashboard_type: "model_comparison",
          campaign_flow: "Workflow Evaluation",
          workflow_id: workflow.id,
          workflow_source: "published",
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to create campaign");
      }
      const campaign = await res.json();
      toast.success("Turnkey campaign ready! Attach statutes and select models.");
      navigate(`/evaluation/${campaign.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to launch campaign");
    } finally {
      setReplicateLoading(false);
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
              {/* Featured Visual Pipeline Card */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-xs relative overflow-hidden">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-5 border-b border-border/40">
                  <div className="space-y-1.5 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider">
                        Standard Multi-Step Suite · 3 Techniques
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
                      <GitBranch className="h-5 w-5 text-primary" />
                      Standard Delegation &amp; Discretion Suite
                    </h2>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Multi-step statutory coding pipeline executing three comparative evaluation techniques in parallel: Cascade Screening, M9 Multiclass, and B3 Binary Partitioning.
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-border text-foreground hover:bg-muted text-xs font-semibold gap-1.5 h-9 px-3.5"
                      onClick={() => {
                        setTechniquesGuideInitialStep(1);
                        setShowTechniquesGuide(true);
                      }}
                    >
                      <HelpCircle className="h-3.5 w-3.5 text-primary" />
                      Techniques Guide
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-border text-foreground hover:bg-muted text-xs font-semibold gap-1.5 h-9 px-4"
                      onClick={() => {
                        const standardTemplate =
                          templates.find(
                            (t) =>
                              t.id === "2055d255-10db-426a-a215-fe6181b36ea7" ||
                              t.slug === "professor_discretion_prompt_suite_detailed" ||
                              t.slug.includes("detailed")
                          ) ||
                          templates.find((t) => t.slug === "professor_discretion_prompt_suite") ||
                          templates.find(
                            (t) =>
                              t.name.toLowerCase().includes("discretion") ||
                              t.name.toLowerCase().includes("delegation")
                          ) ||
                          templates[0];
                        if (standardTemplate) {
                          navigate(`/workflows/${standardTemplate.id}?type=template`);
                        }
                      }}
                    >
                      <Sliders className="h-3.5 w-3.5 text-muted-foreground" />
                      Inspect Graph
                    </Button>
                    <Button
                      size="sm"
                      disabled={replicateLoading}
                      className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold gap-2 h-9 px-4 shadow-xs"
                      onClick={() => {
                        const standardTemplate =
                          templates.find(
                            (t) =>
                              t.id === "2055d255-10db-426a-a215-fe6181b36ea7" ||
                              t.slug === "professor_discretion_prompt_suite_detailed" ||
                              t.slug.includes("detailed")
                          ) ||
                          templates.find((t) => t.slug === "professor_discretion_prompt_suite") ||
                          templates.find(
                            (t) =>
                              t.name.toLowerCase().includes("discretion") ||
                              t.name.toLowerCase().includes("delegation")
                          ) ||
                          templates[0];
                        if (standardTemplate) {
                          void replicateAndLaunchCampaign(standardTemplate);
                        } else {
                          setShowCreate(true);
                        }
                      }}
                    >
                      {replicateLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 text-accent" />
                      )}
                      {replicateLoading ? "Launching Campaign…" : "Replicate & Run"}
                    </Button>
                  </div>
                </div>

                {/* Visual Pipeline Node Chain */}
                <div className="pt-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Shared Stage */}
                    <button
                      type="button"
                      onClick={() => {
                        setTechniquesGuideInitialStep(1);
                        setShowTechniquesGuide(true);
                      }}
                      className="rounded-xl border border-border/60 bg-muted/20 p-3.5 flex items-start gap-3 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-left group cursor-pointer"
                    >
                      <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <FileInput size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Shared Foundation</span>
                          <span className="text-[10px] text-muted-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 font-medium">Guide &rarr;</span>
                        </div>
                        <div className="text-xs font-bold text-foreground truncate">Statute &amp; Inventory</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">Ingestion, authority &amp; constraints</div>
                      </div>
                    </button>

                    {/* Technique 1 */}
                    <button
                      type="button"
                      onClick={() => {
                        setTechniquesGuideInitialStep(1);
                        setShowTechniquesGuide(true);
                      }}
                      className="rounded-xl border border-border/60 bg-muted/20 p-3.5 flex items-start gap-3 hover:border-violet-500/50 hover:bg-violet-500/5 transition-all text-left group cursor-pointer"
                    >
                      <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <Layers size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider block">Technique 1</span>
                          <span className="text-[10px] text-muted-foreground group-hover:text-violet-600 dark:group-hover:text-violet-400 font-medium">Explain &rarr;</span>
                        </div>
                        <div className="text-xs font-bold text-foreground truncate">Cascade Screen</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">Sequential threshold elimination</div>
                      </div>
                    </button>

                    {/* Technique 2 */}
                    <button
                      type="button"
                      onClick={() => {
                        setTechniquesGuideInitialStep(2);
                        setShowTechniquesGuide(true);
                      }}
                      className="rounded-xl border border-border/60 bg-muted/20 p-3.5 flex items-start gap-3 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all text-left group cursor-pointer"
                    >
                      <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <Sparkles size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">Technique 2</span>
                          <span className="text-[10px] text-muted-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 font-medium">Explain &rarr;</span>
                        </div>
                        <div className="text-xs font-bold text-foreground truncate">M9 Multiclass</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">Full-spectrum rank &amp; boundary</div>
                      </div>
                    </button>

                    {/* Technique 3 */}
                    <button
                      type="button"
                      onClick={() => {
                        setTechniquesGuideInitialStep(3);
                        setShowTechniquesGuide(true);
                      }}
                      className="rounded-xl border border-border/60 bg-muted/20 p-3.5 flex items-start gap-3 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-left group cursor-pointer"
                    >
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <GitBranch size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Technique 3</span>
                          <span className="text-[10px] text-muted-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 font-medium">Explain &rarr;</span>
                        </div>
                        <div className="text-xs font-bold text-foreground truncate">B3 Binary Split</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">Bounded vs agency partitioning</div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Educational Bridge: Workflow Blueprint -> Empirical Campaign */}
              <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 via-card to-primary/5 p-5 shadow-xs">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                      Research Concept &amp; Execution Model
                    </span>
                    <h3 className="text-sm font-bold text-foreground">
                      How Workflows and Campaigns Work Together
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Workflows define the coding logic; Campaigns attach the statutes and benchmark multiple AI models.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border/60 bg-card p-3.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <GitBranch size={13} />
                      </div>
                      <span className="text-xs font-bold text-foreground">1. Workflow (The Blueprint)</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      The directed acyclic graph (DAG) defining the screening gates, discretion rubrics, and structured output fields. Contains no specific files or models.
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-card p-3.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Rocket size={13} />
                      </div>
                      <span className="text-xs font-bold text-foreground">2. Turnkey Bridge (Replicate &amp; Run)</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Clicking "Replicate &amp; Run" clones the frozen blueprint into your workspace, publishes revision 1, and instantiates an active Evaluation Campaign.
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-card p-3.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <Layers size={13} />
                      </div>
                      <span className="text-xs font-bold text-foreground">3. Campaign (The Empirical Lab)</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Where statutes (PDF/TXT or Law Corpus) meet LLMs. Run evaluations, compare consensus &amp; Cohen's Kappa, and export replication datasets.
                    </p>
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

                          <div className="flex items-center justify-between pt-2.5 border-t border-border/50 text-[10px] text-muted-foreground">
                            <span>{template.definition.nodes.length} nodes · rev {template.revision}</span>
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                className="h-7 px-2.5 rounded-lg text-[11px] font-semibold bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shadow-xs"
                                title="Replicate template, publish v1, and launch evaluation campaign"
                                disabled={replicateLoading}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void replicateAndLaunchCampaign(template);
                                }}
                              >
                                <Rocket className="h-3 w-3 text-accent" />
                                Run Campaign
                              </Button>
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
                    Start by replicating the official Standard Discretion template or create a new blank graph.
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
                                className="h-7 w-7 p-0 text-primary hover:text-primary hover:bg-primary/10"
                                title="Launch Evaluation Campaign"
                                disabled={replicateLoading}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void launchCampaignFromUserWorkflow(workflow);
                                }}
                              >
                                <Rocket className="h-3.5 w-3.5" />
                              </Button>
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
                    Invite colleagues by email to collaborate on legislative coding pipelines, share empirical campaign results, and audit statutes together.
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

      <TechniquesGuideModal
        open={showTechniquesGuide}
        onOpenChange={setShowTechniquesGuide}
        initialStep={techniquesGuideInitialStep}
        onInspectGraph={() => {
          const standardTemplate =
            templates.find(
              (t) =>
                t.id === "2055d255-10db-426a-a215-fe6181b36ea7" ||
                t.slug === "professor_discretion_prompt_suite_detailed" ||
                t.slug.includes("detailed")
            ) ||
            templates.find((t) => t.slug === "professor_discretion_prompt_suite") ||
            templates.find(
              (t) =>
                t.name.toLowerCase().includes("discretion") ||
                t.name.toLowerCase().includes("delegation")
            ) ||
            templates[0];
          if (standardTemplate) {
            navigate(`/workflows/${standardTemplate.id}?type=template`);
          }
        }}
      />
    </div>
  );
}
