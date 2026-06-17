import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { useChat } from "@/hooks/useChat";
import { useDocuments } from "@/hooks/useDocuments";
import { useThreads } from "@/hooks/useThreads";
import type { Document } from "@/types/document";

const AVAILABLE_MODELS = [
  { value: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4o", label: "GPT-4o" },
];

export function ChatPage() {
  const { id: threadId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { messages, streaming, draftContent, activeTool, sendMessage, stopGeneration } = useChat(
    threadId ?? null
  );
  const { documents } = useDocuments();
  const { threads, updateThreadModel } = useThreads();
  const [pinnedDocuments, setPinnedDocuments] = useState<Document[]>([]);

  const activeThread = threads.find((t) => t.id === threadId);
  const currentModel = activeThread?.model || "gemini-3.1-flash-lite-preview";

  const handleSend = async (text: string) => {
    try {
      let finalMessage = text;
      if (pinnedDocuments.length > 0) {
        const filenames = pinnedDocuments.map(d => d.filename.split("/").pop()).join(", ");
        finalMessage = `[Pinned Files: ${filenames}]\n\n---PINNED_BOUNDARY---\n\n${finalMessage}`;
      }

      const newThreadId = await sendMessage(
        finalMessage,
        threadId,
        pinnedDocuments.map((doc) => doc.id)
      );
      setPinnedDocuments([]); // Clear pinned documents on send
      // If a new thread was created, navigate to it
      if (newThreadId && !threadId) {
        navigate(`/chat/${newThreadId}`, { replace: true });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    }
  };

  return (
    <div className="flex h-screen">
      <ThreadSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {!threadId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8">
            <h1 className="text-2xl font-semibold">Agentic RAG</h1>
            <p className="text-muted-foreground max-w-sm">
              Select a conversation from the sidebar or start a new one below.
            </p>
            <div className="w-full max-w-lg">
              <ChatInput
                onSend={handleSend}
                streaming={streaming}
                onStop={stopGeneration}
                workspaceDocuments={documents}
                pinnedDocuments={pinnedDocuments}
                onPinDocuments={setPinnedDocuments}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Thread Header Bar */}
            <div className="flex items-center justify-between border-b px-6 py-3 bg-card shadow-sm z-10">
              <div className="flex flex-col">
                <span className="font-semibold text-foreground text-sm truncate max-w-md">
                  {activeThread?.title || "Active Chat"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Agentic RAG Conversation
                </span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground font-medium">Model:</label>
                <select
                  value={currentModel}
                  onChange={async (e) => {
                    const selectedModel = e.target.value;
                    try {
                      await updateThreadModel(threadId, selectedModel);
                      toast.success(`Model updated to ${selectedModel}`);
                    } catch {
                      toast.error("Failed to update thread model");
                    }
                  }}
                  className="rounded-md border border-input bg-background px-3 py-1.5 text-xs ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {AVAILABLE_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <MessageList
              messages={messages}
              streaming={streaming}
              draftContent={draftContent}
              activeTool={activeTool}
            />
            <ChatInput
              onSend={handleSend}
              streaming={streaming}
              onStop={stopGeneration}
              workspaceDocuments={documents}
              pinnedDocuments={pinnedDocuments}
              onPinDocuments={setPinnedDocuments}
            />
          </>
        )}
      </div>
    </div>
  );
}
