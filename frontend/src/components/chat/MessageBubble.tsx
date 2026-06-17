import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Message } from "@/types/message";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: Message;
}

interface ParsedMessage {
  fileName?: string;
  pinnedNames?: string;
  userQuery: string;
}

function parseUserMessage(content: string): ParsedMessage {
  let pinnedNames: string | undefined;
  let fileName: string | undefined;
  let userQuery = content;

  // 1. Extract Pinned files if present
  if (userQuery.includes("---PINNED_BOUNDARY---")) {
    const parts = userQuery.split("---PINNED_BOUNDARY---\n\n");
    const pinnedPart = parts[0];
    userQuery = parts[1] || "";
    
    const match = pinnedPart.match(/^\[Pinned Files: ([^\]]+)\]/);
    if (match) {
      pinnedNames = match[1];
    }
  }

  // 2. Extract Attached files if present
  if (userQuery.includes("---ATTACHMENT_BOUNDARY---")) {
    const parts = userQuery.split("---ATTACHMENT_BOUNDARY---\n\n");
    const attachmentPart = parts[0];
    userQuery = parts[1] || "";
    
    const match = attachmentPart.match(/^\[Attached File: ([^\]]+)\]/);
    if (match) {
      fileName = match[1];
    }
  } else {
    const attachmentHeader = "[Attached File: ";
    if (userQuery.startsWith(attachmentHeader)) {
      const endHeaderIndex = userQuery.indexOf("]\nFile Content:\n");
      if (endHeaderIndex !== -1) {
        fileName = userQuery.slice(attachmentHeader.length, endHeaderIndex);
        const rest = userQuery.slice(endHeaderIndex + "]\nFile Content:\n".length);
        
        const lastDoubleNewline = rest.lastIndexOf("\n\n");
        if (lastDoubleNewline !== -1) {
          userQuery = rest.slice(lastDoubleNewline + 2);
        } else {
          userQuery = "";
        }
      }
    }
  }

  return { pinnedNames, fileName, userQuery };
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Parse user message for attachments/pinnings
  const { fileName, pinnedNames, userQuery } = isUser 
    ? parseUserMessage(message.content) 
    : { fileName: undefined, pinnedNames: undefined, userQuery: message.content };

  const lineCount = userQuery.split("\n").length;
  const isLong = lineCount > 5 || userQuery.length > 300;

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "text-sm flex flex-col",
          isUser
            ? "max-w-[80%] rounded-2xl px-4 py-2 bg-primary text-primary-foreground"
            : "w-full text-foreground"
        )}
      >
        {isUser && pinnedNames && (
          <div className="flex items-center gap-1.5 bg-primary-foreground/15 text-primary-foreground/90 px-2.5 py-1 rounded-lg text-xs border border-primary-foreground/10 mb-2 w-fit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3 text-primary-foreground opacity-80" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <span className="font-semibold truncate">Pinned: {pinnedNames}</span>
          </div>
        )}

        {isUser && fileName && (
          <div className="flex items-center gap-1.5 bg-primary-foreground/15 text-primary-foreground/90 px-2.5 py-1 rounded-lg text-xs border border-primary-foreground/10 mb-2 w-fit">
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
              className="opacity-80 shrink-0"
            >
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <span className="font-semibold truncate">Attached: {fileName}</span>
          </div>
        )}

        {isUser ? (
          <div className="flex flex-col">
            <div
              className={cn(
                "whitespace-pre-wrap transition-all duration-200",
                isLong && isCollapsed ? "line-clamp-5 overflow-hidden" : ""
              )}
            >
              {userQuery}
            </div>
            {isLong && (
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="mt-2 text-xs font-semibold underline opacity-85 hover:opacity-100 self-start cursor-pointer focus:outline-none"
              >
                {isCollapsed ? "Read more" : "Show less"}
              </button>
            )}
          </div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none w-full">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code(props) {
                  const { children, className, node, ref, ...rest } = props;
                  const match = /language-(\w+)/.exec(className || "");
                  return match ? (
                    <SyntaxHighlighter
                      {...rest}
                      PreTag="div"
                      children={String(children).replace(/\n$/, "")}
                      language={match[1]}
                      style={vscDarkPlus}
                      className="rounded-md"
                    />
                  ) : (
                    <code
                      {...rest}
                      className={cn(
                        "bg-muted px-1.5 py-0.5 rounded border border-border text-foreground font-mono text-[13px] before:content-none after:content-none font-semibold",
                        className
                      )}
                    >
                      {children}
                    </code>
                  );
                },
              }}
            >
              {userQuery}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
