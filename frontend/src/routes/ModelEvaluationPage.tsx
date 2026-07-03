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
  Loader2, Layers, GitBranch, X, Search, SlidersHorizontal, Check, Eye, EyeOff
} from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { WorkflowTraceGraph } from "@/features/workflows/WorkflowTraceGraph";
import { workflowApi } from "@/lib/workflowApi";
import type { WorkflowDefinition } from "@/types/workflow";

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
  timing?: ModelRunTiming;
}

interface ModelRunTiming {
  queued_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  queue_wait_ms?: number | null;
  total_run_ms?: number | null;
  source_text_load_ms?: number | null;
  workflow_execute_ms?: number | null;
  persist_result_ms?: number | null;
}

interface BenchmarkRow {
  Filename: string;
  "DelegationLaw (Y/N)"?: string;
  RG_Discretion_Rank?: string;
  [key: string]: any;
}

interface ParsedBenchmarkFile {
  headers: string[];
  rows: BenchmarkRow[];
}

interface WorkflowStrategy {
  id: string;
  label: string;
  rankKey: string;
  prefix: string;
}

interface BenchmarkTargetOption {
  key: string;
  label: string;
  type: string;
}

interface BenchmarkColumnMapping {
  csvHeader: string;
  targetKeys: string[];
}

interface BenchmarkTargetMetric {
  key: string;
  label: string;
  csvHeader: string;
  total: number;
  matches: number;
  percent: number;
  meanAbsoluteError: number | null;
}

interface BenchmarkStrategyMetrics {
  strategyId: string;
  total: number;
  matches: number;
  percent: number;
  targets: BenchmarkTargetMetric[];
}

interface BenchmarkModelMetrics {
  strategyOrder: string[];
  strategies: Record<string, BenchmarkStrategyMetrics>;
}

interface BenchmarkCoverage {
  matchedDocuments: number;
  unmatchedDocuments: number;
}

interface BenchmarkTargetMatch {
  benchmarkValue: string;
  mismatch: boolean;
  mapping?: BenchmarkColumnMapping;
}

