import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { postSse } from "@/lib/sse";
import { useAuthContext } from "@/context/AuthContext";
import type { Message } from "@/types/message";
import type { ThreadWithMessages } from "@/types/thread";

interface UseChatReturn {
  messages: Message[];
  streaming: boolean;
  draftContent: string;
  activeTool: { name: string; status: "running" | "completed"; results?: any[] } | null;
  sendMessage: (text: string, threadId?: string, pinnedDocumentIds?: string[], dashboardId?: string) => Promise<string | null>;
  stopGeneration: () => void;
}

/**
 * Manages message history and SSE chat for a given thread.
 * Delta tokens are appended immutably to a draft string during streaming.
 * On "done" the draft becomes a persisted message.
 */
export function useChat(threadId: string | null): UseChatReturn {
  const { session, activeWorkspace } = useAuthContext();
  const jwt = session?.access_token ?? "";

  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [draftContent, setDraftContent] = useState("");
  const [activeTool, setActiveTool] = useState<{ name: string; status: "running" | "completed"; results?: any[] } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<any>(null);

  const stopGeneration = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setStreaming(false);
    setDraftContent("");
    setActiveTool(null);
  }, []);

  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      setStreaming(false);
      setDraftContent("");
      setActiveTool(null);
      
      // Append timeout error message
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        thread_id: threadId ?? "",
        user_id: "",
        role: "assistant",
        content: "Error: The request timed out due to server inactivity. Please try again or click Stop.",
        provider_response_id: null,
        tokens_input: null,
        tokens_output: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }, 60000); // 60 seconds inactivity timeout (free models can be slow)
  }, [threadId]);

  const clearInactivityTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Load messages when thread changes
  useEffect(() => {
    if (!threadId || !jwt) {
      setMessages([]);
      return;
    }

    apiFetch<ThreadWithMessages>(`/api/threads/${threadId}`, jwt)
      .then((data) => setMessages(data.messages))
      .catch(() => setMessages([]));
  }, [threadId, jwt]);

  const sendMessage = useCallback(
    async (text: string, overrideThreadId?: string, pinnedDocumentIds?: string[], dashboardId?: string): Promise<string | null> => {
      if (!jwt || streaming) return null;

      const targetThreadId = overrideThreadId ?? threadId;

      // Append user message optimistically (immutable)
      const userMsg: Message = {
        id: crypto.randomUUID(),
        thread_id: targetThreadId ?? "",
        user_id: "",
        role: "user",
        content: text,
        provider_response_id: null,
        tokens_input: null,
        tokens_output: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      setStreaming(true);
      setDraftContent("");
      setActiveTool(null);
      let newThreadId: string | null = null;
      let accumulated = "";
      let currentToolCall: any = null;

      abortRef.current = new AbortController();
      resetTimeout();

      try {
        await postSse(
          "/api/chat/stream",
          { 
            thread_id: targetThreadId, 
            message: text,
            workspace_id: activeWorkspace?.id ?? "TEST",
            pinned_document_ids: pinnedDocumentIds,
            dashboard_id: dashboardId
          },
          jwt,
          {
            onThread: ({ thread_id }) => {
              newThreadId = thread_id;
              resetTimeout();
            },
            onDelta: ({ text: chunk }) => {
              accumulated += chunk;
              setDraftContent((prev) => prev + chunk);
              resetTimeout();
            },
            onTool: (data) => {
              currentToolCall = data;
              setActiveTool(data);
              resetTimeout();
            },
            onDone: ({ message_id }) => {
              clearInactivityTimeout();
              const assistantMsg: Message = {
                id: message_id,
                thread_id: targetThreadId ?? newThreadId ?? "",
                user_id: "",
                role: "assistant",
                content: accumulated,
                provider_response_id: null,
                tokens_input: null,
                tokens_output: null,
                created_at: new Date().toISOString(),
                toolCall: currentToolCall || undefined,
              };
              setMessages((prev) => [...prev, assistantMsg]);
              setDraftContent("");
              setActiveTool(null);
              setStreaming(false);
            },
            onError: ({ message }) => {
              clearInactivityTimeout();
              throw new Error(message);
            },
          },
          abortRef.current.signal
        );
      } catch (err) {
        clearInactivityTimeout();
        setDraftContent("");
        setActiveTool(null);
        setStreaming(false);
        throw err;
      }

      return newThreadId;
    },
    [jwt, streaming, threadId, resetTimeout, clearInactivityTimeout, activeWorkspace]
  );

  return { messages, streaming, draftContent, activeTool, sendMessage, stopGeneration };
}
