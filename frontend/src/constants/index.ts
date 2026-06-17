/**
 * Global application constants.
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export const DEFAULT_WORKSPACE_ID = "TEST";

export const ALLOWED_EXTENSIONS = ["txt", "md", "html", "pdf", "docx"];

export const CATEGORY_COLORS: Record<string, string> = {
  guide: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  report: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  code: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  legal: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  invoice: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  article: "bg-rose-500/10 text-rose-500 border-rose-500/20",
};

export const DEFAULT_CATEGORY_COLOR = "bg-muted text-muted-foreground border-muted-foreground/10";
