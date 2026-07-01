import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { useAuthContext } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardTitle, CardDescription, CardHeader, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { API_BASE_URL } from "@/constants";
import { 
  Trash2, Plus, Play, Sparkles, 
  AlertTriangle, Upload, RefreshCw, 
  DollarSign, BarChart2, ShieldAlert 
} from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

interface Campaign {
  id: string;
  name: string;
  description: string;
  prompt: string;
  schema: any[];
  model: string;
  dashboard_type: string;
  token_limit: number;
  created_at: string;
}

interface CampaignDocument {
  document_id: string;
  filename: string;
  file_size: number;
  status: string;
  coded_values: any; // Can be nested: model -> fields
  error_message?: string;
  error_type?: string;
  current_step?: number;
  total_steps?: number;
}

interface ModelStats {
  model: string;
  cost: number;
  input_tokens: number;
  output_tokens: number;
  calls: number;
}

interface BenchmarkRow {
  Filename: string;
  "DelegationLaw (Y/N)"?: string;
  RG_Discretion_Rank?: string;
  [key: string]: any;
}

const ALL_PRICING_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.1-pro",
  "gemini-3.1-flash",
  "gemini-3.1-flash-lite",
  "gemini-3-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-5.5-pro",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "o3-mini",
  "o1-preview",
  "o1-mini",
  "o1",
  "claude-3-5-sonnet",
  "claude-opus-4.8",
  "claude-sonnet-5",
  "claude-sonnet-4.6",
  "claude-haiku-4.5",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "deepseek-r1",
  "deepseek-chat",
  "kimi-k2.7-code",
  "kimi-k2.6",
  "kimi-k2.5",
  "kimi",
  "moonshot"
];

