import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { StreamingIndicator } from "./StreamingIndicator";
import { ToolIndicator } from "./ToolIndicator";
import type { Message } from "@/types/message";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";

interface MessageListProps {
  messages: Message[];
  streaming: boolean;
  draftContent: string;
  activeTool: { name: string; status: "running" | "completed"; results?: any[] } | null;
}

export function MessageList({ messages, streaming, draftContent, activeTool }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: streaming ? "auto" : "smooth" });
  }, [messages, draftContent, activeTool, streaming]);

  if (messages.length === 0 && !streaming) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Send a message to start the conversation.
      </div>
    );
  }

  const MarkdownComponents = {
    code(props: any) {
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
  };

  return (
    <ScrollArea className="flex-1 min-h-0 px-4">
      <div className="space-y-4 py-4">
        {messages.map((msg) => (
          <div key={msg.id} className="space-y-1.5">
            {/* Message bubble always first */}
            <MessageBubble message={msg} />

            {/* Sources panel: shown AFTER the assistant message, collapsed by default */}
            {msg.role === "assistant" && msg.toolCall && (
              <div className="flex w-full justify-start pl-2">
                <ToolIndicator
                  status={msg.toolCall.status}
                  results={msg.toolCall.results}
                  filters={msg.toolCall.filters}
                />
              </div>
            )}
          </div>
        ))}

        {/* Live tool indicator shown while still streaming */}
        {streaming && activeTool && (
          <div className="space-y-1.5">
            {/* Show running/completed tool during active streaming */}
            <div className="flex w-full justify-start pl-2">
              <ToolIndicator status={activeTool.status} results={activeTool.results} />
            </div>

            {/* In-flight streaming draft shows after the tool indicator */}
            {draftContent && (
              <div className="flex w-full justify-start">
                <div className="w-full text-sm text-foreground">
                  <div className="prose prose-sm dark:prose-invert max-w-none w-full">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                      {draftContent}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Streaming draft when no tool is running (direct response) */}
        {streaming && !activeTool && draftContent && (
          <div className="flex w-full justify-start">
            <div className="w-full text-sm text-foreground">
              <div className="prose prose-sm dark:prose-invert max-w-none w-full">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                  {draftContent}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Typing dots when waiting for first token */}
        {streaming && !draftContent && !activeTool && <StreamingIndicator />}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
