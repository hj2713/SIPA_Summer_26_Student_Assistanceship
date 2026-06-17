import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthContext } from "@/context/AuthContext";
import type { Thread, CreateThreadPayload, RenameThreadPayload } from "@/types/thread";

/**
 * Manages the user's thread list.
 * All mutations return new arrays (immutable update pattern).
 */
export function useThreads() {
  const { session } = useAuthContext();
  const jwt = session?.access_token ?? "";

  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchThreads = useCallback(async () => {
    if (!jwt) return;
    setLoading(true);
    try {
      const data = await apiFetch<Thread[]>("/api/threads", jwt);
      setThreads(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load threads");
    } finally {
      setLoading(false);
    }
  }, [jwt]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const createThread = async (payload: CreateThreadPayload = {}): Promise<Thread> => {
    const thread = await apiFetch<Thread>("/api/threads", jwt, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setThreads((prev) => [thread, ...prev]);
    return thread;
  };

  const deleteThread = async (threadId: string): Promise<void> => {
    await apiFetch<void>(`/api/threads/${threadId}`, jwt, { method: "DELETE" });
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
  };

  const renameThread = async (threadId: string, payload: RenameThreadPayload): Promise<Thread> => {
    const updated = await apiFetch<Thread>(`/api/threads/${threadId}`, jwt, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, title: updated.title } : t))
    );
    return updated;
  };

  const updateThreadModel = async (threadId: string, model: string): Promise<Thread> => {
    const updated = await apiFetch<Thread>(`/api/threads/${threadId}/model`, jwt, {
      method: "PATCH",
      body: JSON.stringify({ model }),
    });
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, model: updated.model } : t))
    );
    return updated;
  };

  return { threads, loading, error, createThread, deleteThread, renameThread, updateThreadModel, refetch: fetchThreads };
}
