import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { useAuthContext } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { API_BASE_URL } from "@/constants";
import { Trash2, Plus, Play, Sparkles, Layers, X, Upload, ChevronDown, GitBranch } from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useAvailableModels } from "@/hooks/useAvailableModels";
import { workflowApi } from "@/lib/workflowApi";
import type { CodingWorkflow } from "@/types/workflow";

interface Campaign {
  id: string;
  name: string;
  description: string;
  prompt: string;
  schema: any[];
  model?: string;
  dashboard_type?: string;
  campaign_flow?: string;
  created_by?: string;
  created_at: string;
}

export function DashboardListPage() {
  const navigate = useNavigate();
  const { session, user, activeWorkspace } = useAuthContext();
  const { availableModels, loading: modelsLoading } = useAvailableModels();
  
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [workflows, setWorkflows] = useState<CodingWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter tab state: "all" | "prompt" | "workflow"
  const [filterTab, setFilterTab] = useState<"all" | "prompt" | "workflow">("all");

  // Modal & Creation Mode State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creationMode, setCreationMode] = useState<"prompt" | "workflow">("prompt");
  const [showCreateDropdown, setShowCreateDropdown] = useState(false);

  // Form State: Prompt a Campaign
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [columnsList, setColumnsList] = useState<{ name: string; type: string; description: string; options_raw?: string; prompt?: string; depends_on?: string[] }[]>([]);

  // Form State: Workflow Evaluation
  const [wfName, setWfName] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [selectedWorkflowModels, setSelectedWorkflowModels] = useState<string[]>([]);
  const [wfPrompt, setWfPrompt] = useState("");

  const [creating, setCreating] = useState(false);
  const [deleteCampaignId, setDeleteCampaignId] = useState<string | null>(null);

  useEffect(() => {
    if (availableModels.length > 0) {
      if (!selectedModel) setSelectedModel(availableModels[0].value);
      if (selectedWorkflowModels.length === 0) setSelectedWorkflowModels([availableModels[0].value]);
    }
  }, [availableModels]);

  const fetchCampaigns = async () => {
    if (!session?.access_token || !activeWorkspace?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards?workspace_id=${encodeURIComponent(activeWorkspace.id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch dashboards");
      const data = await res.json();
      setCampaigns(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load dashboards");
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkflows = async () => {
    if (!session?.access_token || !activeWorkspace?.id) return;
    try {
      const data = await workflowApi.list(session.access_token, activeWorkspace.id);
      setWorkflows(data || []);
    } catch (err) {
      console.error("Failed to fetch workflows for creation modal:", err);
    }
  };

  useEffect(() => {
    void fetchCampaigns();
    void fetchWorkflows();
  }, [session, activeWorkspace?.id]);

  const handleCsvColumnImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const lines = text.split(/\r?\n/);
      if (lines.length > 0 && lines[0].trim()) {
        const headers = lines[0]
          .split(",")
          .map(h => h.trim().replace(/^["']|["']$/g, ""))
          .filter(h => h.length > 0);
        
        const newCols = headers.map(h => ({
          name: h,
          type: "string",
          description: "",
          depends_on: [],
        }));
        
        setColumnsList(prev => [...prev, ...newCols]);
        toast.success(`Imported ${newCols.length} columns from ${file.name}`);
      } else {
        toast.error("CSV file is empty or invalid.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setPrompt(event.target.result as string);
        toast.success(`Loaded prompt from ${file.name}`);
      }
    };
    reader.readAsText(file);
  };

  // Submit Prompt a Campaign
  const handleCreatePromptCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) {
      toast.error("Name and Prompt/Codebook are required.");
      return;
    }

    const columnNames = columnsList.map((col) => col.name.trim());
    if (new Set(columnNames).size !== columnNames.length) {
      toast.error("Every column must have a unique name.");
      return;
    }
    for (const [index, col] of columnsList.entries()) {
      if (!col.name.trim()) {
        toast.error("Column names cannot be blank.");
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(col.name.trim())) {
        toast.error(`Column name "${col.name}" is invalid. Use alphanumeric characters and underscores only.`);
        return;
      }
      const priorNames = new Set(columnNames.slice(0, index));
      const invalidDependency = (col.depends_on || []).find((dependency) => !priorNames.has(dependency));
      if (invalidDependency) {
        toast.error(`"${col.name}" can only use outputs from an earlier step. Remove "${invalidDependency}" or move that rule earlier.`);
        return;
      }
    }

    setCreating(true);
    toast.info("Analyzing system prompt and generating variable schema...", { duration: 4000 });
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards?workspace_id=${encodeURIComponent(activeWorkspace?.id ?? "")}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          prompt: prompt.trim(),
          model: selectedModel,
          dashboard_type: "campaign",
          campaign_flow: "Prompt a Campaign",
          user_columns: columnsList.length > 0 ? columnsList.map(c => ({
            name: c.name.trim(),
            type: c.type,
            description: c.description.trim() || undefined,
            options: c.options_raw ? c.options_raw.split(",").map(o => o.trim()).filter(Boolean) : null,
            prompt: c.prompt?.trim() || undefined,
            depends_on: c.depends_on || []
          })) : undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to create campaign");
      }
      
      const newCampaign = await res.json();
      toast.success("Prompt a Campaign dashboard created successfully!");
      setShowCreateModal(false);
      setName("");
      setPrompt("");
      setColumnsList([]);
      navigate(`/campaigns/${newCampaign.id}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to create campaign");
    } finally {
      setCreating(false);
    }
  };

  // Submit Workflow Evaluation
  const handleCreateWorkflowEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wfName.trim()) {
      toast.error("Evaluation Name is required.");
      return;
    }
    if (selectedWorkflowModels.length === 0) {
      toast.error("Please select at least one model to evaluate.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards?workspace_id=${encodeURIComponent(activeWorkspace?.id ?? "")}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          name: wfName.trim(),
          prompt: wfPrompt.trim() || "Workflow evaluation run",
          model: selectedWorkflowModels.join(","),
          dashboard_type: "model_comparison",
          campaign_flow: "Workflow Evaluation",
          workflow_id: selectedWorkflowId || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to create workflow evaluation");
      }

      const newCampaign = await res.json();
      toast.success("Workflow Evaluation dashboard created successfully!");
      setShowCreateModal(false);
      setWfName("");
      setWfPrompt("");
      setSelectedWorkflowId("");
      navigate(`/evaluation/${newCampaign.id}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to create workflow evaluation dashboard");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCampaignClick = (campaignId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteCampaignId(campaignId);
  };

  const executeDeleteCampaign = async () => {
    if (!deleteCampaignId || !session?.access_token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${deleteCampaignId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to delete campaign");
      toast.success("Dashboard deleted");
      setCampaigns(prev => prev.filter(c => c.id !== deleteCampaignId));
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete dashboard");
    } finally {
      setDeleteCampaignId(null);
    }
  };

  // Filter lists
  const promptCampaigns = campaigns.filter(c => c.dashboard_type !== "workflow" && c.dashboard_type !== "model_comparison");
  const workflowCampaigns = campaigns.filter(c => c.dashboard_type === "workflow" || c.dashboard_type === "model_comparison");

  const filteredCampaigns = filterTab === "prompt"
    ? promptCampaigns
    : filterTab === "workflow"
    ? workflowCampaigns
    : campaigns;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <ThreadSidebar />

      <main className="flex-1 flex flex-col h-full overflow-y-auto p-8 max-w-7xl mx-auto w-full">
        {/* Header Section */}
        <div className="flex justify-between items-center mb-6 border-b pb-6 border-border/40">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Prompt & Workflow Campaigns
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Define prompt codebooks or evaluate custom workflows across models to extract structured policy datasets.
            </p>
          </div>

          {/* Split / Dropdown Create Campaign Action */}
          <div className="relative">
            <div className="inline-flex rounded-xl shadow-sm bg-primary text-primary-foreground">
              <Button 
                onClick={() => {
                  setCreationMode("prompt");
                  setShowCreateModal(true);
                }} 
                className="gap-2 rounded-r-none border-r border-primary-foreground/20 font-semibold text-xs"
              >
                <Plus size={15} /> Create Campaign
              </Button>
              <Button
                size="icon"
                onClick={() => setShowCreateDropdown(!showCreateDropdown)}
                className="rounded-l-none px-2 text-primary-foreground hover:bg-primary/90"
              >
                <ChevronDown size={14} />
              </Button>
            </div>

            {showCreateDropdown && (
              <div 
                className="absolute right-0 mt-2 w-64 rounded-xl border border-border/60 bg-card p-1.5 shadow-xl z-50 text-xs animate-in fade-in slide-in-from-top-2"
                onClick={() => setShowCreateDropdown(false)}
              >
                <button
                  onClick={() => {
                    setCreationMode("prompt");
                    setShowCreateModal(true);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-primary/10 flex items-center gap-2.5 transition-colors font-medium"
                >
                  <Sparkles size={16} className="text-primary" />
                  <div>
                    <div className="font-bold text-foreground">Prompt a Campaign</div>
                    <div className="text-[10px] text-muted-foreground">Codebook & variable extraction</div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setCreationMode("workflow");
                    setShowCreateModal(true);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-primary/10 flex items-center gap-2.5 transition-colors font-medium border-t border-border/40 mt-1 pt-2"
                >
                  <GitBranch size={16} className="text-amber-500" />
                  <div>
                    <div className="font-bold text-foreground">Workflow Evaluation</div>
                    <div className="text-[10px] text-muted-foreground">Multi-model benchmark & graph flow</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Requirement 14: Filter Options Bar */}
        <div className="flex items-center gap-2 mb-6 border-b pb-3 border-border/40">
          <button
            onClick={() => setFilterTab("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterTab === "all"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/40 text-muted-foreground hover:bg-muted"
            }`}
          >
            All Dashboards ({campaigns.length})
          </button>
          <button
            onClick={() => setFilterTab("prompt")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              filterTab === "prompt"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/40 text-muted-foreground hover:bg-muted"
            }`}
          >
            <Sparkles size={13} /> Prompt a Campaign ({promptCampaigns.length})
          </button>
          <button
            onClick={() => setFilterTab("workflow")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              filterTab === "workflow"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/40 text-muted-foreground hover:bg-muted"
            }`}
          >
            <GitBranch size={13} /> Workflow Evaluation ({workflowCampaigns.length})
          </button>
        </div>

        {/* Campaign Grid List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-48 rounded-xl border bg-muted/20 animate-pulse" />
            ))}
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted/50 rounded-2xl p-16 text-center max-w-2xl mx-auto my-12 bg-muted/5">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
              <Layers size={28} />
            </div>
            <h3 className="text-lg font-bold">No dashboards found</h3>
            <p className="text-muted-foreground text-sm max-w-sm mt-2 mb-6">
              {filterTab === "prompt"
                ? "No Prompt a Campaign dashboards created yet."
                : filterTab === "workflow"
                ? "No Workflow Evaluation dashboards created yet."
                : "Create your first dashboard to define a research codebook or evaluate multi-model workflows."}
            </p>
            <Button onClick={() => setShowCreateModal(true)} className="gap-2">
              <Plus size={16} /> Create Campaign
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
            {filteredCampaigns.map((c) => {
              const isWorkflowType = c.dashboard_type === "workflow" || c.dashboard_type === "model_comparison";
              return (
                <Card 
                  key={c.id} 
                  className="group relative border border-border/50 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden flex flex-col justify-between"
                  onClick={() => navigate(isWorkflowType ? `/evaluation/${c.id}` : `/campaigns/${c.id}`)}
                >
                  <div className="p-6">
                    <div className="flex justify-between items-start gap-4 mb-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        isWorkflowType
                          ? "bg-amber-500/10 text-amber-600 border border-amber-500/20 dark:text-amber-400"
                          : "bg-primary/10 text-primary border border-primary/20"
                      }`}>
                        {isWorkflowType ? <GitBranch size={12} /> : <Sparkles size={12} />}
                        {isWorkflowType ? "Workflow Evaluation" : "Prompt a Campaign"}
                      </span>

                      {(user?.is_admin || user?.can_delete) && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-7 w-7 rounded-md"
                          onClick={(e) => handleDeleteCampaignClick(c.id, e)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                    
                    <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors">
                      {c.name}
                    </CardTitle>

                    {c.created_by && (
                      <div className="text-[11px] text-muted-foreground font-medium mt-1">
                        Created by: {c.created_by}
                      </div>
                    )}

                    <CardDescription className="text-muted-foreground line-clamp-2 text-xs mt-2 leading-relaxed">
                      {c.description || c.prompt}
                    </CardDescription>
                  </div>

                  <div className="border-t border-border/30 bg-muted/10 px-6 py-4 flex justify-between items-center text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Layers size={13} className={c.schema?.length ? "text-primary/70" : "text-amber-500"} />
                      {isWorkflowType
                        ? `${c.model?.split(",").length || 1} models compared`
                        : `${c.schema?.length || 0} columns defined`}
                    </span>
                    <span className="flex items-center gap-1 text-primary font-bold group-hover:underline">
                      Analyze <Play size={10} className="fill-primary" />
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Requirement 15: Create Campaign Dialog with Dual Modes */}
        <Dialog open={showCreateModal} onOpenChange={(open) => !creating && setShowCreateModal(open)}>
          <DialogContent className="w-[96vw] sm:max-w-4xl lg:max-w-5xl max-h-[92vh] overflow-y-auto p-6">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="text-primary animate-pulse" size={20} />
                Create New Dashboard
              </DialogTitle>
            </DialogHeader>

            {/* Creation Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-muted/40 rounded-xl my-3 border border-border/40">
              <button
                type="button"
                onClick={() => setCreationMode("prompt")}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  creationMode === "prompt"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles size={14} /> Prompt a Campaign
              </button>
              <button
                type="button"
                onClick={() => setCreationMode("workflow")}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  creationMode === "workflow"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <GitBranch size={14} /> Workflow Evaluation
              </button>
            </div>

            {/* MODE 1: PROMPT A CAMPAIGN FORM */}
            {creationMode === "prompt" ? (
              <form onSubmit={handleCreatePromptCampaign} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Campaign Name
                  </label>
                  <Input
                    required
                    placeholder="e.g. Agency Discretion & Statutory Coding"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={creating}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Coding Model
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={creating}
                    className="w-full flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {availableModels.length > 0 ? (
                      availableModels.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>
                        {modelsLoading ? "Loading models..." : "No Saved API Keys (Add in Settings)"}
                      </option>
                    )}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      System Prompt / Codebook
                    </label>
                    <label className="text-xs text-primary font-medium hover:underline cursor-pointer">
                      Upload .md/.txt File
                      <input
                        type="file"
                        accept=".txt,.md"
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={creating}
                      />
                    </label>
                  </div>
                  <Textarea
                    required
                    rows={8}
                    placeholder="Paste research rules, scoring rubrics, or coding instructions here. The AI will analyze this to generate a dataset schema."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={creating}
                    className="font-mono text-sm leading-relaxed max-h-72 overflow-y-auto"
                  />
                </div>

                <div className="space-y-3 border-t pt-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                        Predefined Dataset Columns (Optional)
                      </label>
                      <p className="text-[10px] text-muted-foreground leading-normal mt-0.5">
                        Import columns from a CSV file header or add them manually to guide the LLM's classification.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <label className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-7 px-2.5 cursor-pointer gap-1 shadow-sm">
                        <Upload size={12} /> Import CSV
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleCsvColumnImport}
                          className="hidden"
                          disabled={creating}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setColumnsList(prev => [...prev, { name: "", type: "string", description: "", prompt: "", depends_on: [] }])}
                        className="h-7 text-xs gap-1"
                        disabled={creating}
                      >
                        <Plus size={12} /> Add Column
                      </Button>
                    </div>
                  </div>

                  {columnsList.length > 0 && (
                    <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
                      {columnsList.map((col, idx) => (
                        <div key={idx} className="p-4 border rounded-xl bg-card/50 space-y-3 relative">
                          <div className="flex justify-between items-center border-b pb-1.5 border-border/40">
                            <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">Step {idx + 1}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setColumnsList(prev => prev.filter((_, i) => i !== idx))}
                              className="h-5 w-5 hover:bg-destructive/15 text-destructive rounded"
                            >
                              <X size={12} />
                            </Button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-2">
                              <label className="text-[9px] font-bold text-muted-foreground uppercase">Column Name</label>
                              <Input
                                value={col.name}
                                onChange={(e) => setColumnsList(prev => {
                                  const previousName = prev[idx]?.name;
                                  return prev.map((c, i) => {
                                    if (i === idx) return { ...c, name: e.target.value };
                                    if (i > idx && previousName) {
                                      return { ...c, depends_on: (c.depends_on || []).map((dependency) => dependency === previousName ? e.target.value : dependency) };
                                    }
                                    return c;
                                  });
                                })}
                                placeholder="e.g. discretion_score"
                                className="mt-0.5 text-xs h-7"
                                required
                              />
                            </div>
                            <div className="col-span-1">
                              <label className="text-[9px] font-bold text-muted-foreground uppercase">Type</label>
                              <select
                                value={col.type}
                                onChange={(e) => setColumnsList(prev => prev.map((c, i) => i === idx ? { ...c, type: e.target.value } : c))}
                                className="w-full bg-background border border-input rounded mt-0.5 px-2 h-7 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                              >
                                <option value="string">String</option>
                                <option value="number">Number</option>
                                <option value="boolean">Boolean</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-muted-foreground uppercase">Description / LLM Criteria</label>
                            <textarea
                              value={col.description}
                              onChange={(e) => setColumnsList(prev => prev.map((c, i) => i === idx ? { ...c, description: e.target.value } : c))}
                              placeholder="Explain exactly how the LLM should evaluate and score this variable..."
                              className="w-full bg-background border border-input rounded mt-0.5 p-1.5 text-xs min-h-[40px] focus:outline-none focus:ring-1 focus:ring-primary font-sans leading-normal"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateModal(false)}
                    disabled={creating}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating} className="gap-2">
                    {creating ? (
                      <>
                        <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                        Generating Schema...
                      </>
                    ) : (
                      "Create Prompt Campaign"
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              /* MODE 2: WORKFLOW EVALUATION FORM */
              <form onSubmit={handleCreateWorkflowEvaluation} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Evaluation Dashboard Name
                  </label>
                  <Input
                    required
                    placeholder="e.g. Model Benchmark Comparison — Agency Discretion"
                    value={wfName}
                    onChange={(e) => setWfName(e.target.value)}
                    disabled={creating}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Attach Workspace Workflow (Optional)
                  </label>
                  <select
                    value={selectedWorkflowId}
                    onChange={(e) => setSelectedWorkflowId(e.target.value)}
                    disabled={creating}
                    className="w-full flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">No workflow attached (Direct LLM Comparison)</option>
                    {workflows
                      .filter((wf) => wf.status === "published")
                      .map((wf) => (
                        <option key={wf.id} value={wf.id}>
                          {wf.name} {wf.latest_version ? `(v${wf.latest_version})` : "(Published)"}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                    Models to Compare & Evaluate
                  </label>
                  {availableModels.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto p-3 border rounded-xl bg-card/50">
                      {availableModels.map((m) => {
                        const checked = selectedWorkflowModels.includes(m.value);
                        return (
                          <label
                            key={m.value}
                            className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                              checked
                                ? "bg-primary/10 border-primary/40 font-semibold text-primary"
                                : "bg-background border-border/60 text-muted-foreground hover:bg-accent"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedWorkflowModels(prev => [...prev, m.value]);
                                } else {
                                  setSelectedWorkflowModels(prev => prev.filter(v => v !== m.value));
                                }
                              }}
                              className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                            />
                            <span>{m.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3 border border-amber-500/30 rounded-xl bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400">
                      No saved API keys found. Please configure API keys in Settings first.
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Evaluation Notes / Prompt
                  </label>
                  <Textarea
                    rows={3}
                    placeholder="Optional notes or instructions for this multi-model evaluation campaign..."
                    value={wfPrompt}
                    onChange={(e) => setWfPrompt(e.target.value)}
                    disabled={creating}
                    className="text-xs leading-relaxed"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateModal(false)}
                    disabled={creating}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating} className="gap-2">
                    {creating ? (
                      <>
                        <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Workflow Evaluation"
                    )}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>

        <ConfirmationDialog
          open={deleteCampaignId !== null}
          onOpenChange={(open) => !open && setDeleteCampaignId(null)}
          title="Delete Dashboard"
          description="Are you sure you want to delete this dashboard campaign? All associated classifications and grid data will be lost."
          onConfirm={executeDeleteCampaign}
          confirmText="Delete"
          variant="destructive"
        />
      </main>
    </div>
  );
}
