import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthContext } from "@/context/AuthContext";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { useChat } from "@/hooks/useChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { API_BASE_URL } from "@/constants";
import { 
  ArrowLeft, RefreshCw, Download, MessageSquare, 
  Eye, Send, Square, AlertCircle, X, AlertTriangle,
  CheckCircle, Loader2, Sparkles, Plus, BookOpen, Layers, Edit, Info
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { ColumnDependencySelector } from "@/components/dashboard/ColumnDependencySelector";

interface Campaign {
  id: string;
  name: string;
  description: string;
  prompt: string;
  schema: { name: string; type: string; description?: string; options?: string[]; prompt?: string; depends_on?: string[]; prompt_version?: number; prompt_history?: any[] }[];
  model?: string;
}

interface CampaignDocument {
  document_id: string;
  filename: string;
  file_size: number;
  status: "pending" | "processing" | "completed" | "failed";
  coded_values: Record<string, any>;
  error_message?: string;
  error_type?: "API_FAILURE" | "COMPREHENSION_FAILURE" | "EXTRACTION_FAILURE";
  tags: string[];
  current_step?: number;
  total_steps?: number;
}

export function DashboardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuthContext();
  const jwt = session?.access_token ?? "";

  // Data States
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [docs, setDocs] = useState<CampaignDocument[]>([]);
  const [globalDocs, setGlobalDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);

  // UI Panels
  const [rightPanel, setRightPanel] = useState<"none" | "preview" | "chat">("none");
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string>("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);

  // Link Modal State
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedGlobalDocIds, setSelectedGlobalDocIds] = useState<string[]>([]);
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [errorDoc, setErrorDoc] = useState<CampaignDocument | null>(null);

  // Column Reordering state
  const [orderedColumns, setOrderedColumns] = useState<{ name: string; type: string; description?: string; options?: string[]; prompt?: string; depends_on?: string[] }[]>([]);

  // Column Widths for resizing
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    filename: 250,
    status: 130,
  });

  // Campaign settings states (for Manage Columns modal)
  const [campaignName, setCampaignName] = useState("");
  const [campaignDesc, setCampaignDesc] = useState("");
  const [campaignPromptText, setCampaignPromptText] = useState("");
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [selectedColumnInfo, setSelectedColumnInfo] = useState<{ name: string; type: string; description?: string; options?: string[]; prompt?: string; depends_on?: string[] } | null>(null);
  const [schemaFields, setSchemaFields] = useState<{ name: string; type: string; description?: string; options?: string[]; options_raw?: string; prompt?: string; depends_on?: string[] }[]>([]);

  // Cell override / editing state dialog modal
  const [showEditCellModal, setShowEditCellModal] = useState(false);
  const [editCellData, setEditCellData] = useState<{
    docId: string;
    colName: string;
    filename: string;
    value: string;
    reasoning: string;
    options?: string[];
    history?: any[];
  } | null>(null);
  const [editCellVal, setEditCellVal] = useState("");
  const [editCellReasoning, setEditCellReasoning] = useState("");
  const [editCellModalSize, setEditCellModalSize] = useState<'standard' | 'wide' | 'full'>('wide');
  const [reevalFeedback, setReevalFeedback] = useState("");
  const [reevalLoading, setReevalLoading] = useState(false);

  const [selectedCellView, setSelectedCellView] = useState<{ filename: string; columnName: string; value: string; reasoning?: string } | null>(null);

  // Chat State
  const [chatThreadId, setChatThreadId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [pinnedDocIds, setPinnedDocIds] = useState<string[]>([]);
  const { messages, streaming, draftContent, sendMessage, stopGeneration } = useChat(chatThreadId);

  // Drag and Drop Upload State
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [regeneratingSchema, setRegeneratingSchema] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Benchmark Comparison States
  const [parsedBenchmark, setParsedBenchmark] = useState<{ headers: string[]; rows: any[] } | null>(null);
  const [showBenchmarkComparison, setShowBenchmarkComparison] = useState(false);
  const [benchmarkAccuracy, setBenchmarkAccuracy] = useState<{ total: number; matches: number; percent: number } | null>(null);
  const benchmarkInputRef = useRef<HTMLInputElement>(null);


  // Duplicate file detection modal
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [duplicateFiles, setDuplicateFiles] = useState<string[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [selectedForRecompute, setSelectedForRecompute] = useState<Set<string>>(new Set());

  // Refs for Chat Autoscroll
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch campaign info
  const fetchCampaign = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${id}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) throw new Error("Campaign not found");
      const data = await res.json();
      setCampaign(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load campaign metadata");
      navigate("/dashboard");
    }
  };

  // Fetch campaign's chat thread
  const fetchCampaignThread = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/threads/campaign/${id}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) throw new Error("Failed to fetch campaign thread");
      const data = await res.json();
      if (data && data.id) {
        setChatThreadId(data.id);
      } else {
        setChatThreadId(null);
      }
    } catch (err) {
      console.error("Failed to load campaign chat thread:", err);
      setChatThreadId(null);
    }
  };

  // Sync columns with campaign schema once loaded
  useEffect(() => {
    if (campaign) {
      if (campaign.schema) {
        setOrderedColumns(campaign.schema);
        setSchemaFields(campaign.schema);
      }
      setCampaignName(campaign.name || "");
      setCampaignDesc(campaign.description || "");
      setCampaignPromptText(campaign.prompt || "");
    }
  }, [campaign]);

  // Fetch documents linked to campaign
  const fetchDocuments = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${id}/documents`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) throw new Error("Failed to fetch documents");
      const data = await res.json();
      setDocs(data);
      
      // Auto-start polling if there are any processing or pending documents
      const hasActiveJobs = data.some(
        (d: CampaignDocument) => d.status === "pending" || d.status === "processing"
      );
      setPolling(hasActiveJobs);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load campaign documents");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Fetch global workspace documents for Linking
  const fetchGlobalDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) throw new Error("Failed to fetch global documents");
      const data = await res.json();
      setGlobalDocs(data);
    } catch (err) {
      console.error(err);
    }
  };

  // Initialization
  useEffect(() => {
    if (id && jwt) {
      void fetchCampaign();
      void fetchDocuments();
      void fetchGlobalDocuments();
      void fetchCampaignThread();
    }
  }, [id, jwt]);

  // Reset link search query on close
  useEffect(() => {
    if (!showLinkModal) {
      setLinkSearchQuery("");
    }
  }, [showLinkModal]);

  // Polling loop for active runs
  useEffect(() => {
    let intervalId: any;
    if (polling && id && jwt) {
      intervalId = setInterval(() => {
        void fetchDocuments(true);
      }, 3000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [polling, id, jwt]);

  // Scroll Chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, draftContent]);

  // Fetch document plain text content for Preview
  const loadDocPreview = async (docId: string) => {
    setLoadingPreview(true);
    setPreviewDocId(docId);
    setRightPanel("preview");
    setPreviewText("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${docId}/content`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) throw new Error("Failed to load file");
      const blob = await res.blob();
      
      // Attempt plain text read
      const text = await blob.text();
      setPreviewText(text);
    } catch (err) {
      console.error(err);
      setPreviewText(`Error reading text extraction: File may not be fully ingested yet.`);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleUpdateModel = async (newModel: string) => {
    if (!campaign) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          name: campaign.name,
          description: campaign.description,
          prompt: campaign.prompt,
          schema: campaign.schema,
          model: newModel,
        }),
      });
      if (!res.ok) throw new Error("Failed to update campaign model");
      const data = await res.json();
      setCampaign(data);
      toast.success(`Campaign model updated to ${newModel}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to update campaign model");
    }
  };

  // Open Manage Columns / Schema modal
  const openSchemaModal = () => {
    if (campaign) {
      setCampaignName(campaign.name || "");
      setCampaignDesc(campaign.description || "");
      setCampaignPromptText(campaign.prompt || "");
      const mapped = (campaign.schema || []).map(col => ({
        ...col,
        options_raw: col.options ? col.options.join(", ") : "",
        depends_on: col.depends_on || []
      }));
      setSchemaFields(mapped as any);
      setShowSchemaModal(true);
    }
  };

  // Helper to update a schema field in the local state array
  const updateSchemaField = (index: number, key: string, value: any) => {
    setSchemaFields(prev => {
      const previousName = prev[index]?.name;
      return prev.map((col, idx) => {
        if (idx !== index) return col;
        return { ...col, [key]: value };
      }).map((col, idx) => {
        if (key !== "name" || idx <= index || !previousName) return col;
        return {
          ...col,
          depends_on: (col.depends_on || []).map((dependency) => dependency === previousName ? value : dependency),
        };
      });
    });
  };

  // Handle campaign schema and settings update
  const handleSchemaSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Validate column names
      const columnNames = schemaFields.map((col) => col.name.trim());
      if (new Set(columnNames).size !== columnNames.length) {
        toast.error("Every column must have a unique name.");
        return;
      }
      for (const [index, col] of schemaFields.entries()) {
        if (!col.name.trim()) {
          toast.error("Column names cannot be blank.");
          return;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(col.name)) {
          toast.error(`Column name "${col.name}" is invalid. Use letters, numbers, and underscores only.`);
          return;
        }
        const priorNames = new Set(columnNames.slice(0, index));
        const invalidDependency = (col.depends_on || []).find((dependency) => !priorNames.has(dependency));
        if (invalidDependency) {
          toast.error(`"${col.name}" can only use outputs from an earlier step. Remove "${invalidDependency}" or move that rule earlier.`);
          return;
        }
      }

      const formattedSchema = schemaFields.map(col => {
        const { options_raw, ...rest } = col as any;
        const optionsList = options_raw
          ? options_raw.split(",").map((s: string) => s.trim()).filter((s: string) => s.length > 0)
          : col.options;
        return {
          ...rest,
          prompt: col.prompt?.trim() || undefined,
          options: optionsList && optionsList.length > 0 ? optionsList : null,
          depends_on: col.depends_on || []
        };
      });

      const res = await fetch(`${API_BASE_URL}/api/dashboards/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          name: campaignName.trim(),
          description: campaignDesc.trim(),
          prompt: campaignPromptText.trim(),
          schema: formattedSchema,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.detail || "Failed to update columns");
      }
      
      const data = await res.json();
      setCampaign(data);
      setOrderedColumns(data.schema);
      setShowSchemaModal(false);
      toast.success("Campaign settings updated successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to save schema fields");
    }
  };

  // Handle cell override submit
  const handleCellSave = async (docId: string, colName: string, value: string, reasoning: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${id}/documents/${docId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          column_name: colName,
          value: value.trim(),
          reasoning: reasoning.trim(),
        }),
      });

      if (!res.ok) throw new Error("Override failed");
      const data = await res.json();
      
      // Update cell values locally
      setDocs((prev) =>
        prev.map((d) =>
          d.document_id === docId
            ? { ...d, coded_values: data.coded_values }
            : d
        )
      );

      // Update modal history dynamically
      if (editCellData && editCellData.docId === docId && editCellData.colName === colName) {
        setEditCellData(prev => prev ? {
          ...prev,
          history: data.coded_values[`${colName}_history`] || []
        } : null);
      }

      setShowEditCellModal(false);
      toast.success("Coded cell override saved.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save cell override");
    }
  };

  // Handle cell re-evaluate submit
  const handleCellReevaluate = async (docId: string, colName: string, userPrompt: string) => {
    if (!userPrompt.trim()) {
      toast.error("Please enter correction feedback or instructions for the AI.");
      return;
    }
    setReevalLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${id}/documents/${docId}/re-evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          column_name: colName,
          user_prompt: userPrompt.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Re-evaluation failed");
      }
      const data = await res.json();
      
      // Update cell values locally
      setDocs((prev) =>
        prev.map((d) =>
          d.document_id === docId
            ? { ...d, coded_values: data.coded_values }
            : d
        )
      );

      // Update inputs with new AI-generated values
      const newVal = data.coded_values[colName];
      const newReasoning = data.coded_values[`${colName}_reasoning`] || "";
      setEditCellVal(newVal === undefined || newVal === null ? "" : String(newVal));
      setEditCellReasoning(newReasoning);
      setReevalFeedback(""); // Reset input

      // Update modal state dynamically
      if (editCellData && editCellData.docId === docId && editCellData.colName === colName) {
        setEditCellData(prev => prev ? {
          ...prev,
          value: newVal === undefined || newVal === null ? "" : String(newVal),
          reasoning: newReasoning,
          history: data.coded_values[`${colName}_history`] || []
        } : null);
      }

      toast.success("AI cell re-evaluation completed.");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to re-evaluate cell");
    } finally {
      setReevalLoading(false);
    }
  };

  // Column-level re-evaluation states
  const [showColFeedbackModal, setShowColFeedbackModal] = useState(false);
  const [selectedColFeedback, setSelectedColFeedback] = useState<{ name: string; type: string; prompt_version?: number; prompt_history?: any[] } | null>(null);
  const [colFeedbackPrompt, setColFeedbackPrompt] = useState("");
  const [colFeedbackLoading, setColFeedbackLoading] = useState(false);

  // Row-level re-evaluation states
  const [showRowFeedbackModal, setShowRowFeedbackModal] = useState(false);
  const [selectedRowFeedback, setSelectedRowFeedback] = useState<CampaignDocument | null>(null);
  const [rowFeedbackPrompt, setRowFeedbackPrompt] = useState("");
  const [rowFeedbackLoading, setRowFeedbackLoading] = useState(false);

  // Handle column-level re-evaluation submit
  const handleColumnReevaluate = async () => {
    if (!selectedColFeedback || !colFeedbackPrompt.trim()) return;
    setColFeedbackLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${id}/columns/${selectedColFeedback.name}/reevaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ feedback_prompt: colFeedbackPrompt.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Column re-evaluation failed");
      }

      const updatedCampaign = await res.json();
      setCampaign(updatedCampaign);
      setShowColFeedbackModal(false);
      setColFeedbackPrompt("");
      toast.success(`Started AI re-evaluation for column "${selectedColFeedback.name}" across all documents!`);
      void fetchDocuments();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to re-evaluate column");
    } finally {
      setColFeedbackLoading(false);
    }
  };

  // Handle row-level re-evaluation submit
  const handleRowReevaluate = async () => {
    if (!selectedRowFeedback || !rowFeedbackPrompt.trim()) return;
    setRowFeedbackLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${id}/documents/${selectedRowFeedback.document_id}/reevaluate-row`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ feedback_prompt: rowFeedbackPrompt.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Row re-evaluation failed");
      }

      const data = await res.json();
      setDocs((prev) =>
        prev.map((d) =>
          d.document_id === selectedRowFeedback.document_id
            ? { ...d, coded_values: data.coded_values }
            : d
        )
      );
      setShowRowFeedbackModal(false);
      setRowFeedbackPrompt("");
      toast.success("AI row re-evaluation completed successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to re-evaluate row");
    } finally {
      setRowFeedbackLoading(false);
    }
  };

  // Link existing global files to campaign
  const handleLinkDocuments = async () => {
    if (selectedGlobalDocIds.length === 0) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${id}/documents/link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(selectedGlobalDocIds),
      });

      if (!res.ok) throw new Error("Failed to link files");
      toast.success("Documents linked and enqueued for LLM coding!");
      setShowLinkModal(false);
      setSelectedGlobalDocIds([]);
      void fetchDocuments();
    } catch (err) {
      console.error(err);
      toast.error("Failed to link documents");
    }
  };

  // Upload new local file directly
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const filenames = fileArray.map((f) => f.name);

    // Step 1: Check which files already exist in this dashboard
    try {
      const checkRes = await fetch(`${API_BASE_URL}/api/dashboards/${id}/documents/check-duplicates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(filenames),
      });
      if (checkRes.ok) {
        const { duplicates } = await checkRes.json();
        if (duplicates.length > 0) {
          // Store pending files and show the duplicate modal
          setPendingUploadFiles(fileArray);
          setDuplicateFiles(duplicates);
          setSelectedForRecompute(new Set()); // default: none selected = skip all duplicates
          setShowDuplicateModal(true);
          // Reset file input so the same files can be selected again if dismissed
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }
      }
    } catch {
      // If check fails, proceed normally (non-blocking)
    }

    // No duplicates — upload everything
    await doUploadFiles(fileArray, new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Called both from direct upload (no duplicates) and from duplicate modal confirm
  const doUploadFiles = async (fileArray: File[], recomputeSet: Set<string>) => {
    setUploadingFiles(true);
    const uploadedDocs = [];
    const failedFiles: { name: string; reason: string }[] = [];

    for (const file of fileArray) {
      // Skip duplicates that the user chose NOT to recompute
      if (duplicateFiles.includes(file.name) && !recomputeSet.has(file.name)) {
        continue;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("workspace_id", "TEST");

      try {
        const res = await fetch(`${API_BASE_URL}/api/dashboards/${id}/documents/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}` },
          body: formData,
        });

        if (!res.ok) {
          let reason = `HTTP ${res.status}`;
          try {
            const errBody = await res.json();
            reason = errBody.detail || errBody.message || reason;
          } catch {
            reason = res.statusText || reason;
          }
          failedFiles.push({ name: file.name, reason });
          continue;
        }

        const data = await res.json();
        uploadedDocs.push(data);
      } catch (err: any) {
        console.error(err);
        failedFiles.push({ name: file.name, reason: err?.message || "Network error" });
      }
    }

    if (uploadedDocs.length > 0) {
      toast.success(`Uploaded ${uploadedDocs.length} file${uploadedDocs.length > 1 ? "s" : ""}. LLM sequential processing enqueued!`);
      void fetchDocuments();
    }

    for (const failed of failedFiles) {
      toast.error(`Failed to upload "${failed.name}" — ${failed.reason}`, { duration: 8000 });
    }

    setUploadingFiles(false);
  };


  // Batch Retry Failed
  const handleRetryFailed = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${id}/documents/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) throw new Error("Retry failed");
      toast.success("Queued all failed files for sequential retry.");
      void fetchDocuments();
    } catch (err) {
      console.error(err);
      toast.error("Failed to enqueue retry");
    }
  };

  // Retry individual file
  const handleRetryDoc = async (docId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${id}/documents/retry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify([docId]),
      });
      if (!res.ok) throw new Error("Retry failed");
      toast.success("Queued document for coding retry.");
      void fetchDocuments();
    } catch (err) {
      console.error(err);
      toast.error("Failed to retry document");
    }
  };

  // Regenerate / Retry Schema extraction
  const handleRegenerateSchema = async () => {
    setRegeneratingSchema(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${id}/regenerate-schema`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Schema extraction failed");
      }

      const data = await res.json();
      setCampaign(data);
      if (data.schema) {
        setOrderedColumns(data.schema);
        setSchemaFields(data.schema);
      }
      toast.success("Schema regenerated successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to regenerate schema");
    } finally {
      setRegeneratingSchema(false);
    }
  };

  // Resize columns handler
  const handleResizeStart = (e: React.MouseEvent, columnName: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnName === "filename" 
      ? colWidths.filename 
      : columnName === "status" 
        ? colWidths.status 
        : (colWidths[columnName] || 180);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(80, startWidth + deltaX);
      setColWidths((prev) => ({
        ...prev,
        [columnName]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Helper to extract PL Number from filename
  const getPLNumFromFilename = (filename: string): string | null => {
    const match = /\d+-\d+/.exec(filename);
    return match ? match[0] : null;
  };


  // Auto-detect CSV/TSV parser
  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return { headers: [], rows: [] };
    
    const firstLine = lines[0];
    const delimiter = firstLine.includes('\t') ? '\t' : ',';
    
    const splitLine = (line: string) => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim().replace(/^["']|["']$/g, ''));
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      return result;
    };

    const headers = splitLine(firstLine);
    const rows: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const cols = splitLine(line);
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = cols[idx] || "";
      });
      rows.push(row);
    }
    return { headers, rows };
  };

  // Normalize column names for comparison
  const normalizeKey = (key: string): string => {
    return key.toLowerCase().replace(/[^a-z0-9]/g, "");
  };

  // Get benchmark value mapped by PLNum and normalized column header
  const getMappedBenchmarkValue = (doc: CampaignDocument, colName: string) => {
    if (!parsedBenchmark) return undefined;
    const plNum = getPLNumFromFilename(doc.filename);
    if (!plNum) return undefined;
    
    const row = parsedBenchmark.rows.find((r: any) => {
      const csvPlNum = r["PLNum"] || r["pl_num"] || r["PL Num"] || r["Public Law"] || "";
      return csvPlNum.trim() === plNum;
    });
    
    if (!row) return undefined;
    
    const normalizedCampaignCol = normalizeKey(colName);
    const csvKey = parsedBenchmark.headers.find(h => normalizeKey(h) === normalizedCampaignCol);
    
    if (!csvKey) return undefined;
    return row[csvKey];
  };

  // Normalize values (booleans/strings/numbers) for robust equivalence checks
  const normalizeValueForComparison = (val: any): string => {
    if (val === undefined || val === null) return "";
    const s = String(val).trim().toUpperCase();
    if (s === "Y" || s === "YES" || s === "TRUE" || s === "1" || s === "-1") return "TRUE";
    if (s === "N" || s === "NO" || s === "FALSE" || s === "0") return "FALSE";
    return s;
  };

  // Handle benchmark upload
  const handleBenchmarkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        const parsed = parseCSV(text);
        if (parsed.headers.length === 0 || parsed.rows.length === 0) {
          toast.error("Invalid CSV/TSV file. Content is empty.");
          return;
        }
        
        const hasPLNum = parsed.headers.some(h => ["PLNum", "pl_num", "PL Num", "Public Law"].map(x => x.toLowerCase()).includes(h.toLowerCase()));
        if (!hasPLNum) {
          toast.error("Could not find a 'PLNum' column in the uploaded file to match rows.");
          return;
        }

        setParsedBenchmark(parsed);
        setShowBenchmarkComparison(true);
        toast.success(`Successfully loaded ${parsed.rows.length} benchmark rows. Benchmark Mode Active!`);
      } catch (err) {
        console.error("CSV parse error:", err);
        toast.error("Failed to parse CSV file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Dynamic accuracy computation hook
  useEffect(() => {
    if (!showBenchmarkComparison || !parsedBenchmark || docs.length === 0) {
      setBenchmarkAccuracy(null);
      return;
    }

    let totalComparisons = 0;
    let matchCount = 0;

    docs.forEach(doc => {
      if (doc.status !== "completed") return;
      
      orderedColumns.forEach(col => {
        const docVal = doc.coded_values[col.name];
        const benchVal = getMappedBenchmarkValue(doc, col.name);
        
        if (benchVal !== undefined && benchVal !== "") {
          totalComparisons++;
          const normDoc = normalizeValueForComparison(docVal);
          const normBench = normalizeValueForComparison(benchVal);
          if (normDoc === normBench) {
            matchCount++;
          }
        }
      });
    });

    if (totalComparisons > 0) {
      setBenchmarkAccuracy({
        total: totalComparisons,
        matches: matchCount,
        percent: Math.round((matchCount / totalComparisons) * 100)
      });
    } else {
      setBenchmarkAccuracy(null);
    }
  }, [showBenchmarkComparison, parsedBenchmark, docs, orderedColumns]);

  // Export spreadsheet to CSV
  const handleExportCSV = () => {
    if (!campaign || docs.length === 0) return;


    // Headers
    const headers = ["Filename", "Status", ...campaign.schema.map((s) => s.name)];
    
    // Rows
    const csvRows = [
      headers.join(","),
      ...docs.map((d) => {
        const rowData = [
          `"${d.filename.replace(/"/g, '""')}"`,
          d.status,
          ...campaign.schema.map((s) => {
            const val = d.coded_values[s.name];
            if (val === undefined || val === null) return "";
            return typeof val === "string" ? `"${val.replace(/"/g, '""')}"` : val;
          }),
        ];
        return rowData.join(",");
      }),
    ];

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = window.document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${campaign.name.toLowerCase().replace(/ /g, "_")}_results.csv`);
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    toast.success("CSV Downloaded");
  };

  // Send message to campaign-scoped chatbot
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const messageToSend = chatInput;
    const currentPinned = [...pinnedDocIds];
    setChatInput("");
    setPinnedDocIds([]);

    try {
      const newThreadId = await sendMessage(messageToSend, chatThreadId || undefined, currentPinned, id);
      if (newThreadId && !chatThreadId) {
        setChatThreadId(newThreadId);
      }
    } catch (err) {
      toast.error("Chat streaming failed");
    }
  };

  // Progress Stats calculations
  const total = docs.length;
  const completed = docs.filter((d) => d.status === "completed").length;
  const failed = docs.filter((d) => d.status === "failed").length;
  const processing = docs.filter((d) => d.status === "processing").length;
  const pending = docs.filter((d) => d.status === "pending").length;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <ThreadSidebar />

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Detail Page Header */}
        <div className="border-b bg-card px-6 py-4 flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate("/campaigns")}
              className="rounded-full hover:bg-muted"
            >
              <ArrowLeft size={18} />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">{campaign?.name}</h2>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowPromptModal(true)}
                  className="h-7 text-xs gap-1 border-muted-foreground/20 hover:bg-muted"
                >
                  <BookOpen size={12} /> View Codebook
                </Button>
              </div>
              <div className="relative group/desc">
                <p 
                  className="text-muted-foreground text-xs line-clamp-1 mt-0.5 max-w-2xl cursor-pointer hover:text-foreground transition-colors pr-6 select-none"
                  title="Hover or click to view full description"
                >
                  {campaign?.description}
                </p>
                {/* Expand hover/click popover */}
                <div className="absolute left-0 top-full mt-1.5 hidden group-hover/desc:block z-50 w-96 bg-card border border-border rounded-lg p-3 text-xs text-foreground shadow-2xl animate-in fade-in slide-in-from-top-1 duration-150 leading-relaxed max-h-48 overflow-y-auto">
                  <div className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Campaign Description</div>
                  {campaign?.description}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Export, Benchmark & Chat triggers */}
            <Button
              variant={showBenchmarkComparison ? "secondary" : "outline"}
              size="sm"
              onClick={() => {
                if (showBenchmarkComparison) {
                  setShowBenchmarkComparison(false);
                  setParsedBenchmark(null);
                  setBenchmarkAccuracy(null);
                } else {
                  benchmarkInputRef.current?.click();
                }
              }}
              className="gap-1.5 text-xs border-dashed"
            >
              <Sparkles size={14} className={showBenchmarkComparison ? "text-amber-500 fill-amber-500 animate-pulse" : ""} />
              {showBenchmarkComparison ? "Disable Benchmark Mode" : "Compare with Benchmark"}
            </Button>
            <input
              type="file"
              ref={benchmarkInputRef}
              onChange={handleBenchmarkUpload}
              accept=".csv,.tsv,.txt"
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={total === 0} className="gap-1.5 text-xs">
              <Download size={14} /> Export CSV
            </Button>
            <Button 
              variant={rightPanel === "chat" ? "secondary" : "outline"} 
              size="sm" 
              onClick={() => setRightPanel(rightPanel === "chat" ? "none" : "chat")}
              className="gap-1.5 text-xs"
            >
              <MessageSquare size={14} /> Ask Campaign Chatbot
            </Button>
          </div>
        </div>


        {/* Dashboard Progress Banner */}
        {total > 0 && (
          <div className="px-6 py-2.5 bg-muted/40 border-b flex justify-between items-center text-xs">
            <div className="flex items-center gap-4">
              <span className="font-semibold text-muted-foreground">Sequential Coding Progress:</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><CheckCircle size={12} className="text-emerald-500" /> Completed: {completed}/{total}</span>
                {processing > 0 && <span className="flex items-center gap-1 text-primary"><Loader2 size={12} className="animate-spin" /> Processing: {processing}</span>}
                {pending > 0 && <span className="flex items-center gap-1 text-amber-500"><Loader2 size={12} /> Pending: {pending}</span>}
                {failed > 0 && <span className="flex items-center gap-1 text-destructive font-semibold"><AlertCircle size={12} /> Failed: {failed}</span>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {failed > 0 && (
                <Button variant="destructive" size="sm" onClick={handleRetryFailed} className="h-7 px-2.5 text-xs gap-1 shadow-sm">
                  <RefreshCw size={11} /> Retry {failed} Failed
                </Button>
              )}
              {polling && (
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted border px-2 py-0.5 rounded-full font-medium">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" /> Live Syncing...
                </span>
              )}
            </div>
          </div>
        )}

        {/* Benchmark Accuracy Banner */}
        {showBenchmarkComparison && benchmarkAccuracy && (
          <div className="px-6 py-2.5 bg-rose-500/10 dark:bg-rose-950/20 border-b flex justify-between items-center text-xs text-rose-700 dark:text-rose-400 font-medium">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-amber-500 fill-amber-500" />
              <span>Benchmark Mode Active: <strong>{benchmarkAccuracy.matches} / {benchmarkAccuracy.total}</strong> cells match (<strong>{benchmarkAccuracy.percent}% accuracy</strong>).</span>
            </div>
            <button
              onClick={() => {
                setShowBenchmarkComparison(false);
                setParsedBenchmark(null);
                setBenchmarkAccuracy(null);
              }}
              className="text-xs underline hover:text-rose-800 dark:hover:text-rose-300 cursor-pointer"
            >
              Close Benchmark Mode
            </button>
          </div>
        )}


        {/* Middle Work Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Grid Spreadsheet */}
          <div className="flex-1 flex flex-col overflow-hidden p-6">
            
            {/* Inner Dashboard Action Bar */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-sm tracking-wide text-muted-foreground uppercase">Dataset Spreadsheet</h3>
              
              <div className="flex gap-2 items-center">
                <div className="flex items-center gap-1.5 border rounded-md px-2 bg-background h-9 text-xs">
                  <span className="text-muted-foreground font-medium">Coding Model:</span>
                  <select
                    value={campaign?.model || "gemini-3.1-flash-lite-preview"}
                    onChange={(e) => handleUpdateModel(e.target.value)}
                    className="bg-transparent border-none focus:outline-none pr-4 text-xs font-semibold cursor-pointer"
                  >
                    <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                    <option value="gpt-4o">GPT-4o</option>
                  </select>
                </div>

                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={openSchemaModal} 
                  className="gap-1.5 text-xs"
                >
                  <Edit size={13} /> Manage Columns
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowLinkModal(true)} 
                  className="gap-1.5 text-xs"
                >
                  <Plus size={13} /> Link Workspace Files
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => fileInputRef.current?.click()} 
                  disabled={uploadingFiles}
                  className="gap-1.5 text-xs"
                >
                  {uploadingFiles ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Uploading...
                    </>
                  ) : (
                    <>
                      <Plus size={13} /> Upload Local Files
                    </>
                  )}
                </Button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  multiple 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
              </div>
            </div>

            {/* Warning when schema is empty */}
            {!loading && orderedColumns.length === 0 && (
              <div className="mb-4 p-4 border border-amber-500/25 bg-amber-500/5 rounded-xl text-amber-700 dark:text-amber-400 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-bold block mb-0.5">Variable Schema Empty</span>
                    Variable schema extraction from prompt is empty (this can happen if upstream LLM provider API rate-limited during dashboard generation). 
                    You can click <button onClick={openSchemaModal} className="underline font-bold hover:text-amber-800 dark:hover:text-amber-300">Manage Columns</button> to define variables/columns manually.
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateSchema}
                  disabled={regeneratingSchema}
                  className="h-7 text-xs border-amber-500/30 text-amber-700 hover:bg-amber-500/10 shrink-0 gap-1.5"
                >
                  {regeneratingSchema ? (
                    <>
                      <Loader2 size={11} className="animate-spin" /> Extracting...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={11} /> Retry Schema Extraction
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Structured Coding Grid */}
            {loading ? (
              <div className="flex-1 flex flex-col gap-2 items-center justify-center bg-card border rounded-xl shadow-sm p-12">
                <Loader2 size={36} className="animate-spin text-primary" />
                <p className="text-muted-foreground text-sm font-semibold mt-2">Loading coding spreadsheet...</p>
              </div>
            ) : (
              <div className="flex-1 border border-border/80 rounded-xl overflow-hidden shadow-sm bg-card flex flex-col">
                {/* Table: header + rows in one shared scroll container */}
                {docs.length === 0 ? (
                  <>
                    {/* Scrollable header-only table — columns are still visible/browsable */}
                    <div className="overflow-x-auto flex-shrink-0 border-b">
                      <table className="w-full text-left border-collapse table-fixed">
                        <colgroup>
                          <col style={{ width: colWidths.filename }} />
                          <col style={{ width: colWidths.status }} />
                          {orderedColumns.map((col) => (
                            <col key={col.name} style={{ width: colWidths[col.name] || 180 }} />
                          ))}
                        </colgroup>
                        <thead className="bg-muted/60 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="p-3 border-r bg-muted/70" style={{ width: colWidths.filename }}>Filename</th>
                            <th className="p-3 border-r bg-muted/70" style={{ width: colWidths.status }}>Coding Status</th>
                            {orderedColumns.map((col) => (
                              <th key={col.name} className="p-3 border-r bg-muted/70 truncate font-semibold" style={{ width: colWidths[col.name] || 180 }}>
                                {col.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                      </table>
                    </div>
                    {/* Empty state message — always centered on screen, never scrolls horizontally */}
                    <div className="flex-1 flex flex-col items-center justify-center p-12">
                      <Layers size={36} className="text-muted-foreground mb-3" />
                      <h3 className="font-bold text-base text-foreground">No documents coded yet</h3>
                      <p className="text-muted-foreground text-xs max-w-sm mt-1 mb-6 text-center">
                        Add local files or link documents already uploaded in your global workspace to extract structured columns.
                      </p>
                      <div className="flex gap-3 justify-center">
                        <Button variant="outline" size="sm" onClick={() => setShowLinkModal(true)}>
                          Link Existing
                        </Button>
                        <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                          Upload New
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  /* Full table with rows — single overflow-x-auto keeps header+body in sync */
                  <div className="overflow-auto flex-1">
                    <table className="w-full text-left border-collapse table-fixed">
                      <colgroup>
                        <col style={{ width: colWidths.filename }} />
                        <col style={{ width: colWidths.status }} />
                        {orderedColumns.map((col) => (
                          <col key={col.name} style={{ width: colWidths[col.name] || 180 }} />
                        ))}
                      </colgroup>
                      <thead className="bg-muted/60 text-xs font-bold uppercase tracking-wider text-muted-foreground sticky top-0 border-b z-10">
                        <tr>
                          <th className="p-3 border-r bg-muted/70 relative group/filename" style={{ width: colWidths.filename }}>
                            <span className="truncate">Filename</span>
                            <div 
                              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary z-20"
                              onMouseDown={(e) => handleResizeStart(e, "filename")}
                            />
                          </th>
                          <th className="p-3 border-r bg-muted/70 relative group/status" style={{ width: colWidths.status }}>
                            <span className="truncate">Coding Status</span>
                            <div 
                              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary z-20"
                              onMouseDown={(e) => handleResizeStart(e, "status")}
                            />
                          </th>
                          {orderedColumns.map((col, idx) => (
                            <th
                              key={col.name}
                              className="p-3 border-r bg-muted/70 cursor-move select-none relative group/header animate-in"
                              style={{ width: colWidths[col.name] || 180 }}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", idx.toString());
                                e.currentTarget.classList.add("opacity-50");
                              }}
                              onDragEnd={(e) => {
                                e.currentTarget.classList.remove("opacity-50");
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.currentTarget.classList.add("bg-muted-foreground/10");
                              }}
                              onDragLeave={(e) => {
                                e.currentTarget.classList.remove("bg-muted-foreground/10");
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.currentTarget.classList.remove("bg-muted-foreground/10");
                                const dragIdxStr = e.dataTransfer.getData("text/plain");
                                if (dragIdxStr !== "") {
                                  const dragIdx = parseInt(dragIdxStr, 10);
                                  if (dragIdx !== idx) {
                                    const updated = [...orderedColumns];
                                    const [removed] = updated.splice(dragIdx, 1);
                                    updated.splice(idx, 0, removed);
                                    setOrderedColumns(updated);
                                  }
                                }
                              }}
                            >
                              <div className="flex items-center gap-1.5 justify-between">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="truncate font-semibold flex items-center gap-1">
                                    {col.name}
                                    {(() => {
                                      const totalCount = docs.length;
                                      const filledCount = docs.filter(
                                        (d) =>
                                          d.coded_values[col.name] !== undefined &&
                                          d.coded_values[col.name] !== null &&
                                          d.coded_values[col.name] !== ""
                                      ).length;
                                      return (
                                        <span className="text-[10px] text-muted-foreground/60 font-mono font-medium shrink-0 ml-0.5">
                                          ({filledCount}/{totalCount})
                                        </span>
                                      );
                                    })()}
                                  </span>
                                  {col.description && col.description.trim() ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedColumnInfo(col);
                                      }}
                                      className="p-0.5 rounded hover:bg-muted-foreground/20 text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer"
                                      title="Click to view full column criteria/description"
                                    >
                                      <Info size={12} className="shrink-0" />
                                    </button>
                                  ) : (
                                    <AlertTriangle className="text-amber-500 shrink-0 animate-pulse" size={13} />
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedColFeedback(col);
                                      setColFeedbackPrompt("");
                                      setShowColFeedbackModal(true);
                                    }}
                                    className="p-0.5 rounded hover:bg-muted-foreground/20 text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer"
                                    title="Submit prompt/instructions to re-evaluate this column"
                                  >
                                    <Sparkles size={12} className="shrink-0" />
                                  </button>
                                </div>
                                <span className="text-[10px] text-muted-foreground/30 opacity-0 group-hover/header:opacity-100 transition-opacity shrink-0">
                                  ☰
                                </span>
                              </div>
                              <div 
                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary z-20"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  handleResizeStart(e, col.name);
                                }}
                              />
                              <div className="absolute left-1/2 top-full mt-1.5 hidden group-hover/header:block z-50 w-72 bg-card text-foreground border border-border rounded-lg p-3 text-xs shadow-2xl animate-in fade-in slide-in-from-top-1 duration-150 leading-relaxed -translate-x-1/2 normal-case font-normal select-text pointer-events-auto">
                                <div className="font-bold text-[9px] text-muted-foreground uppercase tracking-wider mb-1">
                                  Column Criteria ({col.type})
                                </div>
                                {(!col.description || !col.description.trim()) ? (
                                  <div className="text-amber-600 dark:text-amber-400 font-medium flex items-start gap-1 mb-1.5 leading-relaxed">
                                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                    <span>No description provided. The LLM may not code this column accurately. Open "Manage Columns" to write a description.</span>
                                  </div>
                                ) : (
                                  <p className="text-foreground font-medium mb-1.5 leading-relaxed">{col.description}</p>
                                )}
                                {col.options && col.options.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-border/60">
                                    <span className="font-semibold text-muted-foreground text-[9px] uppercase tracking-wider block mb-1">Allowed Categories:</span>
                                    <div className="flex flex-wrap gap-1">
                                      {col.options.map(opt => (
                                        <span key={opt} className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium border border-border/40 text-muted-foreground">
                                          {opt}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y text-xs">
                        {docs.map((doc) => (
                          <tr key={doc.document_id} className="hover:bg-muted/30 transition-colors">
                            {/* File info cell */}
                             <td className="p-3 border-r font-medium truncate flex items-center justify-between gap-2">
                              <span 
                                className="cursor-pointer text-primary font-semibold hover:underline truncate" 
                                onClick={() => loadDocPreview(doc.document_id)}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData("application/json", JSON.stringify({
                                    id: doc.document_id,
                                    filename: doc.filename.split("/").pop() || ""
                                  }));
                                }}
                              >
                                {doc.filename.split("/").pop()}
                              </span>
                              <div className="flex items-center gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-5 w-5 rounded hover:bg-muted" 
                                  onClick={() => loadDocPreview(doc.document_id)}
                                >
                                  <Eye size={12} />
                                </Button>
                                {(doc.status === "completed" || doc.status === "failed") && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-5 w-5 rounded hover:bg-muted text-primary" 
                                    onClick={() => {
                                      setSelectedRowFeedback(doc);
                                      setRowFeedbackPrompt("");
                                      setShowRowFeedbackModal(true);
                                    }}
                                    title="Re-evaluate all variables in this row with corrective feedback"
                                  >
                                    <Sparkles size={11} />
                                  </Button>
                                )}
                              </div>
                            </td>
                            
                            {/* Status cell */}
                            <td className="p-3 border-r text-center">
                              {doc.status === "completed" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/20">
                                  Coded
                                </span>
                              )}
                              {doc.status === "processing" && (
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold border border-primary/20 relative group/status cursor-help">
                                  <Loader2 size={10} className="animate-spin shrink-0" /> 
                                  <span>Coding ({doc.current_step || 1}/{doc.total_steps || 7})</span>
                                  <div className="absolute left-1/2 bottom-full mb-1.5 hidden group-hover/status:block z-50 w-52 bg-slate-950 text-white rounded-lg p-2.5 text-[10px] leading-normal shadow-xl -translate-x-1/2 text-left border border-white/20 font-sans font-normal">
                                    <span className="font-bold block text-primary uppercase text-[8px] mb-1.5 tracking-wider border-b border-white/10 pb-0.5">Coding Pipeline Steps</span>
                                    <div className="space-y-1">
                                      <div className={doc.current_step === 1 ? "text-emerald-400 font-bold" : "text-slate-400"}>
                                        1. {doc.current_step === 1 ? "● " : ""}Loading Campaign Codebook
                                      </div>
                                      <div className={doc.current_step === 2 ? "text-emerald-400 font-bold" : "text-slate-400"}>
                                        2. {doc.current_step === 2 ? "● " : ""}Extracting Document Text
                                      </div>
                                      <div className={doc.current_step === 3 ? "text-emerald-400 font-bold" : "text-slate-400"}>
                                        3. {doc.current_step === 3 ? "● " : ""}Context Safety Truncation
                                      </div>
                                      <div className={doc.current_step === 4 ? "text-emerald-400 font-bold" : "text-slate-400"}>
                                        4. {doc.current_step === 4 ? "● " : ""}Preparing Dynamic Schema
                                      </div>
                                      <div className={doc.current_step === 5 ? "text-emerald-400 font-bold" : "text-slate-400"}>
                                        5. {doc.current_step === 5 ? "● " : ""}Structured LLM Analysis
                                      </div>
                                      <div className={doc.current_step === 6 ? "text-emerald-400 font-bold" : "text-slate-400"}>
                                        6. {doc.current_step === 6 ? "● " : ""}Saving Coded Cell Values
                                      </div>
                                      <div className={doc.current_step === 7 ? "text-emerald-400 font-bold" : "text-slate-400"}>
                                        7. {doc.current_step === 7 ? "● " : ""}Sequential Delay Safety
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {doc.status === "pending" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-bold border border-amber-500/20">
                                  Pending
                                </span>
                              )}
                              {doc.status === "failed" && (
                                <div className="inline-flex items-center gap-1.5">
                                  <span 
                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-bold border border-destructive/20 cursor-pointer hover:bg-destructive/20 transition-all select-none"
                                    onClick={() => setErrorDoc(doc)}
                                    title="Click to view error details"
                                  >
                                    Failed
                                  </span>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-5 w-5 rounded hover:bg-destructive/10 text-destructive shrink-0" 
                                    onClick={(e) => { e.stopPropagation(); handleRetryDoc(doc.document_id); }}
                                  >
                                    <RefreshCw size={10} />
                                  </Button>
                                </div>
                              )}
                            </td>
                            
                            {/* AI extracted variables & human overrides */}
                            {orderedColumns.map((col) => {
                              const val = doc.coded_values[col.name];
                              const reasoning = doc.coded_values[`${col.name}_reasoning`] ? String(doc.coded_values[`${col.name}_reasoning`]) : "";
                              const hasReasoning = !!reasoning;
                              
                              const benchVal = showBenchmarkComparison ? getMappedBenchmarkValue(doc, col.name) : undefined;
                              const hasBenchmark = benchVal !== undefined && benchVal !== "";
                              const isMismatch = hasBenchmark && normalizeValueForComparison(val) !== normalizeValueForComparison(benchVal);
                              
                              return (
                                <td 
                                  key={col.name} 
                                  className={cn(
                                    "p-2 border-r relative group/cell cursor-pointer h-10 select-none",
                                    isMismatch && "bg-rose-500/10 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-900"
                                  )}
                                  onDoubleClick={() => {
                                    if (doc.status !== "completed" && doc.status !== "failed") return;
                                    const history = doc.coded_values[`${col.name}_history`] || [];
                                    setEditCellData({
                                      docId: doc.document_id,
                                      colName: col.name,
                                      filename: doc.filename.split("/").pop() || "",
                                      value: val === undefined || val === null ? "" : String(val),
                                      reasoning: reasoning,
                                      options: col.options || undefined,
                                      history: history
                                    });
                                    setEditCellVal(val === undefined || val === null ? "" : String(val));
                                    setEditCellReasoning(reasoning);
                                    setReevalFeedback("");
                                    setShowEditCellModal(true);
                                  }}
                                >
                                  <div className="flex items-center justify-between w-full h-full">
                                    {isMismatch && (
                                      <span 
                                        className="mr-1 bg-rose-500 hover:bg-rose-600 text-white rounded-full text-[9px] font-black h-4.5 w-4.5 flex items-center justify-center cursor-help shrink-0 shadow-sm"
                                        title={`Benchmark value: ${benchVal}\nLLM value: ${val}`}
                                      >
                                        !
                                      </span>
                                    )}
                                    <span className={cn(
                                      "truncate block flex-1 leading-normal font-mono",
                                      hasReasoning && "underline decoration-dotted decoration-muted-foreground/50 underline-offset-4"
                                    )}>
                                      {val === undefined || val === null ? (
                                        <span className="text-muted-foreground/30 italic font-sans">double-click</span>
                                      ) : typeof val === "boolean" ? (
                                        val ? (
                                          <span className="bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded font-bold">True</span>
                                        ) : (
                                          <span className="bg-rose-500/10 text-rose-600 px-1.5 py-0.5 rounded font-bold">False</span>
                                        )
                                      ) : (
                                        String(val)
                                      )}
                                    </span>
                                    
                                    <div className="flex items-center gap-0.5">
                                      {(val !== undefined && val !== null) && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedCellView({
                                              filename: doc.filename.split("/").pop() || "",
                                              columnName: col.name,
                                              value: String(val),
                                              reasoning: reasoning || undefined
                                            });
                                          }}
                                          className="hidden group-hover/cell:flex items-center justify-center p-0.5 rounded bg-muted hover:bg-primary/20 text-muted-foreground hover:text-primary"
                                          title="Click to inspect value and reasoning"
                                        >
                                          <Eye size={10} />
                                        </button>
                                      )}
                                      {(doc.status === "completed" || doc.status === "failed") && (
                                        <Edit size={10} className="text-muted-foreground/0 group-hover/cell:text-muted-foreground/60 transition-colors" />
                                      )}
                                    </div>
                                  </div>

                                  {/* Premium reasoning tooltip */}
                                  {hasReasoning && (
                                    <div className="absolute left-1/2 bottom-full mb-2.5 hidden group-hover/cell:block z-50 w-80 bg-slate-900 text-slate-100 border border-slate-700/80 rounded-lg p-3 text-xs shadow-2xl animate-in fade-in slide-in-from-bottom-1 duration-150 leading-relaxed -translate-x-1/2 normal-case font-normal select-text pointer-events-auto">
                                      <div className="font-bold text-[9px] text-primary uppercase tracking-wider mb-1">
                                        AI Reasoning & Evidence
                                      </div>
                                      <p className="leading-relaxed whitespace-pre-wrap">{reasoning}</p>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Panel: Side Tab Drawer (Preview or Chat) */}
          {rightPanel !== "none" && (
            <div className="w-[420px] border-l bg-card flex flex-col h-full shadow-lg relative animate-in slide-in-from-right duration-250">
              
              {/* Tab Header bar */}
              <div className="border-b px-4 py-3 bg-muted/30 flex justify-between items-center">
                <div className="flex gap-2">
                  <Button 
                    variant={rightPanel === "preview" ? "secondary" : "ghost"}
                    size="sm"
                    className="text-xs h-8 px-3 font-semibold"
                    onClick={() => {
                      if (previewDocId) setRightPanel("preview");
                      else toast.error("Click on a file name to preview its contents.");
                    }}
                  >
                    File Preview
                  </Button>
                  <Button 
                    variant={rightPanel === "chat" ? "secondary" : "ghost"}
                    size="sm"
                    className="text-xs h-8 px-3 font-semibold"
                    onClick={() => setRightPanel("chat")}
                  >
                    Campaign Chat
                  </Button>
                </div>
                
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-muted" onClick={() => setRightPanel("none")}>
                  <X size={15} />
                </Button>
              </div>

              {/* Panel Content */}
              <div className="flex-1 overflow-hidden flex flex-col">
                
                {/* Content Case 1: Plain Text Document Preview */}
                {rightPanel === "preview" && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-4 py-2 border-b bg-muted/10 text-[10px] text-muted-foreground flex justify-between items-center">
                      <span>PREVIEW MODE (TEXT ONLY)</span>
                      {previewDocId && (
                        <span className="font-semibold text-primary">
                          {docs.find((d) => d.document_id === previewDocId)?.filename.split("/").pop()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 bg-muted/5 font-mono text-[11px] leading-relaxed select-text whitespace-pre-wrap">
                      {loadingPreview ? (
                        <div className="flex flex-col gap-2 items-center justify-center py-24">
                          <Loader2 size={24} className="animate-spin text-primary" />
                          <span>Extracting file view...</span>
                        </div>
                      ) : (
                        previewText || <span className="text-muted-foreground/40 italic">No document selected. Click a file name in the table to display content.</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Content Case 2: Campaign Chatbot */}
                {rightPanel === "chat" && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-4 py-2 border-b bg-muted/10 text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <Sparkles size={11} className="text-primary animate-pulse" />
                      <span>CAMPAIGN SCOPED RAG CHATBOT</span>
                    </div>

                    {/* Chat Messages Log */}
                    <div 
                      className="flex-1 overflow-y-auto p-4 space-y-4 relative"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        try {
                          const dataStr = e.dataTransfer.getData("application/json");
                          if (dataStr) {
                            const { id: docId, filename } = JSON.parse(dataStr);
                            if (docId && !pinnedDocIds.includes(docId)) {
                              setPinnedDocIds([...pinnedDocIds, docId]);
                              toast.info(`Tagged file "${filename}" in chat context.`);
                            }
                          }
                        } catch (err) {
                          console.error("Drop failed:", err);
                        }
                      }}
                    >
                      {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-xs text-muted-foreground max-w-[280px] mx-auto">
                          <MessageSquare size={32} className="text-muted-foreground/30 mb-2" />
                          <p className="font-semibold">Ask questions about this campaign's docs</p>
                          <p className="mt-1 leading-normal">
                            All queries are automatically constrained to only look inside the documents linked to this spreadsheet. Drag and drop file names here or type `@` to pin files.
                          </p>
                        </div>
                      ) : (
                        messages.map((m) => (
                          <div 
                            key={m.id} 
                            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
                          >
                            <div className="text-[9px] text-muted-foreground mb-0.5 px-1 uppercase tracking-wider font-bold">
                              {m.role === "user" ? "You" : "Assistant"}
                            </div>
                            <div 
                              className={`rounded-xl px-3 py-2 text-xs max-w-[90%] leading-relaxed select-text shadow-sm ${
                                m.role === "user" 
                                  ? "bg-primary text-primary-foreground font-medium rounded-tr-none" 
                                  : "bg-muted text-foreground rounded-tl-none border border-border/40 prose prose-xs"
                              }`}
                            >
                              {m.role === "user" ? (
                                m.content
                              ) : (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {m.content}
                                </ReactMarkdown>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                      
                      {/* Streaming content */}
                      {streaming && draftContent && (
                        <div className="flex flex-col items-start animate-pulse">
                          <div className="text-[9px] text-muted-foreground mb-0.5 px-1 uppercase tracking-wider font-bold">
                            Assistant (typing)
                          </div>
                          <div className="rounded-xl px-3 py-2 text-xs max-w-[90%] leading-relaxed select-text bg-muted border border-border/40 rounded-tl-none prose prose-xs">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {draftContent}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Tag autocomplete dropdown */}
                    {(() => {
                      const atIdx = chatInput.lastIndexOf("@");
                      if (atIdx !== -1) {
                        const query = chatInput.slice(atIdx + 1).toLowerCase();
                        // Filter campaign documents
                        const matching = docs.filter(
                          (d) => 
                            (d.status === "completed" || d.status === "failed") &&
                            d.filename.split("/").pop()?.toLowerCase().includes(query)
                        );
                        if (matching.length > 0) {
                          return (
                            <div className="mx-3 my-1 border border-border bg-card rounded-lg shadow-xl max-h-40 overflow-y-auto text-xs z-50">
                              <div className="p-2 border-b font-bold text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/20">
                                Tag Campaign Document
                              </div>
                              {matching.map((d) => {
                                const fname = d.filename.split("/").pop() || "";
                                return (
                                  <button
                                    key={d.document_id}
                                    type="button"
                                    onClick={() => {
                                      const beforeAt = chatInput.slice(0, atIdx);
                                      setChatInput(beforeAt + `@${fname} `);
                                      if (!pinnedDocIds.includes(d.document_id)) {
                                        setPinnedDocIds([...pinnedDocIds, d.document_id]);
                                      }
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-muted font-mono flex items-center justify-between border-b last:border-b-0 border-border/40"
                                  >
                                    <span>{fname}</span>
                                    <span className="text-[9px] font-sans font-bold bg-primary/10 text-primary border border-primary/20 px-1 py-0.2 rounded">
                                      Tag File
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        }
                      }
                      return null;
                    })()}

                    {/* Tagged files list/badges */}
                    {pinnedDocIds.length > 0 && (
                      <div className="px-3 py-1.5 border-t bg-muted/10 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mr-1">Tagged:</span>
                        {pinnedDocIds.map((docId) => {
                          const docObj = docs.find(d => d.document_id === docId);
                          const label = docObj ? docObj.filename.split("/").pop() : docId;
                          return (
                            <span 
                              key={docId}
                              className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full text-[10px] font-medium font-mono"
                            >
                              <span>{label}</span>
                              <button 
                                type="button" 
                                className="hover:text-destructive transition-colors shrink-0"
                                onClick={() => setPinnedDocIds(pinnedDocIds.filter(id => id !== docId))}
                              >
                                <X size={10} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Chat Input form */}
                    <form 
                      onSubmit={handleSendChatMessage} 
                      className="p-3 border-t bg-muted/20 flex gap-2"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        try {
                          const dataStr = e.dataTransfer.getData("application/json");
                          if (dataStr) {
                            const { id: docId, filename } = JSON.parse(dataStr);
                            if (docId && !pinnedDocIds.includes(docId)) {
                              setPinnedDocIds([...pinnedDocIds, docId]);
                              toast.info(`Tagged file "${filename}" in chat context.`);
                            }
                          }
                        } catch (err) {
                          console.error("Drop failed:", err);
                        }
                      }}
                    >
                      <Input
                        placeholder="Query campaign docs... (Type @ to tag files)"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        disabled={streaming}
                        className="text-xs h-9"
                      />
                      {streaming ? (
                        <Button 
                          type="button" 
                          variant="destructive" 
                          size="icon" 
                          onClick={stopGeneration}
                          className="h-9 w-9 shrink-0"
                        >
                          <Square size={13} />
                        </Button>
                      ) : (
                        <Button 
                          type="submit" 
                          size="icon" 
                          disabled={!chatInput.trim()} 
                          className="h-9 w-9 shrink-0"
                        >
                          <Send size={13} />
                        </Button>
                      )}
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal: View Prompt Codebook */}
        <Dialog open={showPromptModal} onOpenChange={setShowPromptModal}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 border-b pb-2">
                <BookOpen size={18} className="text-primary" />
                Campaign Codebook / Guidelines
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto mt-4 pr-3 bg-muted/5 rounded p-4 font-mono text-xs leading-relaxed select-text whitespace-pre-wrap">
              {campaign?.prompt}
            </div>
            <div className="flex justify-end pt-3 mt-2 border-t">
              <Button onClick={() => setShowPromptModal(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal: Duplicate File Detection */}
        <Dialog open={showDuplicateModal} onOpenChange={(open) => { if (!open) setShowDuplicateModal(false); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <AlertCircle size={18} className="text-amber-500" />
                Duplicate Files Detected
              </DialogTitle>
            </DialogHeader>

            <p className="text-sm text-muted-foreground mt-1">
              {duplicateFiles.length === 1
                ? "1 file is already in this dashboard."
                : `${duplicateFiles.length} files are already in this dashboard.`}
              {" "}Select which ones you want to <strong>re-run through the LLM</strong> to recompute values. Unselected files will be skipped.
            </p>

            {/* New files summary */}
            {(() => {
              const newFiles = pendingUploadFiles.filter(f => !duplicateFiles.includes(f.name));
              return newFiles.length > 0 ? (
                <div className="mt-3 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 border border-border/50">
                  <span className="font-semibold text-foreground">{newFiles.length} new file{newFiles.length > 1 ? "s" : ""}</span> will always be uploaded: {newFiles.map(f => f.name).join(", ")}
                </div>
              ) : null;
            })()}

            {/* Duplicate file checkboxes */}
            <div className="mt-3 max-h-64 overflow-y-auto space-y-2 pr-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Already in dashboard</span>
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    if (selectedForRecompute.size === duplicateFiles.length) {
                      setSelectedForRecompute(new Set());
                    } else {
                      setSelectedForRecompute(new Set(duplicateFiles));
                    }
                  }}
                >
                  {selectedForRecompute.size === duplicateFiles.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              {duplicateFiles.map(filename => (
                <label
                  key={filename}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/60 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    className="rounded accent-primary h-4 w-4 flex-shrink-0"
                    checked={selectedForRecompute.has(filename)}
                    onChange={(e) => {
                      const next = new Set(selectedForRecompute);
                      if (e.target.checked) next.add(filename); else next.delete(filename);
                      setSelectedForRecompute(next);
                    }}
                  />
                  <span className="text-sm font-mono truncate text-foreground">{filename}</span>
                  {selectedForRecompute.has(filename) && (
                    <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded shrink-0">
                      Re-run LLM
                    </span>
                  )}
                </label>
              ))}
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t mt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDuplicateModal(false);
                  setPendingUploadFiles([]);
                  setDuplicateFiles([]);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  setShowDuplicateModal(false);
                  // Upload only the genuinely new files, skip all duplicates
                  const newOnly = pendingUploadFiles.filter(f => !duplicateFiles.includes(f.name));
                  setPendingUploadFiles([]);
                  setDuplicateFiles([]);
                  if (newOnly.length > 0) await doUploadFiles(newOnly, new Set());
                  else toast.info("All files were already present — nothing to upload.");
                }}
              >
                Skip All Duplicates
              </Button>
              <Button
                onClick={async () => {
                  setShowDuplicateModal(false);
                  const recompute = new Set(selectedForRecompute);
                  const files = [...pendingUploadFiles];
                  setPendingUploadFiles([]);
                  setDuplicateFiles([]);
                  setSelectedForRecompute(new Set());
                  await doUploadFiles(files, recompute);
                }}
              >
                Confirm
                {selectedForRecompute.size > 0 && (
                  <span className="ml-1.5 bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                    +{selectedForRecompute.size} re-run
                  </span>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal: Link Workspace Documents */}
        <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
          <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2 border-b pb-2">
                <Layers size={18} className="text-primary" />
                Link Workspace Files
              </DialogTitle>
            </DialogHeader>
            
            <p className="text-xs text-muted-foreground my-2">
              Select files from your global workspace library to code in this campaign dashboard.
            </p>

             <div className="mb-3">
              <Input
                type="text"
                placeholder="Search by file name or tag..."
                value={linkSearchQuery}
                onChange={(e) => setLinkSearchQuery(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            <div className="flex-grow overflow-y-auto border border-border/80 rounded-lg p-2 bg-muted/5 min-h-[300px] max-h-[45vh]">
              {globalDocs.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-12">No workspace documents found.</p>
              ) : (() => {
                const unlinkedDocs = globalDocs.filter((gd) => !docs.some((d) => d.document_id === gd.id));
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
                                  strokeWidth="2.5"
                                >
                                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                  <polyline points="14 2 14 8 20 8" />
                                </svg>
                              </div>
                              <span className="font-medium truncate text-foreground/95" title={child.name}>
                                {child.name}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5 ml-5">
                              <span className="text-[9px] text-muted-foreground/75">
                                {(doc.file_size / 1024).toFixed(1)} KB
                              </span>
                              {doc.metadata?.tags && doc.metadata.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {doc.metadata.tags.map((tag: string) => (
                                    <span key={tag} className="px-1 py-0.2 rounded bg-primary/10 text-primary text-[8px] font-bold border border-primary/20">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                  });

                  return rows;
                };

                return <div className="space-y-0.5">{renderTree(root)}</div>;
              })()}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t mt-4">
              <Button variant="outline" onClick={() => { setShowLinkModal(false); setSelectedGlobalDocIds([]); }}>
                Cancel
              </Button>
              <Button onClick={handleLinkDocuments} disabled={selectedGlobalDocIds.length === 0}>
                Link {selectedGlobalDocIds.length} Selected
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal: View Column Information */}
        <Dialog open={!!selectedColumnInfo} onOpenChange={(open) => !open && setSelectedColumnInfo(null)}>
          <DialogContent className="max-w-md bg-card border border-border shadow-2xl rounded-lg text-foreground">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2 border-b pb-2">
                <Info size={20} className="text-primary" />
                Column Information
              </DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-4 text-xs leading-normal">
              <div>
                <span className="font-bold text-muted-foreground block uppercase text-[10px] tracking-wider mb-1">Column Name</span>
                <span className="font-mono text-foreground font-semibold bg-muted px-2 py-1 rounded text-sm block w-fit border">{selectedColumnInfo?.name}</span>
              </div>
              <div>
                <span className="font-bold text-muted-foreground block uppercase text-[10px] tracking-wider mb-1">Type</span>
                <span className="capitalize font-semibold text-foreground bg-muted px-2 py-0.5 rounded border block w-fit text-[11px]">{selectedColumnInfo?.type}</span>
              </div>
              <div>
                <span className="font-bold text-muted-foreground block uppercase text-[10px] tracking-wider mb-1">Description / Coding Criteria</span>
                <div className="p-3 bg-muted/30 border rounded-lg text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {selectedColumnInfo?.description || <span className="text-amber-500 italic">No description provided.</span>}
                </div>
              </div>
              {selectedColumnInfo?.options && selectedColumnInfo.options.length > 0 && (
                <div>
                  <span className="font-bold text-muted-foreground block uppercase text-[10px] tracking-wider mb-1.5">Allowed Categories</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedColumnInfo.options.map(opt => (
                      <span key={opt} className="px-2 py-1 rounded bg-muted text-[11px] font-semibold border text-muted-foreground">
                        {opt}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-3 border-t mt-4">
              <Button variant="outline" size="sm" onClick={() => setSelectedColumnInfo(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal: View Coding Failure Details */}
        <Dialog open={!!errorDoc} onOpenChange={(open) => !open && setErrorDoc(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-destructive border-b pb-2">
                <AlertCircle size={18} />
                Coding Failure Details
              </DialogTitle>
            </DialogHeader>
            <div className="mt-3 space-y-3 text-xs leading-normal">
              <div>
                <span className="font-bold text-muted-foreground block uppercase text-[10px]">File Name</span>
                <span className="font-mono text-foreground font-semibold">{errorDoc?.filename.split("/").pop()}</span>
              </div>
              <div>
                <span className="font-bold text-muted-foreground block uppercase text-[10px]">Error Type</span>
                <span className="inline-flex px-2 py-0.5 rounded bg-destructive/10 text-destructive font-bold text-[10px] mt-0.5">
                  {errorDoc?.error_type || "EXTRACTION_FAILURE"}
                </span>
              </div>
              <div>
                <span className="font-bold text-muted-foreground block uppercase text-[10px]">Error Message</span>
                <div className="mt-1 bg-muted/60 border rounded p-3 font-mono text-[10px] whitespace-pre-wrap max-h-60 overflow-y-auto select-text leading-relaxed">
                  {errorDoc?.error_message || "No error message provided."}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t mt-4">
              <Button variant="outline" onClick={() => setErrorDoc(null)}>
                Close
              </Button>
              {errorDoc && (
                <Button 
                  onClick={() => {
                    const docId = errorDoc.document_id;
                    setErrorDoc(null);
                    void handleRetryDoc(docId);
                  }}
                  className="gap-1.5"
                >
                  <RefreshCw size={12} /> Retry Coding
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal: View Coded Cell Text Details */}
        <Dialog open={!!selectedCellView} onOpenChange={(open) => !open && setSelectedCellView(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2 border-b pb-2">
                <Eye size={18} className="text-primary" />
                Value Inspector: {selectedCellView?.columnName}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2 space-y-3 text-xs leading-normal flex-1 overflow-hidden flex flex-col">
              <div className="flex-shrink-0">
                <span className="font-bold text-muted-foreground block uppercase text-[10px]">File Name</span>
                <span className="font-mono text-foreground font-semibold">{selectedCellView?.filename}</span>
              </div>
              <div className="flex-1 flex flex-col min-h-0 space-y-3 overflow-y-auto">
                <div className="flex-1 flex flex-col min-h-[100px]">
                  <span className="font-bold text-muted-foreground block uppercase text-[10px] mb-1">Full Value</span>
                  <div className="flex-1 bg-muted/65 border rounded p-3 font-mono text-[11px] whitespace-pre-wrap select-text leading-relaxed">
                    {selectedCellView?.value}
                  </div>
                </div>
                {selectedCellView?.reasoning && (
                  <div className="flex-1 flex flex-col min-h-[120px]">
                    <span className="font-bold text-muted-foreground block uppercase text-[10px] mb-1">AI Reasoning & Evidence</span>
                    <div className="flex-1 bg-primary/5 border border-primary/20 rounded p-3 font-sans text-xs whitespace-pre-wrap select-text leading-relaxed">
                      {selectedCellView.reasoning}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end pt-3 border-t mt-4 flex-shrink-0">
              <Button variant="outline" onClick={() => setSelectedCellView(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal: Manage Columns & Campaign Settings */}
        <Dialog open={showSchemaModal} onOpenChange={setShowSchemaModal}>
          <DialogContent className="w-[96vw] sm:max-w-5xl lg:max-w-6xl h-[92vh] max-h-[92vh] flex flex-col overflow-hidden p-5">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2 border-b pb-2">
                <Edit size={18} className="text-primary" />
                Manage Campaign Settings & Columns
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSchemaSave} className="flex-1 flex flex-col min-h-0">
              <div className="mt-2 space-y-5 flex-1 overflow-y-auto pr-2">
                {/* Basic info section */}
                <div className="space-y-3 p-4 bg-muted/30 border rounded-lg">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">General Info</h4>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Campaign Name</label>
                    <Input 
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      placeholder="E.g. Financial Regulation Audit"
                      className="mt-1 text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Description</label>
                    <Input 
                      value={campaignDesc}
                      onChange={(e) => setCampaignDesc(e.target.value)}
                      placeholder="E.g. Quantifying delegation of agency discretion..."
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">System Prompt / Codebook</label>
                    <textarea 
                      value={campaignPromptText}
                      onChange={(e) => setCampaignPromptText(e.target.value)}
                      placeholder="Paste your system prompt instructions/codebook rules..."
                      className="w-full bg-background border border-input rounded mt-1 p-2 text-xs min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>
                </div>

                {/* Variable Schema columns list section */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Extracted Variables (Columns)</h4>
                    <Button 
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSchemaFields([...schemaFields, { name: "new_column_" + (schemaFields.length + 1), type: "string", description: "", options_raw: "", prompt: "", depends_on: [] }])}
                      className="h-7 text-xs gap-1"
                    >
                      <Plus size={11} /> Add Column
                    </Button>
                  </div>
                  
                  {schemaFields.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic text-center p-4 border border-dashed rounded-lg">No columns defined. Click Add Column to start.</p>
                  ) : (
                    <div className="space-y-3">
                      {schemaFields.map((col, idx) => (
                        <div key={idx} className="p-4 border rounded-xl bg-card shadow-sm space-y-3 relative">
                          <div className="flex justify-between items-center border-b pb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">Step {idx + 1}</span>
                              <span className="text-[11px] font-semibold text-muted-foreground">Define and evaluate this column</span>
                              {!col.description?.trim() && (
                                <span className="flex items-center gap-1 text-[9px] text-amber-500 font-semibold bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded animate-pulse">
                                  <AlertTriangle size={10} /> Missing Description
                                </span>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setSchemaFields(schemaFields.filter((_, i) => i !== idx))}
                              className="h-5 w-5 hover:bg-destructive/15 text-destructive rounded"
                            >
                              <X size={12} />
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="col-span-1">
                              <label className="text-[9px] font-bold text-muted-foreground uppercase">Variable Name (snake_case)</label>
                              <Input 
                                value={col.name}
                                onChange={(e) => updateSchemaField(idx, "name", e.target.value)}
                                placeholder="E.g. discretion_level"
                                className="mt-0.5 text-xs h-8"
                                required
                              />
                            </div>
                            <div className="col-span-1">
                              <label className="text-[9px] font-bold text-muted-foreground uppercase">Data Type</label>
                              <select
                                value={col.type}
                                onChange={(e) => updateSchemaField(idx, "type", e.target.value)}
                                className="w-full bg-background border border-input rounded mt-0.5 px-2 h-8 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                              >
                                <option value="string">String</option>
                                <option value="number">Number</option>
                                <option value="boolean">Boolean</option>
                              </select>
                            </div>
                            <div className="col-span-1">
                              <label className="text-[9px] font-bold text-muted-foreground uppercase">Allowed Options (Categorical)</label>
                              <Input 
                                value={col.options_raw || ""}
                                onChange={(e) => updateSchemaField(idx, "options_raw", e.target.value)}
                                placeholder="Comma separated, e.g. Y, N, Unclear"
                                className="mt-0.5 text-xs h-8"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-muted-foreground uppercase">Instructions / Criteria for LLM Decision</label>
                            <textarea
                              value={col.description || ""}
                              onChange={(e) => updateSchemaField(idx, "description", e.target.value)}
                              placeholder="Explain exactly how the LLM should evaluate and score this variable..."
                              className="w-full bg-background border border-input rounded mt-0.5 p-2 text-xs min-h-[50px] focus:outline-none focus:ring-1 focus:ring-primary font-sans leading-normal"
                            />
                          </div>
                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-muted-foreground uppercase">Column Prompt / Rubric</label>
                              <textarea
                                value={col.prompt || ""}
                                onChange={(e) => updateSchemaField(idx, "prompt", e.target.value)}
                                placeholder="Optional detailed prompt used specifically for this column..."
                                className="w-full bg-background border border-input rounded mt-0.5 p-2 text-xs min-h-[70px] focus:outline-none focus:ring-1 focus:ring-primary font-sans leading-normal"
                              />
                            </div>
                            <div className="rounded-lg border bg-muted/20 p-3">
                              <ColumnDependencySelector
                                columns={schemaFields}
                                columnIndex={idx}
                                value={col.depends_on || []}
                                onChange={(dependencies) => updateSchemaField(idx, "depends_on", dependencies)}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t mt-4 flex-shrink-0">
                <Button type="button" variant="outline" onClick={() => setShowSchemaModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  Save Changes
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Edit Cell Value & Reasoning */}
        <Dialog open={showEditCellModal} onOpenChange={setShowEditCellModal}>
          <DialogContent 
            className={cn(
              "flex flex-col p-6 overflow-hidden transition-all duration-200",
              editCellModalSize === 'standard' && "sm:max-w-3xl md:max-w-4xl h-[85vh] max-h-[85vh] w-[95vw] sm:w-full",
              editCellModalSize === 'wide' && "sm:max-w-5xl md:max-w-6xl lg:max-w-7xl h-[90vh] max-h-[90vh] w-[95vw] sm:w-full",
              editCellModalSize === 'full' && "sm:max-w-[96vw] md:max-w-[96vw] lg:max-w-[96vw] w-[96vw] h-[96vh] max-h-[96vh]"
            )}
          >
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="text-base font-bold flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2">
                  <Edit size={18} className="text-primary animate-pulse" />
                  <span>Inspect & Correct Cell: <span className="font-mono text-primary lowercase">{editCellData?.colName}</span></span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-muted/70 p-0.5 rounded-lg border border-border/60 text-xs">
                    <button
                      type="button"
                      onClick={() => setEditCellModalSize('standard')}
                      className={cn(
                        "px-2.5 py-1 rounded-md font-medium text-[11px] transition-all",
                        editCellModalSize === 'standard'
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Standard
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditCellModalSize('wide')}
                      className={cn(
                        "px-2.5 py-1 rounded-md font-medium text-[11px] transition-all",
                        editCellModalSize === 'wide'
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Widescreen
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditCellModalSize('full')}
                      className={cn(
                        "px-2.5 py-1 rounded-md font-medium text-[11px] transition-all",
                        editCellModalSize === 'full'
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Fullscreen
                    </button>
                  </div>
                  <span className="text-xs font-mono font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded max-w-[150px] truncate">
                    {editCellData?.filename}
                  </span>
                </div>
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto pr-1 space-y-6 py-2">
              {/* Split layout: Manual Override vs AI Re-evaluation */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                {/* Left Side: Manual Override */}
                <div className="border border-border/60 bg-muted/10 rounded-xl p-5 flex flex-col justify-between shadow-sm">
                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5 border-b pb-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
                      Manual Value Override
                    </h4>
                    <div className="space-y-4 text-xs">
                      {showBenchmarkComparison && parsedBenchmark && (() => {
                        const doc = docs.find(d => d.document_id === editCellData?.docId);
                        if (!doc || !editCellData) return null;
                        const benchVal = getMappedBenchmarkValue(doc, editCellData.colName);
                        if (benchVal === undefined || benchVal === "") return null;
                        return (
                          <div className="bg-rose-500/10 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 p-3 rounded-lg border border-rose-200 dark:border-rose-900 text-xs">
                            <span className="font-bold block uppercase text-[10px] tracking-wider mb-1 flex items-center gap-1.5">
                              <Sparkles size={11} className="text-amber-500 fill-amber-500 animate-pulse" />
                              Professor Benchmark Value
                            </span>
                            <span className="font-mono text-xs font-bold">{String(benchVal)}</span>
                          </div>
                        );
                      })()}

                      <div>
                        <span className="font-bold text-muted-foreground block uppercase text-[10px] tracking-wider mb-1.5">
                          Override Value
                        </span>
                        {editCellData?.options && editCellData.options.length > 0 ? (
                          <select
                            className="w-full bg-background border border-input rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary h-9 font-medium"
                            value={editCellVal}
                            onChange={(e) => setEditCellVal(e.target.value)}
                          >
                            <option value="">-- Select Option --</option>
                            {editCellData.options.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <textarea
                            className="w-full bg-background border border-input rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary min-h-[90px] font-mono leading-normal"
                            value={editCellVal}
                            onChange={(e) => setEditCellVal(e.target.value)}
                            placeholder="Enter column value..."
                          />
                        )}
                      </div>

                      <div>
                        <span className="font-bold text-muted-foreground block uppercase text-[10px] tracking-wider mb-1.5">
                          Override Rationale / Evidence
                        </span>
                        <textarea
                          className="w-full bg-background border border-input rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary min-h-[140px] font-sans leading-relaxed"
                          value={editCellReasoning}
                          onChange={(e) => setEditCellReasoning(e.target.value)}
                          placeholder="Explain the rationale or evidence for this override..."
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end pt-4 border-t border-border/40 mt-5">
                    <Button 
                      size="sm"
                      onClick={() => {
                        if (editCellData) {
                          void handleCellSave(editCellData.docId, editCellData.colName, editCellVal, editCellReasoning);
                        }
                      }}
                    >
                      Save Manual Override
                    </Button>
                  </div>
                </div>

                {/* Right Side: AI Re-evaluation */}
                <div className="border border-border/60 bg-primary/5 rounded-xl p-5 flex flex-col justify-between shadow-sm">
                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-primary mb-4 flex items-center gap-1.5 border-b pb-2 border-primary/20">
                      <span className="h-2 w-2 rounded-full bg-primary animate-pulse shadow-sm shadow-primary/50" />
                      AI Re-evaluation & Correction
                    </h4>
                    <div className="space-y-4 text-xs">
                      <p className="text-xs text-muted-foreground/90 leading-relaxed">
                        Identify what the AI got wrong or instruct it on how to score this document. The AI will re-read the file, campaign rules, previous value/reasoning, and your correction feedback to decide a new value.
                      </p>
                      <div>
                        <span className="font-bold text-primary block uppercase text-[10px] tracking-wider mb-1.5">
                          Corrective Feedback / Critique for AI
                        </span>
                        <textarea
                          className="w-full bg-background border border-input rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary min-h-[160px] font-sans leading-relaxed"
                          value={reevalFeedback}
                          onChange={(e) => setReevalFeedback(e.target.value)}
                          disabled={reevalLoading}
                          placeholder="Example: 'You rated this a 4 (high discretion) because of rulemaking, but the law states this is purely a narrow procedural rule with no policymaking authority. It should be minimal discretion (1).'"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end pt-4 border-t border-primary/10 mt-5">
                    <Button 
                      size="sm"
                      onClick={() => {
                        if (editCellData) {
                          void handleCellReevaluate(editCellData.docId, editCellData.colName, reevalFeedback);
                        }
                      }}
                      disabled={reevalLoading || !reevalFeedback.trim()}
                    >
                      {reevalLoading ? (
                        <>
                          <Loader2 size={13} className="animate-spin mr-1.5" />
                          Reevaluating...
                        </>
                      ) : (
                        "Reevaluate with AI"
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Version History Log timeline */}
              <div className="border border-border/60 rounded-xl p-4 bg-muted/5">
                <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5 border-b pb-1.5">
                  📁 Version History & Audit Log
                </h4>
                {editCellData?.history && editCellData.history.length > 0 ? (
                  <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                    {[...editCellData.history].reverse().map((h) => {
                      const dateStr = h.timestamp ? new Date(h.timestamp).toLocaleString() : "";
                      return (
                        <div key={h.version} className="border border-border/40 bg-card rounded-lg p-3 text-xs leading-normal relative">
                          <div className="flex justify-between items-center mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-foreground">Version {h.version}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${
                                h.source === "ai" 
                                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                  : h.source === "user_override"
                                    ? "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                                    : "bg-primary/10 text-primary border border-primary/20"
                              }`}>
                                {h.source === "ai" ? "Initial AI" : h.source === "user_override" ? "Manual Override" : "AI Reevaluated"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground font-mono">{dateStr}</span>
                              <button
                                type="button"
                                className="text-[10px] text-primary font-bold hover:underline bg-primary/5 hover:bg-primary/10 px-1.5 py-0.5 rounded"
                                onClick={() => {
                                  setEditCellVal(h.value === null || h.value === undefined ? "" : String(h.value));
                                  setEditCellReasoning(h.reasoning || "");
                                  toast.info(`Loaded Version ${h.version} data into manual editor.`);
                                }}
                              >
                                Load
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 border-t border-border/40 pt-2">
                            <div className="md:col-span-1">
                              <span className="font-bold text-muted-foreground text-[9px] uppercase tracking-wider block">Value</span>
                              <span className="font-mono font-semibold bg-muted px-1.5 py-0.5 rounded inline-block mt-0.5">{h.value === null || h.value === undefined ? "null" : String(h.value)}</span>
                            </div>
                            <div className="md:col-span-3">
                              <span className="font-bold text-muted-foreground text-[9px] uppercase tracking-wider block">AI Reasoning / Evidence</span>
                              <p className="text-muted-foreground text-[11px] mt-0.5 whitespace-pre-wrap">{h.reasoning || "No reasoning logged."}</p>
                            </div>
                          </div>

                          {h.feedback_prompt && (
                            <div className="mt-2 bg-primary/5 border border-primary/10 rounded p-2 text-[11px]">
                              <span className="font-bold text-primary text-[9px] uppercase tracking-wider block">Feedback / Critique Submitted:</span>
                              <p className="text-foreground italic mt-0.5">"{h.feedback_prompt}"</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground text-xs italic">
                    No history logged yet. History begins when a cell value is overridden or re-evaluated.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t mt-4 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => setShowEditCellModal(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal: Column feedback re-evaluation */}
        <Dialog open={showColFeedbackModal} onOpenChange={setShowColFeedbackModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2 border-b pb-2">
                <Sparkles size={18} className="text-primary animate-pulse" />
                <span>Re-evaluate Column: <span className="font-mono text-primary lowercase">{selectedColFeedback?.name}</span></span>
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2 space-y-4 text-xs leading-normal">
              <p className="text-muted-foreground">
                Submit corrective feedback or prompt instructions for this column. The AI will re-evaluate <strong>all documents</strong> in this campaign using your updated guidelines.
              </p>

              <div>
                <span className="font-bold text-muted-foreground block uppercase text-[10px] tracking-wider mb-1">
                  Column Instruction / Corrective Feedback
                </span>
                <textarea
                  className="w-full bg-background border border-input rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary min-h-[120px] font-sans leading-relaxed mt-1"
                  value={colFeedbackPrompt}
                  onChange={(e) => setColFeedbackPrompt(e.target.value)}
                  placeholder="e.g. 'Ensure that TimeLimits is only set to True if there is a sunset date or statutory authority expiration. Do not mark True for reporting deadlines.'"
                  disabled={colFeedbackLoading}
                />
              </div>

              {selectedColFeedback?.prompt_history && selectedColFeedback.prompt_history.length > 0 && (
                <div className="mt-3">
                  <span className="font-bold text-muted-foreground block uppercase text-[10px] tracking-wider mb-2">
                    Prompt Version History
                  </span>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {[...selectedColFeedback.prompt_history].reverse().map((hist: any) => (
                      <div key={hist.version} className="p-2 border border-border bg-muted/40 rounded text-[11px]">
                        <div className="flex justify-between font-bold text-foreground mb-1">
                          <span>Version {hist.version}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{new Date(hist.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-muted-foreground italic">"{hist.prompt}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowColFeedbackModal(false)} disabled={colFeedbackLoading}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleColumnReevaluate} disabled={colFeedbackLoading || !colFeedbackPrompt.trim()}>
                {colFeedbackLoading ? (
                  <>
                    <Loader2 size={13} className="animate-spin mr-1.5" /> Reevaluating Dataset...
                  </>
                ) : (
                  "Reevaluate Column"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal: Row feedback re-evaluation */}
        <Dialog open={showRowFeedbackModal} onOpenChange={setShowRowFeedbackModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2 border-b pb-2">
                <Sparkles size={18} className="text-primary animate-pulse" />
                <span>Re-evaluate Document: <span className="font-mono text-primary truncate max-w-[250px]">{selectedRowFeedback?.filename.split("/").pop()}</span></span>
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2 space-y-4 text-xs leading-normal">
              <p className="text-muted-foreground">
                Explain what the AI got wrong or what specific criteria it should use when coding all variables for this law/document.
              </p>

              <div>
                <span className="font-bold text-muted-foreground block uppercase text-[10px] tracking-wider mb-1">
                  Document Corrective Feedback / Critique
                </span>
                <textarea
                  className="w-full bg-background border border-input rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary min-h-[140px] font-sans leading-relaxed mt-1"
                  value={rowFeedbackPrompt}
                  onChange={(e) => setRowFeedbackPrompt(e.target.value)}
                  placeholder="e.g. 'DirectOversight was marked True because of an SRO audit, but that is self-regulation. We only want True when Congress or GAO performs the audit. Re-evaluate variables accordingly.'"
                  disabled={rowFeedbackLoading}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowRowFeedbackModal(false)} disabled={rowFeedbackLoading}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleRowReevaluate} disabled={rowFeedbackLoading || !rowFeedbackPrompt.trim()}>
                {rowFeedbackLoading ? (
                  <>
                    <Loader2 size={13} className="animate-spin mr-1.5" /> Reevaluating Row...
                  </>
                ) : (
                  "Reevaluate Row"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
