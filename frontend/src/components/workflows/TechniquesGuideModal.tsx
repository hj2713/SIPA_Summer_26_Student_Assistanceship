import { useState } from "react";
import {
  Layers,
  Sparkles,
  GitBranch,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Scale,
  Sliders,
  Check,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TechniquesGuideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStep?: 1 | 2 | 3;
  onInspectGraph?: () => void;
}

export function TechniquesGuideModal({
  open,
  onOpenChange,
  initialStep = 1,
  onInspectGraph,
}: TechniquesGuideModalProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(initialStep);

  // Sync initialStep when modal opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setCurrentStep(initialStep);
    }
    onOpenChange(isOpen);
  };

  const techniques = [
    {
      step: 1 as const,
      id: "cascade",
      title: "Cascade Screen",
      subtitle: "Sequential Threshold Elimination",
      icon: Layers,
      color: "text-violet-600 dark:text-violet-400",
      bgColor: "bg-violet-500/10",
      borderColor: "border-violet-500/30",
      accentBg: "bg-violet-600 text-white",
      outputField: "cascade_discretion_rank (1–5)",
      philosophy:
        "Rather than guessing a 1–5 number in a single prompt, Cascade evaluates discretion hierarchically through sequential drop-out gates, mirroring how legal researchers apply doctrine.",
      dagFlow: [
        {
          node: "Stage 2 Minimal Screen",
          desc: "Tests if the statute exceeds Rank 1 (No/Minimal Discretion). If it fails, execution drops out and locks Rank 1.",
        },
        {
          node: "Stage 3 Bounded Screen",
          desc: "Tests if the statute exceeds Rank 2 (Constrained Discretion). If it fails, execution drops out and locks Rank 2.",
        },
        {
          node: "Stage 4 Substantial Screen",
          desc: "Evaluates whether statutory authority reaches Rank 3 (Moderate) or advances to Rank 4/5 (Broad/Plenary).",
        },
        {
          node: "Boundary Calibration",
          desc: "Dedicated review node tests borderline conditions against formal rubric definitions before finalizing.",
        },
      ],
      strengthTitle: "Why Use Cascade?",
      strengthDesc:
        "Eliminates the tendency of LLMs to assign inflated middle-of-the-road scores (e.g. defaulting to 3). If a statute fails a lower threshold, it cannot artificially jump to higher ranks.",
      bestFor: "Conservative, highly verifiable statutory constraint auditing.",
    },
    {
      step: 2 as const,
      id: "m9",
      title: "M9 Multiclass",
      subtitle: "Full-Spectrum Direct Classification & Boundary Review",
      icon: Sparkles,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/30",
      accentBg: "bg-amber-600 text-white",
      outputField: "m9_discretion_rank (1–5)",
      philosophy:
        "Evaluates the statute as an integrated whole, weighting affirmative regulatory powers against procedural constraints across the complete 1–5 spectrum simultaneously.",
      dagFlow: [
        {
          node: "M9 Rank Discipline Prep",
          desc: "Synthesizes statutory evidence, isolating explicit regulatory delegations from procedural handcuffs.",
        },
        {
          node: "Full-Spectrum Multiclass Ranker",
          desc: "Prompts the LLM with all 5 discrete rubric rank definitions and reference anchor statutes simultaneously.",
        },
        {
          node: "M9 Boundary Review",
          desc: "LLMs frequently hesitate on borderline cases (e.g., Rank 2 vs 3). This node specifically audits edge-case boundaries.",
        },
        {
          node: "Recalibration Final",
          desc: "Resolves any ambiguity between the multiclass provisional rank and boundary audit evidence.",
        },
      ],
      strengthTitle: "Why Use M9 Multiclass?",
      strengthDesc:
        "Maintains global context across complex, multi-title statutes where broad rulemaking in one section is balanced by strict judicial review in another.",
      bestFor: "Comprehensive statutory acts with mixed and cross-cutting authority provisions.",
    },
    {
      step: 3 as const,
      id: "b3",
      title: "B3 Binary Split",
      subtitle: "Hierarchical Coarse Banding & Split Decision Tree",
      icon: GitBranch,
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/30",
      accentBg: "bg-emerald-600 text-white",
      outputField: "b3_discretion_rank (1–5)",
      philosophy:
        "Partitions the problem at administrative law's most critical juncture: the divide between Rule-Bound Administration (Ranks 1–2) and Agency-Discretion Administration (Ranks 3–5).",
      dagFlow: [
        {
          node: "Coarse Band Screen",
          desc: "Determines whether the statute belongs to the Bounded Band [1, 2] or the Agency Discretion Band [3, 4, 5].",
        },
        {
          node: "Conditional Band Router",
          desc: "Routes the statute into specialized low-band or high-band decision paths, eliminating irrelevant rank distractors.",
        },
        {
          node: "Specialized Band Classifier",
          desc: "Low-band path tests Rank 1 vs 2; High-band path tests Rank 3 vs 4 vs 5 using targeted sub-rubrics.",
        },
        {
          node: "B3 Boundary Review & Finalizer",
          desc: "Validates that the coarse band boundary was respected and emits the calibrated rank.",
        },
      ],
      strengthTitle: "Why Use B3 Binary Split?",
      strengthDesc:
        "Reduces cognitive load on the LLM by transforming a 5-class puzzle into two sequential, high-accuracy binary and ternary decisions.",
      bestFor: "Sharp resolution between ministerial compliance and substantive administrative discretion.",
    },
  ];

  const currentTechnique = techniques[currentStep - 1];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl rounded-2xl border-border bg-card text-foreground p-0 overflow-hidden shadow-xl">
        
        {/* Header */}
        <div className="p-6 border-b border-border bg-muted/20">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider">
                Methodology Deep-Dive
              </span>
              <span className="text-[11px] text-muted-foreground font-medium">
                Step {currentStep} of 3
              </span>
            </div>
            <DialogTitle className="text-lg font-bold text-foreground mt-1">
              Standard Delegation Suite: The 3 Evaluation Techniques
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed mt-1">
              The benchmark executes three distinct evaluation architectures in parallel to calculate consensus and prevent single-prompt bias.
            </DialogDescription>
          </DialogHeader>

          {/* 3 Steps Stepper Bar */}
          <div className="grid grid-cols-3 gap-2.5 mt-5">
            {techniques.map((tech) => {
              const isActive = currentStep === tech.step;
              const isPast = currentStep > tech.step;
              return (
                <button
                  key={tech.step}
                  type="button"
                  onClick={() => setCurrentStep(tech.step)}
                  className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                    isActive
                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                      : isPast
                      ? "border-border bg-background/80 hover:bg-muted/40"
                      : "border-border bg-background/50 hover:bg-muted/30 opacity-70"
                  }`}
                >
                  <div
                    className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold transition-all ${
                      isActive
                        ? tech.accentBg
                        : isPast
                        ? "bg-muted text-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isPast ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : tech.step}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block tracking-wider">
                      Technique {tech.step}
                    </span>
                    <span className="text-xs font-bold text-foreground truncate block">
                      {tech.title}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Body: Active Technique Details */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Technique Hero Title */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`h-11 w-11 rounded-xl ${currentTechnique.bgColor} ${currentTechnique.color} border ${currentTechnique.borderColor} flex items-center justify-center shrink-0`}
              >
                <currentTechnique.icon size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">
                    Technique {currentTechnique.step}: {currentTechnique.title}
                  </h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${currentTechnique.bgColor} ${currentTechnique.color} ${currentTechnique.borderColor}`}>
                    {currentTechnique.subtitle}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Output Variable: <code className="font-mono text-foreground font-semibold">{currentTechnique.outputField}</code>
                </p>
              </div>
            </div>
          </div>

          {/* Core Philosophy */}
          <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 text-xs leading-relaxed space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Scale className="h-3.5 w-3.5 text-primary" /> Core Theoretical Premise
            </span>
            <p className="text-foreground">{currentTechnique.philosophy}</p>
          </div>

          {/* DAG Execution Steps */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-primary" /> Execution Flow in the Directed Graph
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {currentTechnique.dagFlow.map((flow, idx) => (
                <div
                  key={flow.node}
                  className="p-3 rounded-xl border border-border bg-card shadow-2xs space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-foreground truncate">{flow.node}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed pl-6">
                    {flow.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Advantage & Best-For Callout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-1">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {currentTechnique.strengthTitle}
              </span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {currentTechnique.strengthDesc}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-border/80 bg-muted/30 space-y-1">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Optimal Research Use
              </span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {currentTechnique.bestFor}
              </p>
            </div>
          </div>

          {/* Parallel Triangulation Note */}
          <div className="p-3 rounded-xl border border-border/60 bg-background text-[11px] text-muted-foreground flex items-center gap-2.5">
            <Zap className="h-4 w-4 text-accent shrink-0" />
            <span>
              <strong>Cross-Technique Triangulation:</strong> When all 3 techniques produce identical ranks, empirical confidence increases to 99%, confirming the score is not an artifact of prompt framing.
            </span>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {currentStep > 1 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep((currentStep - 1) as 1 | 2 | 3)}
                className="text-xs h-8 gap-1 rounded-xl"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Previous Technique</span>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs h-8 text-muted-foreground"
              >
                Close
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onInspectGraph && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onInspectGraph();
                }}
                className="text-xs h-8 gap-1.5 rounded-xl border-border"
              >
                <Sliders className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Inspect in Graph</span>
              </Button>
            )}

            {currentStep < 3 ? (
              <Button
                size="sm"
                onClick={() => setCurrentStep((currentStep + 1) as 1 | 2 | 3)}
                className="text-xs h-8 gap-1 rounded-xl bg-primary text-primary-foreground font-semibold"
              >
                <span>Next Technique</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs h-8 gap-1 rounded-xl bg-primary text-primary-foreground font-semibold"
              >
                <span>Done</span>
                <Check className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
