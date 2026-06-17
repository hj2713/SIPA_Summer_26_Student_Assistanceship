import { useState, useRef, useEffect } from "react";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { useDocuments } from "@/hooks/useDocuments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import type { Document } from "@/types/document";
import { useAuthContext } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

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

export function DocumentsPage() {
  const { user, session } = useAuthContext();
  const { 
    documents, 
    loading, 
    uploading, 
    uploadMultipleFiles, 
    deleteDocument,
    retryDocument,
    retryDocumentsBatch
  } = useDocuments();

  const [isDragOver, setIsDragOver] = useState(false);
  const [expandedSummaryIds, setExpandedSummaryIds] = useState<string[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  
  // Admin panel states
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Fetch registered users if admin
  const fetchUsers = async () => {
    if (!session?.access_token || !user?.is_admin) return;
    setLoadingUsers(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"}/api/auth/users`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (err) {
      console.error("Failed to fetch users", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (user?.is_admin) {
      void fetchUsers();
    }
  }, [user, session]);

  const handleTogglePermission = async (targetUser: any, field: "can_add" | "can_delete") => {
    if (!session?.access_token) return;
    const payload = {
      can_add: field === "can_add" ? !targetUser.can_add : targetUser.can_add,
      can_delete: field === "can_delete" ? !targetUser.can_delete : targetUser.can_delete,
    };
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"}/api/auth/users/${targetUser.id}/permissions`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        }
      );
      if (response.ok) {
        const updatedUser = await response.json();
        setUsers((prev) => prev.map((u) => (u.id === targetUser.id ? updatedUser : u)));
        toast.success(`Permissions updated for ${targetUser.email}`);
      } else {
        throw new Error("Failed to update permissions");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle permission");
    }
  };

  const handleCreateUser = async () => {
    if (!newUserEmail.trim() || !newUserPassword.trim()) return;
    setCreatingUser(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"}/api/auth/signup`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ email: newUserEmail.trim(), password: newUserPassword }),
        }
      );
      if (response.ok) {
        toast.success("User created successfully!");
        setShowAddUserModal(false);
        setNewUserEmail("");
        setNewUserPassword("");
        void fetchUsers();
      } else {
        const body = await response.json();
        throw new Error(body.detail ?? "Failed to create user");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!user?.can_add && !user?.is_admin) return;
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const traverseFileTree = async (item: any): Promise<{ file: File; relativePath: string }[]> => {
    const result: { file: File; relativePath: string }[] = [];
    if (item.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        item.file(resolve, reject);
      });
      const cleanPath = item.fullPath.startsWith("/") ? item.fullPath.slice(1) : item.fullPath;
      result.push({ file, relativePath: cleanPath });
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      const readAllEntries = async (): Promise<any[]> => {
        const entries: any[] = [];
        const read = (): Promise<any[]> => {
          return new Promise((resolve, reject) => {
            dirReader.readEntries(resolve, reject);
          });
        };
        let batch = await read();
        while (batch.length > 0) {
          entries.push(...batch);
          batch = await read();
        }
        return entries;
      };

      const entries = await readAllEntries();
      for (const entry of entries) {
        const nested = await traverseFileTree(entry);
        result.push(...nested);
      }
    }
    return result;
  };

  const isIngestableFile = (name: string): boolean => {
    const allowedExtensions = ["txt", "md", "html", "pdf", "docx"];
    const ext = name.split(".").pop()?.toLowerCase();
    return ext ? allowedExtensions.includes(ext) : false;
  };

  const uploadMultiple = async (filesToUpload: { file: File; relativePath: string }[]) => {
    if (filesToUpload.length === 0) {
      toast.error("No supported files found (PDF, DOCX, HTML, MD, TXT).");
      return;
    }

    const toastId = toast.loading(`Uploading ${filesToUpload.length} files... 0%`);
    try {
      const result = await uploadMultipleFiles(
        filesToUpload,
        (current, total, success, fail) => {
          const pct = Math.round((current / total) * 100);
          toast.loading(
            `Uploading: ${current}/${total} (${pct}%) • Success: ${success} • Failed: ${fail}`,
            { id: toastId }
          );
        }
      );
      if (result) {
        if (result.failCount > 0) {
          const errors = result.errors;
          const isUnauthorized = errors.some(e => e.includes("401") || e.toLowerCase().includes("unauthorized"));
          const isForbidden = errors.some(e => e.includes("403") || e.toLowerCase().includes("forbidden") || e.toLowerCase().includes("permission"));
          
          let detailMsg = "";
          if (isUnauthorized) {
            detailMsg = " Your session is invalid or expired. Please sign out and sign back in.";
          } else if (isForbidden) {
            detailMsg = " You do not have permission to upload files.";
          } else if (errors.length > 0) {
            const uniqueErrorMessages = Array.from(new Set(errors.map(e => {
              const parts = e.split(": ");
              return parts.slice(1).join(": ");
            })));
            detailMsg = ` Details: ${uniqueErrorMessages.slice(0, 2).join(", ")}${uniqueErrorMessages.length > 2 ? "..." : ""}`;
          }
          
          toast.error(
            `Uploaded ${result.successCount} files, but ${result.failCount} failed.${detailMsg}`,
            { id: toastId, duration: 8000 }
          );
          console.error("Upload failures:\n" + result.errors.join("\n"));
        } else {
          toast.success(`Successfully uploaded all ${result.successCount} files! Ingestion started.`, { id: toastId });
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed", { id: toastId });
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (!user?.can_add && !user?.is_admin) return;
    e.preventDefault();
    setIsDragOver(false);

    const items = e.dataTransfer.items;
    const filesToUpload: { file: File; relativePath: string }[] = [];

    if (items && items.length > 0) {
      const promises: Promise<any>[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const entry = item.webkitGetAsEntry();
        if (entry) {
          promises.push(
            traverseFileTree(entry).then((nestedFiles) => {
              for (const f of nestedFiles) {
                if (isIngestableFile(f.relativePath)) {
                  filesToUpload.push(f);
                }
              }
            })
          );
        }
      }
      await Promise.all(promises);
    } else {
      const files = e.dataTransfer.files;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (isIngestableFile(file.name)) {
          filesToUpload.push({ file, relativePath: file.name });
        }
      }
    }

    await uploadMultiple(filesToUpload);
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
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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
      if (folderInputRef.current) {
        folderInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument(id);
      toast.success("Document deleted.");
    } catch {
      toast.error("Failed to delete document.");
    }
  };

  const handleRetryFile = async (id: string) => {
    const toastId = toast.loading("Queuing document for ingestion retry...");
    try {
      await retryDocument(id);
      toast.success("Document ingestion queued successfully!", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed", { id: toastId });
    }
  };

  const handleRetryFolder = async (folderNode: FolderNode) => {
    const docs = getDocsInFolder(folderNode);
    const failedDocs = docs.filter((d) => d.status === "failed");
    if (failedDocs.length === 0) return;

    const toastId = toast.loading(`Starting retry for ${failedDocs.length} failed documents...`);
    try {
      const ids = failedDocs.map((d) => d.id);
      await retryDocumentsBatch(ids);
      toast.success(`Successfully queued ${failedDocs.length} documents for ingestion retry!`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed", { id: toastId });
    }
  };

  const handleRetryAllFailed = async () => {
    const failedDocs = documents.filter((d) => d.status === "failed");
    if (failedDocs.length === 0) return;

    const toastId = toast.loading(`Starting retry for all ${failedDocs.length} failed documents...`);
    try {
      const ids = failedDocs.map((d) => d.id);
      await retryDocumentsBatch(ids);
      toast.success(`Successfully queued ${failedDocs.length} documents for ingestion retry!`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed", { id: toastId });
    }
  };

  const toggleSummary = (id: string) => {
    setExpandedSummaryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [path]: prev[path] === false ? true : false,
    }));
  };

  const isFolderExpanded = (path: string) => {
    return expandedFolders[path] !== false;
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
    switch (cat) {
      case "guide":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "report":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "code":
        return "bg-violet-500/10 text-violet-500 border-violet-500/20";
      case "legal":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "invoice":
        return "bg-cyan-500/10 text-cyan-500 border-cyan-500/20";
      case "article":
        return "bg-rose-500/10 text-rose-500 border-rose-500/20";
      default:
        return "bg-muted text-muted-foreground border-muted-foreground/10";
    }
  };

  const buildTree = (docs: Document[]): FolderNode => {
    const root: FolderNode = {
      type: "folder",
      name: "",
      path: "",
      children: {},
    };

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
    if (docs.length === 0) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to delete the folder "${folderNode.name}" and all of its ${docs.length} files?`
    );
    if (!confirmed) return;

    const toastId = toast.loading(`Deleting folder "${folderNode.name}" and nested files...`);
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
    
    if (failCount > 0) {
      toast.error(`Deleted ${successCount} files, but failed to delete ${failCount}.`, { id: toastId });
    } else {
      toast.success(`Successfully deleted folder "${folderNode.name}" and all its files!`, { id: toastId });
    }
  };

  const renderTree = (node: FolderNode, depth = 0): React.ReactNode => {
    const sortedChildren = getSortedChildren(node.children);

    return (
      <div className="flex flex-col w-full">
        {sortedChildren.map((child) => {
          if (child.type === "folder") {
            const isExpanded = isFolderExpanded(child.path);
            const folderDocs = getDocsInFolder(child);
            
            const total = folderDocs.length;
            const completed = folderDocs.filter(d => d.status === "completed").length;
            const processing = folderDocs.filter(d => d.status === "processing").length;
            const pending = folderDocs.filter(d => d.status === "pending").length;
            const failed = folderDocs.filter(d => d.status === "failed").length;

            return (
              <div key={child.path} className="flex flex-col w-full">
                {/* Folder Row */}
                <div 
                  className="flex items-center justify-between py-2 px-4 hover:bg-muted/5 group border-b border-muted/20"
                  style={{ paddingLeft: `${Math.max(16, depth * 20 + 16)}px` }}
                >
                  <div 
                    className="flex items-center gap-2 cursor-pointer min-w-0 flex-1"
                    onClick={() => toggleFolder(child.path)}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>

                    <div className="rounded-md bg-primary/10 p-1.5 text-primary flex-shrink-0">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />
                      </svg>
                    </div>

                    <span className="text-sm font-semibold truncate max-w-[200px] sm:max-w-md" title={child.name}>
                      {child.name}
                    </span>

                    <div className="flex items-center gap-1.5 flex-wrap ml-2">
                      <span className="text-[10px] text-muted-foreground font-normal bg-muted/60 px-1.5 py-0.5 rounded border border-muted-foreground/10">
                        {total} {total === 1 ? "file" : "files"}
                      </span>
                      {completed > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500">
                          {completed} completed
                        </span>
                      )}
                      {processing > 0 && (
                        <span className="inline-flex items-center gap-1 rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-500 animate-pulse">
                          {processing} processing
                        </span>
                      )}
                      {pending > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded border border-yellow-500/20 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-500">
                          {pending} queued
                        </span>
                      )}
                      {failed > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded border border-destructive/20 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                          {failed} failed
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Retry Folder Button */}
                    {failed > 0 && (user?.can_add || user?.is_admin) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        title={`Retry ${failed} failed files in folder`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRetryFolder(child);
                        }}
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
                          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                        </svg>
                      </Button>
                    )}

                    {/* Delete Folder Button */}
                    {(user?.can_delete || user?.is_admin) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Delete folder and all files inside"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteFolder(child);
                        }}
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
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Recursive Children Rendering */}
                {isExpanded && renderTree(child, depth + 1)}
              </div>
            );
          } else {
            // File node
            const doc = child.document;
            return (
              <div 
                key={doc.id} 
                className="flex flex-col border-b border-muted/20 hover:bg-muted/5 transition-all duration-150"
                style={{ paddingLeft: `${Math.max(16, depth * 20 + 20)}px` }}
              >
                <div className="flex items-center justify-between py-2.5 pr-4 w-full">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="rounded-md bg-muted p-1.5 text-muted-foreground flex-shrink-0">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium truncate max-w-[200px] sm:max-w-md" title={child.name}>
                          {child.name}
                        </p>
                        {doc.metadata?.category && (
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.2 text-[9px] font-semibold transition-colors ${getCategoryColor(doc.metadata.category)}`}>
                            {doc.metadata.category}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {formatBytes(doc.file_size)} • {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                      {doc.metadata?.tags && doc.metadata.tags.length > 0 && (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {doc.metadata.tags.map((tag: string, index: number) => (
                            <span key={index} className="inline-flex items-center rounded bg-muted/60 border px-1.5 py-0.2 text-[9px] text-muted-foreground">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    {/* Status Badge */}
                    {doc.status === "completed" && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Completed
                      </span>
                    )}

                    {doc.status === "processing" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-500 animate-pulse">
                        <svg className="animate-spin h-2.5 w-2.5 text-blue-500" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Processing
                      </span>
                    )}

                    {doc.status === "pending" && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-500">
                        Queued
                      </span>
                    )}

                    {doc.status === "failed" && (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive cursor-help"
                          title={doc.error_message || "Ingestion error"}
                        >
                          Failed
                        </span>
                        {(user?.can_add || user?.is_admin) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary/10"
                            title="Retry document ingestion"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRetryFile(doc.id);
                            }}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                            </svg>
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Delete Button */}
                    {(user?.can_delete || user?.is_admin) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Delete document"
                        onClick={() => void handleDelete(doc.id)}
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
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Collapsible Summary Section */}
                {doc.status === "completed" && doc.metadata?.summary && (
                  <div className="w-full pl-8 text-[11px] pb-2 pt-0.5">
                    <button
                      onClick={() => toggleSummary(doc.id)}
                      className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground font-medium mb-1 transition-all"
                    >
                      <span>{expandedSummaryIds.includes(doc.id) ? "Hide summary" : "Show summary"}</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        className={`transition-transform duration-200 ${expandedSummaryIds.includes(doc.id) ? "rotate-180" : ""}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {expandedSummaryIds.includes(doc.id) && (
                      <p className="text-muted-foreground/80 leading-relaxed bg-muted/5 p-2 rounded border border-muted/20 max-w-xl animate-in fade-in slide-in-from-top-1 duration-150">
                        {doc.metadata.summary}
                      </p>
                    )}
                  </div>
                )}

                {/* Collapsible Error Section */}
                {doc.status === "failed" && doc.error_message && (
                  <div className="w-full pl-8 text-[11px] pb-2 pt-0.5">
                    <button
                      onClick={() => toggleSummary(doc.id)}
                      className="flex items-center gap-0.5 text-destructive hover:text-destructive/80 font-medium mb-1 transition-all"
                    >
                      <span>{expandedSummaryIds.includes(doc.id) ? "Hide error details" : "Show error details"}</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        className={`transition-transform duration-200 ${expandedSummaryIds.includes(doc.id) ? "rotate-180" : ""}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {expandedSummaryIds.includes(doc.id) && (
                      <pre className="whitespace-pre-wrap font-mono text-[10px] text-destructive/90 leading-relaxed bg-destructive/5 p-3 rounded border border-destructive/20 max-w-2xl overflow-x-auto animate-in fade-in slide-in-from-top-1 duration-150">
                        {doc.error_message}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          }
        })}
      </div>
    );
  };

  const treeRoot = buildTree(documents);
  const globalFailedDocs = documents.filter((d) => d.status === "failed");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <ThreadSidebar />
      <main className="flex-1 overflow-y-auto p-8 flex justify-center">
        <div className="w-full max-w-4xl space-y-8 pb-16">
          <header className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Document Ingestion</h1>
            <p className="text-muted-foreground">
              Ingest PDF, DOCX, HTML, Markdown, or plain text documents and folders into your local RAG pipeline. Files are split, embedded using OpenAI, and stored locally in SQLite.
            </p>
          </header>

          {/* Conditional Dropzone Rendering */}
          {!user?.can_add && !user?.is_admin ? (
            <Card className="bg-muted/30 border border-muted/50">
              <CardContent className="p-12 flex flex-col items-center justify-center text-center">
                <div className="rounded-full bg-muted/80 p-3 text-muted-foreground mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <p className="text-sm font-semibold">Uploads Disabled</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">
                  You currently have read-only access to this workspace. Please contact an administrator to request add permissions.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed border-2 hover:border-primary/50 transition-colors duration-200">
              <CardContent className="p-0">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center p-12 text-center rounded-lg transition-all duration-300 ${
                    isDragOver ? "bg-primary/5 border-primary scale-[0.99]" : "bg-muted/10"
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".txt,.md,.html,.pdf,.docx,text/plain,text/markdown,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    disabled={uploading}
                    multiple
                  />
                  <input
                    type="file"
                    ref={folderInputRef}
                    onChange={handleFolderChange}
                    className="hidden"
                    disabled={uploading}
                    {...({
                      webkitdirectory: "",
                      directory: "",
                      multiple: true,
                    } as any)}
                  />
                  
                  <div className="mb-4 rounded-full bg-primary/10 p-3 text-primary">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" x2="12" y1="3" y2="15" />
                    </svg>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">
                        {uploading ? "Uploading files..." : "Drag & drop files or folders here, or browse"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PDF, DOCX, HTML, MD, TXT supported (max 20 MB per file)
                      </p>
                    </div>
                    
                    <div className="flex justify-center gap-3 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Select Files
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={uploading}
                        onClick={() => folderInputRef.current?.click()}
                      >
                        Select Folder
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Documents Table / Tree List */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Workspace Documents</CardTitle>
                {loading && documents.length > 0 && (
                  <svg className="animate-spin h-3.5 w-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
              </div>
              {globalFailedDocs.length > 0 && (user?.can_add || user?.is_admin) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive flex items-center gap-1.5"
                  onClick={handleRetryAllFailed}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                  Retry All Failed ({globalFailedDocs.length})
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {loading && documents.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading documents...
                </div>
              ) : documents.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground text-sm">
                  No documents found in this workspace. Upload files or folders to search them in your chat.
                </div>
              ) : (
                <div className="divide-y border-t bg-card">
                  {renderTree(treeRoot)}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Admin User Permissions Panel */}
          {user?.is_admin && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-lg">User Permissions Management</CardTitle>
                <Button size="sm" onClick={() => setShowAddUserModal(true)}>
                  + Add New User
                </Button>
              </CardHeader>
              <CardContent>
                {loadingUsers ? (
                  <div className="p-6 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Loading users...
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-md">
                    <table className="w-full text-left text-sm text-muted-foreground border-collapse">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="py-3 px-4 font-semibold text-foreground">Email</th>
                          <th className="py-3 px-4 font-semibold text-foreground text-center">Role</th>
                          <th className="py-3 px-4 font-semibold text-foreground text-center">Can Add Files</th>
                          <th className="py-3 px-4 font-semibold text-foreground text-center">Can Delete Files</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-muted/20">
                        {users.map((u) => (
                          <tr key={u.id} className="hover:bg-muted/5 transition-all">
                            <td className="py-3 px-4 font-medium text-foreground">{u.email}</td>
                            <td className="py-3 px-4 text-center">
                              {u.is_admin ? (
                                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 rounded px-2 py-0.5 font-bold uppercase">
                                  Admin
                                </span>
                              ) : (
                                <span className="text-[10px] bg-muted text-muted-foreground rounded px-2 py-0.5 font-normal uppercase">
                                  User
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                disabled={u.is_admin}
                                onClick={() => handleTogglePermission(u, "can_add")}
                                className={cn(
                                  "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50",
                                  u.can_add || u.is_admin ? "bg-primary" : "bg-muted"
                                )}
                              >
                                <span
                                  className={cn(
                                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
                                    u.can_add || u.is_admin ? "translate-x-4" : "translate-x-0"
                                  )}
                                />
                              </button>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                disabled={u.is_admin}
                                onClick={() => handleTogglePermission(u, "can_delete")}
                                className={cn(
                                  "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50",
                                  u.can_delete || u.is_admin ? "bg-primary" : "bg-muted"
                                )}
                              >
                                <span
                                  className={cn(
                                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
                                    u.can_delete || u.is_admin ? "translate-x-4" : "translate-x-0"
                                  )}
                                />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Add User Modal */}
          {showAddUserModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowAddUserModal(false)}>
              <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold mb-2">Add New User</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Create a new login account. Newly created users have read-only workspace access by default.
                </p>
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-xs font-semibold block mb-1">Email Address</label>
                    <input
                      type="email"
                      placeholder="user@example.com"
                      className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAddUserModal(false);
                      setNewUserEmail("");
                      setNewUserPassword("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleCreateUser} disabled={creatingUser}>
                    {creatingUser ? "Creating..." : "Create User"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
