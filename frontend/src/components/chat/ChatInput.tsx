import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Document } from "@/types/document";

interface FileHandler {
  accept: string;
  read: (file: File) => Promise<string>;
}

// Extensible registry for chatbot file attachments
const TEXT_READER = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read text file"));
    reader.readAsText(file);
  });
};

const CHAT_FILE_HANDLERS: Record<string, FileHandler> = {
  ".txt": { accept: "text/plain", read: TEXT_READER },
  ".md": { accept: "text/markdown", read: TEXT_READER },
  ".json": { accept: "application/json", read: TEXT_READER },
  ".js": { accept: "application/javascript", read: TEXT_READER },
  ".ts": { accept: "application/typescript", read: TEXT_READER },
  ".tsx": { accept: "text/typescript-jsx", read: TEXT_READER },
  ".jsx": { accept: "text/javascript-jsx", read: TEXT_READER },
  ".css": { accept: "text/css", read: TEXT_READER },
  ".html": { accept: "text/html", read: TEXT_READER },
  ".csv": { accept: "text/csv", read: TEXT_READER },
  ".xml": { accept: "text/xml", read: TEXT_READER },
  ".yml": { accept: "text/yaml", read: TEXT_READER },
  ".yaml": { accept: "text/yaml", read: TEXT_READER },
  ".ini": { accept: "text/plain", read: TEXT_READER },
  ".conf": { accept: "text/plain", read: TEXT_READER },
  ".log": { accept: "text/plain", read: TEXT_READER },
};

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-red-400">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z"/>
      </svg>
    );
  }
  if (["doc", "docx"].includes(ext)) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-blue-400">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z"/>
      </svg>
    );
  }
  if (["csv", "xlsx", "xls"].includes(ext)) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-green-400">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-emerald-400">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z"/>
    </svg>
  );
}

interface ChatInputProps {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
  onStop?: () => void;
  streaming?: boolean;
  workspaceDocuments?: Document[];
  pinnedDocuments?: Document[];
  onPinDocuments?: (docs: Document[]) => void;
}

/**
 * Chat input textarea with file attachment and document pinning.
 * - Enter submits the message.
 * - Shift+Enter inserts a newline.
 * - @ triggers document suggestions dropdown.
 * - Disabled while streaming.
 */