const IDENTIFIER_HEADER_CANDIDATES = ["filename", "document", "documentname", "plnum", "publiclaw"];

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDuration(durationMs?: number | null): string {
  if (durationMs === undefined || durationMs === null) return "—";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)} s`;
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current.trim());
  return values.map((item) => item.replace(/^["']|["']$/g, ""));
}

function parseBenchmarkFile(text: string): ParsedBenchmarkFile {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = parseDelimitedLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => {
    const rowValues = parseDelimitedLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = rowValues[index] || "";
    });
    return row as BenchmarkRow;
  });

  return { headers, rows };
}

function getBenchmarkIdentifierCandidates(headers: string[]): string[] {
  return headers.filter((header) => IDENTIFIER_HEADER_CANDIDATES.includes(normalizeKey(header)));
}

function getBenchmarkIdentifierHeader(headers: string[]): string | null {
  return getBenchmarkIdentifierCandidates(headers)[0] || null;
}

function normalizeValueForType(value: unknown, type?: string): string {
  if (value === undefined || value === null) return "";
  const normalized = String(value).trim();
  if (!normalized) return "";

  if (type === "boolean") {
    const lowered = normalized.toLowerCase();
    if (["true", "yes", "y", "1", "t", "-1"].includes(lowered)) return "true";
    if (["false", "no", "n", "0", "f"].includes(lowered)) return "false";
  }

  if (type === "number" || type === "integer" || type === "decimal") {
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) return String(numeric);
  }

  return normalized.toLowerCase();
}

function numericValue(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(String(value).trim());
  return Number.isFinite(numeric) ? numeric : null;
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
  "nousresearch/hermes-3-llama-3.1-405b",
  "qwen/qwen3-235b-a22b-2507",
  "deepseek/deepseek-v4-pro",
  "z-ai/glm-5.2",
  "kimi-k2.7-code",
  "kimi-k2.6",
  "kimi-k2.5",
  "kimi",
  "moonshot",
  "mistral-large",
  "mistral-codestral",
  "mistral-nemo",
  "minimax-01",
  "mistral-small-2603",
  "qwen3.7-plus",
  "granite-4.1-8b"
];

const MODEL_USAGE_ALIASES: Record<string, string[]> = {
  "deepseek-chat": ["deepseek-v4-flash"],
};

function normalizeModelKey(model: string): string {
  return model.toLowerCase().split("/").pop() || "";
}

function matchUsageStat(model: string, stats: ModelStats[]): ModelStats | undefined {
  const targetModel = normalizeModelKey(model);
  const aliases = MODEL_USAGE_ALIASES[targetModel] || [];
  return stats.find((entry) => {
    const dbModel = normalizeModelKey(entry.model);
    return dbModel === targetModel || aliases.includes(dbModel);
  });
}

function statusLabel(status: string): string {
  if (status === "pending") return "queued";
  if (status === "processing") return "processing";
  return status;
}

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
  const [traceViewMode, setTraceViewMode] = useState<"list" | "graph">("list");
  const [linkedWorkflowDefinition, setLinkedWorkflowDefinition] = useState<WorkflowDefinition | null>(null);
  const [showLinkDocumentsDialog, setShowLinkDocumentsDialog] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    filename: 260,
  });
  const [hiddenColumns, setHiddenColumns] = useState<Record<string, boolean>>({});
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [columnPickerQuery, setColumnPickerQuery] = useState("");
  const [hiddenModelColumns, setHiddenModelColumns] = useState<Record<string, boolean>>({});
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelPickerQuery, setModelPickerQuery] = useState("");

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
      const status = getModelRunStatus(doc, model);
      
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

  const markModelRetryQueued = (documentIds: string[], modelName?: string) => {
    const targetIds = new Set(documentIds);
    setDocuments((prev) =>
      prev.map((doc) => {
        if (!targetIds.has(doc.document_id)) return doc;
        const nextCodedValues = { ...(doc.coded_values || {}) };
        if (modelName) {
          const currentRun = nextCodedValues[modelName];
          if (currentRun && typeof currentRun === "object") {
            nextCodedValues[modelName] = {
              ...currentRun,
              status: "pending",
              error_message: undefined,
              error_type: undefined,
            };
          }
        }
        return {
          ...doc,
          status: "pending",
          error_message: undefined,
          error_type: undefined,
          coded_values: nextCodedValues,
        };
      })
    );
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
  const [createWorkflowId, setCreateWorkflowId] = useState("");
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

  // Benchmark State
  const [parsedBenchmark, setParsedBenchmark] = useState<ParsedBenchmarkFile | null>(null);
  const [benchmarkAccuracy, setBenchmarkAccuracy] = useState<Record<string, BenchmarkModelMetrics> | null>(null);
  const [benchmarkCoverage, setBenchmarkCoverage] = useState<BenchmarkCoverage | null>(null);
  const [benchmarkIdentifierHeader, setBenchmarkIdentifierHeader] = useState<string | null>(null);
  const [benchmarkMappings, setBenchmarkMappings] = useState<BenchmarkColumnMapping[]>([]);
  const [pendingBenchmark, setPendingBenchmark] = useState<ParsedBenchmarkFile | null>(null);
  const [showBenchmarkMappingDialog, setShowBenchmarkMappingDialog] = useState(false);
  const [selectedBenchmarkStrategyByModel, setSelectedBenchmarkStrategyByModel] = useState<Record<string, string>>({});
  const benchmarkInputRef = useRef<HTMLInputElement>(null);

  const campaignModels = campaign?.model.split(",").map((m) => m.trim()).filter(Boolean) ?? [];
  const visibleCampaignModels = campaignModels.filter((model) => !hiddenModelColumns[model]);
  const schemaColumns = (campaign?.schema ?? []).filter((col) => col?.name);
  const visibleSchemaColumns = schemaColumns.filter((col) => !hiddenColumns[col.name]);
  const benchmarkTargetOptions: BenchmarkTargetOption[] = schemaColumns.map((col) => ({
    key: col.name,
    label: normalizeLabel(col.name),
    type: col.type || "string",
  }));
  const basename = (filename: string) => filename.split("/").pop() || filename;
  const visibleColumnCount = visibleSchemaColumns.length;
  const filteredSchemaColumns = schemaColumns.filter((col) => {
    const query = columnPickerQuery.trim().toLowerCase();
    if (!query) return true;
    return `${col.name} ${normalizeLabel(col.name)} ${col.type || ""}`.toLowerCase().includes(query);
  });

  const toggleColumnVisibility = (columnName: string) => {
    setHiddenColumns((current) => ({
      ...current,
      [columnName]: !current[columnName],
    }));
  };

  const showAllColumns = () => setHiddenColumns({});
  const hideAllColumns = () => setHiddenColumns(
    schemaColumns.reduce<Record<string, boolean>>((acc, column) => {
      acc[column.name] = true;
      return acc;
    }, {})
  );

  const toggleModelVisibility = (modelName: string) => {
    setHiddenModelColumns((current) => ({
      ...current,
      [modelName]: !current[modelName],
    }));
  };

  const showAllModelColumns = () => setHiddenModelColumns({});
  const hideAllModelColumns = () => setHiddenModelColumns(
    campaignModels.reduce<Record<string, boolean>>((acc, model) => {
      acc[model] = true;
      return acc;
    }, {})
  );

  const filteredCampaignModels = campaignModels.filter((model) => {
    const query = modelPickerQuery.trim().toLowerCase();
    if (!query) return true;
    return model.toLowerCase().includes(query);
  });

  const workflowStrategies = (() => {
    const outputEntries = Array.isArray(linkedWorkflowDefinition?.outputs) ? linkedWorkflowDefinition.outputs : [];
    const groupedOutputs = outputEntries
      .map((item) => ({
        key: String(item.key || ""),
        group: String(item.group || ""),
      }))
      .filter((item) => item.key);

    const groupedStrategies = groupedOutputs
      .filter((item) => /discretion.*rank/i.test(item.key) && item.group && !["delegation", "inventory"].includes(item.group.toLowerCase()))
      .map((item) => {
        const rankKey = item.key;
        const prefix = rankKey.includes("_discretion_rank") ? `${rankKey.split("_discretion_rank")[0]}_` : `${rankKey.split("_rank")[0]}_`;
        return {
          id: normalizeKey(item.group),
          label: item.group,
          rankKey,
          prefix,
        } satisfies WorkflowStrategy;
      });

    if (groupedStrategies.length > 0) return groupedStrategies;

    const fallbackRankColumns = schemaColumns
      .map((col) => col.name)
      .filter((name) => /discretion.*rank/i.test(name) && name !== "discretion_rank")
      .map((rankKey) => ({
        id: normalizeKey(rankKey),
        label: normalizeLabel(rankKey.replace(/_discretion_rank$/i, "")),
        rankKey,
        prefix: rankKey.includes("_discretion_rank") ? `${rankKey.split("_discretion_rank")[0]}_` : `${rankKey}_`,
      }));

    return fallbackRankColumns;
  })();
  const supportsWorkflowBenchmark = Boolean(campaign?.workflow_id) && workflowStrategies.length > 0 && benchmarkTargetOptions.length > 0;

  const getModelRun = (doc: CampaignDocument, model: string): ModelRunRecord => {
    const run = doc.coded_values?.[model];
    return run && typeof run === "object" ? run : {};
  };

  const getModelRunStatus = (doc: CampaignDocument, model: string): string => {
    const run = getModelRun(doc, model);
    if ((doc.status === "failed") && (run.status === "pending" || run.status === "processing")) {
      return "failed";
    }
    if (typeof run.status === "string" && run.status.trim()) return run.status;
    if (doc.status === "processing" || doc.status === "pending") {
      const hasAnyCompleted = Object.values(doc.coded_values || {}).some(
        (r: any) => r && typeof r === "object" && r.status === "completed"
      );
      if (!hasAnyCompleted) {
        return doc.status;
      }
    }
    return "missing";
  };

  const isSharedBenchmarkTarget = (targetKey: string): boolean =>
    !workflowStrategies.some((strategy) => targetKey === strategy.rankKey || targetKey.startsWith(strategy.prefix));

  const getStrategyTargets = (strategy: WorkflowStrategy): BenchmarkTargetOption[] =>
    benchmarkTargetOptions.filter((target) => isSharedBenchmarkTarget(target.key) || target.key === strategy.rankKey || target.key.startsWith(strategy.prefix));

  const createDefaultBenchmarkMappings = (headers: string[], identifierHeader: string | null): BenchmarkColumnMapping[] => {
    const rankTargets = workflowStrategies.map((strategy) => strategy.rankKey);
    const normalizedHeaderTargets = new Map<string, string[]>();

    headers.forEach((header) => {
      const normalized = normalizeKey(header);
      if (normalized.includes("delegationlaw") || normalized === "delegatelaw" || normalized === "delegatelawyn") {
        normalizedHeaderTargets.set(header, benchmarkTargetOptions.filter((target) => target.key === "delegate_law").map((target) => target.key));
        return;
      }
      if (normalized.includes("discretionrank") || normalized === "rgdiscretionrank") {
        normalizedHeaderTargets.set(header, rankTargets);
      }
    });

    return headers
      .filter((header) => header !== identifierHeader)
      .map((header) => ({
        csvHeader: header,
        targetKeys: normalizedHeaderTargets.get(header) || [],
      }));
  };

  const getBenchmarkRowForDocument = (doc: CampaignDocument): BenchmarkRow | null => {
    if (!parsedBenchmark || !benchmarkIdentifierHeader) return null;
    const identifierIsFilenameLike = ["filename", "document", "documentname"].includes(normalizeKey(benchmarkIdentifierHeader));
    const documentBase = basename(doc.filename).trim().toLowerCase();
    const documentIdentifier = normalizeKey(documentBase);

    return (
      parsedBenchmark.rows.find((row) => {
        const rawIdentifier = String(row[benchmarkIdentifierHeader] || "").trim();
        if (!rawIdentifier) return false;
        if (identifierIsFilenameLike) {
          return basename(rawIdentifier).trim().toLowerCase() === documentBase;
        }
        return normalizeKey(rawIdentifier) === documentIdentifier || documentBase.includes(rawIdentifier.toLowerCase());
      }) || null
    );
  };

  const getBenchmarkTargetMatch = (doc: CampaignDocument, model: string, targetKey: string): BenchmarkTargetMatch | null => {
    const benchmarkRow = getBenchmarkRowForDocument(doc);
    if (!benchmarkRow) return null;
    const mapping = benchmarkMappings.find((entry) => entry.targetKeys.includes(targetKey));
    if (!mapping) return null;

    const target = benchmarkTargetOptions.find((item) => item.key === targetKey);
    const benchmarkValue = benchmarkRow[mapping.csvHeader];
    if (benchmarkValue === undefined || benchmarkValue === null || benchmarkValue === "") return null;

    const modelRun = getModelRun(doc, model);
    if (modelRun.status !== "completed") return null;
    const modelValue = modelRun.values?.[targetKey];
    const mismatch = normalizeValueForType(benchmarkValue, target?.type) !== normalizeValueForType(modelValue, target?.type);

    return {
      benchmarkValue: String(benchmarkValue),
      mismatch,
      mapping,
    };
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
      if (campaignData.workflow_id && activeWorkspace?.id) {
        try {
          const workflow = await workflowApi.get(campaignData.workflow_id, session.access_token, activeWorkspace.id);
          setLinkedWorkflowDefinition(workflow.definition);
        } catch (workflowErr) {
          console.error(workflowErr);
          setLinkedWorkflowDefinition(null);
        }
      } else {
        setLinkedWorkflowDefinition(null);
      }

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
      setLinkedWorkflowDefinition(null);
      setDocuments([]);
      setUsageStats([]);
      setParsedBenchmark(null);
      setBenchmarkAccuracy(null);
      setBenchmarkCoverage(null);
      setBenchmarkIdentifierHeader(null);
      setBenchmarkMappings([]);
      setSelectedBenchmarkStrategyByModel({});
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

  // Handle campaign creation. When a workflow is selected, dashboard columns come
  // directly from workflow outputs instead of prompt schema extraction.
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasWorkflow = Boolean(createWorkflowId);
    const trimmedPrompt = prompt.trim();
    if (!name.trim()) {
      toast.error("Campaign name is required.");
      return;
    }
    if (!hasWorkflow && !trimmedPrompt) {
      toast.error("Add a workflow or enter a system prompt.");
      return;
    }
    if (selectedModels.length === 0) {
      toast.error("Select at least one LLM model.");
      return;
    }

    setCreating(true);
    toast.info(
      hasWorkflow
        ? "Creating workflow-first evaluation campaign and deriving dashboard columns from workflow outputs..."
        : "Analyzing rubric codebook and building variable schema...",
      { duration: 4000 },
    );

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards?workspace_id=${encodeURIComponent(activeWorkspace?.id ?? "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          name: name.trim(),
          prompt: trimmedPrompt,
          model: selectedModels.join(","),
          dashboard_type: "model_comparison",
          token_limit: 2500000,
          workflow_id: createWorkflowId || undefined,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to create comparison campaign");
      }
      const newCampaign = await res.json();
      toast.success(
        hasWorkflow
          ? "Workflow-first evaluation campaign created. Add files on the evaluation page to run them through the linked workflow."
          : "Model evaluation campaign created. You can still link a workflow later if you want.",
      );
      setShowCreateModal(false);
      setName("");
      setPrompt("");
      setCreateWorkflowId("");
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
      const body = await res.json();
      const queuedCount = Number(body?.queued_count || 0);
      if (queuedCount <= 0) {
        toast.info(body?.message || `No failed document classifications to retry on ${modelName}`);
        return;
      }
      const targetDocIds = documents
        .filter((doc) => {
          const status = getModelRunStatus(doc, modelName);
          return status === "failed" || status === "suspended_limit";
        })
        .map((doc) => doc.document_id);
      markModelRetryQueued(targetDocIds, modelName);
      toast.success(body?.message || `Triggered retry for all failed document classifications on ${modelName}`);
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
      const body = await res.json();
      const queuedCount = Number(body?.queued_count || 0);
      if (queuedCount <= 0) {
        toast.info(body?.message || (modelName ? `No failed run found for ${modelName} on this file.` : "No failed run found for this file."));
        return;
      }
      markModelRetryQueued([documentId], modelName);
      toast.success(body?.message || (modelName ? `Queued ${modelName} to retry on this file.` : "Queued file for retry."));
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
      if (data?.warning) {
        toast.warning(data.message || data.warning);
      } else {
        toast.success(data.message || `Successfully added ${newModelToAdd.trim()} to evaluation.`);
      }
      setShowAddModelDialog(false);
      setNewModelToAdd("");
      if (Number(data?.queued_count || 0) > 0) {
        setIsPolling(true);
      }
      void fetchCampaignDetails(campaign.id);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to add model");
    } finally {
      setAddingModel(false);
    }
  };
  // Delete/remove a model from campaign on-the-fly
  const handleDeleteModelFromCampaign = async (modelName: string) => {
    if (!campaign || !modelName || !session?.access_token) return;
    if (!window.confirm(`Are you sure you want to delete "${modelName}"? This will permanently remove its evaluation results from this dashboard.`)) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/dashboards/${campaign.id}/delete-model?model=${encodeURIComponent(modelName.trim())}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
        }
      });
      if (!response.ok) {
        throw new Error(await response.text() || "Failed to delete model from campaign");
      }
      const data = await response.json();
      toast.success(data.message || `Successfully removed ${modelName} from campaign.`);
      void fetchCampaignDetails(campaign.id);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to remove model");
    }
  };

  const clearBenchmarkState = () => {
    setParsedBenchmark(null);
    setPendingBenchmark(null);
    setBenchmarkIdentifierHeader(null);
    setBenchmarkMappings([]);
    setBenchmarkAccuracy(null);
    setBenchmarkCoverage(null);
    setShowBenchmarkMappingDialog(false);
    setSelectedBenchmarkStrategyByModel({});
  };

  // Parse benchmark CSV and open the mapping flow
  const handleBenchmarkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const parsed = parseBenchmarkFile(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        toast.error("The benchmark file is empty or could not be parsed.");
        return;
      }

      const identifierHeader = getBenchmarkIdentifierHeader(parsed.headers);
      if (!identifierHeader) {
        toast.error("Could not detect a filename or document identifier column in the benchmark CSV.");
        return;
      }

      setPendingBenchmark(parsed);
      setBenchmarkIdentifierHeader(identifierHeader);
      setBenchmarkMappings(createDefaultBenchmarkMappings(parsed.headers, identifierHeader));
      setShowBenchmarkMappingDialog(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleBenchmarkTargetToggle = (csvHeader: string, targetKey: string) => {
    setBenchmarkMappings((current) =>
      current.map((mapping) =>
        mapping.csvHeader !== csvHeader
          ? mapping
          : {
              ...mapping,
              targetKeys: mapping.targetKeys.includes(targetKey)
                ? mapping.targetKeys.filter((item) => item !== targetKey)
                : [...mapping.targetKeys, targetKey],
            },
      ),
    );
  };

  const applyBenchmarkMappings = () => {
    if (!pendingBenchmark || !benchmarkIdentifierHeader) {
      toast.error("Load a benchmark file first.");
      return;
    }
    const hasMappings = benchmarkMappings.some((mapping) => mapping.targetKeys.length > 0);
    if (!hasMappings) {
      toast.error("Map at least one CSV column to a dashboard column before running the benchmark.");
      return;
    }

    setParsedBenchmark(pendingBenchmark);
    setShowBenchmarkMappingDialog(false);
    toast.success(`Loaded ${pendingBenchmark.rows.length} benchmark rows with custom column mappings.`);
  };

  // Compute accuracy statistics per model and per workflow strategy dynamically
  useEffect(() => {
    if (!parsedBenchmark || documents.length === 0 || !campaign || workflowStrategies.length === 0) {
      setBenchmarkAccuracy(null);
      setBenchmarkCoverage(null);
      return;
    }

    const modelStats: Record<string, BenchmarkModelMetrics> = {};
    let matchedDocuments = 0;

    campaignModels.forEach((model) => {
      const strategyMetrics: Record<string, BenchmarkStrategyMetrics> = {};

      workflowStrategies.forEach((strategy) => {
        const relevantTargets = getStrategyTargets(strategy)
          .map((target) => ({
            target,
            mapping: benchmarkMappings.find((entry) => entry.targetKeys.includes(target.key)),
          }))
          .filter((entry) => entry.mapping);

        const targets = relevantTargets.map(({ target, mapping }) => {
          let total = 0;
          let matches = 0;
          const numericErrors: number[] = [];

          documents.forEach((doc) => {
            const benchmarkRow = getBenchmarkRowForDocument(doc);
            if (!benchmarkRow) return;

            const run = getModelRun(doc, model);
            if (run.status !== "completed") return;

            const benchmarkValue = benchmarkRow[mapping!.csvHeader];
            if (benchmarkValue === undefined || benchmarkValue === null || benchmarkValue === "") return;

            const actualValue = run.values?.[target.key];
            total += 1;

            const benchmarkNormalized = normalizeValueForType(benchmarkValue, target.type);
            const actualNormalized = normalizeValueForType(actualValue, target.type);
            if (benchmarkNormalized === actualNormalized) {
              matches += 1;
            }

            const expectedNumber = numericValue(benchmarkValue);
            const actualNumber = numericValue(actualValue);
            if (expectedNumber !== null && actualNumber !== null) {
              numericErrors.push(Math.abs(expectedNumber - actualNumber));
            }
          });

          return {
            key: target.key,
            label: target.label,
            csvHeader: mapping!.csvHeader,
            total,
            matches,
            percent: total > 0 ? Math.round((matches / total) * 100) : 0,
            meanAbsoluteError: numericErrors.length > 0 ? Math.round((numericErrors.reduce((sum, item) => sum + item, 0) / numericErrors.length) * 100) / 100 : null,
          } satisfies BenchmarkTargetMetric;
        }).filter((metric) => metric.total > 0);

        const total = targets.reduce((sum, item) => sum + item.total, 0);
        const matches = targets.reduce((sum, item) => sum + item.matches, 0);
        strategyMetrics[strategy.id] = {
          strategyId: strategy.id,
          total,
          matches,
          percent: total > 0 ? Math.round((matches / total) * 100) : 0,
          targets,
        };
      });

      modelStats[model] = {
        strategyOrder: workflowStrategies.map((strategy) => strategy.id),
        strategies: strategyMetrics,
      };
    });

    documents.forEach((doc) => {
      if (getBenchmarkRowForDocument(doc)) matchedDocuments += 1;
    });

    setBenchmarkCoverage({
      matchedDocuments,
      unmatchedDocuments: Math.max(0, documents.length - matchedDocuments),
    });
    setBenchmarkAccuracy(modelStats);
    setSelectedBenchmarkStrategyByModel((current) => {
      let changed = false;
      const next = { ...current };
      campaignModels.forEach((model) => {
        if (!next[model] || !workflowStrategies.some((strategy) => strategy.id === next[model])) {
          next[model] = workflowStrategies[0]?.id || "";
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [parsedBenchmark, documents, campaign, workflowStrategies, benchmarkMappings, campaignModels]);

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
                  accept=".csv,.tsv,.txt"
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
                {supportsWorkflowBenchmark && (
                  <Button
                    variant={parsedBenchmark ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (parsedBenchmark) {
                        clearBenchmarkState();
                        toast.info("Cleared benchmark comparison.");
                      } else {
                        benchmarkInputRef.current?.click();
                      }
                    }}
                    className="gap-1.5 text-xs"
                  >
                    {parsedBenchmark ? (
                      <>
                        <X size={13} /> Remove Benchmark
                      </>
                    ) : (
                      <>
                        <Upload size={13} /> Test with Benchmark
                      </>
                    )}
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
                  onClick={() => {
                    if (campaign?.workflow_id) return;
                    void fetchWorkflows();
                    setSelectedWorkflowId(campaign?.workflow_id || "");
                    setShowLinkWorkflowDialog(true);
                  }}
                  disabled={Boolean(campaign?.workflow_id)}
                  className={`gap-1.5 text-xs ${campaign?.workflow_id ? "text-violet-600 border-violet-300 bg-violet-50 opacity-100 disabled:opacity-100" : "text-muted-foreground border-muted hover:bg-muted/30"}`}
                >
                  ⚡ {campaign?.workflow_id ? "Workflow Locked" : "Link Workflow"}
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
                        ? "Files added here run through the linked workflow once per selected model, and the results stay on this model evaluation dashboard. The workflow is now locked for this campaign so the column schema cannot drift later."
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
                      className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 pl-3 pr-2 py-1 text-[11px] font-semibold text-primary gap-1"
                    >
                      {model}
                      <button
                        type="button"
                        onClick={() => handleDeleteModelFromCampaign(model)}
                        className="rounded-full p-0.5 hover:bg-primary/20 text-primary hover:text-destructive transition-colors focus:outline-none"
                        title={`Delete ${model}`}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {parsedBenchmark && benchmarkCoverage && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="font-bold uppercase tracking-wide text-[11px] text-emerald-700">Benchmark mode active</div>
                      <p className="mt-1 text-muted-foreground">
                        Comparing {parsedBenchmark.rows.length} benchmark row{parsedBenchmark.rows.length === 1 ? "" : "s"} against {benchmarkCoverage.matchedDocuments} matched dashboard file{benchmarkCoverage.matchedDocuments === 1 ? "" : "s"}.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full border border-emerald-200 bg-white/90 px-3 py-1 font-semibold text-emerald-700">
                        Identifier: {benchmarkIdentifierHeader}
                      </span>
                      <span className="rounded-full border border-emerald-200 bg-white/90 px-3 py-1 font-semibold text-emerald-700">
                        Mapped columns: {benchmarkMappings.filter((mapping) => mapping.targetKeys.length > 0).length}
                      </span>
                      <span className="rounded-full border border-emerald-200 bg-white/90 px-3 py-1 font-semibold text-emerald-700">
                        Unmatched files: {benchmarkCoverage.unmatchedDocuments}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Top Cost / Accuracy Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {campaignModels.map(model => {
                  const stat = matchUsageStat(model, usageStats);
                  const accuracy = benchmarkAccuracy?.[model];
                  const selectedStrategyId = selectedBenchmarkStrategyByModel[model] || workflowStrategies[0]?.id || "";
                  const selectedStrategy = workflowStrategies.find((strategy) => strategy.id === selectedStrategyId) || workflowStrategies[0];
                  const selectedStrategyMetrics = selectedStrategy ? accuracy?.strategies?.[selectedStrategy.id] : null;
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
                                ? `${processingDocs.length} file${processingDocs.length === 1 ? "" : "s"} in flight`
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
                                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">In-flight files</div>
                                {processingDocs.slice(0, 3).map((doc) => (
                                  <div key={`${model}-${doc.document_id}-processing`} className="truncate text-[11px] text-primary">
                                    {basename(doc.filename)} · {statusLabel(getModelRunStatus(doc, model))}
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

                        {accuracy && selectedStrategy && (
                          <div className="border-t border-border/20 pt-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Benchmark by strategy</span>
                              <span className="text-[10px] text-muted-foreground">
                                {selectedStrategyMetrics?.total || 0} mapped cells
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {workflowStrategies.map((strategy) => {
                                const strategyMetrics = accuracy.strategies[strategy.id];
                                const isActive = strategy.id === selectedStrategy.id;
                                return (
                                  <button
                                    key={`${model}-${strategy.id}`}
                                    type="button"
                                    onClick={() => setSelectedBenchmarkStrategyByModel((current) => ({ ...current, [model]: strategy.id }))}
                                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                                      isActive
                                        ? "border-primary/30 bg-primary/10 text-primary"
                                        : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                                    }`}
                                  >
                                    {strategy.label} {strategyMetrics ? `${strategyMetrics.percent}%` : ""}
                                  </button>
                                );
                              })}
                            </div>

                            {selectedStrategyMetrics && selectedStrategyMetrics.targets.length > 0 ? (
                              <div className="rounded-lg border border-border/30 bg-muted/10 p-2.5 space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-muted-foreground">{selectedStrategy.label} overall</span>
                                  <span className="font-bold text-green-600 dark:text-green-400">
                                    {selectedStrategyMetrics.percent}% ({selectedStrategyMetrics.matches}/{selectedStrategyMetrics.total})
                                  </span>
                                </div>
                                {selectedStrategyMetrics.targets.map((target) => (
                                  <div key={`${model}-${selectedStrategy.id}-${target.key}`} className="space-y-1 border-t border-border/20 pt-2 first:border-t-0 first:pt-0">
                                    <div className="flex justify-between items-center text-xs gap-3">
                                      <div className="min-w-0">
                                        <div className="truncate text-foreground">{target.label}</div>
                                        <div className="text-[10px] text-muted-foreground truncate">CSV: {target.csvHeader}</div>
                                      </div>
                                      <span className="font-bold text-green-600 dark:text-green-400 shrink-0">
                                        {target.percent}% ({target.matches}/{target.total})
                                      </span>
                                    </div>
                                    {target.meanAbsoluteError !== null && (
                                      <div className="flex justify-between items-center text-[11px]">
                                        <span className="text-muted-foreground">Mean Abs Error</span>
                                        <span className="font-medium text-amber-500">{target.meanAbsoluteError}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-lg border border-dashed border-border/40 px-3 py-2 text-[11px] text-muted-foreground">
                                No mapped benchmark columns are attached to the {selectedStrategy.label} strategy yet.
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowColumnPicker(true)}
                      className="h-7 gap-1.5 px-2 text-[10px] font-semibold"
                    >
                      <SlidersHorizontal className="h-3 w-3" />
                      Columns
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                        {visibleColumnCount}/{schemaColumns.length}
                      </span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowModelPicker(true)}
                      className="h-7 gap-1.5 px-2 text-[10px] font-semibold"
                    >
                      <Layers className="h-3 w-3" />
                      Models
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                        {visibleCampaignModels.length}/{campaignModels.length}
                      </span>
                    </Button>
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
                <Dialog open={showColumnPicker} onOpenChange={setShowColumnPicker}>
                  <DialogContent className="max-w-3xl">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <SlidersHorizontal className="h-4 w-4 text-primary" />
                        Select visible columns
                      </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs text-muted-foreground">
                          Choose the columns you want to inspect. This only affects the current view.
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={showAllColumns} className="h-8 gap-1.5 text-xs">
                            <Eye className="h-3.5 w-3.5" />
                            Show all
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={hideAllColumns} className="h-8 gap-1.5 text-xs">
                            <EyeOff className="h-3.5 w-3.5" />
                            Hide all
                          </Button>
                        </div>
                      </div>

                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={columnPickerQuery}
                          onChange={(event) => setColumnPickerQuery(event.target.value)}
                          placeholder="Search columns..."
                          className="h-9 pl-9 text-xs"
                        />
                      </div>

                      <div className="max-h-[52vh] overflow-y-auto rounded-xl border border-border/40 bg-muted/20 p-3">
                        <div className="space-y-2">
                          {filteredSchemaColumns.length > 0 ? (
                            filteredSchemaColumns.map((col) => {
                              const isHidden = Boolean(hiddenColumns[col.name]);
                              return (
                                <button
                                  key={col.name}
                                  type="button"
                                  onClick={() => toggleColumnVisibility(col.name)}
                                  className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                                    isHidden
                                      ? "border-border/60 bg-background text-muted-foreground hover:bg-muted/40"
                                      : "border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10"
                                  }`}
                                  aria-pressed={!isHidden}
                                >
                                  <span
                                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                      isHidden ? "border-input bg-background" : "border-primary bg-primary text-primary-foreground"
                                    }`}
                                  >
                                    {!isHidden && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block break-words text-sm font-semibold leading-snug">{normalizeLabel(col.name)}</span>
                                    <span className="mt-0.5 block break-words text-[11px] text-muted-foreground leading-snug">
                                      {col.name}
                                      {col.type ? ` · ${col.type}` : ""}
                                    </span>
                                  </span>
                                </button>
                              );
                            })
                          ) : (
                            <div className="rounded-lg border border-dashed border-border/40 px-3 py-6 text-center text-xs text-muted-foreground">
                              No columns match that search.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] text-muted-foreground">
                          {visibleColumnCount} visible, {schemaColumns.length - visibleColumnCount} hidden
                        </div>
                        <Button type="button" size="sm" onClick={() => setShowColumnPicker(false)} className="h-8 px-3 text-xs">
                          Close
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={showModelPicker} onOpenChange={setShowModelPicker}>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-primary" />
                        Select visible models
                      </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs text-muted-foreground">
                          Choose which model subcolumns appear in the grid. This only affects the current view.
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={showAllModelColumns} className="h-8 gap-1.5 text-xs">
                            <Eye className="h-3.5 w-3.5" />
                            Show all
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={hideAllModelColumns} className="h-8 gap-1.5 text-xs">
                            <EyeOff className="h-3.5 w-3.5" />
                            Hide all
                          </Button>
                        </div>
                      </div>

                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={modelPickerQuery}
                          onChange={(event) => setModelPickerQuery(event.target.value)}
                          placeholder="Search models..."
                          className="h-9 pl-9 text-xs"
                        />
                      </div>

                      <div className="max-h-[52vh] overflow-y-auto rounded-xl border border-border/40 bg-muted/20 p-3">
                        <div className="space-y-2">
                          {filteredCampaignModels.length > 0 ? (
                            filteredCampaignModels.map((model) => {
                              const isHidden = Boolean(hiddenModelColumns[model]);
                              return (
                                <button
                                  key={model}
                                  type="button"
                                  onClick={() => toggleModelVisibility(model)}
                                  className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                                    isHidden
                                      ? "border-border/60 bg-background text-muted-foreground hover:bg-muted/40"
                                      : "border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10"
                                  }`}
                                  aria-pressed={!isHidden}
                                >
                                  <span
                                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                      isHidden ? "border-input bg-background" : "border-primary bg-primary text-primary-foreground"
                                    }`}
                                  >
                                    {!isHidden && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block break-words text-sm font-semibold leading-snug">{model}</span>
                                    <span className="mt-0.5 block break-words text-[11px] text-muted-foreground leading-snug">
                                      Model subcolumn
                                    </span>
                                  </span>
                                </button>
                              );
                            })
                          ) : (
                            <div className="rounded-lg border border-dashed border-border/40 px-3 py-6 text-center text-xs text-muted-foreground">
                              No models match that search.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] text-muted-foreground">
                          {visibleCampaignModels.length} visible, {campaignModels.length - visibleCampaignModels.length} hidden
                        </div>
                        <Button type="button" size="sm" onClick={() => setShowModelPicker(false)} className="h-8 px-3 text-xs">
                          Close
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

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
                          {visibleSchemaColumns.map((col) => (
                            <th key={col.name} className="p-3.5 font-bold border-r border-border/20 text-center bg-card" colSpan={visibleCampaignModels.length || 1}>
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
                          {visibleSchemaColumns.map((col) => (
                            visibleCampaignModels.map((model) => (
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
                          {visibleSchemaColumns.map((col) => (
                            visibleCampaignModels.map((model) => {
                                const run = getModelRun(doc, model);
                                const vals = run.values || {};
                                const value = vals[col.name];
                                const reasoning = vals[`${col.name}_reasoning`] || "No reasoning logged.";
                                const history = vals[`${col.name}_history`] || [];
                                const runStatus = getModelRunStatus(doc, model);
                                const isPending = runStatus === "processing" || runStatus === "pending";
                                const isFailed = runStatus === "failed" || runStatus === "suspended_limit";
                                const isMissing = runStatus === "missing";

                                const activeStrategyId = selectedBenchmarkStrategyByModel[model] || workflowStrategies[0]?.id || "";
                                const activeStrategy = workflowStrategies.find((strategy) => strategy.id === activeStrategyId) || workflowStrategies[0];
                                const targetBelongsToStrategy = activeStrategy
                                  ? isSharedBenchmarkTarget(col.name) || col.name === activeStrategy.rankKey || col.name.startsWith(activeStrategy.prefix)
                                  : true;
                                const benchmarkMatch = parsedBenchmark && targetBelongsToStrategy
                                  ? getBenchmarkTargetMatch(doc, model, col.name)
                                  : null;
                                const benchVal = benchmarkMatch?.benchmarkValue;
                                const isMismatch = benchmarkMatch?.mismatch || false;

                                return (
                                  <td
                                    key={`${doc.document_id}-${col.name}-${model}`}
                                    style={{ 
                                      width: `${columnWidths[`${col.name}-${model}`] || 180}px`, 
                                      minWidth: `${columnWidths[`${col.name}-${model}`] || 180}px`, 
                                      maxWidth: `${columnWidths[`${col.name}-${model}`] || 180}px` 
                                    }}
                                    onClick={() => {
                                      setTraceViewMode("list");
                                      setSelectedCellView({
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
                                        timing: run.timing || {},
                                      });
                                    }}
                                    className={`p-3 text-center border-r border-border/20 align-top cursor-pointer hover:bg-muted/10 transition-colors ${
                                      isMismatch 
                                        ? "bg-rose-500/10 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-900" 
                                        : isFailed 
                                          ? "bg-red-500/5" 
                                          : isMissing 
                                            ? "bg-amber-500/5" 
                                            : ""
                                    }`}
                                  >
                                    <div className="flex h-[88px] flex-col items-center justify-start overflow-hidden">
                                      {isPending ? (
                                        <span className="flex items-center justify-center gap-1.5 text-muted-foreground animate-pulse text-[10px]">
                                          <RefreshCw className="h-3 w-3 animate-spin text-primary" /> {statusLabel(runStatus)}...
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
                                          {isMismatch ? (
                                            <div className="flex flex-col justify-center w-full py-0.5">
                                              <div className="flex items-center justify-center gap-1 min-w-0">
                                                <span 
                                                  className="bg-rose-500 text-white rounded-full text-[9px] font-black h-4 w-4 flex items-center justify-center shrink-0 shadow-sm"
                                                  title={`Benchmark value: ${benchVal}\nLLM value: ${value}`}
                                                >
                                                  !
                                                </span>
                                                <span className="truncate font-semibold text-xs leading-4">
                                                  <span className="text-[10px] text-muted-foreground mr-1 select-none">LLM:</span>
                                                  {value !== undefined && value !== null && value !== "" ? String(value) : "—"}
                                                </span>
                                              </div>

                                              <div className="text-[10px] text-rose-600 dark:text-rose-400 font-sans mt-1.5 pt-1.5 border-t border-rose-200/50 dark:border-rose-900/30 flex items-center justify-center min-w-0">
                                                <span className="font-semibold mr-1 select-none">CSV:</span>
                                                <span className="font-mono truncate bg-rose-500/5 px-1.5 py-0.5 rounded">
                                                  {benchVal}
                                                </span>
                                              </div>
                                            </div>
                                          ) : (
                                            <div
                                              className={`max-w-[170px] overflow-hidden text-center font-semibold underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 ${
                                                isLongformColumn(col.name) ? "line-clamp-3 text-[11px] leading-4" : "line-clamp-2 break-words"
                                              }`}
                                            >
                                              {value !== undefined && value !== null && value !== "" ? String(value) : "—"}
                                            </div>
                                          )}
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
        <Dialog
          open={showCreateModal}
          onOpenChange={(open) => {
            if (creating) return;
            setShowCreateModal(open);
            if (!open) {
              setName("");
              setPrompt("");
              setCreateWorkflowId("");
              setSearchModelQuery("");
            }
          }}
        >
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

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Attach Workflow
                </label>
                {workflows.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                    No workflows found in this workspace yet. If you continue without one, this campaign will fall back to prompt-based schema extraction.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto rounded-lg border p-2">
                    {workflows.map((wf: any) => {
                      const isSelected = createWorkflowId === wf.id;
                      return (
                        <button
                          key={wf.id}
                          type="button"
                          onClick={() => setCreateWorkflowId(isSelected ? "" : wf.id)}
                          className={`w-full rounded-lg border p-3 text-left transition-all ${isSelected ? "border-violet-400 bg-violet-50 shadow-sm" : "border-border hover:border-violet-200 hover:bg-muted/20"}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold">{wf.name}</span>
                            {isSelected && (
                              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">Attached</span>
                            )}
                          </div>
                          {wf.description && (
                            <p className="mt-1 text-[11px] text-muted-foreground">{wf.description}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  If a workflow is attached here, the dashboard columns will be created from the workflow outputs immediately. The campaign will no longer depend on prompt analysis to decide its schema.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {createWorkflowId ? "Campaign Notes (Optional)" : "System Prompt / Codebook"}
                </label>
                <Textarea
                  required={!createWorkflowId}
                  rows={8}
                  placeholder={
                    createWorkflowId
                      ? "Optional notes for humans. Schema will come from the attached workflow, not from this text."
                      : "Paste research rules or scoring rubrics here. The AI will extract discretion/delegation scores across all selected models based on these instructions."
                  }
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={creating}
                  className="font-mono text-sm leading-relaxed max-h-72 overflow-y-auto"
                />
                <p className="text-[11px] text-muted-foreground">
                  {createWorkflowId
                    ? "This text is optional metadata only for a workflow-first campaign. Files will run through the attached workflow once per selected model."
                    : "Without a workflow, this prompt is analyzed to create the campaign columns and coding rubric."}
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
        <Dialog
          open={showBenchmarkMappingDialog}
          onOpenChange={(open) => {
            if (!open) {
              setShowBenchmarkMappingDialog(false);
              if (!parsedBenchmark) {
                setPendingBenchmark(null);
              }
            }
          }}
        >
          <DialogContent className="w-[96vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto p-5">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Upload size={18} /> Map Benchmark Columns
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5 text-sm">
              <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Benchmark file</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Pick the identifier column and map each CSV column to one or more dashboard outputs. Shared columns like `delegate_law` can appear in every strategy, and one CSV rank column can feed all three strategy ranks.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Identifier column</label>
                    <select
                      value={benchmarkIdentifierHeader || ""}
                      onChange={(event) => {
                        const nextIdentifier = event.target.value;
                        setBenchmarkIdentifierHeader(nextIdentifier);
                        if (pendingBenchmark) {
                          setBenchmarkMappings(createDefaultBenchmarkMappings(pendingBenchmark.headers, nextIdentifier));
                        }
                      }}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-xs"
                    >
                      {(pendingBenchmark?.headers || []).map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/50 overflow-hidden">
                <div className="grid grid-cols-[220px_minmax(0,1fr)] border-b bg-muted/20 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <div className="p-3 border-r">CSV Column</div>
                  <div className="p-3">Map To Dashboard Columns</div>
                </div>
                <div className="divide-y">
                  {benchmarkMappings.map((mapping) => (
                    <div key={mapping.csvHeader} className="grid grid-cols-[220px_minmax(0,1fr)]">
                      <div className="border-r bg-muted/10 p-3">
                        <div className="font-semibold text-xs break-words">{mapping.csvHeader}</div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {mapping.targetKeys.length === 0 ? "Not mapped yet" : `${mapping.targetKeys.length} target${mapping.targetKeys.length === 1 ? "" : "s"} selected`}
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {benchmarkTargetOptions.map((target) => (
                            <label
                              key={`${mapping.csvHeader}-${target.key}`}
                              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                                mapping.targetKeys.includes(target.key)
                                  ? "border-primary/30 bg-primary/5"
                                  : "border-border/50 bg-background hover:bg-muted/20"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={mapping.targetKeys.includes(target.key)}
                                onChange={() => handleBenchmarkTargetToggle(mapping.csvHeader, target.key)}
                                className="mt-0.5"
                              />
                              <span className="min-w-0">
                                <span className="block font-semibold">{target.label}</span>
                                <span className="block text-[10px] text-muted-foreground">{target.key}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {workflowStrategies.length > 0 && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-violet-700">Detected workflow strategies</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {workflowStrategies.map((strategy) => (
                      <span key={strategy.id} className="rounded-full border border-violet-200 bg-white/90 px-3 py-1 text-[11px] font-semibold text-violet-700">
                        {strategy.label} {"->"} {strategy.rankKey}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowBenchmarkMappingDialog(false);
                    if (!parsedBenchmark) setPendingBenchmark(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={applyBenchmarkMappings}>
                  Apply Benchmark Mapping
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
          <DialogContent className="w-[96vw] sm:max-w-3xl lg:max-w-6xl max-h-[92vh] overflow-y-auto p-6">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-muted/20 p-2.5 rounded-lg border border-border/10 text-center">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Queue Wait</span>
                    <span className="font-bold text-xs truncate block">{formatDuration(selectedCellView.timing?.queue_wait_ms)}</span>
                  </div>
                  <div className="bg-muted/20 p-2.5 rounded-lg border border-border/10 text-center">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Total Runtime</span>
                    <span className="font-bold text-xs truncate block">{formatDuration(selectedCellView.timing?.total_run_ms)}</span>
                  </div>
                  <div className="bg-muted/20 p-2.5 rounded-lg border border-border/10 text-center">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Source Load</span>
                    <span className="font-bold text-xs truncate block">{formatDuration(selectedCellView.timing?.source_text_load_ms)}</span>
                  </div>
                  <div className="bg-muted/20 p-2.5 rounded-lg border border-border/10 text-center">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Workflow Execute</span>
                    <span className="font-bold text-xs truncate block">{formatDuration(selectedCellView.timing?.workflow_execute_ms)}</span>
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
                  <div className="space-y-3 pt-3 border-t">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Workflow Trace</span>
                      <div className="inline-flex rounded-lg border bg-muted/20 p-1">
                        <button
                          type="button"
                          onClick={() => setTraceViewMode("list")}
                          className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${traceViewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          Step View
                        </button>
                        <button
                          type="button"
                          onClick={() => setTraceViewMode("graph")}
                          disabled={!linkedWorkflowDefinition}
                          className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${traceViewMode === "graph" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          Graph View
                        </button>
                      </div>
                    </div>

                    {traceViewMode === "graph" ? (
                      linkedWorkflowDefinition ? (
                        <WorkflowTraceGraph
                          definition={linkedWorkflowDefinition}
                          trace={selectedCellView.trace}
                          context={selectedCellView.context || {}}
                        />
                      ) : (
                        <div className="rounded-lg border border-dashed p-4 text-[11px] text-muted-foreground">
                          Workflow definition is still loading for this campaign, so the graph preview is not ready yet.
                        </div>
                      )
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {selectedCellView.trace.map((item: any, idx: number) => (
                          <div key={idx} className="rounded-lg border bg-muted/20 p-3 text-[11px]">
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <span className="font-bold">{item.name || item.node_id}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground font-semibold">
                                  {formatDuration(item.duration_ms)}
                                </span>
                                <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold">
                                  {item.status || "completed"}
                                </span>
                              </div>
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
                    )}
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