export function ModelEvaluationPage() {
  const { session, activeWorkspace } = useAuthContext();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  
  // List State
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  
  // Detail State
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [documents, setDocuments] = useState<CampaignDocument[]>([]);
  const [usageStats, setUsageStats] = useState<ModelStats[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [retryingModel, setRetryingModel] = useState<string | null>(null);
  const [raisingLimit, setRaisingLimit] = useState(false);
  const [selectedCellView, setSelectedCellView] = useState<any | null>(null);

  // Create Campaign State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>(["gemini-1.5-flash", "gpt-4o-mini"]);
  const [creating, setCreating] = useState(false);
  const [deleteCampaignId, setDeleteCampaignId] = useState<string | null>(null);
  const [searchModelQuery, setSearchModelQuery] = useState("");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showAddModelDialog, setShowAddModelDialog] = useState(false);
  const [newModelToAdd, setNewModelToAdd] = useState("");
  const [addingModel, setAddingModel] = useState(false);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [sourceType, setSourceType] = useState<"prompt" | "workflow">("prompt");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");

  // Professor Benchmark State
  const [parsedBenchmark, setParsedBenchmark] = useState<{ headers: string[]; rows: BenchmarkRow[] } | null>(null);
  const [benchmarkAccuracy, setBenchmarkAccuracy] = useState<Record<string, {
    delegation_total: number;
    delegation_matches: number;
    delegation_percent: number;
    rank_total: number;
    rank_matches: number;
    rank_percent: number;
    mae: number | null;
  }> | null>(null);
  const benchmarkInputRef = useRef<HTMLInputElement>(null);

  // Fetch all model comparison dashboards
  const fetchCampaigns = async () => {
    if (!session?.access_token || !activeWorkspace?.id) return;
    setLoadingList(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards?workspace_id=${encodeURIComponent(activeWorkspace.id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      const data: Campaign[] = await res.json();
      // Filter only comparison dashboards
      setCampaigns(data.filter(d => d.dashboard_type === "model_comparison"));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load evaluation dashboards");
    } finally {
      setLoadingList(false);
    }
  };

  // Fetch all workflows in the workspace
  const fetchWorkflows = async () => {
    if (!session?.access_token || !activeWorkspace?.id) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/workflows?workspace_id=${encodeURIComponent(activeWorkspace.id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch specific dashboard details
  const fetchCampaignDetails = async (campaignId: string) => {
    if (!session?.access_token) return;
    try {
      // 1. Fetch dashboard meta
      const resDash = await fetch(`${API_BASE_URL}/api/dashboards/${campaignId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resDash.ok) throw new Error("Failed to load dashboard details");
      const campaignData: Campaign = await resDash.json();
      setCampaign(campaignData);

      // 2. Fetch documents
      const resDocs = await fetch(`${API_BASE_URL}/api/dashboards/${campaignId}/documents`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resDocs.ok) throw new Error("Failed to load dashboard documents");
      const docsData: CampaignDocument[] = await resDocs.json();
      setDocuments(docsData);

      // 3. Fetch usage breakdown stats
      const resUsage = await fetch(`${API_BASE_URL}/api/usage/stats?timeframe=all&campaign_id=${campaignId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (resUsage.ok) {
        const usageData = await resUsage.json();
        setUsageStats(usageData.breakdown || []);
      }

      // Check if polling is needed
      const pendingOrProcessing = docsData.some(d => d.status === "pending" || d.status === "processing");
      setIsPolling(pendingOrProcessing);

    } catch (err) {
      console.error(err);
      toast.error("Failed to load dashboard details");
    }
  };

  useEffect(() => {
    if (id) {
      void fetchCampaignDetails(id);
    } else {
      void fetchCampaigns();
      void fetchWorkflows();
      setCampaign(null);
      setDocuments([]);
      setUsageStats([]);
      setParsedBenchmark(null);
      setBenchmarkAccuracy(null);
    }
  }, [id, session, activeWorkspace?.id]);

  // Polling hook
  useEffect(() => {
    if (!isPolling || !id || !session?.access_token) return;
    const interval = setInterval(async () => {
      try {
        const resDocs = await fetch(`${API_BASE_URL}/api/dashboards/${id}/documents`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (resDocs.ok) {
          const docsData: CampaignDocument[] = await resDocs.json();
          setDocuments(docsData);
          const stillRunning = docsData.some(d => d.status === "pending" || d.status === "processing");
          setIsPolling(stillRunning);
        }
        
        // Refresh usage stats too
        const resUsage = await fetch(`${API_BASE_URL}/api/usage/stats?timeframe=all&campaign_id=${id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (resUsage.ok) {
          const usageData = await resUsage.json();
          setUsageStats(usageData.breakdown || []);
        }
      } catch (err) {
        console.error("Polling sync error", err);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [isPolling, id, session]);

  // Handle campaign creation
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Campaign name is required.");
      return;
    }
    if (sourceType === "prompt" && !prompt.trim()) {
      toast.error("System Prompt is required.");
      return;
    }
    if (sourceType === "workflow" && !selectedWorkflowId) {
      toast.error("Please select a workflow to run.");
      return;
    }
    if (selectedModels.length === 0) {
      toast.error("Select at least one LLM model.");
      return;
    }

    setCreating(true);
    if (sourceType === "workflow") {
      toast.info("Setting up workflow evaluation campaign...", { duration: 4000 });
    } else {
      toast.info("Analyzing rubric codebook and building variable schema...", { duration: 4000 });
    }

    try {
      const body: any = {
        name: name.trim(),
        prompt: sourceType === "prompt" ? prompt.trim() : "Workflow evaluation",
        model: selectedModels.join(","),
        dashboard_type: "model_comparison",
        token_limit: 2500000,
      };

      if (sourceType === "workflow") {
        body.workflow_id = selectedWorkflowId;
        body.workflow_source = "draft";
      }

      const res = await fetch(`${API_BASE_URL}/api/dashboards?workspace_id=${encodeURIComponent(activeWorkspace?.id ?? "")}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to create comparison campaign");
      }

      const newCampaign = await res.json();
      toast.success("Model evaluation campaign created successfully!");
      setShowCreateModal(false);
      setName("");
      setPrompt("");
      setSelectedModels(["gemini-1.5-flash", "gpt-4o-mini"]);
      setSourceType("prompt");
      setSelectedWorkflowId("");
      navigate(`/campaigns/${newCampaign.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create comparison campaign");
    } finally {
      setCreating(false);
    }
  };

  // Execute delete campaign
  const executeDeleteCampaign = async () => {
    if (!deleteCampaignId || !session?.access_token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${deleteCampaignId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to delete campaign");
      toast.success("Campaign deleted");
      setCampaigns((prev) => prev.filter((c) => c.id !== deleteCampaignId));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete campaign");
    } finally {
      setDeleteCampaignId(null);
    }
  };

  // Toggle model selection
  const handleModelToggle = (modelId: string) => {
    setSelectedModels(prev => 
      prev.includes(modelId) 
        ? prev.filter(id => id !== modelId) 
        : [...prev, modelId]
    );
  };

  // Ingest documents mapping
  const handleLinkDocuments = async () => {
    if (!campaign || !session?.access_token) return;
    try {
      // Find all global documents in workspace to link
      const resWorkspaceDocs = await fetch(`${API_BASE_URL}/api/documents?workspace_id=${encodeURIComponent(activeWorkspace?.id ?? "")}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resWorkspaceDocs.ok) throw new Error("Failed to load documents");
      const wsDocs: any[] = await resWorkspaceDocs.json();
      const docIds = wsDocs.map(d => d.id);
      
      if (docIds.length === 0) {
        toast.warning("No documents found in workspace. Please ingest documents first.");
        return;
      }

      toast.info(`Linking ${docIds.length} workspace documents to campaign...`);
      const linkRes = await fetch(`${API_BASE_URL}/api/dashboards/${campaign.id}/documents/link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ document_ids: docIds }),
      });
      if (!linkRes.ok) throw new Error("Failed to link documents");
      toast.success("Linked documents successfully! Queueing runs...");
      
      // Trigger evaluation runs
      const runRes = await fetch(`${API_BASE_URL}/api/dashboards/${campaign.id}/documents/retry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(docIds),
      });
      if (runRes.ok) {
        toast.success("Successfully enqueued all documents for parallel multi-LLM classification!");
        setIsPolling(true);
        void fetchCampaignDetails(campaign.id);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to link documents");
    }
  };

  // Retry failed runs for a specific model
  const handleRetryModel = async (modelName: string) => {
    if (!campaign || !session?.access_token) return;
    setRetryingModel(modelName);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${campaign.id}/documents/retry?model=${encodeURIComponent(modelName)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`Failed to retry model ${modelName}`);
      toast.success(`Triggered retry for all failed document classifications on ${modelName}`);
      setIsPolling(true);
      void fetchCampaignDetails(campaign.id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRetryingModel(null);
    }
  };

  // Raise token safety limit
  const handleRaiseLimit = async () => {
    if (!campaign || !session?.access_token) return;
    setRaisingLimit(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${campaign.id}/raise-token-limit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to raise token safety limit");
      const data = await res.json();
      toast.success(`Increased token safety limit. New Limit: ${(data.new_limit / 1000000).toFixed(1)}M tokens. Resuming execution!`);
      setIsPolling(true);
      void fetchCampaignDetails(campaign.id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRaisingLimit(false);
    }
  };

  // Add a new model to campaign on-the-fly
  const handleAddModelToCampaign = async () => {
    if (!campaign || !newModelToAdd.trim() || !session?.access_token) return;
    setAddingModel(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/dashboards/${campaign.id}/add-model?model=${encodeURIComponent(newModelToAdd.trim())}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
        }
      });
      if (!response.ok) {
        throw new Error(await response.text() || "Failed to add model to campaign");
      }
      const data = await response.json();
      toast.success(data.message || `Successfully added ${newModelToAdd.trim()} to evaluation.`);
      setShowAddModelDialog(false);
      setNewModelToAdd("");
      setIsPolling(true);
      void fetchCampaignDetails(campaign.id);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to add model");
    } finally {
      setAddingModel(false);
    }
  };

  // Parse Professor Benchmark CSV
  const handleBenchmarkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const lines = text.split(/\r?\n/);
      if (lines.length === 0) return;
      
      const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
      const rows: BenchmarkRow[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const vals = line.split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
        const rowObj: any = {};
        headers.forEach((h, idx) => {
          rowObj[h] = vals[idx] || "";
        });
        rows.push(rowObj);
      }
      
      setParsedBenchmark({ headers, rows });
      toast.success(`Loaded ${rows.length} professor benchmark rows.`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Helper to normalize values for comparison
  const normalizeVal = (val: any): string => {
    if (val === undefined || val === null) return "";
    const text = String(val).trim().toLowerCase();
    if (text === "true" || text === "yes" || text === "1" || text === "t" || text === "y") return "yes";
    if (text === "false" || text === "no" || text === "0" || text === "f" || text === "n") return "no";
    return text;
  };

  // Compute accuracy statistics per model dynamically
  useEffect(() => {
    if (!parsedBenchmark || documents.length === 0 || !campaign) {
      setBenchmarkAccuracy(null);
      return;
    }

    const campaignModels = campaign.model.split(",").map(m => m.trim());
    const stats: Record<string, {
      delegation_total: number;
      delegation_matches: number;
      delegation_percent: number;
      rank_total: number;
      rank_matches: number;
      rank_percent: number;
      mae: number | null;
    }> = {};

    campaignModels.forEach(model => {
      let delTotal = 0;
      let delMatches = 0;
      let rankTotal = 0;
      let rankMatches = 0;
      let rankErrors: number[] = [];

      documents.forEach(doc => {
        // Match benchmark row by filename
        const docBase = doc.filename.split("/").pop()?.toLowerCase() || "";
        const benchRow = parsedBenchmark.rows.find(r => 
          (r.Filename || "").split("/").pop()?.toLowerCase() === docBase
        );
        
        if (!benchRow) return;

        // Retrieve model nested coded values
        const modelRun = doc.coded_values?.[model];
        if (!modelRun || modelRun.status !== "completed") return;

        const modelVals = modelRun.values || {};

        // 1. Evaluate delegation accuracy
        const expDel = normalizeVal(benchRow["DelegationLaw (Y/N)"]);
        const predDel = normalizeVal(modelVals["delegate_law"]);
        if (expDel) {
          delTotal++;
          if (expDel === predDel) delMatches++;
        }

        // 2. Evaluate rank accuracy
        const expRank = parseFloat(benchRow["RG_Discretion_Rank"] || "");
        const predRank = parseFloat(modelVals["discretion_rank"] || "");
        if (!isNaN(expRank) && !isNaN(predRank)) {
          rankTotal++;
          if (expRank === predRank) rankMatches++;
          rankErrors.push(Math.abs(predRank - expRank));
        }
      });

      stats[model] = {
        delegation_total: delTotal,
        delegation_matches: delMatches,
        delegation_percent: delTotal > 0 ? Math.round((delMatches / delTotal) * 100) : 0,
        rank_total: rankTotal,
        rank_matches: rankMatches,
        rank_percent: rankTotal > 0 ? Math.round((rankMatches / rankTotal) * 100) : 0,
        mae: rankErrors.length > 0 ? Math.round((rankErrors.reduce((a, b) => a + b, 0) / rankErrors.length) * 100) / 100 : null
      };
    });

    setBenchmarkAccuracy(stats);
  }, [parsedBenchmark, documents, campaign]);

  // Export spreadsheet matching professor's requirement
  const handleExportComparisonCSV = () => {
    if (!campaign || documents.length === 0) return;

    const campaignModels = campaign.model.split(",").map(m => m.trim());
    
    // Headers
    const headers = [
      "Filename",
      "Professor Delegation",
      "Professor Rank",
      ...campaignModels.flatMap(model => [
        `${model} Predicted Delegation`,
        `${model} Predicted Rank`,
        `${model} Status`,
        `${model} Error`
      ])
    ];

    // CSV rows compiler
    const csvRows = [
      headers.join(","),
      ...documents.map(doc => {
        const docBase = doc.filename.split("/").pop()?.toLowerCase() || "";
        const benchRow = parsedBenchmark?.rows.find(r => 
          (r.Filename || "").split("/").pop()?.toLowerCase() === docBase
        );

        const profDel = benchRow ? benchRow["DelegationLaw (Y/N)"] || "" : "";
        const profRank = benchRow ? benchRow["RG_Discretion_Rank"] || "" : "";

        const rowValues = [
          `"${doc.filename.replace(/"/g, '""')}"`,
          `"${profDel}"`,
          `"${profRank}"`,
          ...campaignModels.flatMap(model => {
            const modelRun = doc.coded_values?.[model] || {};
            const modelVals = modelRun.values || {};
            const predDel = modelVals["delegate_law"] !== undefined ? modelVals["delegate_law"] : "";
            const predRank = modelVals["discretion_rank"] !== undefined ? modelVals["discretion_rank"] : "";
            return [
              `"${String(predDel).replace(/"/g, '""')}"`,
              `"${String(predRank).replace(/"/g, '""')}"`,
              `"${modelRun.status || "pending"}"`,
              `"${(modelRun.error_message || "").replace(/"/g, '""')}"`
            ];
          })
        ];
        return rowValues.join(",");
      })
    ];

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = window.document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${campaign.name.toLowerCase().replace(/ /g, "_")}_evaluation_results.csv`);
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    toast.success("Comparison CSV Downloaded!");
  };

  // Determine if limit is exceeded in any document model run
  const hasSuspendedLimit = documents.some(d => {
    if (!d.coded_values) return false;
    return Object.values(d.coded_values).some((v: any) => v.status === "suspended_limit");
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground animate-fade-in">
      <ThreadSidebar />

      {/* Main Container */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Detail View Router */}
        {campaign ? (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header Detail Dashboard */}
            <div className="border-b bg-card/40 backdrop-blur-md px-8 py-5 flex items-center justify-between z-10">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => navigate("/evaluation")} className="text-xs h-6 px-1.5 gap-1 text-muted-foreground hover:text-primary">
                    &larr; Back
                  </Button>
                  <span className="text-[10px] uppercase font-extrabold tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    Model Evaluation Run
                  </span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
                <p className="text-xs text-muted-foreground line-clamp-1">{campaign.description}</p>
              </div>

              <div className="flex items-center gap-3">
                {documents.length === 0 ? (
                  <Button onClick={handleLinkDocuments} className="gap-2 text-xs shadow-sm bg-gradient-to-r from-primary to-primary/80 hover:opacity-90">
                    <Play size={13} className="fill-current" /> Run Evaluation on Workspace Documents
                  </Button>
                ) : (
                  <>
                    <input
                      type="file"
                      accept=".csv"
                      ref={benchmarkInputRef}
                      onChange={handleBenchmarkUpload}
                      className="hidden"
                    />
                    <Button variant="outline" size="sm" onClick={() => benchmarkInputRef.current?.click()} className="gap-1.5 text-xs">
                      <Upload size={13} /> {parsedBenchmark ? "Update Professor CSV" : "Upload Professor CSV"}
                    </Button>

                    <Button variant="outline" size="sm" onClick={handleExportComparisonCSV} className="gap-1.5 text-xs text-primary border-primary/20 hover:bg-primary/5">
                      <BarChart2 size={13} /> Export Comparison CSV
                    </Button>

                    <Button variant="outline" size="sm" onClick={() => setShowAddModelDialog(true)} className="gap-1.5 text-xs text-primary border-primary/20 hover:bg-primary/5">
                      <Plus size={13} /> Add Model
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 flex flex-col overflow-y-auto p-8 space-y-6">
              
              {/* Warnings & Notices */}
              {hasSuspendedLimit && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-center justify-between gap-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <ShieldAlert className="text-destructive h-5 w-5 shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-destructive">Token Limit Exceeded</h4>
                      <p className="text-xs text-muted-foreground">
                        Some evaluation runs were automatically paused to prevent runaway API billing because a model crossed the {(campaign.token_limit / 1000000).toFixed(1)}M tokens threshold.
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="destructive" onClick={handleRaiseLimit} disabled={raisingLimit} className="gap-1.5 text-xs shrink-0 font-bold">
                    {raisingLimit ? <RefreshCw className="animate-spin h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                    Authorize raise (+2.5M tokens) & Resume
                  </Button>
                </div>
              )}

              {/* Top Cost / Accuracy Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {campaign.model.split(",").map(m => m.trim()).map(model => {
                  const stat = usageStats.find(s => s.model === model);
                  const accuracy = benchmarkAccuracy?.[model];
                  return (
                    <Card key={model} className="border border-border/40 bg-card/10 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
                      <CardHeader className="pb-2 border-b border-border/10 bg-muted/5 flex flex-row items-center justify-between py-3">
                        <div className="font-bold text-xs truncate max-w-[150px]">{model}</div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleRetryModel(model)}
                          disabled={retryingModel !== null || isPolling}
                          className="h-6 w-6 text-muted-foreground hover:text-primary rounded-md"
                        >
                          <RefreshCw className={`h-3 w-3 ${retryingModel === model ? 'animate-spin' : ''}`} />
                        </Button>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-3.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground flex items-center gap-1"><DollarSign size={13} /> Overall Cost</span>
                          <span className="font-bold text-primary">${(stat?.cost || 0).toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Cumulative Tokens</span>
                          <span className="font-medium">{(((stat?.input_tokens || 0) + (stat?.output_tokens || 0)) / 1000).toFixed(1)}k</span>
                        </div>

                        {accuracy && (
                          <div className="border-t border-border/20 pt-3 space-y-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-muted-foreground">Delegation Accuracy</span>
                              <span className="font-bold text-green-600 dark:text-green-400">{accuracy.delegation_percent}%</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-muted-foreground">Rank Accuracy (Exact)</span>
                              <span className="font-bold text-green-600 dark:text-green-400">{accuracy.rank_percent}%</span>
                            </div>
                            {accuracy.mae !== null && (
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground">Mean Abs Error</span>
                                <span className="font-medium text-amber-500">{accuracy.mae}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Grid Spreadsheet comparison table */}
              <div className="rounded-xl border border-border/40 bg-card overflow-hidden shadow-sm flex-1 flex flex-col min-h-[400px]">
                <div className="p-4 border-b border-border/30 bg-muted/10 flex justify-between items-center text-xs text-muted-foreground">
                  <span className="font-medium">{documents.length} Classification Documents Linked</span>
                  {isPolling && (
                    <span className="flex items-center gap-1.5 text-primary animate-pulse font-semibold">
                      <RefreshCw className="animate-spin h-3.5 w-3.5" /> Background LLM parsing active...
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-auto max-h-[500px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-muted/30 sticky top-0 border-b border-border/30">
                      <tr>
                        <th className="p-3.5 font-bold border-r border-border/20 max-w-[200px] truncate">Filename</th>
                        <th className="p-3.5 font-bold border-r border-border/20">Professor benchmark</th>
                        {campaign.model.split(",").map(m => m.trim()).map(model => (
                          <th key={model} className="p-3.5 font-bold border-r border-border/20 text-center" colSpan={2}>
                            {model}
                          </th>
                        ))}
                      </tr>
                      <tr className="border-b border-border/20 bg-muted/10">
                        <td className="p-2 border-r border-border/20 font-medium"></td>
                        <td className="p-2 border-r border-border/20 text-muted-foreground italic text-[10px]">Delegation / Rank</td>
                        {campaign.model.split(",").map(m => m.trim()).map(model => (
                          <>
                            <td key={`${model}-del`} className="p-2 text-center text-muted-foreground text-[10px] font-medium border-r border-border/10">Delegation</td>
                            <td key={`${model}-rank`} className="p-2 text-center text-muted-foreground text-[10px] font-medium border-r border-border/20">Rank</td>
                          </>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((doc) => {
                        const docBase = doc.filename.split("/").pop()?.toLowerCase() || "";
                        const benchRow = parsedBenchmark?.rows.find(r => 
                          (r.Filename || "").split("/").pop()?.toLowerCase() === docBase
                        );

                        return (
                          <tr key={doc.document_id} className="border-b border-border/15 hover:bg-muted/5 transition-colors">
                            <td className="p-3 border-r border-border/20 font-medium max-w-[200px] truncate" title={doc.filename}>
                              {doc.filename.split("/").pop()}
                            </td>
                            <td className="p-3 border-r border-border/20 font-semibold text-muted-foreground">
                              {benchRow ? (
                                <span className="flex items-center gap-1">
                                  {benchRow["DelegationLaw (Y/N)"] || "?"} / {benchRow["RG_Discretion_Rank"] !== undefined ? benchRow["RG_Discretion_Rank"] : "?"}
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground italic">No Match</span>
                              )}
                            </td>

                            {campaign.model.split(",").map(m => m.trim()).map(model => {
                              const run = doc.coded_values?.[model] || {};
                              const vals = run.values || {};
                              
                              if (run.status === "processing" || run.status === "pending") {
                                return (
                                  <td key={`${model}-run`} className="p-3 text-center border-r border-border/20" colSpan={2}>
                                    <span className="flex items-center justify-center gap-1.5 text-muted-foreground animate-pulse text-[10px]">
                                      <RefreshCw className="h-3 w-3 animate-spin text-primary" /> {run.status}...
                                    </span>
                                  </td>
                                );
                              }
                              
                              if (run.status === "failed" || run.status === "suspended_limit") {
                                return (
                                  <td key={`${model}-run`} className="p-3 text-center border-r border-border/20" colSpan={2} title={run.error_message}>
                                    <span className="flex items-center justify-center gap-1 text-destructive font-bold text-[10px]">
                                      <AlertTriangle size={12} /> {run.status === "suspended_limit" ? "Suspended" : "Failed"}
                                    </span>
                                  </td>
                                );
                              }

                              const isDelMatch = benchRow && normalizeVal(benchRow["DelegationLaw (Y/N)"]) === normalizeVal(vals["delegate_law"]);
                              const isRankMatch = benchRow && parseFloat(benchRow["RG_Discretion_Rank"] || "") === parseFloat(vals["discretion_rank"] || "");

                              return (
                                <>
                                  <td 
                                    key={`${model}-del`} 
                                    onClick={() => setSelectedCellView({
                                      filename: doc.filename.split("/").pop(),
                                      modelName: model,
                                      columnName: "delegate_law",
                                      value: vals["delegate_law"] !== undefined ? String(vals["delegate_law"]) : "-",
                                      reasoning: vals["delegate_law_reasoning"] || "No reasoning logged.",
                                      history: vals["delegate_law_history"] || []
                                    })}
                                    className={`p-3 text-center border-r border-border/10 font-medium cursor-pointer hover:bg-muted/10 transition-colors ${isDelMatch ? 'text-green-600 dark:text-green-400 bg-green-500/5' : benchRow ? 'text-red-500 bg-red-500/5' : ''}`}
                                  >
                                    <div className="underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 font-semibold">
                                      {vals["delegate_law"] !== undefined ? String(vals["delegate_law"]) : "-"}
                                    </div>
                                    {run.cost !== undefined && (
                                      <div className="text-[9px] text-muted-foreground/75 font-normal mt-0.5" title={`Individual execution cost: $${run.cost.toFixed(6)}`}>
                                        ${run.cost.toFixed(5)}
                                      </div>
                                    )}
                                  </td>
                                  <td 
                                    key={`${model}-rank`} 
                                    onClick={() => setSelectedCellView({
                                      filename: doc.filename.split("/").pop(),
                                      modelName: model,
                                      columnName: "discretion_rank",
                                      value: vals["discretion_rank"] !== undefined ? String(vals["discretion_rank"]) : "-",
                                      reasoning: vals["discretion_rank_reasoning"] || "No reasoning logged.",
                                      history: vals["discretion_rank_history"] || []
                                    })}
                                    className={`p-3 text-center border-r border-border/20 font-medium cursor-pointer hover:bg-muted/10 transition-colors ${isRankMatch ? 'text-green-600 dark:text-green-400 bg-green-500/5' : benchRow ? 'text-red-500 bg-red-500/5' : ''}`}
                                  >
                                    <div className="underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 font-semibold">
                                      {vals["discretion_rank"] !== undefined ? String(vals["discretion_rank"]) : "-"}
                                    </div>
                                    {run.input_tokens !== undefined && (
                                      <div className="text-[9px] text-muted-foreground/75 font-normal mt-0.5" title={`Input: ${run.input_tokens || 0} / Output: ${run.output_tokens || 0} tokens`}>
                                        {((run.input_tokens + run.output_tokens)).toLocaleString()} t
                                      </div>
                                    )}
                                  </td>
                                </>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        ) : (
          /* List View Evaluation dashboards */
          <div className="flex-1 flex flex-col h-full overflow-y-auto p-8 max-w-7xl mx-auto w-full">
            <div className="flex justify-between items-center mb-8 border-b pb-6 border-border/40">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  Model Evaluation Dashboard
                </h1>
                <p className="text-muted-foreground mt-1.5 text-sm">
                  Test and compare document classification accuracy and API costs across multiple LLMs side-by-side.
                </p>
              </div>
              <Button onClick={() => setShowCreateModal(true)} className="gap-2 shadow-sm">
                <Plus size={16} /> Create Evaluation
              </Button>
            </div>

            {loadingList ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-48 rounded-xl border bg-muted/20 animate-pulse" />
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted/50 rounded-2xl p-16 text-center max-w-2xl mx-auto my-12 bg-muted/5">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
                  <BarChart2 size={28} />
                </div>
                <h3 className="text-lg font-bold">No evaluation comparison runs</h3>
                <p className="text-muted-foreground text-sm max-w-sm mt-2 mb-6">
                  Create a model comparison run to evaluate the classification outputs of multiple models side-by-side against a test set.
                </p>
                <Button onClick={() => setShowCreateModal(true)} className="gap-2">
                  <Plus size={16} /> Create Evaluation
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
                {campaigns.map((c) => (
                  <Card 
                    key={c.id} 
                    className="group relative border border-border/50 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden flex flex-col justify-between"
                    onClick={() => navigate(`/evaluation/${c.id}`)}
                  >
                    <div className="p-6">
                      <div className="flex justify-between items-start gap-4 mb-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                          <BarChart2 size={20} />
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8 rounded-md"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteCampaignId(c.id);
                          }}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                      
                      <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors">
                        {c.name}
                      </CardTitle>
                      <CardDescription className="text-muted-foreground line-clamp-3 text-xs mt-2 leading-relaxed">
                        {c.description}
                      </CardDescription>
                    </div>

                    <div className="border-t border-border/30 bg-muted/10 px-6 py-4 flex justify-between items-center text-xs text-muted-foreground">
                      <span className="font-semibold text-primary/80">
                        Models: {c.model.split(",").length} LLMs selected
                      </span>
                      <span className="flex items-center gap-1 text-primary font-bold group-hover:underline">
                        Compare <Play size={10} className="fill-primary" />
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create Campaign Modal */}
        <Dialog open={showCreateModal} onOpenChange={(open) => !creating && setShowCreateModal(open)}>
          <DialogContent className="w-[96vw] sm:max-w-4xl lg:max-w-5xl max-h-[92vh] overflow-y-auto p-5">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="text-primary animate-pulse" size={20} />
                New Model Comparison Campaign
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreateCampaign} className="space-y-5 mt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Campaign Name
                </label>
                <Input
                  required
                  placeholder="e.g. Multi-Model Discretion Evaluation"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={creating}
                />
              </div>

              {/* Models selection tags & search dropdown */}
              <div className="space-y-2 relative">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  Select Models to Compare
                </label>
                
                {/* Selected models badges */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedModels.map(model => (
                    <span 
                      key={model} 
                      className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 rounded-md px-2 py-0.5 text-xs font-semibold"
                    >
                      {model}
                      <button 
                        type="button" 
                        onClick={() => handleModelToggle(model)}
                        className="text-primary hover:text-destructive transition-colors ml-0.5 font-bold"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  {selectedModels.length === 0 && (
                    <span className="text-xs text-muted-foreground italic">No models selected. Search and add below.</span>
                  )}
                </div>

                {/* Model Search bar */}
                <div className="flex gap-2">
                  <Input 
                    type="text"
                    placeholder="Search or type a custom model name (e.g. gemini-3.5-flash)..."
                    value={searchModelQuery}
                    onChange={(e) => {
                      setSearchModelQuery(e.target.value);
                      setShowModelDropdown(true);
                    }}
                    onFocus={() => setShowModelDropdown(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && searchModelQuery.trim()) {
                        e.preventDefault();
                        const modelToAdd = searchModelQuery.trim();
                        if (!selectedModels.includes(modelToAdd)) {
                          setSelectedModels(prev => [...prev, modelToAdd]);
                        }
                        setSearchModelQuery("");
                        setShowModelDropdown(false);
                      }
                    }}
                  />
                  {searchModelQuery.trim() && (
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={() => {
                        const modelToAdd = searchModelQuery.trim();
                        if (!selectedModels.includes(modelToAdd)) {
                          setSelectedModels(prev => [...prev, modelToAdd]);
                        }
                        setSearchModelQuery("");
                        setShowModelDropdown(false);
                      }}
                    >
                      Add Custom
                    </Button>
                  )}
                </div>

                {/* Autocomplete Dropdown list */}
                {showModelDropdown && (
                  <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-card border rounded-lg shadow-lg z-50">
                    <div className="flex justify-between items-center px-3 py-1.5 border-b bg-muted/20 text-[10px] uppercase font-bold text-muted-foreground">
                      <span>Suggested Models</span>
                      <button 
                        type="button" 
                        onClick={() => setShowModelDropdown(false)}
                        className="text-muted-foreground hover:text-foreground text-xs"
                      >
                        Close
                      </button>
                    </div>
                    {ALL_PRICING_MODELS
                      .filter(m => m.toLowerCase().includes(searchModelQuery.toLowerCase()))
                      .map(model => {
                        const isSelected = selectedModels.includes(model);
                        return (
                          <div 
                            key={model}
                            onClick={() => {
                              handleModelToggle(model);
                              setShowModelDropdown(false);
                            }}
                            className={`px-3 py-2 text-xs cursor-pointer hover:bg-primary/5 flex items-center justify-between ${isSelected ? 'bg-primary/5 text-primary font-semibold' : ''}`}
                          >
                            <span>{model}</span>
                            {isSelected && <span className="text-[10px] text-primary">✓ Selected</span>}
                          </div>
                        );
                      })}
                    {ALL_PRICING_MODELS.filter(m => m.toLowerCase().includes(searchModelQuery.toLowerCase())).length === 0 && (
                      <div className="px-3 py-4 text-xs text-muted-foreground italic text-center">
                        No matches found. Press Enter or click "Add Custom" to use "{searchModelQuery}".
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Source Type Toggle */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  Evaluation Source
                </label>
                <div className="flex bg-muted/30 rounded-lg p-1 gap-1 w-fit">
                  <button
                    type="button"
                    onClick={() => setSourceType("prompt")}
                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${sourceType === "prompt" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    📝 System Prompt
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSourceType("workflow"); void fetchWorkflows(); }}
                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${sourceType === "workflow" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    ⚡ Workflow
                  </button>
                </div>

                {sourceType === "prompt" && (
                  <div className="space-y-1">
                    <Textarea
                      required
                      rows={8}
                      placeholder="Paste research rules or scoring rubrics here. The AI will extract discretion/delegation scores across all selected models based on these instructions."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      disabled={creating}
                      className="font-mono text-sm leading-relaxed max-h-72 overflow-y-auto"
                    />
                  </div>
                )}

                {sourceType === "workflow" && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Select a workflow to run all uploaded files through. The workflow's output variables will become the evaluation columns.
                    </p>
                    {workflows.length === 0 ? (
                      <div className="border rounded-lg p-4 text-center text-xs text-muted-foreground">
                        No workflows found in this workspace. Create one in the Workflows section first.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {workflows.map((wf: any) => (
                          <div
                            key={wf.id}
                            onClick={() => setSelectedWorkflowId(wf.id)}
                            className={`border rounded-lg p-3 cursor-pointer transition-all ${selectedWorkflowId === wf.id ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/20"}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold">{wf.name}</span>
                              {selectedWorkflowId === wf.id && (
                                <span className="text-[10px] text-primary font-bold bg-primary/10 px-2 py-0.5 rounded-full">Selected</span>
                              )}
                            </div>
                            {wf.description && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{wf.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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
                      {sourceType === "workflow" ? "Setting up..." : "Analyzing..."}
                    </>
                  ) : (
                    sourceType === "workflow" ? "⚡ Create Workflow Campaign" : "Create Evaluation Campaign"
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Add Model Modal */}
        <Dialog open={showAddModelDialog} onOpenChange={(open) => !addingModel && setShowAddModelDialog(open)}>
          <DialogContent className="w-[90vw] sm:max-w-md max-h-[85vh] overflow-y-auto p-5">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Plus className="text-primary" size={18} />
                Add LLM Model to Campaign
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              <p className="text-xs text-muted-foreground">
                Enter or search for a model to add to the evaluation dashboard. Adding a new model will trigger evaluations for it across all documents currently in the campaign.
              </p>
              
              <div className="space-y-1.5 relative">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  Select Model to Add
                </label>
                <div className="flex gap-2">
                  <Input 
                    type="text"
                    placeholder="Search or type custom model..."
                    value={newModelToAdd}
                    onChange={(e) => {
                      setNewModelToAdd(e.target.value);
                      setShowModelDropdown(true);
                    }}
                    onFocus={() => setShowModelDropdown(true)}
                  />
                </div>

                {/* Autocomplete Dropdown list */}
                {showModelDropdown && (
                  <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-card border rounded-lg shadow-lg z-50">
                    <div className="flex justify-between items-center px-3 py-1.5 border-b bg-muted/20 text-[10px] uppercase font-bold text-muted-foreground">
                      <span>Suggested Models</span>
                      <button 
                        type="button" 
                        onClick={() => setShowModelDropdown(false)}
                        className="text-muted-foreground hover:text-foreground text-xs"
                      >
                        Close
                      </button>
                    </div>
                    {ALL_PRICING_MODELS
                      .filter(m => m.toLowerCase().includes(newModelToAdd.toLowerCase()))
                      .map(model => {
                        const isAlreadyPresent = campaign?.model.split(",").map(m => m.trim()).includes(model);
                        return (
                          <div 
                            key={model}
                            onClick={() => {
                              if (!isAlreadyPresent) {
                                setNewModelToAdd(model);
                              }
                              setShowModelDropdown(false);
                            }}
                            className={`px-3 py-2 text-xs cursor-pointer hover:bg-primary/5 flex items-center justify-between ${isAlreadyPresent ? 'opacity-50 cursor-not-allowed bg-muted/10' : ''}`}
                          >
                            <span>{model}</span>
                            {isAlreadyPresent && <span className="text-[10px] text-muted-foreground">Already in Campaign</span>}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddModelDialog(false);
                    setNewModelToAdd("");
                  }}
                  disabled={addingModel}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddModelToCampaign} 
                  disabled={addingModel || !newModelToAdd.trim()} 
                  className="gap-2 text-xs font-bold"
                >
                  {addingModel ? (
                    <>
                      <div className="h-3.5 w-3.5 border-2 border-background border-t-transparent rounded-full animate-spin" />
                      Queueing...
                    </>
                  ) : (
                    "Add & Start Evaluation"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Inspect Coded Cell Modal */}
        <Dialog open={selectedCellView !== null} onOpenChange={(open) => !open && setSelectedCellView(null)}>
          <DialogContent className="w-[92vw] sm:max-w-lg lg:max-w-2xl max-h-[85vh] overflow-y-auto p-6">
            <DialogHeader className="border-b pb-3 mb-4">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <BarChart2 className="text-primary" size={18} />
                LLM Prediction & Reasoning Detail
              </DialogTitle>
            </DialogHeader>

            {selectedCellView && (
              <div className="space-y-5 text-sm">
                {/* Metadata cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/30 p-2.5 rounded-lg border border-border/20 text-center">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Variable</span>
                    <span className="font-bold text-xs truncate block">{selectedCellView.columnName}</span>
                  </div>
                  <div className="bg-muted/30 p-2.5 rounded-lg border border-border/20 text-center col-span-2">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Model Identifier</span>
                    <span className="font-bold text-xs truncate block text-primary">{selectedCellView.modelName}</span>
                  </div>
                </div>

                <div className="bg-muted/30 p-2.5 rounded-lg border border-border/20">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Document File</span>
                  <span className="font-semibold text-xs truncate block">{selectedCellView.filename}</span>
                </div>

                {/* Predicted Value */}
                <div className="space-y-1">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Predicted Value</span>
                  <div className="bg-primary/5 text-primary border border-primary/20 rounded-lg p-3 font-mono font-bold text-sm inline-block">
                    {selectedCellView.value}
                  </div>
                </div>

                {/* Reasoning */}
                <div className="space-y-1">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">AI Reasoning & Evidence</span>
                  <div className="bg-card border rounded-lg p-4 font-normal text-xs leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto shadow-inner">
                    {selectedCellView.reasoning}
                  </div>
                </div>

                {/* Audit trail history logs */}
                {selectedCellView.history && selectedCellView.history.length > 0 && (
                  <div className="space-y-2 pt-3 border-t">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Version Audit Trail</span>
                    <div className="space-y-2 max-h-36 overflow-y-auto">
                      {selectedCellView.history.map((h: any, idx: number) => (
                        <div key={idx} className="bg-muted/20 border border-border/10 p-2.5 rounded-md text-[11px] space-y-1">
                          <div className="flex justify-between font-bold text-muted-foreground">
                            <span>Version {h.version || (idx + 1)} ({h.source || "ai"})</span>
                            <span>{h.timestamp ? new Date(h.timestamp).toLocaleString() : ""}</span>
                          </div>
                          <div className="font-semibold text-foreground">Value: {String(h.value)}</div>
                          {h.reasoning && <div className="text-muted-foreground whitespace-pre-wrap">{h.reasoning}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-3 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedCellView(null)}
                    className="text-xs font-bold px-4"
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <ConfirmationDialog
          open={deleteCampaignId !== null}
          onOpenChange={(open) => !open && setDeleteCampaignId(null)}
          title="Delete Model Comparison Campaign"
          description="Are you sure you want to delete this comparison campaign? All multi-model classifications and spreadsheet data will be lost."
          onConfirm={executeDeleteCampaign}
          confirmText="Delete"
          variant="destructive"
        />
      </main>
    </div>
  );
}