export function ChatInput({
  onSend,
  disabled = false,
  onStop,
  streaming = false,
  workspaceDocuments = [],
  pinnedDocuments = [],
  onPinDocuments,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);

  // Document suggestions state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [atMatchStart, setAtMatchStart] = useState(-1);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredDocs = workspaceDocuments
    .filter((doc) => doc.status === "completed")
    .filter((doc) => doc.filename.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleSend = async () => {
    const trimmed = value.trim();
    if ((!trimmed && !attachedFile) || disabled || streaming) return;

    let finalMessage = trimmed;
    if (attachedFile) {
      // Inject file details and contents to the prompt context
      finalMessage = `[Attached File: ${attachedFile.name}]\nFile Content:\n${attachedFile.content}\n\n---ATTACHMENT_BOUNDARY---\n\n${trimmed}`;
    }

    setValue("");
    setAttachedFile(null);
    textareaRef.current?.focus();

    await onSend(finalMessage);
  };

  const handleSelectDocument = (doc: Document) => {
    if (atMatchStart !== -1 && textareaRef.current) {
      const cursor = textareaRef.current.selectionStart;
      const newValue = value.slice(0, atMatchStart) + value.slice(cursor);
      setValue(newValue);

      const alreadyPinned = pinnedDocuments.some((d) => d.id === doc.id);
      if (!alreadyPinned) {
        onPinDocuments?.([...pinnedDocuments, doc]);
      }

      // Refocus textarea and place cursor where the @ tag was
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(atMatchStart, atMatchStart);
        }
      }, 50);
    }
    setShowSuggestions(false);
    setAtMatchStart(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (showSuggestions && filteredDocs.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % filteredDocs.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + filteredDocs.length) % filteredDocs.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleSelectDocument(filteredDocs[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSuggestions(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setValue(val);

    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const atMatch = textBeforeCursor.match(/@([a-zA-Z0-9_\-\.\/]*)$/);
    if (atMatch) {
      setShowSuggestions(true);
      setSearchQuery(atMatch[1]);
      setAtMatchStart(cursor - atMatch[0].length);
      setActiveIndex(0);
    } else {
      setShowSuggestions(false);
      setAtMatchStart(-1);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      const handler = CHAT_FILE_HANDLERS[ext];
      if (!handler) {
        toast.error(`Unsupported file type: ${ext}. Supported types: ${Object.keys(CHAT_FILE_HANDLERS).join(", ")}`);
        return;
      }
      
      try {
        const content = await handler.read(file);
        setAttachedFile({ name: file.name, content });
        toast.success(`Attached "${file.name}"`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to read file");
      }
      
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const acceptAttribute = Object.values(CHAT_FILE_HANDLERS).map((h) => h.accept).join(",");

  return (
    <div className="relative border-t bg-background px-4 py-3">
      {/* Document Suggestions Popover */}
      {showSuggestions && filteredDocs.length > 0 && (
        <div className="absolute bottom-[calc(100%-8px)] left-4 right-4 z-50 bg-popover text-popover-foreground rounded-lg border border-border shadow-md max-h-[180px] overflow-y-auto p-1 divide-y divide-border/20 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
          {filteredDocs.map((doc, idx) => (
            <button
              key={doc.id}
              onClick={() => handleSelectDocument(doc)}
              className={cn(
                "flex items-center w-full px-3 py-1.5 text-xs text-left rounded gap-2 transition-colors duration-100",
                idx === activeIndex
                  ? "bg-accent text-accent-foreground font-semibold"
                  : "hover:bg-muted/60"
              )}
            >
              {getFileIcon(doc.filename)}
              <span className="truncate flex-1">{doc.filename}</span>
              <span className="text-[10px] text-muted-foreground">{(doc.file_size / 1024).toFixed(0)} KB</span>
            </button>
          ))}
        </div>
      )}

      {/* Pills Container */}
      <div className="flex flex-wrap gap-2 mb-2">
        {/* Pinned Documents Pills */}
        {pinnedDocuments.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs border border-primary/20 animate-in fade-in zoom-in-95 duration-100 font-medium"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3 text-primary" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <span className="opacity-70">Pinned:</span>
            <span className="truncate max-w-[180px] font-semibold">{doc.filename.split("/").pop()}</span>
            <button
              onClick={() => onPinDocuments?.(pinnedDocuments.filter((d) => d.id !== doc.id))}
              className="text-primary/75 hover:text-primary ml-1 p-0.5 rounded hover:bg-primary/20 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}

        {/* File Attachment Pill */}
        {attachedFile && (
          <div className="flex items-center gap-1.5 bg-muted px-2.5 py-1 rounded-full text-xs border border-border animate-in fade-in zoom-in-95 duration-100">
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
              className="text-muted-foreground"
            >
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <span className="font-medium truncate max-w-[150px]">{attachedFile.name}</span>
            <button
              onClick={() => setAttachedFile(null)}
              className="text-muted-foreground hover:text-foreground ml-1 p-0.5 rounded hover:bg-muted/80"
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="flex items-end gap-2">
        {/* Attach File Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-[44px] w-10 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || streaming}
          title="Attach File"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </Button>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept={acceptAttribute}
          onChange={handleFileChange}
        />

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message… (Type @ to pin a document, Enter to send)"
          className="min-h-[44px] max-h-[200px] resize-none flex-1"
          rows={1}
          disabled={disabled || streaming}
        />
        {streaming && onStop ? (
          <Button
            onClick={onStop}
            variant="destructive"
            size="sm"
            className="shrink-0"
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
              className="mr-1"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            </svg>
            Stop
          </Button>
        ) : (
          <Button
            onClick={handleSend}
            disabled={disabled || (!value.trim() && !attachedFile)}
            size="sm"
            className="shrink-0"
          >
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
