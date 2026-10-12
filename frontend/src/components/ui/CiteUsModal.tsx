import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BookOpen, Copy, Check, Download, Quote } from "lucide-react";
import { toast } from "sonner";

interface CiteUsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const APA_CITATION = `Legal Text Workflow Studio Team. (2026). Legal Text Workflow Studio: A Replicable Theory-Guided LLM Workflow for Measuring Legal Delegation and Administrative Discretion [Computer software]. arXiv preprint. https://arxiv.org/abs/2608.xxxx`;

const BIBTEX_CITATION = `@article{legaltextworkflow2026,
  title     = {Legal Text Workflow Studio: A Replicable Theory-Guided LLM Workflow for Measuring Legal Delegation and Administrative Discretion},
  author    = {{Legal Text Workflow Studio Team}},
  journal   = {arXiv preprint arXiv:2608.xxxx},
  year      = {2026},
  url       = {https://arxiv.org/abs/2608.xxxx}
}

@software{legaltextworkflow_software_2026,
  title     = {Legal Text Workflow Studio},
  author    = {{Legal Text Workflow Studio Team}},
  year      = {2026},
  publisher = {Zenodo},
  url       = {https://github.com/hj2713/SIPA_Summer_26_Student_Assistanceship}
}`;

export function CiteUsModal({ open, onOpenChange }: CiteUsModalProps) {
  const [copiedType, setCopiedType] = useState<"apa" | "bibtex" | null>(null);

  const handleCopy = (text: string, type: "apa" | "bibtex") => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    toast.success(`${type.toUpperCase()} citation copied to clipboard!`);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleDownloadBibTeX = () => {
    const blob = new Blob([BIBTEX_CITATION], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "legal_text_workflow_studio.bib";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Downloaded legal_text_workflow_studio.bib file!");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-2xl p-6 glass-panel border-border/60">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-500 border border-violet-500/20">
              <Quote className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">Cite Legal Text Workflow Studio</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Free & open source for academic research in exchange for citation.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* APA Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-500" /> APA 7th Edition Format
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(APA_CITATION, "apa")}
                className="h-7 text-[11px] rounded-lg gap-1.5"
              >
                {copiedType === "apa" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                {copiedType === "apa" ? "Copied" : "Copy APA"}
              </Button>
            </div>
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 text-xs text-foreground/90 leading-relaxed font-sans">
              {APA_CITATION}
            </div>
          </div>

          {/* BibTeX Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Quote className="w-3.5 h-3.5 text-violet-500" /> BibTeX Entry
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadBibTeX}
                  className="h-7 text-[11px] rounded-lg gap-1.5 bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20 border-violet-500/30"
                >
                  <Download className="w-3 h-3" /> Download .bib
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(BIBTEX_CITATION, "bibtex")}
                  className="h-7 text-[11px] rounded-lg gap-1.5"
                >
                  {copiedType === "bibtex" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copiedType === "bibtex" ? "Copied" : "Copy BibTeX"}
                </Button>
              </div>
            </div>
            <pre className="p-3.5 rounded-xl bg-muted/60 border border-border/60 text-[11px] text-muted-foreground font-mono overflow-x-auto whitespace-pre-wrap">
              {BIBTEX_CITATION}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
