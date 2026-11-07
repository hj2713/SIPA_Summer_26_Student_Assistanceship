import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { useChat } from "@/hooks/useChat";
import { useDocuments } from "@/hooks/useDocuments";
import { useThreads } from "@/hooks/useThreads";
import { useAvailableModels } from "@/hooks/useAvailableModels";
import type { Document } from "@/types/document";

export function ChatPage() {
  const { id: threadId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { availableModels, loading: modelsLoading } = useAvailableModels();
  const { messages, streaming, draftContent, activeTool, sendMessage, stopGeneration } = useChat(
    threadId ?? null
  );
  const { documents } = useDocuments();
  const { threads, updateThreadModel } = useThreads();
  const [pinnedDocuments, setPinnedDocuments] = useState<Document[]>([]);

  const activeThread = threads.find((t) => t.id === threadId);
  const currentModel = activeThread?.model || (availableModels[0]?.value || "");

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
    <div className="flex h-screen bg-[#F7F3EE] text-stone-900 overflow-hidden">
      <ThreadSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {!threadId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8 max-w-2xl mx-auto">
            <div className="h-12 w-12 rounded-2xl bg-[#0B3B36] text-white flex items-center justify-center font-bold text-lg shadow-md mb-1">
              §
            </div>
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Legislative Research Assistant</h1>
            <p className="text-xs text-stone-500 max-w-md leading-relaxed">
              Query ingested public laws and statutes with grounded RAG retrieval, citations, and statutory delegation audits.
            </p>

            {/* Suggested prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left pt-2 pb-2">
              <button
                onClick={() => void handleSend("Which executive agencies receive delegated rulemaking authority under the ingested statutes?")}
                className="p-3 rounded-xl border border-stone-200 bg-white hover:border-[#0B3B36]/40 hover:shadow-xs transition-all text-xs text-stone-700"
              >
                <span className="font-semibold text-stone-900 block mb-0.5">Agency Delegation</span>
                <span className="text-[11px] text-stone-500">Which agencies receive delegated rulemaking power?</span>
              </button>
              <button
                onClick={() => void handleSend("Explain how statutory constraints affect discretion ranks on the 1 to 5 scale.")}
                className="p-3 rounded-xl border border-stone-200 bg-white hover:border-[#0B3B36]/40 hover:shadow-xs transition-all text-xs text-stone-700"
              >
                <span className="font-semibold text-stone-900 block mb-0.5">Discretion Constraints</span>
                <span className="text-[11px] text-stone-500">How do statutory reporting rules lower discretion rank?</span>
              </button>
            </div>

            <div className="w-full max-w-xl">
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
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-3 bg-white shadow-xs z-10">
              <div className="flex flex-col">
                <span className="font-bold text-stone-900 text-sm truncate max-w-md">
                  {activeThread?.title || "Active Research Chat"}
                </span>
                <span className="text-[11px] text-stone-500">
                  RAG Grounded Legal Exploration
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-stone-500 font-medium">Model:</label>
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
                    className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-[#0B3B36] font-medium"
                  >
                    {availableModels.length > 0 ? (
                      availableModels.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>
                        {modelsLoading ? "Loading models..." : "No Saved API Keys (Add in Settings)"}
                      </option>
                    )}
                  </select>
                </div>
                <ThemeToggle />
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
