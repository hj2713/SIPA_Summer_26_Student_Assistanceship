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
  Trash2, Plus, Sparkles,
  AlertTriangle, Upload, RefreshCw,
  DollarSign, BarChart2, ShieldAlert,
  Loader2, Layers, GitBranch
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
  workflow_id?: string | null;
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
  workflow_trace?: any[];
  workflow_context?: Record<string, any>;
}

interface WorkspaceDocument {
  id: string;
  filename: string;
  metadata?: {
    tags?: string[];
  };
}

interface ModelStats {
  model: string;
  cost: number;
  input_tokens: number;
  output_tokens: number;
  calls: number;
}

interface ModelRunRecord {
  values?: Record<string, any>;
  status?: string;
  cost?: number;
  input_tokens?: number;
  output_tokens?: number;
  trace?: any[];
  context?: Record<string, any>;
  error_message?: string | null;
  error_type?: string | null;
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
  const [retryingAllFailed, setRetryingAllFailed] = useState(false);
  const [retryingDocumentKey, setRetryingDocumentKey] = useState<string | null>(null);
  const [raisingLimit, setRaisingLimit] = useState(false);
  const [selectedCellView, setSelectedCellView] = useState<any | null>(null);
  const [showLinkDocumentsDialog, setShowLinkDocumentsDialog] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    filename: 260,
  });

  const startResize = (e: React.MouseEvent, columnId: string) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = columnWidths[columnId] || (columnId === "filename" ? 260 : 180);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(80, startWidth + (moveEvent.pageX - startX));
      setColumnWidths((prev) => ({
        ...prev,
        [columnId]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const getModelStatsForField = (model: string, colName: string) => {
    let completed = 0;
    let running = 0;
    let failed = 0;
    
    documents.forEach((doc) => {
      const run = doc.coded_values?.[model] || {};
      const status = run.status || (doc.status === "processing" ? "processing" : doc.status === "pending" ? "pending" : "missing");
      
      const hasValue = run.values && run.values[colName] !== undefined && run.values[colName] !== null && run.values[colName] !== "";
      
      if (status === "completed" && hasValue) {
        completed++;
      } else if (status === "processing" || status === "pending") {
        running++;
      } else {
        failed++;
      }
    });
    
    return { completed, running, failed, total: documents.length };
  };

  const [globalDocs, setGlobalDocs] = useState<WorkspaceDocument[]>([]);
  const [selectedGlobalDocIds, setSelectedGlobalDocIds] = useState<string[]>([]);
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [linkingDocs, setLinkingDocs] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [showLinkWorkflowDialog, setShowLinkWorkflowDialog] = useState(false);
  const [linkingWorkflow, setLinkingWorkflow] = useState(false);

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

  const campaignModels = campaign?.model.split(",").map((m) => m.trim()).filter(Boolean) ?? [];
  const schemaColumns = (campaign?.schema ?? []).filter((col) => col?.name);
  const supportsProfessorBenchmark = schemaColumns.some((col) => col.name === "delegate_law") && schemaColumns.some((col) => col.name === "discretion_rank");
  const basename = (filename: string) => filename.split("/").pop() || filename;

  const getModelRun = (doc: CampaignDocument, model: string): ModelRunRecord => {
    const run = doc.coded_values?.[model];
    return run && typeof run === "object" ? run : {};
  };

  const getModelRunStatus = (doc: CampaignDocument, model: string): string => {
    const run = getModelRun(doc, model);
    if (typeof run.status === "string" && run.status.trim()) return run.status;
    if (doc.status === "processing") return "processing";
    if (doc.status === "pending") return "pending";
    return "missing";
  };

  const isLongformColumn = (columnName: string): boolean => /rationale|reasoning|evidence/i.test(columnName);

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

  const fetchGlobalDocs = async () => {
    if (!session?.access_token || !activeWorkspace?.id) return;
    const res = await fetch(`${API_BASE_URL}/api/documents?workspace_id=${encodeURIComponent(activeWorkspace.id)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) throw new Error("Failed to load workspace documents");
    const data: WorkspaceDocument[] = await res.json();
    setGlobalDocs(data);
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

  useEffect(() => {
    if (!showLinkDocumentsDialog) {
      setSelectedGlobalDocIds([]);
      setLinkSearchQuery("");
      return;
    }
    void fetchGlobalDocs().catch((err) => {
      console.error(err);
      toast.error("Failed to load workspace files");
    });
  }, [showLinkDocumentsDialog, session?.access_token, activeWorkspace?.id]);

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

  // Handle campaign creation (prompt-based only; workflow is linked separately after creation)
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) {
      toast.error("Name and System Prompt are required.");
      return;
    }
    if (selectedModels.length === 0) {
      toast.error("Select at least one LLM model.");
      return;
    }

    setCreating(true);
    toast.info("Analyzing rubric codebook and building variable schema...", { duration: 4000 });

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards?workspace_id=${encodeURIComponent(activeWorkspace?.id ?? "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          name: name.trim(),
          prompt: prompt.trim(),
          model: selectedModels.join(","),
          dashboard_type: "model_comparison",
          token_limit: 2500000,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to create comparison campaign");
      }
      const newCampaign = await res.json();
      toast.success("Model evaluation campaign created. Link a workflow, then add files from this evaluation page.");
      setShowCreateModal(false);
      setName("");
      setPrompt("");
      setSelectedModels(["gemini-1.5-flash", "gpt-4o-mini"]);
      navigate(`/evaluation/${newCampaign.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create comparison campaign");
    } finally {
      setCreating(false);
    }
  };

  // Handle linking/unlinking a workflow to the current campaign
  const handleLinkWorkflow = async () => {
    if (!campaign || !session) return;
    setLinkingWorkflow(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${campaign.id}/link-workflow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ workflow_id: selectedWorkflowId || null }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to link workflow");
      }
      const updated = await res.json();
      setCampaign(updated);
      setShowLinkWorkflowDialog(false);
      toast.success(selectedWorkflowId ? "Workflow linked! New file uploads will run through this workflow." : "Workflow unlinked.");
    } catch (err: any) {
      toast.error(err.message || "Failed to link workflow");
    } finally {
      setLinkingWorkflow(false);
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

  const handleLinkDocuments = async () => {
    if (!campaign || !session?.access_token) return;
    if (!campaign.workflow_id) {
      toast.error("Link a workflow first. Model evaluation files run through the linked workflow on this page.");
      return;
    }
    if (selectedGlobalDocIds.length === 0) {
      toast.error("Select at least one workspace file.");
      return;
    }
    const docIds = [...selectedGlobalDocIds];
    setLinkingDocs(true);
    try {
      const linkRes = await fetch(`${API_BASE_URL}/api/dashboards/${campaign.id}/documents/link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(docIds),
      });
      if (!linkRes.ok) throw new Error("Failed to link documents");
      toast.success(`Queued ${docIds.length} file${docIds.length === 1 ? "" : "s"} for workflow evaluation on this dashboard.`);
      setShowLinkDocumentsDialog(false);
      setSelectedGlobalDocIds([]);
      setIsPolling(true);
      void fetchCampaignDetails(campaign.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to link documents");
    } finally {
      setLinkingDocs(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!campaign || !session?.access_token || !files || files.length === 0) return;
    if (!campaign.workflow_id) {
      toast.error("Link a workflow first. Model evaluation files run through the linked workflow on this page.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploadingFiles(true);
    let successCount = 0;
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("workspace_id", activeWorkspace?.id ?? "");

        const res = await fetch(`${API_BASE_URL}/api/dashboards/${campaign.id}/documents/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || `Failed to upload ${file.name}`);
        }
        successCount += 1;
      }

      toast.success(`Queued ${successCount} uploaded file${successCount === 1 ? "" : "s"} for workflow evaluation.`);
      setIsPolling(true);
      void fetchCampaignDetails(campaign.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload files");
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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

  const handleRetryDocument = async (documentId: string, modelName?: string) => {
    if (!campaign || !session?.access_token) return;
    const retryKey = `${documentId}:${modelName || "all"}`;
    setRetryingDocumentKey(retryKey);
    try {
      const url = new URL(`${API_BASE_URL}/api/dashboards/${campaign.id}/documents/retry`);
      if (modelName) {
        url.searchParams.set("model", modelName);
      }
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify([documentId]),
      });
      if (!res.ok) {
        throw new Error(modelName ? `Failed to retry ${modelName} for this file` : "Failed to retry file");
      }
      toast.success(modelName ? `Queued ${modelName} to retry on this file.` : "Queued file for retry.");
      setIsPolling(true);
      void fetchCampaignDetails(campaign.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to retry file");
    } finally {
      setRetryingDocumentKey(null);
    }
  };

  const handleRetryAllFailed = async () => {
    if (!campaign || !session?.access_token) return;
    setRetryingAllFailed(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${campaign.id}/documents/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        throw new Error("Failed to retry all failed runs");
      }
      toast.success("Queued all failed model runs for retry.");
      setIsPolling(true);
      void fetchCampaignDetails(campaign.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to retry all failed runs");
    } finally {
      setRetryingAllFailed(false);
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

    const headers = [
      "Filename",
      ...schemaColumns.flatMap((col) =>
        campaignModels.flatMap((model) => [
          `${col.name} [${model}]`,
          `${col.name}_reasoning [${model}]`,
          `${col.name}_status [${model}]`,
          `${col.name}_error [${model}]`,
        ]),
      ),
    ];

    const csvRows = [
      headers.join(","),
      ...documents.map(doc => {
        const rowValues = [
          `"${doc.filename.replace(/"/g, '""')}"`,
          ...schemaColumns.flatMap((col) =>
            campaignModels.flatMap((model) => {
              const modelRun = doc.coded_values?.[model] || {};
              const modelVals = modelRun.values || {};
              const value = modelVals[col.name] !== undefined ? modelVals[col.name] : "";
              const reasoning = modelVals[`${col.name}_reasoning`] || "";
              return [
                `"${String(value).replace(/"/g, '""')}"`,
                `"${String(reasoning).replace(/"/g, '""')}"`,
                `"${modelRun.status || "pending"}"`,
                `"${String(modelRun.error_message || "").replace(/"/g, '""')}"`,
              ];
            }),
          ),
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
  const hasAnyFailedRuns = documents.some((doc) =>
    campaignModels.some((model) => {
      const status = getModelRunStatus(doc, model);
      return status === "failed" || status === "suspended_limit";
    }),
  );

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
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <input
                  type="file"
                  accept=".csv"
                  ref={benchmarkInputRef}
                  onChange={handleBenchmarkUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLinkDocumentsDialog(true)}
                  className="gap-1.5 text-xs"
                >
                  <Layers size={13} /> Link Workspace Files
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFiles}
                  className="gap-1.5 text-xs"
                >
                  {uploadingFiles ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {uploadingFiles ? "Uploading..." : "Upload Local Files"}
                </Button>
                {supportsProfessorBenchmark && (
                  <Button variant="outline" size="sm" onClick={() => benchmarkInputRef.current?.click()} className="gap-1.5 text-xs">
                    <Upload size={13} /> {parsedBenchmark ? "Update Professor CSV" : "Upload Professor CSV"}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleExportComparisonCSV} className="gap-1.5 text-xs text-primary border-primary/20 hover:bg-primary/5">
                  <BarChart2 size={13} /> Export CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowAddModelDialog(true)} className="gap-1.5 text-xs text-primary border-primary/20 hover:bg-primary/5">
                  <Plus size={13} /> Add Model
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { void fetchWorkflows(); setSelectedWorkflowId(campaign?.workflow_id || ""); setShowLinkWorkflowDialog(true); }}
                  className={`gap-1.5 text-xs ${campaign?.workflow_id ? "text-violet-600 border-violet-300 bg-violet-50 hover:bg-violet-100" : "text-muted-foreground border-muted hover:bg-muted/30"}`}
                >
                  ⚡ {campaign?.workflow_id ? "Workflow Linked" : "Link Workflow"}
                </Button>
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
                    Authorize raise (+5M tokens) & Resume
                  </Button>
                </div>
              )}

              <div className={`rounded-xl border p-4 text-xs ${campaign.workflow_id ? "border-violet-200 bg-violet-50/70" : "border-amber-200 bg-amber-50/70"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-bold uppercase tracking-wide text-[11px] mb-1">
                      {campaign.workflow_id ? "Workflow-driven evaluation dashboard" : "Workflow required"}
                    </div>
                    <p className="text-muted-foreground leading-relaxed">
                      {campaign.workflow_id
                        ? "Files added here run through the linked workflow once per selected model, and the results stay on this model evaluation dashboard."
                        : "Link a workflow before adding files. This page now evaluates only the files you explicitly select or upload here, and it no longer auto-runs every workspace file."}
                    </p>
                  </div>
                  {campaign.workflow_id && (
                    <div className="shrink-0 rounded-full bg-violet-100 px-3 py-1 font-semibold text-violet-700">
                      Workflow attached
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Active models on this dashboard</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Add another LLM at any time. The new model will run across every file already linked to this dashboard.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddModelDialog(true)}
                    className="gap-1.5 self-start text-xs text-primary border-primary/20 hover:bg-primary/5"
                  >
                    <Plus size={13} /> Add Another Model
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {campaignModels.map((model) => (
                    <span
                      key={model}
                      className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary"
                    >
                      {model}
                    </span>
                  ))}
                </div>
              </div>

              {/* Top Cost / Accuracy Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {campaignModels.map(model => {
                  const stat = usageStats.find(s => s.model === model);
                  const accuracy = benchmarkAccuracy?.[model];
                  const processingDocs = documents.filter((doc) => {
                    const status = getModelRunStatus(doc, model);
                    return status === "processing" || status === "pending";
                  });
                  const failedDocs = documents.filter((doc) => {
                    const status = getModelRunStatus(doc, model);
                    return status === "failed" || status === "suspended_limit";
                  });
                  const missingDocs = documents.filter((doc) => getModelRunStatus(doc, model) === "missing");
                  return (
                    <Card key={model} className="border border-border/40 bg-card/10 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
                      <CardHeader className="pb-2 border-b border-border/10 bg-muted/5 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold text-xs truncate max-w-[180px]">{model}</div>
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              {processingDocs.length > 0
                                ? `${processingDocs.length} file${processingDocs.length === 1 ? "" : "s"} active`
                                : failedDocs.length > 0
                                  ? `${failedDocs.length} failed`
                                  : missingDocs.length > 0
                                    ? `${missingDocs.length} missing result`
                                    : "All visible files synced"}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRetryModel(model)}
                            disabled={retryingModel !== null || isPolling}
                            className="h-7 gap-1.5 px-2 text-[10px] font-semibold"
                          >
                            <RefreshCw className={`h-3 w-3 ${retryingModel === model ? 'animate-spin' : ''}`} />
                            Retry failed
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-2.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground flex items-center gap-1"><DollarSign size={13} /> Overall Cost</span>
                          <span className="font-bold text-primary">${(stat?.cost || 0).toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Cumulative Tokens</span>
                          <span className="font-medium">{(((stat?.input_tokens || 0) + (stat?.output_tokens || 0)) / 1000).toFixed(1)}k</span>
                        </div>
                        <div className="flex justify-between items-center text-xs pl-3 border-l border-muted/50">
                          <span className="text-muted-foreground/80">└ Input Tokens</span>
                          <span className="font-medium text-muted-foreground">{(stat?.input_tokens || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs pl-3 border-l border-muted/50">
                          <span className="text-muted-foreground/80">└ Output Tokens</span>
                          <span className="font-medium text-muted-foreground">{(stat?.output_tokens || 0).toLocaleString()}</span>
                        </div>

                        {(processingDocs.length > 0 || failedDocs.length > 0 || missingDocs.length > 0) && (
                          <div className="border-t border-border/20 pt-3 space-y-2">
                            {processingDocs.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Processing files</div>
                                {processingDocs.slice(0, 3).map((doc) => (
                                  <div key={`${model}-${doc.document_id}-processing`} className="truncate text-[11px] text-primary">
                                    {basename(doc.filename)}
                                  </div>
                                ))}
                                {processingDocs.length > 3 && (
                                  <div className="text-[10px] text-muted-foreground">
                                    +{processingDocs.length - 3} more
                                  </div>
                                )}
                              </div>
                            )}
                            {failedDocs.length > 0 && (
                              <div className="text-[11px] text-destructive">
                                {failedDocs.length} file{failedDocs.length === 1 ? "" : "s"} failed on this model.
                              </div>
                            )}
                            {missingDocs.length > 0 && (
                              <div className="text-[11px] text-amber-600">
                                {missingDocs.length} file{missingDocs.length === 1 ? "" : "s"} finished without a saved result on this model.
                              </div>
                            )}
                          </div>
                        )}

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
              <div className="rounded-xl border border-border/40 bg-card shadow-sm w-full">
                <div className="p-4 border-b border-border/30 bg-muted/10 flex justify-between items-center text-xs text-muted-foreground">
                  <span className="font-medium">{documents.length} evaluation file{documents.length === 1 ? "" : "s"} on this dashboard</span>
                  <div className="flex items-center gap-2">
                    {hasAnyFailedRuns && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRetryAllFailed}
                        disabled={retryingAllFailed || isPolling}
                        className="h-7 gap-1.5 px-2 text-[10px] font-semibold"
                      >
                        <RefreshCw className={`h-3 w-3 ${retryingAllFailed ? "animate-spin" : ""}`} />
                        Retry all failed
                      </Button>
                    )}
                    {isPolling && (
                      <span className="flex items-center gap-1.5 text-primary animate-pulse font-semibold">
                        <RefreshCw className="animate-spin h-3.5 w-3.5" /> Workflow execution active...
                      </span>
                    )}
                  </div>
                </div>

                {documents.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10 text-center">
                    <div className="rounded-full bg-muted/40 p-4">
                      <Layers className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold">No files added yet</h3>
                      <p className="text-xs text-muted-foreground max-w-md">
                        Add workspace files or upload local files here. Each selected file will run through the linked workflow once per selected model, and the results will appear on this evaluation dashboard.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setShowLinkDocumentsDialog(true)} className="gap-1.5 text-xs">
                        <Layers size={13} /> Link Workspace Files
                      </Button>
                      <Button size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5 text-xs">
                        <Upload size={13} /> Upload Local Files
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 z-20 bg-card border-b border-border/30">
                        <tr>
                          <th 
                            style={{ 
                              width: `${columnWidths["filename"] || 260}px`, 
                              minWidth: `${columnWidths["filename"] || 260}px`, 
                              maxWidth: `${columnWidths["filename"] || 260}px` 
                            }}
                            className="p-3.5 font-bold border-r border-border/20 relative group bg-card select-none"
                          >
                            <span>Filename</span>
                            <div
                              onMouseDown={(e) => startResize(e, "filename")}
                              className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity select-none z-30"
                            />
                          </th>
                          {schemaColumns.map((col) => (
                            <th key={col.name} className="p-3.5 font-bold border-r border-border/20 text-center bg-card" colSpan={campaignModels.length || 1}>
                              {col.name}
                            </th>
                          ))}
                        </tr>
                        <tr className="border-b border-border/20 bg-muted/10">
                          <td 
                            style={{ 
                              width: `${columnWidths["filename"] || 260}px`, 
                              minWidth: `${columnWidths["filename"] || 260}px`, 
                              maxWidth: `${columnWidths["filename"] || 260}px` 
                            }}
                            className="p-2 border-r border-border/20 text-[10px] font-medium text-muted-foreground bg-muted/20"
                          >
                            Selected document
                          </td>
                          {schemaColumns.map((col) => (
                            campaignModels.map((model) => (
                              <td 
                                key={`${col.name}-${model}`} 
                                style={{ 
                                  width: `${columnWidths[`${col.name}-${model}`] || 180}px`, 
                                  minWidth: `${columnWidths[`${col.name}-${model}`] || 180}px`, 
                                  maxWidth: `${columnWidths[`${col.name}-${model}`] || 180}px` 
                                }}
                                className="p-2 text-center text-muted-foreground text-[10px] font-medium border-r border-border/20 relative group bg-muted/20 select-none"
                              >
                                <div className="flex items-center justify-center gap-1 group">
                                  <span className="truncate max-w-[100px] font-semibold text-foreground/90" title={model}>{model}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleRetryModel(model);
                                    }}
                                    title={`Retry all failed runs for ${model}`}
                                    className="p-0.5 rounded hover:bg-muted text-muted-foreground/60 hover:text-primary transition-colors cursor-pointer"
                                    disabled={retryingModel === model}
                                  >
                                    <RefreshCw className={`h-2.5 w-2.5 ${retryingModel === model ? "animate-spin text-primary" : ""}`} />
                                  </button>
                                </div>
                                {(() => {
                                  const stats = getModelStatsForField(model, col.name);
                                  return (
                                    <div className="mt-1 text-[9px] text-muted-foreground/80 space-y-0.5 font-normal">
                                      <div>Values: <span className="font-bold text-foreground">{stats.completed}</span>/{stats.total}</div>
                                      <div className="text-[8px] flex items-center justify-center gap-1.5 opacity-80">
                                        <span className="text-primary">● {stats.running} run</span>
                                        <span className="text-destructive">● {stats.failed} fail</span>
                                      </div>
                                    </div>
                                  );
                                })()}
                                <div
                                  onMouseDown={(e) => startResize(e, `${col.name}-${model}`)}
                                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity select-none z-30"
                                />
                              </td>
                            ))
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {documents.map((doc) => (
                          <tr key={doc.document_id} className="border-b border-border/15 hover:bg-muted/5 transition-colors">
                            <td 
                              style={{ 
                                width: `${columnWidths["filename"] || 260}px`, 
                                minWidth: `${columnWidths["filename"] || 260}px`, 
                                maxWidth: `${columnWidths["filename"] || 260}px` 
                              }}
                              className="p-3 border-r border-border/20 align-top" 
                              title={doc.filename}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-medium max-w-[220px] truncate">{basename(doc.filename)}</div>
                                  <div className="mt-1 text-[10px] text-muted-foreground">
                                    {campaignModels.filter((model) => {
                                      const status = getModelRunStatus(doc, model);
                                      return status === "failed" || status === "suspended_limit";
                                    }).length} failed
                                    {" • "}
                                    {campaignModels.filter((model) => getModelRunStatus(doc, model) === "missing").length} missing
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleRetryDocument(doc.document_id);
                                  }}
                                  disabled={retryingDocumentKey === `${doc.document_id}:all`}
                                  className="h-7 shrink-0 gap-1.5 px-2 text-[10px] font-semibold"
                                >
                                  <RefreshCw className={`h-3 w-3 ${retryingDocumentKey === `${doc.document_id}:all` ? "animate-spin" : ""}`} />
                                  Retry file
                                </Button>
                              </div>
                            </td>
                            {schemaColumns.map((col) => (
                              campaignModels.map((model) => {
                                const run = getModelRun(doc, model);
                                const vals = run.values || {};
                                const value = vals[col.name];
                                const reasoning = vals[`${col.name}_reasoning`] || "No reasoning logged.";
                                const history = vals[`${col.name}_history`] || [];
                                const runStatus = getModelRunStatus(doc, model);
                                const isPending = runStatus === "processing" || runStatus === "pending";
                                const isFailed = runStatus === "failed" || runStatus === "suspended_limit";
                                const isMissing = runStatus === "missing";

                                return (
                                  <td
                                    key={`${doc.document_id}-${col.name}-${model}`}
                                    style={{ 
                                      width: `${columnWidths[`${col.name}-${model}`] || 180}px`, 
                                      minWidth: `${columnWidths[`${col.name}-${model}`] || 180}px`, 
                                      maxWidth: `${columnWidths[`${col.name}-${model}`] || 180}px` 
                                    }}
                                    onClick={() => setSelectedCellView({
                                      documentId: doc.document_id,
                                      filename: basename(doc.filename),
                                      modelName: model,
                                      columnName: col.name,
                                      value: value !== undefined && value !== null && value !== "" ? String(value) : "—",
                                      reasoning,
                                      history,
                                      status: runStatus,
                                      errorMessage: run.error_message || "",
                                      trace: run.trace || [],
                                      context: run.context || {},
                                      cost: run.cost,
                                      inputTokens: run.input_tokens,
                                      outputTokens: run.output_tokens,
                                    })}
                                    className={`p-3 text-center border-r border-border/20 align-top cursor-pointer hover:bg-muted/10 transition-colors ${isFailed ? "bg-red-500/5" : isMissing ? "bg-amber-500/5" : ""}`}
                                  >
                                    <div className="flex h-[88px] flex-col items-center justify-start overflow-hidden">
                                      {isPending ? (
                                        <span className="flex items-center justify-center gap-1.5 text-muted-foreground animate-pulse text-[10px]">
                                          <RefreshCw className="h-3 w-3 animate-spin text-primary" /> {runStatus}...
                                        </span>
                                      ) : isFailed ? (
                                        <div className="flex flex-col items-center gap-1.5 justify-center">
                                          <span className="flex items-center justify-center gap-1 text-destructive font-bold text-[10px]">
                                            <AlertTriangle size={12} /> {runStatus === "suspended_limit" ? "Suspended" : "Failed"}
                                          </span>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-1.5 text-[9px] text-muted-foreground hover:text-primary hover:bg-muted font-medium flex items-center gap-1"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              void handleRetryDocument(doc.document_id, model);
                                            }}
                                            disabled={retryingDocumentKey === `${doc.document_id}:${model}`}
                                          >
                                            <RefreshCw className={`h-2.5 w-2.5 ${retryingDocumentKey === `${doc.document_id}:${model}` ? "animate-spin text-primary" : ""}`} />
                                            Retry
                                          </Button>
                                        </div>
                                      ) : isMissing ? (
                                        <div className="space-y-1.5 flex flex-col items-center justify-center">
                                          <span className="flex items-center justify-center gap-1 text-amber-600 font-bold text-[10px]">
                                            <AlertTriangle size={12} /> No result
                                          </span>
                                          <div className="text-[9px] text-muted-foreground">Run data was not saved.</div>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-1.5 text-[9px] text-muted-foreground hover:text-primary hover:bg-muted font-medium flex items-center gap-1"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              void handleRetryDocument(doc.document_id, model);
                                            }}
                                            disabled={retryingDocumentKey === `${doc.document_id}:${model}`}
                                          >
                                            <RefreshCw className={`h-2.5 w-2.5 ${retryingDocumentKey === `${doc.document_id}:${model}` ? "animate-spin text-primary" : ""}`} />
                                            Retry
                                          </Button>
                                        </div>
                                      ) : (
                                        <>
                                          <div
                                            className={`max-w-[170px] overflow-hidden text-center font-semibold underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 ${
                                              isLongformColumn(col.name) ? "line-clamp-3 text-[11px] leading-4" : "line-clamp-2 break-words"
                                            }`}
                                          >
                                            {value !== undefined && value !== null && value !== "" ? String(value) : "—"}
                                          </div>
                                          <div className="mt-1 text-[9px] text-muted-foreground/75 font-normal">
                                            {run.trace?.length ? `${run.trace.length} trace node${run.trace.length === 1 ? "" : "s"}` : "No trace"}
                                          </div>
                                          {(run.input_tokens || run.output_tokens) ? (
                                            <div className="mt-0.5 text-[8.5px] text-muted-foreground/60 font-mono">
                                              in:{run.input_tokens || 0} / out:{run.output_tokens || 0}
                                            </div>
                                          ) : null}
                                          {isLongformColumn(col.name) && (
                                            <div className="mt-1 text-[9px] font-medium text-muted-foreground">Click to read full text</div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </td>
                                );
                              })
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
                        Open
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

              {/* Evaluation Source — always prompt-based at creation */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  System Prompt / Codebook
                </label>
                <Textarea
                  required
                  rows={8}
                  placeholder="Paste research rules or scoring rubrics here. The AI will extract discretion/delegation scores across all selected models based on these instructions."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={creating}
                  className="font-mono text-sm leading-relaxed max-h-72 overflow-y-auto"
                />
                <p className="text-[11px] text-muted-foreground">
                  After creating the campaign, use the <span className="font-semibold text-violet-600">⚡ Link Workflow</span> button, then add files directly on the evaluation page using <span className="font-semibold">Link Workspace Files</span> or <span className="font-semibold">Upload Local Files</span>.
                </p>
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
                      Analyzing...
                    </>
                  ) : (
                    "Create Evaluation Campaign"
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

        {/* Link Workflow Dialog */}
        <Dialog open={showLinkWorkflowDialog} onOpenChange={(open) => !linkingWorkflow && setShowLinkWorkflowDialog(open)}>
          <DialogContent className="w-[90vw] sm:max-w-lg max-h-[85vh] overflow-y-auto p-5">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                ⚡ Link Workflow to Campaign
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <p className="text-xs text-muted-foreground">
                When a workflow is linked, every file uploaded to this dashboard will run through the workflow
                <strong> once per selected model</strong> (with model injected). Results populate the dashboard columns automatically.
              </p>

              {campaign?.workflow_id && (
                <div className="flex items-center justify-between border border-violet-200 bg-violet-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-violet-700">Currently linked:</span>
                    <span className="text-xs text-violet-600 font-mono">{workflows.find((w: any) => w.id === campaign.workflow_id)?.name || campaign.workflow_id}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedWorkflowId(""); }}
                    className="text-[11px] text-destructive font-bold hover:underline"
                  >
                    Unlink
                  </button>
                </div>
              )}

              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select a Workflow</p>
                {workflows.length === 0 ? (
                  <div className="border rounded-lg p-6 text-center text-xs text-muted-foreground">
                    No workflows found in this workspace. Create one in the Workflows section first.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {workflows.map((wf: any) => (
                      <div
                        key={wf.id}
                        onClick={() => setSelectedWorkflowId(selectedWorkflowId === wf.id ? "" : wf.id)}
                        className={`border rounded-lg p-3 cursor-pointer transition-all ${selectedWorkflowId === wf.id ? "border-violet-400 bg-violet-50 shadow-sm" : "border-border hover:border-violet-200 hover:bg-muted/20"}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">{wf.name}</span>
                          {selectedWorkflowId === wf.id && (
                            <span className="text-[10px] text-violet-700 font-bold bg-violet-100 px-2 py-0.5 rounded-full">Selected</span>
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

              <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                <p className="text-[11px] text-muted-foreground font-semibold">How it works:</p>
                <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">
                  <li>Each uploaded file runs through the workflow <strong>N times</strong> (once per model)</li>
                  <li>All N model runs happen <strong>in parallel</strong> — separate API keys, no waiting</li>
                  <li>Each run uses max 2 concurrent files (<em>Semaphore(2)</em>) per model</li>
                  <li>Results land in the dashboard columns, side-by-side per model</li>
                </ul>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => setShowLinkWorkflowDialog(false)} disabled={linkingWorkflow}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleLinkWorkflow}
                  disabled={linkingWorkflow}
                  className="gap-2 font-bold"
                >
                  {linkingWorkflow ? (
                    <><div className="h-3.5 w-3.5 border-2 border-background border-t-transparent rounded-full animate-spin" /> Saving...</>
                  ) : selectedWorkflowId ? "Link Workflow" : "Unlink Workflow"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showLinkDocumentsDialog} onOpenChange={setShowLinkDocumentsDialog}>
          <DialogContent className="w-[96vw] sm:max-w-xl max-h-[85vh] flex flex-col p-5">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2 border-b pb-2">
                <Layers size={18} className="text-primary" />
                Link Workspace Files
              </DialogTitle>
            </DialogHeader>
            
            <p className="text-xs text-muted-foreground my-2">
              Choose the files you want to evaluate on this dashboard. Only the selected files will run through the linked workflow.
            </p>

            <div className="mb-3">
              <Input
                type="text"
                placeholder="Search workspace files by name..."
                value={linkSearchQuery}
                onChange={(e) => setLinkSearchQuery(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            <div className="flex-grow overflow-y-auto border border-border/80 rounded-lg p-2 bg-muted/5 min-h-[300px] max-h-[45vh]">
              {globalDocs.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-12">No workspace documents found.</p>
              ) : (() => {
                const unlinkedDocs = globalDocs.filter((gd) => !documents.some((d) => d.document_id === gd.id));
                const filteredUnlinkedDocs = unlinkedDocs.filter((gd) => {
                  if (!linkSearchQuery.trim()) return true;
                  const q = linkSearchQuery.toLowerCase();
                  const nameMatch = gd.filename.toLowerCase().includes(q);
                  const tags = gd.metadata?.tags || [];
                  const tagsMatch = tags.some((t: string) => t.toLowerCase().includes(q));
                  return nameMatch || tagsMatch;
                });

                if (filteredUnlinkedDocs.length === 0) {
                  return <p className="text-center text-xs text-muted-foreground py-12">No matching workspace documents found.</p>;
                }

                // Node definitions
                interface LinkFileNode {
                  type: "file";
                  name: string;
                  document: any;
                }

                interface LinkFolderNode {
                  type: "folder";
                  name: string;
                  path: string;
                  children: { [key: string]: LinkFileNode | LinkFolderNode };
                }

                // Build tree helper
                const root: LinkFolderNode = {
                  type: "folder",
                  name: "",
                  path: "",
                  children: {},
                };

                for (const doc of filteredUnlinkedDocs) {
                  const parts = doc.filename.split("/");
                  let current = root;
                  for (let i = 0; i < parts.length; i++) {
                    const part = parts[i];
                    const isLast = i === parts.length - 1;
                    const currentPath = current.path ? `${current.path}/${part}` : part;
                    if (isLast) {
                      current.children[part] = {
                        type: "file",
                        name: part,
                        document: doc,
                      };
                    } else {
                      if (!current.children[part]) {
                        current.children[part] = {
                          type: "folder",
                          name: part,
                          path: currentPath,
                          children: {},
                        };
                      }
                      current = current.children[part] as LinkFolderNode;
                    }
                  }
                }

                const getDocsInFolder = (node: LinkFolderNode): any[] => {
                  const docs: any[] = [];
                  const traverse = (n: LinkFolderNode) => {
                    for (const key in n.children) {
                      const child = n.children[key];
                      if (child.type === "file") {
                        docs.push(child.document);
                      } else {
                        traverse(child);
                      }
                    }
                  };
                  traverse(node);
                  return docs;
                };

                const toggleFolderSelection = (folderNode: LinkFolderNode) => {
                  const folderDocs = getDocsInFolder(folderNode);
                  const folderDocIds = folderDocs.map(d => d.id);
                  const allSelected = folderDocIds.every(id => selectedGlobalDocIds.includes(id));
                  if (allSelected) {
                    setSelectedGlobalDocIds(prev => prev.filter(id => !folderDocIds.includes(id)));
                  } else {
                    setSelectedGlobalDocIds(prev => {
                      const newSelection = [...prev];
                      folderDocIds.forEach(id => {
                        if (!newSelection.includes(id)) newSelection.push(id);
                      });
                      return newSelection;
                    });
                  }
                };

                const getFolderSelectionState = (folderNode: LinkFolderNode) => {
                  const folderDocs = getDocsInFolder(folderNode);
                  if (folderDocs.length === 0) return { checked: false, indeterminate: false };
                  const selectedCount = folderDocs.filter(d => selectedGlobalDocIds.includes(d.id)).length;
                  return {
                    checked: selectedCount === folderDocs.length,
                    indeterminate: selectedCount > 0 && selectedCount < folderDocs.length
                  };
                };

                const getSortedChildren = (children: { [key: string]: LinkFileNode | LinkFolderNode }) => {
                  return Object.values(children).sort((a, b) => {
                    if (a.type !== b.type) {
                      return a.type === "folder" ? -1 : 1;
                    }
                    return a.name.localeCompare(b.name);
                  });
                };

                // Collapsible folder states for link modal
                const renderTree = (node: LinkFolderNode, depth = 0): React.ReactNode[] => {
                  const sortedChildren = getSortedChildren(node.children);
                  const rows: React.ReactNode[] = [];

                  sortedChildren.forEach((child) => {
                    if (child.type === "folder") {
                      const isExpanded = expandedFolders[child.path] !== false; // default to true
                      const folderDocs = getDocsInFolder(child);
                      const { checked, indeterminate } = getFolderSelectionState(child);

                      rows.push(
                        <div 
                           key={child.path} 
                           className="flex items-center justify-between py-1.5 px-2 hover:bg-muted/40 rounded transition-colors text-xs select-none"
                           style={{ paddingLeft: `${depth * 16 + 8}px` }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedFolders(prev => ({ ...prev, [child.path]: !isExpanded }));
                              }}
                              className="p-0.5 hover:bg-muted rounded text-muted-foreground transition-transform"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                              >
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                            </button>
                            <input
                              type="checkbox"
                              checked={checked}
                              ref={(el) => {
                                if (el) {
                                  el.indeterminate = indeterminate;
                                }
                              }}
                              onChange={() => toggleFolderSelection(child)}
                              className="rounded border-input text-primary focus:ring-ring shrink-0 h-3.5 w-3.5"
                            />
                            <div className="rounded-md bg-primary/10 p-0.5 text-primary">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />
                              </svg>
                            </div>
                            <span className="font-semibold truncate text-foreground/95" title={child.name}>
                              {child.name}
                            </span>
                            <span className="text-[9px] text-muted-foreground bg-muted/80 px-1 rounded">
                              {folderDocs.length}
                            </span>
                          </div>
                        </div>
                      );

                      if (isExpanded) {
                        rows.push(...renderTree(child, depth + 1));
                      }
                    } else {
                      const doc = child.document;
                      const isSelected = selectedGlobalDocIds.includes(doc.id);
                      rows.push(
                        <div 
                          key={doc.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedGlobalDocIds(selectedGlobalDocIds.filter((id) => id !== doc.id));
                            } else {
                              setSelectedGlobalDocIds([...selectedGlobalDocIds, doc.id]);
                            }
                          }}
                          className={`flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/40 transition-all text-xs ${
                            isSelected ? "bg-primary/5" : ""
                          }`}
                          style={{ paddingLeft: `${depth * 16 + 28}px` }}
                        >
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            readOnly
                            className="rounded border-input text-primary focus:ring-ring shrink-0 h-3.5 w-3.5"
                          />
                          <div className="flex-1 truncate">
                            <div className="flex items-center gap-1.5">
                              <div className="rounded bg-muted p-0.5 text-muted-foreground flex-shrink-0">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                  <line x1="16" y1="13" x2="8" y2="13" />
                                  <line x1="16" y1="17" x2="8" y2="17" />
                                  <polyline points="10 9 9 9 8 9" />
                                </svg>
                              </div>
                              <span className="truncate font-medium text-foreground/90" title={doc.filename.split("/").pop()}>
                                {doc.filename.split("/").pop()}
                              </span>
                            </div>
                            {doc.metadata?.tags?.length ? (
                              <div className="text-[10px] text-muted-foreground mt-0.5 pl-6 flex items-center gap-1">
                                <span>Tags:</span>
                                <span className="italic">{doc.metadata.tags.join(", ")}</span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    }
                  });

                  return rows;
                };

                return <div className="divide-y divide-border/10">{renderTree(root)}</div>;
              })()}
            </div>

            <div className="flex justify-between items-center pt-3 mt-2 border-t">
              <div className="text-xs text-muted-foreground">
                {selectedGlobalDocIds.length} file{selectedGlobalDocIds.length === 1 ? "" : "s"} selected
              </div>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" onClick={() => setShowLinkDocumentsDialog(false)} disabled={linkingDocs}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleLinkDocuments} disabled={linkingDocs || selectedGlobalDocIds.length === 0} className="gap-2 font-bold">
                  {linkingDocs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
                  Run Selected Files
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Inspect Coded Cell Modal */}
        <Dialog open={selectedCellView !== null} onOpenChange={(open) => !open && setSelectedCellView(null)}>
          <DialogContent className="w-[94vw] sm:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto p-6">
            <DialogHeader className="border-b pb-3 mb-4">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <GitBranch className="text-primary" size={18} />
                LLM Result, Reasoning, and Workflow Trace
              </DialogTitle>
            </DialogHeader>

            {selectedCellView && (
              <div className="space-y-5 text-sm">
                {/* Metadata cards */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="bg-muted/30 p-2.5 rounded-lg border border-border/20 text-center">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Variable</span>
                    <span className="font-bold text-xs truncate block">{selectedCellView.columnName}</span>
                  </div>
                  <div className="bg-muted/30 p-2.5 rounded-lg border border-border/20 text-center">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Model Identifier</span>
                    <span className="font-bold text-xs truncate block text-primary">{selectedCellView.modelName}</span>
                  </div>
                  <div className="bg-muted/30 p-2.5 rounded-lg border border-border/20 text-center">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Run Status</span>
                    <span className="font-bold text-xs truncate block">{selectedCellView.status}</span>
                  </div>
                  <div className="bg-muted/30 p-2.5 rounded-lg border border-border/20 text-center">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Trace Nodes</span>
                    <span className="font-bold text-xs truncate block">{selectedCellView.trace?.length || 0}</span>
                  </div>
                </div>

                <div className="bg-muted/30 p-2.5 rounded-lg border border-border/20">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Document File</span>
                  <span className="font-semibold text-xs truncate block">{selectedCellView.filename}</span>
                </div>

                {/* Economics breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-muted/20 p-2.5 rounded-lg border border-border/10 text-center">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Input Tokens</span>
                    <span className="font-bold text-xs truncate block">{selectedCellView.inputTokens !== undefined && selectedCellView.inputTokens !== null ? selectedCellView.inputTokens.toLocaleString() : "—"}</span>
                  </div>
                  <div className="bg-muted/20 p-2.5 rounded-lg border border-border/10 text-center">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Output Tokens</span>
                    <span className="font-bold text-xs truncate block">{selectedCellView.outputTokens !== undefined && selectedCellView.outputTokens !== null ? selectedCellView.outputTokens.toLocaleString() : "—"}</span>
                  </div>
                  <div className="bg-muted/20 p-2.5 rounded-lg border border-border/10 text-center">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Estimated Cost</span>
                    <span className="font-bold text-xs truncate block text-emerald-600 dark:text-emerald-500">{selectedCellView.cost !== undefined && selectedCellView.cost !== null ? `$${selectedCellView.cost.toFixed(5)}` : "—"}</span>
                  </div>
                </div>

                {/* Predicted Value */}
                <div className="space-y-1">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Predicted Value</span>
                  <div className="bg-primary/5 text-primary border border-primary/20 rounded-lg p-3 font-mono font-bold text-sm inline-block">
                    {selectedCellView.value}
                  </div>
                </div>

                {selectedCellView.errorMessage && (
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Run Error</span>
                    <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 text-xs whitespace-pre-wrap">
                      {selectedCellView.errorMessage}
                    </div>
                  </div>
                )}

                {/* Reasoning */}
                <div className="space-y-1">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">AI Reasoning & Evidence</span>
                  <div className="bg-card border rounded-lg p-4 font-normal text-xs leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto shadow-inner">
                    {selectedCellView.reasoning}
                  </div>
                </div>

                {(selectedCellView.status === "failed" || selectedCellView.status === "suspended_limit" || selectedCellView.status === "missing") && (
                  <div className="flex justify-start">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleRetryDocument(selectedCellView.documentId, selectedCellView.modelName)}
                      disabled={retryingDocumentKey === `${selectedCellView.documentId}:${selectedCellView.modelName}`}
                      className="gap-2 text-xs font-bold"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${retryingDocumentKey === `${selectedCellView.documentId}:${selectedCellView.modelName}` ? "animate-spin" : ""}`} />
                      Retry this model for this file
                    </Button>
                  </div>
                )}

                {selectedCellView.trace && selectedCellView.trace.length > 0 && (
                  <div className="space-y-2 pt-3 border-t">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Workflow Trace</span>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedCellView.trace.map((item: any, idx: number) => (
                        <div key={idx} className="rounded-lg border bg-muted/20 p-3 text-[11px]">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <span className="font-bold">{item.name || item.node_id}</span>
                            <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold">
                              {item.status || "completed"}
                            </span>
                          </div>
                          {item.message ? (
                            <div className="text-muted-foreground mb-2 whitespace-pre-wrap">{item.message}</div>
                          ) : null}
                          <pre className="rounded-md bg-background/80 p-2 overflow-x-auto whitespace-pre-wrap break-words">
                            {JSON.stringify(item.outputs || {}, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedCellView.context && Object.keys(selectedCellView.context).length > 0 && (
                  <div className="space-y-2 pt-3 border-t">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Workflow Context</span>
                    <pre className="rounded-lg border bg-muted/20 p-3 text-[11px] overflow-x-auto whitespace-pre-wrap break-words max-h-56 overflow-y-auto">
                      {JSON.stringify(selectedCellView.context, null, 2)}
                    </pre>
                  </div>
                )}

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
