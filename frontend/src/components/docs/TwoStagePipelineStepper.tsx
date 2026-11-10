import { useState } from "react";
import {
  FileText,
  Binary,
  GitBranch,
  Sliders,
  CheckCircle2,
  ArrowRight,
  Zap,
  Scale,
  CornerDownRight,
  Building2,
  Coins,
  Check,
} from "lucide-react";

export function TwoStagePipelineStepper() {
  const [selectedNode, setSelectedNode] = useState<"input" | "stage1" | "gate" | "stage2" | "output">("stage1");
  const [simulationLaw, setSimulationLaw] = useState<"delegating" | "non_delegating">("delegating");

  const isDelegating = simulationLaw === "delegating";

  return (
    <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
      {/* 1. Header Bar */}
      <div className="border-b border-border bg-muted/30 px-5 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-sm font-bold text-foreground">Interactive 2-Stage Verification Pipeline</h3>
              <span className="px-2 py-0.5 rounded-md border border-border bg-muted/80 text-[10px] uppercase font-bold text-muted-foreground">
                Frozen DAG Simulator
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Test how the frozen Directed Acyclic Graph (DAG) routes public laws and eliminates hallucinations through deterministic short-circuiting.
            </p>
          </div>
        </div>

        {/* 2. Interactive Law Selector (2 Clear Side-by-Side Cards) */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Card A: Delegating Statute */}
          <button
            type="button"
            onClick={() => {
              setSimulationLaw("delegating");
              if (selectedNode === "gate") setSelectedNode("stage2");
            }}
            className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
              isDelegating
                ? "border-primary bg-primary/5 shadow-xs ring-2 ring-primary/30"
                : "border-border bg-background/60 hover:border-border/80 hover:bg-muted/40 opacity-70"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${isDelegating ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">Clean Air Act § 111</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                      Delegating Law
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Substantive regulatory mandate: Grants EPA Administrator rulemaking authority.
                  </p>
                </div>
              </div>
              {isDelegating && (
                <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                  <Check className="h-3 w-3 stroke-[3]" />
                </span>
              )}
            </div>
            <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground font-mono">Route: Full 2-Stage Audit</span>
              <span className="font-semibold text-primary">~1,420 Tokens (2 Passes)</span>
            </div>
          </button>

          {/* Card B: Non-Delegating Statute */}
          <button
            type="button"
            onClick={() => {
              setSimulationLaw("non_delegating");
              if (selectedNode === "stage2") setSelectedNode("gate");
            }}
            className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
              !isDelegating
                ? "border-amber-500 bg-amber-500/5 shadow-xs ring-2 ring-amber-500/30"
                : "border-border bg-background/60 hover:border-border/80 hover:bg-muted/40 opacity-70"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${!isDelegating ? "bg-amber-600 text-white" : "bg-muted text-muted-foreground"}`}>
                  <Coins className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">Commemorative Coin Act (PL 100-24)</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                      Non-Delegating Law
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Ceremonial resolution: Direct command to mint coins, zero agency discretion.
                  </p>
                </div>
              </div>
              {!isDelegating && (
                <span className="h-5 w-5 rounded-full bg-amber-600 text-white flex items-center justify-center shrink-0">
                  <Check className="h-3 w-3 stroke-[3]" />
                </span>
              )}
            </div>
            <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground font-mono">Route: ⚡ Short-Circuit Gate</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">~410 Tokens (68% Saved)</span>
            </div>
          </button>
        </div>
      </div>

      {/* 3. Live "What Just Happened?" Explanation Banner */}
      <div className="px-5 py-3.5 border-b border-border bg-background">
        <div
          className={`p-3.5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs transition-all ${
            isDelegating
              ? "bg-emerald-500/10 border-emerald-500/30 text-foreground"
              : "bg-amber-500/10 border-amber-500/30 text-foreground"
          }`}
        >
          <div className="flex items-start gap-2.5">
            {isDelegating ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-foreground">
                  {isDelegating
                    ? "Full 2-Stage DAG Path Active: Delegating Statute Detected"
                    : "⚡ Short-Circuit Triggered: Stage 2 Bypassed (68% Tokens Saved)"}
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                    isDelegating
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                      : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {isDelegating ? "2 LLM Passes" : "1 LLM Pass Only"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {isDelegating
                  ? "Stage 1 identified regulatory authority (delegate_law = 1). The Gate confirmed delegation and routed the text to Stage 2, which evaluated procedural constraints and assigned Rank 4 (Broad Discretion)."
                  : "Stage 1 found no administrative delegation (delegate_law = 0). The Gate immediately set discretion_rank = 0 without calling Stage 2, preventing hallucinated scores on ceremonial legislation."}
              </p>
            </div>
          </div>
          <div className="shrink-0 font-mono text-[11px] self-end md:self-center px-2.5 py-1 rounded bg-background/80 border border-border">
            {isDelegating ? "Tokens: ~1,420 (Complete Audit)" : "Tokens: ~410 (Saved 1,010 Tokens)"}
          </div>
        </div>
      </div>

      {/* 4. Visual Pipeline Flowchart Cards (Spacious, Zero Overlap, Visual Flow) */}
      <div className="p-5 sm:p-6 bg-gradient-to-b from-muted/20 via-background to-background">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Pipeline Directed Flow (Click any stage to inspect)
          </span>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Active Selection: <strong className="text-foreground capitalize">{selectedNode}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-stretch relative">
          
          {/* Card 0: Input Corpus */}
          <div
            onClick={() => setSelectedNode("input")}
            className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
              selectedNode === "input"
                ? "border-primary bg-primary/5 shadow-xs ring-2 ring-primary/40"
                : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Step 0</span>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <h4 className="text-xs font-bold text-foreground">Statute Corpus</h4>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Raw statutory text normalized from public laws or bills.
              </p>
            </div>
            
            {/* Stacked footer prevents any horizontal overlap */}
            <div className="pt-2.5 border-t border-border/50 mt-3 space-y-1">
              <div className="text-[10px] text-muted-foreground font-mono">input_text</div>
              <div className="w-full text-center py-1 px-2 rounded-md bg-muted text-[10px] font-bold font-mono text-foreground border border-border/60">
                100% Verbatim Text
              </div>
            </div>
          </div>

          {/* Card 1: Stage 1 Delegation Screening */}
          <div
            onClick={() => setSelectedNode("stage1")}
            className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
              selectedNode === "stage1"
                ? "border-primary bg-primary/5 shadow-xs ring-2 ring-primary/40"
                : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Stage 1</span>
                <Binary className="h-4 w-4 text-primary" />
              </div>
              <h4 className="text-xs font-bold text-foreground">Delegation Screen</h4>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Binary detection: Does statute delegate regulatory power?
              </p>
            </div>

            {/* Stacked footer */}
            <div className="pt-2.5 border-t border-border/50 mt-3 space-y-1">
              <div className="text-[10px] text-muted-foreground font-mono">delegate_law</div>
              <div
                className={`w-full text-center py-1 px-2 rounded-md text-[10px] font-bold font-mono border ${
                  isDelegating
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
                }`}
              >
                {isDelegating ? "= 1 (Delegated)" : "= 0 (None)"}
              </div>
            </div>
          </div>

          {/* Card 2: Deterministic Short-Circuit Gate */}
          <div
            onClick={() => setSelectedNode("gate")}
            className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
              selectedNode === "gate"
                ? "border-accent bg-accent/10 shadow-xs ring-2 ring-accent/40"
                : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent-foreground">Gate</span>
                <GitBranch className="h-4 w-4 text-accent-foreground" />
              </div>
              <h4 className="text-xs font-bold text-foreground">Conditional Split</h4>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Branch rule: If 1 &rarr; Stage 2; If 0 &rarr; short-circuit.
              </p>
            </div>

            {/* Stacked footer */}
            <div className="pt-2.5 border-t border-border/50 mt-3 space-y-1">
              <div className="text-[10px] text-muted-foreground font-medium">Branch Decision</div>
              <div
                className={`w-full text-center py-1 px-2 rounded-md text-[10px] font-bold border ${
                  isDelegating
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
                }`}
              >
                {isDelegating ? "Proceeds ➔ Stage 2" : "⚡ Short-Circuit Triggered"}
              </div>
            </div>
          </div>

          {/* Card 3: Stage 2 Discretion Classification */}
          <div
            onClick={() => {
              if (isDelegating) setSelectedNode("stage2");
            }}
            className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between relative ${
              !isDelegating
                ? "opacity-60 border-dashed border-amber-500/40 bg-amber-500/5 cursor-not-allowed"
                : selectedNode === "stage2"
                ? "border-primary bg-primary/5 shadow-xs ring-2 ring-primary/40 cursor-pointer"
                : "border-border bg-card hover:border-border/80 hover:bg-muted/30 cursor-pointer"
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Stage 2</span>
                <Sliders className="h-4 w-4 text-primary" />
              </div>
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-bold text-foreground">Discretion Rank</h4>
                {!isDelegating && (
                  <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    Skipped
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {isDelegating
                  ? "Scale 1–5: Evaluate procedural constraints vs administrative leeway."
                  : "Bypassed by Gate. No LLM invoked (saved 100% of Stage 2 cost)."}
              </p>
            </div>

            {/* Stacked footer */}
            <div className="pt-2.5 border-t border-border/50 mt-3 space-y-1">
              <div className="text-[10px] text-muted-foreground font-mono">discretion_rank</div>
              <div
                className={`w-full text-center py-1 px-2 rounded-md text-[10px] font-bold font-mono border ${
                  isDelegating
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-muted text-muted-foreground border-border/60"
                }`}
              >
                {isDelegating ? "Score: 4 / 5 (Broad)" : "= 0 (Auto-Locked)"}
              </div>
            </div>
          </div>

          {/* Card 4: Final Consensus & Citations */}
          <div
            onClick={() => setSelectedNode("output")}
            className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
              selectedNode === "output"
                ? "border-emerald-500 bg-emerald-500/5 shadow-xs ring-2 ring-emerald-500/40"
                : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Final Output
                </span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h4 className="text-xs font-bold text-foreground">Consensus Matrix</h4>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Verifiable citations + cross-model agreement metrics.
              </p>
            </div>

            {/* Stacked footer */}
            <div className="pt-2.5 border-t border-border/50 mt-3 space-y-1">
              <div className="text-[10px] text-muted-foreground font-medium">Inter-Model Agreement</div>
              <div className="w-full text-center py-1 px-2 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold font-mono border border-emerald-500/30">
                κ = 0.94 (Near-Perfect)
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 5. Deep-Dive Step Inspector */}
      <div className="border-t border-border bg-card p-5 sm:p-6 space-y-4">
        
        {/* Step Selector Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs border-b border-border/60">
          <span className="text-[11px] font-bold text-muted-foreground mr-2 shrink-0">Stage Detail:</span>
          {[
            { id: "input" as const, label: "Step 0: Statute Text" },
            { id: "stage1" as const, label: "Stage 1: Binary Screen" },
            { id: "gate" as const, label: "Gate: Branch Logic" },
            { id: "stage2" as const, label: isDelegating ? "Stage 2: Discretion Rank" : "Stage 2: (Skipped)" },
            { id: "output" as const, label: "Output: JSON Trace" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              disabled={tab.id === "stage2" && !isDelegating}
              onClick={() => setSelectedNode(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all shrink-0 ${
                selectedNode === tab.id
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : tab.id === "stage2" && !isDelegating
                  ? "opacity-40 cursor-not-allowed text-muted-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 0: Input Statute */}
        {selectedNode === "input" && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-bold text-foreground">Step 0: Statutory Corpus Ingestion & Normalization</h4>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-border bg-muted">
                Variable: input_text
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Legislative provisions enter as plain text or OCR-processed PDF documents. The platform normalizes section numbering, statutory definitions, cross-references, and structural hierarchies.
            </p>
            <div className="p-3.5 rounded-lg bg-muted/40 border border-border/60 font-mono text-[11px] text-foreground leading-relaxed">
              <div className="text-[10px] text-muted-foreground font-sans font-semibold mb-1">
                Active Simulation Excerpt ({isDelegating ? "Clean Air Act" : "Commemorative Act"}):
              </div>
              {isDelegating
                ? `"Clean Air Act § 111(b)(1)(B): The Administrator shall establish standards of performance for new sources within such category. The Administrator shall, at least every 8 years, review and, if appropriate, revise such standards..."`
                : `"100th Congress Public Law 100-24: Be it enacted by the Senate and House of Representatives of the United States of America in Congress assembled, That a commemorative medal be struck honoring the United States Constitution bicentennial..."`}
            </div>
          </div>
        )}

        {/* Tab 1: Stage 1 Delegation Screening */}
        {selectedNode === "stage1" && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Binary className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-bold text-foreground">Stage 1: Binary Delegation Screening</h4>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                Output: delegate_law ({isDelegating ? "1" : "0"})
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This node answers the fundamental theoretical question: <em>"Does Congress assign regulatory, administrative, or enforcement authority to an executive agency or official?"</em>
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className={`p-3 rounded-lg border text-xs space-y-1.5 ${isDelegating ? "bg-emerald-500/5 border-emerald-500/30" : "bg-muted/30 border-border/60"}`}>
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> What Qualifies as Delegation (1)
                </span>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Rulemaking powers, license issuance, permit denials, administrative hearings, setting standards, and civil enforcement powers.
                </p>
                {isDelegating && (
                  <div className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold pt-1 border-t border-emerald-500/20">
                    &rarr; Detected: "The Administrator shall establish standards of performance"
                  </div>
                )}
              </div>

              <div className={`p-3 rounded-lg border text-xs space-y-1.5 ${!isDelegating ? "bg-amber-500/5 border-amber-500/30" : "bg-muted/30 border-border/60"}`}>
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Scale className="h-4 w-4 text-amber-500" /> What Does Not Qualify (0)
                </span>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Pure appropriations, ceremonial declarations, commemorative coins, direct Congressional mandates with judicial-only enforcement.
                </p>
                {!isDelegating && (
                  <div className="text-[10px] font-mono text-amber-700 dark:text-amber-400 font-semibold pt-1 border-t border-amber-500/20">
                    &rarr; Detected: Pure ceremonial resolution. Zero agency rulemaking authority.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Gate Branching */}
        {selectedNode === "gate" && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-accent-foreground" />
                <h4 className="text-sm font-bold text-foreground">Deterministic Routing Gate & Short-Circuit</h4>
              </div>
              <span className="text-[10px] uppercase font-bold text-accent-foreground border border-accent/40 bg-accent/10 px-2 py-0.5 rounded">
                Guaranteed Math Consistency
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Traditional naive LLM pipelines ask all questions in a single giant prompt, frequently causing models to hallucinate a "discretion score" on statutes that don't delegate power at all. Our frozen DAG strictly branches based on <code className="font-mono text-primary">delegate_law</code>:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs font-mono">
              <div className={`p-3.5 rounded-lg border transition-all ${
                isDelegating
                  ? "bg-primary/5 border-primary text-foreground ring-1 ring-primary/40"
                  : "bg-muted/20 border-border text-muted-foreground opacity-60"
              }`}>
                <div className="font-bold flex items-center gap-2 text-primary text-xs">
                  <ArrowRight className="h-4 w-4" /> IF delegate_law == 1:
                </div>
                <p className="text-[11px] mt-1.5 pl-6 font-sans text-muted-foreground leading-relaxed">
                  Route statute text to Stage 2 classification to evaluate procedural constraints vs administrative leeway.
                </p>
              </div>

              <div className={`p-3.5 rounded-lg border transition-all ${
                !isDelegating
                  ? "bg-amber-500/10 border-amber-500 text-foreground ring-1 ring-amber-500/40"
                  : "bg-muted/20 border-border text-muted-foreground opacity-60"
              }`}>
                <div className="font-bold flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs">
                  <CornerDownRight className="h-4 w-4" /> IF delegate_law == 0:
                </div>
                <p className="text-[11px] mt-1.5 pl-6 font-sans text-muted-foreground leading-relaxed">
                  Deterministically set <code className="text-foreground font-mono">discretion_rank = 0</code>. Short-circuit execution immediately. Consumes 0 additional tokens.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Stage 2 Discretion Classification */}
        {selectedNode === "stage2" && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-bold text-foreground">Stage 2: Discretion Rank Classification (1–5)</h4>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-border bg-muted">
                Scale: 0 to 5
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              When delegation is present, Stage 2 evaluates the extent of procedural constraints (reporting requirements, mandatory consultations, strict timetables, public hearings) versus substantive authority.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1 text-xs">
              {[
                { r: 1, name: "Highly Constrained", desc: "Rigid statutory bounds, strict deadlines, mandatory consultations." },
                { r: 2, name: "Constrained", desc: "Narrow parameters; agency must follow detailed procedural rules." },
                { r: 3, name: "Moderate", desc: "Standard APA safeguards with substantive rulemaking power." },
                { r: 4, name: "Broad Discretion", desc: "Open-ended statutory goals; agency determines standards & timelines." },
                { r: 5, name: "Plenary / Sweeping", desc: "Power granted 'as deemed necessary and appropriate' by agency." },
              ].map((item) => (
                <div
                  key={item.r}
                  className={`p-2.5 rounded-lg border flex flex-col justify-between ${
                    item.r === 4
                      ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                      : "border-border/60 bg-muted/20"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold font-mono text-primary text-xs">Rank {item.r}</span>
                      {item.r === 4 && (
                        <span className="text-[9px] font-bold px-1 rounded bg-primary text-primary-foreground">
                          CAA Score
                        </span>
                      )}
                    </div>
                    <h5 className="font-semibold text-foreground text-[11px] mt-0.5">{item.name}</h5>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Final JSON Output & Consensus */}
        {selectedNode === "output" && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h4 className="text-sm font-bold text-foreground">Final Consensus Record & Citation Audit Trace</h4>
              </div>
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded">
                Auditable JSON Trace
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Every evaluated provision produces an immutable JSON record containing the discrete codes, verbatim statutory excerpt citations, and multi-model consensus scores (Cohen's Kappa &amp; Fleiss' Kappa).
            </p>

            <div className="p-3.5 rounded-lg bg-muted/40 border border-border/60 font-mono text-[11px] text-foreground space-y-1">
              <div>&#123;</div>
              <div className="pl-4"><span className="text-primary">"document_id"</span>: <span className="text-foreground">"{isDelegating ? "CAA-1970-SEC-111" : "PL-100-24"}"</span>,</div>
              <div className="pl-4"><span className="text-primary">"statute_title"</span>: <span className="text-muted-foreground">"{isDelegating ? "Clean Air Act § 111" : "Commemorative Medal Act"}"</span>,</div>
              <div className="pl-4"><span className="text-primary">"delegate_law"</span>: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{isDelegating ? 1 : 0}</span>,</div>
              <div className="pl-4"><span className="text-primary">"discretion_rank"</span>: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{isDelegating ? 4 : 0}</span>,</div>
              <div className="pl-4"><span className="text-primary">"stage2_invoked"</span>: <span className="text-foreground font-bold">{isDelegating ? "true" : "false (Short-Circuited)"}</span>,</div>
              <div className="pl-4"><span className="text-primary">"tokens_consumed"</span>: <span className="text-foreground">{isDelegating ? "1420" : "410"}</span>,</div>
              <div className="pl-4"><span className="text-primary">"actors"</span>: <span className="text-foreground">{isDelegating ? '["Administrator", "EPA"]' : '[]'}</span>,</div>
              <div className="pl-4"><span className="text-primary">"statutory_citation"</span>: <span className="text-muted-foreground">{isDelegating ? '"§ 111(b)(1)(B) The Administrator shall establish standards..."' : '"PL 100-24 § 1 A commemorative medal be struck..."'}</span>,</div>
              <div className="pl-4"><span className="text-primary">"inter_model_consensus"</span>: <span className="text-foreground">&#123; <span className="text-primary">"gpt4o"</span>: {isDelegating ? 4 : 0}, <span className="text-primary">"claude"</span>: {isDelegating ? 4 : 0}, <span className="text-primary">"gemini"</span>: {isDelegating ? 4 : 0} &#125;</span></div>
              <div>&#125;</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
