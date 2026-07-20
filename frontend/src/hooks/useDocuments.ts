import { useEffect, useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import type { Document } from "@/types/document";
import { API_BASE_URL, DEFAULT_WORKSPACE_ID } from "@/constants";

const BASE_URL = API_BASE_URL;

interface DocumentPage {
  items: Document[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export function useDocuments(options: { pageSize?: number } = {}) {
  const { session, user, activeWorkspace } = useAuthContext();
  const pageSize = options.pageSize;
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  const fetchDocuments = async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const workspaceId = activeWorkspace?.id ?? DEFAULT_WORKSPACE_ID;
      if (pageSize) {
        const data = await apiFetch<DocumentPage>(
          `/api/documents/page?workspace_id=${workspaceId}&page=${page}&page_size=${pageSize}`,
          session.access_token
        );
        setDocuments(data.items);
        setTotalDocuments(data.total);
        setPageCount(data.pages);
        if (page > data.pages) setPage(data.pages);
      } else {
        const data = await apiFetch<Document[]>(
          `/api/documents?workspace_id=${workspaceId}`,
          session.access_token
        );
        setDocuments(data);
        setTotalDocuments(data.length);
        setPageCount(1);
      }
    } catch (err) {
      console.error("Failed to fetch documents", err);
    } finally {
      setLoading(false);
    }
  };

  const uploadDocument = async (file: File, relativePath?: string, tags?: string[]) => {
    if (!session?.access_token) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (relativePath) {
        formData.append("relative_path", relativePath);
      }
      if (tags && tags.length > 0) {
        formData.append("tags", tags.join(","));
      }
      formData.append("workspace_id", activeWorkspace?.id ?? DEFAULT_WORKSPACE_ID);

      const response = await fetch(`${BASE_URL}/api/documents/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const body = await response.json();
          message = body.detail ?? body.message ?? message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      await response.json();
    } finally {
      setUploading(false);
    }
  };

  const uploadMultipleFiles = async (
    files: { file: File; relativePath: string }[],
    onProgress?: (current: number, total: number, successCount: number, failCount: number) => void,
    tags?: string[]
  ) => {
    if (!session?.access_token) return;
    setUploading(true);
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    try {
      const total = files.length;
      for (let i = 0; i < total; i++) {
        const item = files[i];
        const formData = new FormData();
        formData.append("file", item.file);
        if (item.relativePath) {
          formData.append("relative_path", item.relativePath);
        }
        if (tags && tags.length > 0) {
          formData.append("tags", tags.join(","));
        }
        formData.append("workspace_id", activeWorkspace?.id ?? DEFAULT_WORKSPACE_ID);

        try {
          const response = await fetch(`${BASE_URL}/api/documents/upload`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            body: formData,
          });

          if (!response.ok) {
            let message = `HTTP ${response.status}`;
            try {
              const body = await response.json();
              message = body.detail ?? body.message ?? message;
            } catch {}
            throw new Error(message);
          }
          successCount++;
        } catch (err) {
          failCount++;
          errors.push(`${item.relativePath}: ${err instanceof Error ? err.message : String(err)}`);
        }

        if (onProgress) {
          onProgress(i + 1, total, successCount, failCount);
        }
      }
    } finally {
      setUploading(false);
    }
    return { successCount, failCount, errors };
  };

  const deleteDocument = async (id: string) => {
    if (!session?.access_token) return;
    try {
      await apiFetch(`/api/documents/${id}`, session.access_token, {
        method: "DELETE",
      });
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error("Failed to delete document", err);
      throw err;
    }
  };

  const bulkDeleteDocuments = async (documentIds: string[]) => {
    if (!session?.access_token || !documentIds.length) return;
    try {
      await apiFetch<{ deleted_count: number; deleted_ids: string[] }>(
        "/api/documents/bulk-delete",
        session.access_token,
        {
          method: "POST",
          body: JSON.stringify({ document_ids: documentIds }),
        }
      );
      const idSet = new Set(documentIds);
      setDocuments((prev) => prev.filter((d) => !idSet.has(d.id)));
    } catch (err) {
      console.error("Failed to bulk delete documents", err);
      throw err;
    }
  };

  const updateDocumentTags = async (id: string, tags: string[]) => {
    if (!session?.access_token) return;
    try {
      const response = await fetch(`${BASE_URL}/api/documents/${id}/tags`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tags }),
      });

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const body = await response.json();
          message = body.detail ?? body.message ?? message;
        } catch {}
        throw new Error(message);
      }

      const updatedDoc = await response.json();
      setDocuments((prev) => prev.map((d) => (d.id === id ? updatedDoc : d)));
      return updatedDoc;
    } catch (err) {
      console.error("Failed to update tags", err);
      throw err;
    }
  };

  const retryDocument = async (id: string) => {
    if (!session?.access_token) return;
    try {
      const updatedDoc = await apiFetch<Document>(
        `/api/documents/${id}/retry`,
        session.access_token,
        { method: "POST" }
      );
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? updatedDoc : d))
      );
      return updatedDoc;
    } catch (err) {
      console.error("Failed to retry document ingestion", err);
      throw err;
    }
  };

  const retryDocumentsBatch = async (ids: string[]) => {
    if (!session?.access_token || ids.length === 0) return;
    try {
      const response = await fetch(`${BASE_URL}/api/documents/retry-batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ document_ids: ids }),
      });

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const body = await response.json();
          message = body.detail ?? body.message ?? message;
        } catch {}
        throw new Error(message);
      }

      const updatedDocs = await response.json();
      setDocuments((prev) =>
        prev.map((d) => {
          if (ids.includes(d.id)) {
            return { ...d, status: "pending", error_message: null };
          }
          return d;
        })
      );
      return updatedDocs;
    } catch (err) {
      console.error("Failed to retry batch ingestion", err);
      throw err;
    }
  };

  const moveDocument = async (id: string, newFilename: string) => {
    if (!session?.access_token) return;
    try {
      const response = await fetch(`${BASE_URL}/api/documents/${id}/move`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ new_filename: newFilename }),
      });

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const body = await response.json();
          message = body.detail ?? body.message ?? message;
        } catch {}
        throw new Error(message);
      }

      const updatedDoc = await response.json();
      setDocuments((prev) => prev.map((d) => (d.id === id ? updatedDoc : d)));
      return updatedDoc;
    } catch (err) {
      console.error("Failed to move document", err);
      throw err;
    }
  };

  useEffect(() => {
    setPage(1);
  }, [activeWorkspace?.id]);

  useEffect(() => {
    if (session?.access_token) {
      void fetchDocuments();
    } else {
      setDocuments([]);
      setLoading(false);
    }
  }, [session, activeWorkspace, page, pageSize]);

  useEffect(() => {
    if (!session || !user) return;

    const hasActiveJob = documents.some(
      (d) => d.status === "pending" || d.status === "processing"
    );

    if (!hasActiveJob) return;

    const interval = setInterval(() => {
      void fetchDocuments();
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [session, user, documents]);

  return {
    documents,
    loading,
    uploading,
    uploadDocument,
    uploadMultipleFiles,
    deleteDocument,
    bulkDeleteDocuments,
    updateDocumentTags,
    moveDocument,
    retryDocument,
    retryDocumentsBatch,
    refetch: fetchDocuments,
    page,
    setPage,
    pageCount,
    totalDocuments,
  };
}
