import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Copy,
  Check,
  Download,
  Quote,
  Laptop,
  ExternalLink,
  Info,
} from "lucide-react";
import { toast } from "sonner";

interface CiteUsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CitationTarget = "software" | "book";
type CitationFormat = "bibtex" | "apa" | "chicago";

interface CitationData {
  title: string;
  subtitle: string;
  bibtex: string;
  apa: string;
  chicago: string;
  bibFilename: string;
  linkText: string;
  linkUrl: string;
}

const CITATIONS: Record<CitationTarget, CitationData> = {
  software: {
    title: "Law Delegation Platform (Software & Multi-Model Workflows)",
    subtitle: "Columbia SIPA Empirical Legislative Coding Workbench",
    bibFilename: "law_delegation_platform.bib",
    linkText: "GitHub Repository & Release",
    linkUrl: "https://github.com/hj2713/SIPA_Summer_26_Student_Assistanceship",
    apa: `Jhawar, H., & O'Halloran, S. (2026). Law Delegation Platform: Theory-Guided LLM Workflow Studio for Measuring Legislative Delegation and Discretion [Computer software]. Columbia University SIPA. https://github.com/hj2713/SIPA_Summer_26_Student_Assistanceship`,
    chicago: `Jhawar, Himanshu, and Sharyn O'Halloran. "Law Delegation Platform: Theory-Guided LLM Workflow Studio for Measuring Legislative Delegation and Discretion." Computer software. Columbia University SIPA, 2026. https://github.com/hj2713/SIPA_Summer_26_Student_Assistanceship.`,
    bibtex: `@software{jhawar_ohalloran_2026_lawdelegation,
  author    = {Jhawar, Himanshu and O'Halloran, Sharyn},
  title     = {Law Delegation Platform: Theory-Guided LLM Workflow Studio for Measuring Legislative Delegation and Discretion},
  year      = {2026},
  publisher = {Columbia University SIPA},
  url       = {https://github.com/hj2713/SIPA_Summer_26_Student_Assistanceship}
}`,
  },
  book: {
    title: "Foundational Methodology (Epstein & O'Halloran, 1999)",
    subtitle: "Delegating Powers: A Law and Economics Approach to Politics, Regulation, and the Economy",
    bibFilename: "epstein_ohalloran_1999_delegating_powers.bib",
    linkText: "Cambridge University Press (DOI)",
    linkUrl: "https://doi.org/10.1017/CBO9780511609312",
    apa: `Epstein, D., & O'Halloran, S. (1999). Delegating Powers: A Law and Economics Approach to Politics, Regulation, and the Economy. Cambridge University Press. https://doi.org/10.1017/CBO9780511609312`,
    chicago: `Epstein, David, and Sharyn O'Halloran. Delegating Powers: A Law and Economics Approach to Politics, Regulation, and the Economy. Political Economy of Institutions and Decisions. Cambridge: Cambridge University Press, 1999. https://doi.org/10.1017/CBO9780511609312.`,
    bibtex: `@book{epstein1999delegating,
  author    = {Epstein, David and O'Halloran, Sharyn},
  title     = {Delegating Powers: A Law and Economics Approach to Politics, Regulation, and the Economy},
  series    = {Political Economy of Institutions and Decisions},
  publisher = {Cambridge University Press},
  year      = {1999},
  doi       = {10.1017/CBO9780511609312}
}`,
  },
};

export function CiteUsModal({ open, onOpenChange }: CiteUsModalProps) {
  const [target, setTarget] = useState<CitationTarget>("software");
  const [format, setFormat] = useState<CitationFormat>("bibtex");
  const [copied, setCopied] = useState(false);

  const currentData = CITATIONS[target];
  const activeText = currentData[format];

  const handleCopy = () => {
    navigator.clipboard.writeText(activeText);
    setCopied(true);
    toast.success(`${format.toUpperCase()} citation copied to clipboard!`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadBibTeX = () => {
    const blob = new Blob([currentData.bibtex], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = currentData.bibFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${currentData.bibFilename}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-xl md:max-w-2xl rounded-2xl p-6 bg-card border-border shadow-xl overflow-hidden">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-accent-plum/10 text-accent-plum border border-accent-plum/20 shadow-xs">
              <Quote className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                Cite Academic Research & Tools
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Free & open source for scientific inquiry in exchange for attribution.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Target Selection: Software vs Foundational Methodology */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/50 border border-border w-full">
            <button
              type="button"
              onClick={() => {
                setTarget("software");
                setCopied(false);
              }}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all min-w-0 ${
                target === "software"
                  ? "bg-card text-foreground shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Laptop className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="truncate">1. Software Platform (2026)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTarget("book");
                setCopied(false);
              }}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all min-w-0 ${
                target === "book"
                  ? "bg-card text-foreground shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-accent-plum shrink-0" />
              <span className="truncate">2. Theory Book (1999)</span>
            </button>
          </div>

          {/* Active Citation Card Title & Source Link */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-1">
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-foreground truncate">{currentData.title}</h3>
              <p className="text-[11px] text-muted-foreground truncate">{currentData.subtitle}</p>
            </div>
            <a
              href={currentData.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium shrink-0"
            >
              <span>{currentData.linkText}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Format Selector Pills & Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-1.5 shrink-0">
              {(["bibtex", "apa", "chicago"] as CitationFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => {
                    setFormat(fmt);
                    setCopied(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                    format === fmt
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {fmt === "bibtex" ? "BibTeX" : fmt === "apa" ? "APA 7th" : "Chicago"}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {format === "bibtex" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadBibTeX}
                  className="h-7 text-xs rounded-lg gap-1.5 border-border bg-card hover:bg-muted text-foreground"
                >
                  <Download className="w-3 h-3 text-primary" />
                  <span>Download .bib</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="h-7 text-xs rounded-lg gap-1.5 border-border bg-card hover:bg-muted text-foreground font-medium"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-primary" />}
                <span>{copied ? "Copied!" : `Copy ${format.toUpperCase()}`}</span>
              </Button>
            </div>
          </div>

          {/* Display Preview Box */}
          <div className="relative rounded-xl border border-border bg-background p-4 shadow-2xs min-w-0 w-full overflow-hidden">
            {format === "bibtex" ? (
              <pre className="text-xs font-mono text-foreground/90 leading-relaxed overflow-x-auto whitespace-pre-wrap [overflow-wrap:anywhere] select-all min-w-0 w-full">
                {activeText}
              </pre>
            ) : (
              <p className="text-xs font-sans text-foreground/90 leading-relaxed select-all break-words min-w-0 w-full">
                {activeText}
              </p>
            )}
          </div>

          {/* Academic Indexing Note */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/15 text-[11px] text-muted-foreground leading-relaxed">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground">How Citations Are Counted: </span>
              When researchers cite these entries in published papers, preprints (arXiv/SSRN), or conference proceedings,
              indexing algorithms at <span className="font-medium text-foreground">Google Scholar</span>,{" "}
              <span className="font-medium text-foreground">Semantic Scholar</span>, and{" "}
              <span className="font-medium text-foreground">Crossref</span> parse the authors&apos; names and automatically
              attribute citations to Himanshu Jhawar and the research project.
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
