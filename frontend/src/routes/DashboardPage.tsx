import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { useDocuments } from "@/hooks/useDocuments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthContext } from "@/context/AuthContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Document } from "@/types/document";
import { API_BASE_URL, ALLOWED_EXTENSIONS, CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR } from "@/constants";

interface FileNode {
  type: "file";
  name: string;
  document: Document;
}

interface FolderNode {
  type: "folder";
  name: string;
  path: string;
  children: { [key: string]: FileNode | FolderNode };
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, session, activeWorkspace } = useAuthContext();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignDocumentMapping, setCampaignDocumentMapping] = useState<Record<string, any[]>>({});
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState<string>("");
  const [selectedUploadCampaign, setSelectedUploadCampaign] = useState<string>("");
  const { 
    documents, 
    loading, 
    uploading, 
    uploadMultipleFiles, 
    deleteDocument,
    updateDocumentTags,
    moveDocument,
    refetch,
    page,
    setPage,
    pageCount,
    totalDocuments,
  } = useDocuments({ pageSize: 50 });
  const visibleDocumentIdsKey = useMemo(() => documents.map((doc) => doc.id).join(","), [documents]);

  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);

  // Tree View and Virtual Folder states
  const [virtualFolders, setVirtualFolders] = useState<string[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // Document Move states
  const [moveDoc, setMoveDoc] = useState<{ id: string; filename: string } | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState<string>("/");
  const [moveNewFolderName, setMoveNewFolderName] = useState<string>("");

  // Selection states
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [isBatchMoveOpen, setIsBatchMoveOpen] = useState(false);

  // Resize side panel states
  const [previewWidth, setPreviewWidth] = useState<number>(550);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [showFullscreenModal, setShowFullscreenModal] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize listener
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = containerRect.right - e.clientX;
      const minWidth = 320;
      const maxWidth = containerRect.width * 0.8;
      if (newWidth > minWidth && newWidth < maxWidth) {
        setPreviewWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Serve document preview
  useEffect(() => {
    if (previewDocId && session?.access_token) {
      const fetchPreview = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/documents/${previewDocId}/content`, {
            headers: { Authorization: `Bearer ${session.access_token}` }
          });
          if (!res.ok) throw new Error("Failed to fetch document");
          
          const previewDoc = documents.find(d => d.id === previewDocId);
          const contentType = res.headers.get("content-type") || "";
          
          const isPlainText = 
            contentType.includes("text/plain") || 
            contentType.includes("text/markdown") ||
            previewDoc?.filename.endsWith(".txt") ||
            previewDoc?.filename.endsWith(".md");
          
          if (isPlainText) {
            const text = await res.text();
            setPreviewText(text);
            setPreviewUrl(null);
          } else {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);
            setPreviewText(null);
          }
        } catch (error) {
          toast.error("Could not load preview");
          setPreviewDocId(null);
          setPreviewText(null);
        }
      };
      void fetchPreview();
    }
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setPreviewText(null);
    };
  }, [previewDocId, session, documents]);

  const fetchCampaigns = async () => {
    if (!session?.access_token) return;
    try {
      const workspaceId = activeWorkspace?.id ?? "TEST";
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const campaignResponse = await fetch(`${API_BASE_URL}/api/dashboards?workspace_id=${workspaceId}`, { headers });
      if (campaignResponse.ok) setCampaigns(await campaignResponse.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCampaignMapping = async () => {
    if (!session?.access_token) return;
    if (documents.length === 0) {
      setCampaignDocumentMapping({});
      return;
    }
    try {
      const workspaceId = activeWorkspace?.id ?? "TEST";
      const mappingResponse = await fetch(`${API_BASE_URL}/api/dashboards/document-mapping?workspace_id=${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ document_ids: documents.map((doc) => doc.id) }),
      });
      if (mappingResponse.ok) {
        const rows = await mappingResponse.json();
        const mapping: Record<string, any[]> = {};
        for (const row of rows) {
          (mapping[row.document_id] ??= []).push({
            campaignId: row.campaign_id,
            campaignName: row.campaign_name,
            status: row.status,
            error_message: row.error_message,
            error_type: row.error_type,
          });
        }
        setCampaignDocumentMapping(mapping);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (session?.access_token) {
      void fetchCampaigns();
    }
  }, [session?.access_token, activeWorkspace?.id]);

  useEffect(() => {
    void fetchCampaignMapping();
  }, [session?.access_token, activeWorkspace?.id, visibleDocumentIdsKey]);

  const isIngestableFile = (name: string): boolean => {
    const ext = name.split(".").pop()?.toLowerCase();
    return ext ? ALLOWED_EXTENSIONS.includes(ext) : false;
  };

  const uploadMultiple = async (filesToUpload: { file: File; relativePath: string }[]) => {
    if (filesToUpload.length === 0) {
      toast.error("No supported files found (PDF, DOCX, HTML, MD, TXT).");
      return;
    }

    const tags = uploadTags.split(",").map(t => t.trim()).filter(t => t);
    const toastId = toast.loading(`Uploading ${filesToUpload.length} files... 0%`);
    try {
      if (selectedUploadCampaign) {
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < filesToUpload.length; i++) {
          const item = filesToUpload[i];
          const formData = new FormData();
          formData.append("file", item.file);
          if (item.relativePath) {
            formData.append("relative_path", item.relativePath);
          }
          if (tags.length > 0) {
            formData.append("tags", tags.join(","));
          }
          formData.append("workspace_id", activeWorkspace?.id ?? "TEST");
          
          try {
            const res = await fetch(`${API_BASE_URL}/api/dashboards/${selectedUploadCampaign}/documents/upload`, {
              method: "POST",
              headers: { Authorization: `Bearer ${session?.access_token}` },
              body: formData,
            });
            if (!res.ok) throw new Error("Upload failed");
            successCount++;
          } catch {
            failCount++;
          }
          const pct = Math.round(((i + 1) / filesToUpload.length) * 100);
          toast.loading(
            `Uploading to Campaign: ${i + 1}/${filesToUpload.length} (${pct}%) • Success: ${successCount} • Failed: ${failCount}`,
            { id: toastId }
          );
        }
        toast.success(`Successfully uploaded ${successCount} files and enqueued campaign coding!`, { id: toastId });
        setUploadTags("");
      } else {
        const result = await uploadMultipleFiles(
          filesToUpload,
          (current, total, success, fail) => {
            const pct = Math.round((current / total) * 100);
            toast.loading(
              `Uploading: ${current}/${total} (${pct}%) • Success: ${success} • Failed: ${fail}`,
              { id: toastId }
            );
          },
          tags.length > 0 ? tags : undefined
        );
        if (result) {
          if (result.failCount > 0) {
            toast.error(`Uploaded ${result.successCount} files, but ${result.failCount} failed.`, { id: toastId });
          } else {
            toast.success(`Successfully uploaded all ${result.successCount} files!`, { id: toastId });
            setUploadTags(""); // clear tags on success
          }
        }
      }
      refetch();
      void fetchCampaigns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed", { id: toastId });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const filesToUpload: { file: File; relativePath: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (isIngestableFile(file.name)) {
          filesToUpload.push({ file, relativePath: file.name });
        }
      }
      await uploadMultiple(filesToUpload);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFolderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const filesToUpload: { file: File; relativePath: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relPath = file.webkitRelativePath || file.name;
        if (isIngestableFile(relPath)) {
          filesToUpload.push({ file, relativePath: relPath });
        }
      }
      await uploadMultiple(filesToUpload);
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  };

  const handleUpdateTags = async (id: string, currentTags: string[]) => {
    const newTagsStr = prompt("Update tags (comma separated):", currentTags.join(", "));
    if (newTagsStr !== null) {
      const tags = newTagsStr.split(",").map(t => t.trim()).filter(t => t);
      const toastId = toast.loading("Updating tags...");
      try {
        await updateDocumentTags(id, tags);
        toast.success("Tags updated!", { id: toastId });
      } catch (e) {
        toast.error("Failed to update tags", { id: toastId });
      }
    }
  };

  const handleCreateNewFolder = () => {
    const folderName = prompt("Enter folder path (e.g. 'archive' or 'finance/invoices'):");
    if (folderName && folderName.trim()) {
      const trimmed = folderName.trim().replace(/^\/+|\/+$/g, ""); // strip leading/trailing slashes
      if (virtualFolders.includes(trimmed)) {
        toast.error("Folder already exists.");
        return;
      }
      setVirtualFolders(prev => [...prev, trimmed]);
      toast.success(`Folder "${trimmed}" created.`);
    }
  };

  const handleRetryCampaignDoc = async (campaignId: string, docId: string) => {
    const toastId = toast.loading("Queuing retry...");
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${campaignId}/documents/retry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify([docId]),
      });
      if (!res.ok) throw new Error("Retry failed");
      toast.success("Retry queued successfully!", { id: toastId });
      void fetchCampaigns();
    } catch (err) {
      toast.error("Failed to retry coding", { id: toastId });
    }
  };

  const getBasename = (filename: string) => {
    const parts = filename.split("/");
    return parts[parts.length - 1];
  };

  const handleDragStart = (e: React.DragEvent, docId: string) => {
    let dragIds = [docId];
    if (selectedDocIds.has(docId)) {
      dragIds = Array.from(selectedDocIds);
    }
    e.dataTransfer.setData("text/plain", JSON.stringify(dragIds));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetFolderPath: string) => {
    e.preventDefault();
    try {
      const idsData = e.dataTransfer.getData("text/plain");
      if (!idsData) return;
      const docIds: string[] = JSON.parse(idsData);
      if (!Array.isArray(docIds)) return;

      const toastId = toast.loading(`Moving ${docIds.length} file(s)...`);
      let successCount = 0;
      let failCount = 0;

      for (const id of docIds) {
        const doc = documents.find(d => d.id === id);
        if (!doc) continue;
        const basename = getBasename(doc.filename);
        const newFilename = targetFolderPath ? `${targetFolderPath}/${basename}` : basename;
        if (newFilename === doc.filename) {
          successCount++;
          continue;
        }

        try {
          await moveDocument(id, newFilename);
          successCount++;
        } catch (err) {
          failCount++;
        }
      }

      setSelectedDocIds(new Set());
      if (targetFolderPath && !virtualFolders.includes(targetFolderPath)) {
        setVirtualFolders(prev => [...prev, targetFolderPath]);
      }

      if (failCount > 0) {
        toast.error(`Moved ${successCount} file(s), failed to move ${failCount}.`, { id: toastId });
      } else {
        toast.success(`Successfully moved ${successCount} file(s) to "${targetFolderPath || "Root"}"!`, { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to move files.");
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedDocIds);
    if (ids.length === 0) return;

    const confirmed = window.confirm(`Are you sure you want to delete ${ids.length} selected file(s)?`);
    if (!confirmed) return;

    const toastId = toast.loading(`Deleting ${ids.length} file(s)...`);
    let successCount = 0;
    let failCount = 0;

    for (const id of ids) {
      try {
        await deleteDocument(id);
        successCount++;
      } catch (err) {
        failCount++;
      }
    }

    setSelectedDocIds(new Set());
    if (failCount > 0) {
      toast.error(`Deleted ${successCount} file(s), failed to delete ${failCount}.`, { id: toastId });
    } else {
      toast.success(`Successfully deleted ${successCount} file(s)!`, { id: toastId });
    }
  };

  const handleCreateFolderWithSelected = async () => {
    const ids = Array.from(selectedDocIds);
    if (ids.length === 0) return;

    const folderName = prompt("Enter new folder path (e.g. 'archive' or 'finance/invoices'):");
    if (!folderName || !folderName.trim()) return;

    const targetFolder = folderName.trim().replace(/^\/+|\/+$/g, "");
    const toastId = toast.loading(`Moving ${ids.length} file(s) to new folder "${targetFolder}"...`);
    let successCount = 0;
    let failCount = 0;

    for (const id of ids) {
      const doc = documents.find(d => d.id === id);
      if (!doc) continue;
      const basename = getBasename(doc.filename);
      const newFilename = targetFolder ? `${targetFolder}/${basename}` : basename;

      try {
        await moveDocument(id, newFilename);
        successCount++;
      } catch (err) {
        failCount++;
      }
    }

    if (targetFolder && !virtualFolders.includes(targetFolder)) {
      setVirtualFolders(prev => [...prev, targetFolder]);
    }

    setSelectedDocIds(new Set());

    if (failCount > 0) {
      toast.error(`Moved ${successCount} file(s), failed to move ${failCount}.`, { id: toastId });
    } else {
      toast.success(`Successfully moved ${successCount} file(s) to "${targetFolder}"!`, { id: toastId });
    }
  };

  const handleMoveConfirm = async () => {
    if (!moveDoc) return;
    
    let targetFolder = "";
    if (moveNewFolderName.trim()) {
      targetFolder = moveNewFolderName.trim().replace(/^\/+|\/+$/g, ""); // clean slashes
    } else {
      targetFolder = moveTargetFolder === "/" ? "" : moveTargetFolder;
    }
    
    const basename = getBasename(moveDoc.filename);
    const newFilename = targetFolder ? `${targetFolder}/${basename}` : basename;
    
    if (newFilename === moveDoc.filename) {
      toast.error("Document is already in this folder.");
      return;
    }

    const toastId = toast.loading(`Moving "${basename}"...`);
    try {
      await moveDocument(moveDoc.id, newFilename);
      toast.success(`Successfully moved to "${targetFolder || "Root"}"!`, { id: toastId });
      
      // Keep track of the virtual folder in state if they made one
      if (targetFolder && !virtualFolders.includes(targetFolder)) {
        setVirtualFolders(prev => [...prev, targetFolder]);
      }
      
      setMoveDoc(null);
      setMoveTargetFolder("/");
      setMoveNewFolderName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to move file", { id: toastId });
    }
  };

  const handleBatchMoveConfirm = async () => {
    let targetFolder = "";
    if (moveNewFolderName.trim()) {
      targetFolder = moveNewFolderName.trim().replace(/^\/+|\/+$/g, "");
    } else {
      targetFolder = moveTargetFolder === "/" ? "" : moveTargetFolder;
    }

    const ids = Array.from(selectedDocIds);
    const toastId = toast.loading(`Moving ${ids.length} file(s)...`);
    let successCount = 0;
    let failCount = 0;

    for (const id of ids) {
      const doc = documents.find(d => d.id === id);
      if (!doc) continue;
      const basename = getBasename(doc.filename);
      const newFilename = targetFolder ? `${targetFolder}/${basename}` : basename;
      if (newFilename === doc.filename) continue;

      try {
        await moveDocument(id, newFilename);
        successCount++;
      } catch (err) {
        failCount++;
      }
    }

    if (targetFolder && !virtualFolders.includes(targetFolder)) {
      setVirtualFolders(prev => [...prev, targetFolder]);
    }

    setSelectedDocIds(new Set());
    setIsBatchMoveOpen(false);
    setMoveTargetFolder("/");
    setMoveNewFolderName("");

    if (failCount > 0) {
      toast.error(`Moved ${successCount} file(s), failed to move ${failCount}.`, { id: toastId });
    } else {
      toast.success(`Successfully moved ${successCount} file(s) to "${targetFolder || "Root"}"!`, { id: toastId });
    }
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  const getCategoryColor = (cat?: string) => {
    return cat ? (CATEGORY_COLORS[cat] || DEFAULT_CATEGORY_COLOR) : DEFAULT_CATEGORY_COLOR;
  };

  const buildTree = (docs: Document[], vFolders: string[]): FolderNode => {
    const root: FolderNode = {
      type: "folder",
      name: "",
      path: "",
      children: {},
    };

    // Add virtual folders
    for (const vf of vFolders) {
      if (!vf.trim()) continue;
      const parts = vf.split("/").filter(Boolean);
      let current = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const currentPath = current.path ? `${current.path}/${part}` : part;
        if (!current.children[part]) {
          current.children[part] = {
            type: "folder",
            name: part,
            path: currentPath,
            children: {},
          };
        }
        current = current.children[part] as FolderNode;
      }
    }

    // Add documents
    for (const doc of docs) {
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
          current = current.children[part] as FolderNode;
        }
      }
    }

    return root;
  };

  const getSortedChildren = (children: { [key: string]: FileNode | FolderNode }) => {
    return Object.values(children).sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  };

  const getDocsInFolder = (node: FolderNode): Document[] => {
    const docs: Document[] = [];
    const traverse = (n: FolderNode) => {
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

  const handleDeleteFolder = async (folderNode: FolderNode) => {
    const docs = getDocsInFolder(folderNode);
    if (docs.length === 0) {
      setVirtualFolders(prev => prev.filter(f => f !== folderNode.path && !f.startsWith(folderNode.path + "/")));
      toast.success("Folder removed.");
      return;
    }
    
    const confirmed = window.confirm(
      `Are you sure you want to delete the folder "${folderNode.name}" and all of its ${docs.length} files?`
    );
    if (!confirmed) return;

    const toastId = toast.loading(`Deleting folder "${folderNode.name}"...`);
    let successCount = 0;
    let failCount = 0;
    
    for (const doc of docs) {
      try {
        await deleteDocument(doc.id);
        successCount++;
      } catch (err) {
        failCount++;
      }
    }
    
    setVirtualFolders(prev => prev.filter(f => f !== folderNode.path && !f.startsWith(folderNode.path + "/")));
    
    if (failCount > 0) {
      toast.error(`Deleted ${successCount} files, but failed to delete ${failCount}.`, { id: toastId });
    } else {
      toast.success(`Successfully deleted folder and its ${successCount} files!`, { id: toastId });
    }
  };

  const getFolderPaths = (node: FolderNode, paths: string[] = []) => {
    for (const key in node.children) {
      const child = node.children[key];
      if (child.type === "folder") {
        paths.push(child.path);
        getFolderPaths(child, paths);
      }
    }
    return paths;
  };

  const renderTree = (node: FolderNode, depth = 0): React.ReactNode[] => {
    const sortedChildren = getSortedChildren(node.children);
    const rows: React.ReactNode[] = [];

    sortedChildren.forEach((child) => {
      if (child.type === "folder") {
        const isExpanded = expandedFolders[child.path] !== false; // default to expanded if not set
        const folderDocs = getDocsInFolder(child);
        const total = folderDocs.length;
        const totalSize = folderDocs.reduce((acc, d) => acc + d.file_size, 0);
        
        const completed = folderDocs.filter(d => d.status === "completed").length;
        const failed = folderDocs.filter(d => d.status === "failed").length;
        const processing = folderDocs.filter(d => d.status === "processing").length;
        const pending = folderDocs.filter(d => d.status === "pending").length;

        const folderDocIds = folderDocs.map(d => d.id);
        const allFolderDocsSelected = folderDocIds.length > 0 && folderDocIds.every(id => selectedDocIds.has(id));

        rows.push(
          <tr 
            key={child.path} 
            className="border-b last:border-0 bg-muted/20 hover:bg-muted/30 transition-colors"
            onDragOver={handleDragOver}
            onDragEnter={(e) => e.currentTarget.classList.add("bg-primary/20")}
            onDragLeave={(e) => e.currentTarget.classList.remove("bg-primary/20")}
            onDrop={(e) => {
              e.currentTarget.classList.remove("bg-primary/20");
              void handleDrop(e, child.path);
            }}
          >
            <td className="px-4 py-3 text-center w-12">
              {total > 0 && (
                <input
                  type="checkbox"
                  checked={allFolderDocsSelected}
                  onChange={(e) => {
                    const newSelected = new Set(selectedDocIds);
                    if (e.target.checked) {
                      folderDocIds.forEach(id => newSelected.add(id));
                    } else {
                      folderDocIds.forEach(id => newSelected.delete(id));
                    }
                    setSelectedDocIds(newSelected);
                  }}
                  className="rounded border-input text-primary focus:ring-ring cursor-pointer"
                />
              )}
            </td>
            <td className="px-4 py-3 font-semibold" style={{ paddingLeft: `${depth * 20 + 16}px` }}>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExpandedFolders(prev => ({ ...prev, [child.path]: !isExpanded }))}
                  className="p-1 hover:bg-muted rounded text-muted-foreground transition-transform"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                <div className="rounded-md bg-primary/10 p-1 text-primary">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />
                  </svg>
                </div>
                <span className="truncate max-w-[200px]" title={child.name}>
                  {child.name}
                </span>
                <span className="text-[10px] text-muted-foreground font-normal bg-muted/80 px-1.5 rounded ml-1">
                  {total} {total === 1 ? "file" : "files"}
                </span>
              </div>
            </td>
            <td className="px-4 py-3 text-muted-foreground text-center">-</td>
            <td className="px-4 py-3 text-center">-</td>
            <td className="px-4 py-3 text-muted-foreground font-medium text-xs">{formatBytes(totalSize)}</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                {failed > 0 && (
                  <span className="text-[10px] font-semibold bg-destructive/10 text-destructive px-1.5 py-0.5 rounded border border-destructive/20">
                    {failed} failed
                  </span>
                )}
                {processing > 0 && (
                  <span className="text-[10px] font-semibold bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded border border-blue-500/20 animate-pulse">
                    {processing} processing
                  </span>
                )}
                {pending > 0 && (
                  <span className="text-[10px] font-semibold bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded border border-yellow-500/20">
                    {pending} queued
                  </span>
                )}
                {completed === total && total > 0 && (
                  <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    completed
                  </span>
                )}
                {total === 0 && (
                  <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                    empty
                  </span>
                )}
              </div>
            </td>
            <td className="px-4 py-3 text-right">
              {(user?.can_delete || user?.is_admin) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive h-7 px-2"
                  onClick={() => handleDeleteFolder(child)}
                >
                  Delete
                </Button>
              )}
            </td>
          </tr>
        );

        if (isExpanded) {
          rows.push(...renderTree(child, depth + 1));
        }
      } else {
        const doc = child.document;
        const tags = doc.metadata?.tags || [];
        
        rows.push(
          <tr 
            key={doc.id} 
            className="border-b last:border-0 hover:bg-muted/10 transition-colors"
            draggable={user?.can_add || user?.is_admin}
            onDragStart={(e) => handleDragStart(e, doc.id)}
          >
            <td className="px-4 py-3 text-center w-12">
              <input
                type="checkbox"
                checked={selectedDocIds.has(doc.id)}
                onChange={(e) => {
                  const newSelected = new Set(selectedDocIds);
                  if (e.target.checked) {
                    newSelected.add(doc.id);
                  } else {
                    newSelected.delete(doc.id);
                  }
                  setSelectedDocIds(newSelected);
                }}
                className="rounded border-input text-primary focus:ring-ring cursor-pointer"
              />
            </td>
            <td className="px-4 py-3 font-medium" style={{ paddingLeft: `${depth * 20 + 36}px` }}>
              <div className="flex items-center gap-2">
                <div className="rounded bg-muted p-1 text-muted-foreground flex-shrink-0 cursor-grab active:cursor-grabbing">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <span className="truncate max-w-[180px] md:max-w-[240px]" title={child.name}>
                  {child.name}
                </span>
              </div>
            </td>
            <td className="px-4 py-3">
              {doc.metadata?.category ? (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${getCategoryColor(doc.metadata.category)}`}>
                  {doc.metadata.category}
                </span>
              ) : <span className="text-muted-foreground">-</span>}
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1 max-w-[200px]">
                {tags.length > 0 ? tags.map((t: string, i: number) => (
                  <span key={i} className="bg-primary/10 text-primary text-[9px] px-1.5 py-0.5 rounded border border-primary/20">
                    {t}
                  </span>
                )) : null}
                {(campaignDocumentMapping[doc.id] || []).map((c: any) => (
                  <span 
                    key={c.campaignId} 
                    className="bg-indigo-500/10 text-indigo-600 text-[9px] px-1.5 py-0.5 rounded border border-indigo-500/20 font-bold cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/campaigns/${c.campaignId}`);
                    }}
                  >
                    Campaign: {c.campaignName}
                  </span>
                ))}
                {tags.length === 0 && (!campaignDocumentMapping[doc.id] || campaignDocumentMapping[doc.id].length === 0) && (
                  <span className="text-muted-foreground text-xs">-</span>
                )}
              </div>
            </td>
            <td className="px-4 py-3 text-muted-foreground text-xs">{formatBytes(doc.file_size)}</td>
            <td className="px-4 py-3">
              {selectedCampaignFilter ? (
                (() => {
                  const campInfo = (campaignDocumentMapping[doc.id] || []).find((c: any) => c.campaignId === selectedCampaignFilter);
                  if (!campInfo) {
                    return (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-muted text-muted-foreground">
                        Not Linked
                      </span>
                    );
                  }
                  return (
                    <div className="inline-flex items-center gap-1.5 relative group cursor-help">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        campInfo.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                        campInfo.status === 'failed' ? 'bg-destructive/10 text-destructive border-destructive/20 font-bold' :
                        'bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse'
                      }`}>
                        Coding: {campInfo.status}
                      </span>
                      {campInfo.status === 'failed' && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-4 w-4 rounded hover:bg-destructive/10 text-destructive shrink-0 p-0 flex items-center justify-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleRetryCampaignDoc(selectedCampaignFilter, doc.id);
                          }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        </Button>
                      )}
                      {campInfo.status === 'failed' && (
                        <div className="absolute left-1/2 bottom-full mb-1 hidden group-hover:block z-50 w-48 bg-slate-900 text-white rounded p-1.5 text-[9px] leading-normal shadow-md -translate-x-1/2">
                          <span className="font-bold block text-destructive uppercase text-[8px] mb-0.5">{campInfo.error_type}</span>
                          {campInfo.error_message || "Coding execution failed."}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  doc.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                  doc.status === 'failed' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                  'bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse'
                }`} title={doc.error_message || undefined}>
                  {doc.status}
                </span>
              )}
            </td>
            <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
              <Button
                variant={previewDocId === doc.id ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setPreviewDocId(doc.id)}
              >
                Preview
              </Button>
              {(user?.can_add || user?.is_admin) && (
                <>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleUpdateTags(doc.id, tags)}>
                    Tags
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setMoveDoc({ id: doc.id, filename: doc.filename })}>
                    Move
                  </Button>
                </>
              )}
              {(user?.can_delete || user?.is_admin) && (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-7 px-2 text-xs" onClick={() => deleteDocument(doc.id)}>
                  Delete
                </Button>
              )}
            </td>
          </tr>
        );
      }
    });

    return rows;
  };

  const filteredDocs = documents.filter(doc => {
    const matchesSearch = doc.filename.toLowerCase().includes(searchQuery.toLowerCase());
    const docTags = doc.metadata?.tags || [];
    const matchesTag = tagFilter ? docTags.some((t: string) => t.toLowerCase().includes(tagFilter.toLowerCase())) : true;
    const matchesCampaign = selectedCampaignFilter
      ? (campaignDocumentMapping[doc.id] && campaignDocumentMapping[doc.id].some(c => c.campaignId === selectedCampaignFilter))
      : true;
    return matchesSearch && matchesTag && matchesCampaign;
  });

  const treeRoot = buildTree(filteredDocs, virtualFolders);
  const allFolders = getFolderPaths(buildTree(documents, virtualFolders));

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">
      <ThreadSidebar />
      <div ref={containerRef} className="flex-1 flex h-full relative overflow-hidden">
        {/* Transparent Overlay during resizing to block iframe focus capture */}
        {isResizing && (
          <div className="absolute inset-0 bg-transparent z-50 cursor-col-resize select-none" />
        )}

        {/* Main Document Explorer Panel */}
        <main className="flex-1 overflow-y-auto min-w-0 h-full">
          <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-8">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Document Explorer</h1>
                <p className="text-muted-foreground mt-1">Manage, structure, search and tag documents in a visual directory tree.</p>
              </div>
              
              {(user?.can_add || user?.is_admin) && (
                <div className="flex flex-col items-end gap-2 bg-muted/20 p-4 rounded-lg border border-border">
                  <div className="text-sm font-medium mb-1 w-full text-left">Upload Documents</div>
                  <Input 
                    placeholder="Tags (comma separated)..." 
                    value={uploadTags}
                    onChange={(e) => setUploadTags(e.target.value)}
                    className="w-full mb-1.5 bg-background h-8 text-sm"
                  />
                  <div className="flex items-center gap-2 w-full mb-1.5">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground shrink-0">Target:</label>
                    <select
                      className="flex-1 h-8 rounded-md border border-input bg-background px-2 py-0 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={selectedUploadCampaign}
                      onChange={(e) => setSelectedUploadCampaign(e.target.value)}
                    >
                      <option value="">Global Library</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          Campaign: {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 w-full">
                    <Button 
                      variant="outline" 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex-1 text-xs"
                    >
                      Files
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => folderInputRef.current?.click()}
                      disabled={uploading}
                      className="flex-1 text-xs"
                    >
                      Folder
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={handleCreateNewFolder}
                      className="flex-1 text-xs text-primary"
                    >
                      + Folder
                    </Button>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    multiple
                    onChange={handleFileChange}
                  />
                  <input
                    type="file"
                    ref={folderInputRef}
                    className="hidden"
                    //@ts-expect-error webkitdirectory is non-standard but widely supported
                    webkitdirectory="true"
                    directory="true"
                    onChange={handleFolderChange}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-center">
              <Input 
                placeholder="Search by filename..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-md"
              />
              <Input 
                placeholder="Filter by tag..." 
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="max-w-[200px]"
              />
              <select
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 max-w-[220px]"
                value={selectedCampaignFilter}
                onChange={(e) => setSelectedCampaignFilter(e.target.value)}
              >
                <option value="">Global / All Campaigns</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    Campaign: {c.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedDocIds.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-primary/5 rounded-lg border border-primary/20 animate-in fade-in slide-in-from-top-4 duration-200">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                  <span>{selectedDocIds.size} file(s) selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => setSelectedDocIds(new Set())}
                  >
                    Clear Selection
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => setIsBatchMoveOpen(true)}
                  >
                    Move Selected
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 text-primary hover:text-primary-foreground hover:bg-primary"
                    onClick={handleCreateFolderWithSelected}
                  >
                    Create Folder with Selected
                  </Button>
                  {(user?.can_delete || user?.is_admin) && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="text-xs h-8"
                      onClick={handleBulkDelete}
                    >
                      Delete Selected
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-md border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead 
                    className="text-xs text-muted-foreground uppercase bg-muted/50 border-b transition-colors"
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => e.currentTarget.classList.add("bg-primary/10")}
                    onDragLeave={(e) => e.currentTarget.classList.remove("bg-primary/10")}
                    onDrop={(e) => {
                      e.currentTarget.classList.remove("bg-primary/10");
                      void handleDrop(e, "");
                    }}
                  >
                    <tr>
                      <th className="px-4 py-3 font-medium w-12 text-center">
                        <input
                          type="checkbox"
                          checked={filteredDocs.length > 0 && filteredDocs.every(d => selectedDocIds.has(d.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDocIds(new Set(filteredDocs.map(d => d.id)));
                            } else {
                              setSelectedDocIds(new Set());
                            }
                          }}
                          className="rounded border-input text-primary focus:ring-ring cursor-pointer"
                        />
                      </th>
                      <th className="px-4 py-3 font-medium w-2/5">Filename</th>
                      <th className="px-4 py-3 font-medium">Category</th>
                      <th className="px-4 py-3 font-medium">Tags</th>
                      <th className="px-4 py-3 font-medium">Size</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && documents.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-muted-foreground">Loading documents...</td>
                      </tr>
                    )}
                    {!loading && filteredDocs.length === 0 && virtualFolders.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-muted-foreground">No documents found.</td>
                      </tr>
                    )}
                    {(filteredDocs.length > 0 || virtualFolders.length > 0) && renderTree(treeRoot)}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
                <span>{totalDocuments} documents · page {page} of {pageCount}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= pageCount || loading} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Resize Handler Divider */}
        {previewDocId && (
          <div
            className="w-1 bg-border hover:bg-primary/50 active:bg-primary cursor-col-resize transition-all h-full z-10 flex-shrink-0"
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
            }}
          />
        )}

        {/* Draggable Document Preview Sidebar */}
        {previewDocId && (
          <aside
            style={{ width: `${previewWidth}px` }}
            className="h-full border-l bg-card flex flex-col flex-shrink-0 z-10 animate-in slide-in-from-right duration-200"
          >
            <div className="p-4 border-b flex justify-between items-center bg-muted/40 flex-shrink-0">
              <h3 className="font-semibold text-sm truncate max-w-[65%]" title={documents.find(d => d.id === previewDocId)?.filename}>
                Preview: {getBasename(documents.find(d => d.id === previewDocId)?.filename || "")}
              </h3>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-muted"
                  title="Fullscreen Dialog"
                  onClick={() => setShowFullscreenModal(true)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-muted text-muted-foreground hover:text-foreground"
                  onClick={() => setPreviewDocId(null)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </Button>
              </div>
            </div>
            <div className="flex-1 bg-muted/20 relative overflow-hidden">
              {previewText !== null ? (
                <pre className="w-full h-full overflow-auto p-6 bg-zinc-100/90 dark:bg-zinc-900/90 text-zinc-800 dark:text-zinc-200 font-mono text-xs leading-relaxed whitespace-pre-wrap select-text">
                  {previewText}
                </pre>
              ) : previewUrl ? (
                <iframe 
                  src={previewUrl} 
                  className="w-full h-full border-0" 
                  title="Sidebar Document Preview"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground animate-pulse text-xs">
                  Loading preview...
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Fullscreen Dialog Modal */}
      <Dialog open={showFullscreenModal} onOpenChange={setShowFullscreenModal}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 border border-border bg-background shadow-2xl">
          <DialogHeader className="p-4 border-b flex flex-row items-center justify-between space-y-0 flex-shrink-0">
            <DialogTitle className="text-base truncate max-w-[80%]">
              Fullscreen Preview: {documents.find(d => d.id === previewDocId)?.filename}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 bg-muted/20 overflow-hidden relative">
            {previewText !== null ? (
              <pre className="w-full h-full overflow-auto p-8 bg-zinc-100/90 dark:bg-zinc-900/90 text-zinc-800 dark:text-zinc-200 font-mono text-sm leading-relaxed whitespace-pre-wrap select-text">
                {previewText}
              </pre>
            ) : previewUrl ? (
              <iframe 
                src={previewUrl} 
                className="w-full h-full border-0" 
                title="Fullscreen Document Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground animate-pulse">
                Loading preview...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Move Document Dialog */}
      <Dialog open={!!moveDoc} onOpenChange={(open) => !open && setMoveDoc(null)}>
        <DialogContent className="max-w-md w-[90vw] p-6 bg-card border border-border shadow-xl rounded-lg text-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Move Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">
              Select a target folder path for <span className="font-semibold text-foreground">"{moveDoc ? getBasename(moveDoc.filename) : ""}"</span>:
            </p>
            
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                Choose Existing Folder
              </label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={moveTargetFolder}
                onChange={(e) => {
                  setMoveTargetFolder(e.target.value);
                  if (e.target.value) setMoveNewFolderName(""); // clear custom name if selecting dropdown
                }}
              >
                <option value="/">Root (no folder)</option>
                {allFolders.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or Move to New Folder</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                Create New Folder
              </label>
              <Input
                placeholder="e.g. 'archive' or 'finance/invoices'"
                value={moveNewFolderName}
                onChange={(e) => {
                  setMoveNewFolderName(e.target.value);
                  if (e.target.value) setMoveTargetFolder(""); // clear dropdown if typing manual
                }}
              />
              <p className="text-[10px] text-muted-foreground">
                This will create the folder path on the fly and move the document into it.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMoveDoc(null);
                  setMoveTargetFolder("/");
                  setMoveNewFolderName("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={moveDoc ? handleMoveConfirm : undefined}
                disabled={!moveTargetFolder && !moveNewFolderName.trim()}
              >
                Move Document
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Move Documents Dialog */}
      <Dialog open={isBatchMoveOpen} onOpenChange={(open) => !open && setIsBatchMoveOpen(false)}>
        <DialogContent className="max-w-md w-[90vw] p-6 bg-card border border-border shadow-xl rounded-lg text-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Move Selected Documents</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">
              Select a target folder path for the <span className="font-semibold text-foreground">{selectedDocIds.size} selected file(s)</span>:
            </p>
            
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                Choose Existing Folder
              </label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={moveTargetFolder}
                onChange={(e) => {
                  setMoveTargetFolder(e.target.value);
                  if (e.target.value) setMoveNewFolderName(""); // clear custom name if selecting dropdown
                }}
              >
                <option value="/">Root (no folder)</option>
                {allFolders.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or Move to New Folder</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                Create New Folder
              </label>
              <Input
                placeholder="e.g. 'archive' or 'finance/invoices'"
                value={moveNewFolderName}
                onChange={(e) => {
                  setMoveNewFolderName(e.target.value);
                  if (e.target.value) setMoveTargetFolder(""); // clear dropdown if typing manual
                }}
              />
              <p className="text-[10px] text-muted-foreground">
                This will create the folder path on the fly and move the selected documents into it.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsBatchMoveOpen(false);
                  setMoveTargetFolder("/");
                  setMoveNewFolderName("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleBatchMoveConfirm}
                disabled={!moveTargetFolder && !moveNewFolderName.trim()}
              >
                Move Documents
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
