import { useState } from "react";

interface SearchResult {
  chunk_id: string;
  document_id: string;
  filename: string;
  content: string;
  similarity: number;
}

interface ToolIndicatorProps {
  status: "running" | "completed";
  results?: SearchResult[];
  filters?: {
    category?: string | null;
    tag?: string | null;
  };
}

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["pdf"].includes(ext)) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-red-400">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM9.5 14.5c0 .55-.45 1-1 1s-1-.45-1-1 .45-1 1-1 1 .45 1 1zm5 0c0 .55-.45 1-1 1s-1-.45-1-1 .45-1 1-1 1 .45 1 1zM12 17c-1.38 0-2.5-.56-2.5-1.25S10.62 14.5 12 14.5s2.5.56 2.5 1.25S13.38 17 12 17z"/>
        <path d="M5 18h2v-1H5v1zm0-2h2v-1H5v1zm4 2h2v-1H9v1zm0-2h2v-1H9v1zm4 2h2v-1h-2v1zm0-2h2v-1h-2v1z"/>
      </svg>
    );
  }
  if (["doc", "docx"].includes(ext)) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-blue-400">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 17v-1h8v1H8zm0-3v-1h8v1H8zm0-3V10h4v1H8z"/>
      </svg>
    );
  }
  if (["txt", "md", "markdown"].includes(ext)) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-emerald-400">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 17v-1h5v1H8zm0-3v-1h8v1H8zm0-3V10h8v1H8z"/>
      </svg>
    );
  }
  if (["csv", "xlsx", "xls"].includes(ext)) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-green-400">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 15h2v2H8v-2zm4 0h2v2h-2v-2zm-4-3h2v2H8v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2zm-4-3h2v2h-2V9zm4 0h2v2h-2V9z"/>
      </svg>
    );
  }
  // Default document icon
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-violet-400">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 17v-1h8v1H8zm0-3v-1h8v1H8zm0-3V10h5v1H8z"/>
    </svg>
  );
}

function getSimilarityColor(score: number): string {
  if (score >= 0.85) return "bg-emerald-500";
  if (score >= 0.70) return "bg-blue-500";
  if (score >= 0.55) return "bg-amber-500";
  return "bg-rose-500";
}

function getSimilarityLabel(score: number): { text: string; className: string } {
  if (score >= 0.85) return { text: "High match", className: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800" };
  if (score >= 0.70) return { text: "Good match", className: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800" };
  if (score >= 0.55) return { text: "Partial", className: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800" };
  return { text: "Weak", className: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800" };
}

function truncateFilename(name: string, maxLen = 38): string {
  if (name.length <= maxLen) return name;
  const ext = name.lastIndexOf(".");
  if (ext > 0) {
    const base = name.slice(0, ext);
    const extension = name.slice(ext);
    return base.slice(0, maxLen - extension.length - 3) + "…" + extension;
  }
  return name.slice(0, maxLen - 1) + "…";
}

export function ToolIndicator({ status, results = [], filters }: ToolIndicatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedChunk, setExpandedChunk] = useState<string | null>(null);

  const filterParts: string[] = [];
  if (filters?.category) filterParts.push(`category: ${filters.category}`);
  if (filters?.tag) filterParts.push(`tag: #${filters.tag}`);
  const filterLabel = filterParts.length > 0 ? ` · Filtered by ${filterParts.join(", ")}` : "";

  const uniqueDocs = Array.from(new Set(results.map((r) => r.filename)));
  const avgScore = results.length > 0
    ? results.reduce((s, r) => s + r.similarity, 0) / results.length
    : 0;

  // ── Running state ──────────────────────────────────────────────
  if (status === "running") {
    return (
      <div
        className="flex items-center gap-3 px-4 py-2.5 my-1.5 text-sm rounded-xl border max-w-xs"
        style={{
          background: "color-mix(in oklch, var(--muted) 30%, transparent)",
          borderColor: "color-mix(in oklch, var(--border) 60%, transparent)",
        }}
      >
        <div className="relative flex-shrink-0">
          <div className="w-5 h-5 rounded-full border-2 border-t-primary border-muted animate-spin" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-foreground text-xs">Searching documents{filterLabel && <span className="font-normal text-muted-foreground">{filterLabel}</span>}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Running semantic + keyword retrieval…</p>
        </div>
      </div>
    );
  }

  // ── Completed — no results ─────────────────────────────────────
  if (results.length === 0) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-2.5 my-1.5 text-sm rounded-xl border max-w-xs"
        style={{
          background: "color-mix(in oklch, var(--muted) 20%, transparent)",
          borderColor: "color-mix(in oklch, var(--border) 50%, transparent)",
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-muted-foreground flex-shrink-0">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
          <path d="M8 11h6M11 8v6" strokeLinecap="round" />
        </svg>
        <div>
          <p className="text-xs font-medium text-foreground">No matching sources found</p>
          <p className="text-[11px] text-muted-foreground">Response based on general knowledge</p>
        </div>
      </div>
    );
  }

  // ── Completed — with results ───────────────────────────────────
  return (
    <div
      className="my-2 rounded-xl border overflow-hidden text-sm"
      style={{
        maxWidth: "520px",
        background: "color-mix(in oklch, var(--card) 80%, transparent)",
        borderColor: "color-mix(in oklch, var(--border) 70%, transparent)",
        boxShadow: "0 1px 4px 0 color-mix(in oklch, var(--foreground) 6%, transparent)",
      }}
    >
      {/* ── Header ── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-3 gap-3 hover:bg-muted/30 transition-colors duration-150 text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Icon */}
          <div
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "color-mix(in oklch, var(--primary) 12%, transparent)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-primary" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>

          {/* Title + meta */}
          <div className="min-w-0">
            <p className="font-semibold text-xs text-foreground leading-tight">
              {uniqueDocs.length} source{uniqueDocs.length !== 1 ? "s" : ""} retrieved
              {filterParts.length > 0 && (
                <span className="font-normal text-muted-foreground">{filterLabel}</span>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              {results.length} chunk{results.length !== 1 ? "s" : ""} · avg {(avgScore * 100).toFixed(0)}% relevance
            </p>
          </div>
        </div>

        {/* Right side: pills + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {uniqueDocs.slice(0, 2).map((doc, i) => (
            <span
              key={i}
              className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium text-muted-foreground border"
              style={{
                background: "color-mix(in oklch, var(--muted) 60%, transparent)",
                borderColor: "color-mix(in oklch, var(--border) 50%, transparent)",
                maxWidth: "100px",
              }}
            >
              {getFileIcon(doc)}
              <span className="truncate">{doc.split("/").pop()?.split(".")[0] ?? doc}</span>
            </span>
          ))}
          {uniqueDocs.length > 2 && (
            <span className="hidden sm:inline text-[10px] text-muted-foreground">+{uniqueDocs.length - 2}</span>
          )}

          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* ── Expandable result list ── */}
      {isOpen && (
        <div
          className="border-t divide-y divide-border/40 overflow-y-auto"
          style={{
            maxHeight: "340px",
            borderColor: "color-mix(in oklch, var(--border) 60%, transparent)",
          }}
        >
          {results.map((res, idx) => {
            const label = getSimilarityLabel(res.similarity);
            const barColor = getSimilarityColor(res.similarity);
            const isExpanded = expandedChunk === (res.chunk_id || String(idx));
            const shortName = truncateFilename(res.filename.split("/").pop() ?? res.filename);
            const chunkKey = res.chunk_id || String(idx);

            return (
              <div
                key={chunkKey}
                className="px-4 py-3 hover:bg-muted/20 transition-colors duration-100"
              >
                {/* File header row */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {getFileIcon(res.filename)}
                    <span
                      className="text-xs font-semibold text-foreground truncate"
                      title={res.filename}
                    >
                      {shortName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${label.className}`}
                    >
                      {label.text}
                    </span>
                    <span className="text-[11px] font-bold tabular-nums text-foreground">
                      {(res.similarity * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* Similarity bar */}
                <div className="h-1 rounded-full bg-muted mb-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${(res.similarity * 100).toFixed(1)}%` }}
                  />
                </div>

                {/* Content preview */}
                <div
                  className="relative"
                  onClick={() => setExpandedChunk(isExpanded ? null : chunkKey)}
                >
                  <p
                    className={`text-[11.5px] leading-relaxed text-muted-foreground rounded-lg px-3 py-2 border cursor-pointer transition-all duration-200 ${
                      isExpanded ? "" : "line-clamp-2"
                    }`}
                    style={{
                      background: "color-mix(in oklch, var(--muted) 30%, transparent)",
                      borderColor: "color-mix(in oklch, var(--border) 40%, transparent)",
                    }}
                  >
                    {res.content}
                  </p>
                  {!isExpanded && res.content.length > 120 && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-6 rounded-b-lg"
                      style={{
                        background: "linear-gradient(to bottom, transparent, color-mix(in oklch, var(--muted) 30%, transparent))",
                        pointerEvents: "none",
                      }}
                    />
                  )}
                </div>

                {/* Expand/collapse toggle */}
                {res.content.length > 120 && (
                  <button
                    onClick={() => setExpandedChunk(isExpanded ? null : chunkKey)}
                    className="mt-1.5 text-[10.5px] text-primary hover:underline font-medium"
                  >
                    {isExpanded ? "Show less" : "Read more"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
