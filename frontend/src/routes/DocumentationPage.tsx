import { useState, useEffect } from "react";
import {
  BookOpen,
  Sparkles,
  Scale,
  GitBranch,
  ShieldCheck,
  ArrowRight,
  Hash,
} from "lucide-react";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { HeaderBar } from "@/components/ui/HeaderBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TwoStagePipelineStepper } from "@/components/docs/TwoStagePipelineStepper";
import workflowStepsSvg from "@/assets/workflow-steps.svg";
import delegationFrameworkPng from "@/assets/delegation-framework.png";
import rubricStaircasePng from "@/assets/rubric-staircase.png";
import byokVaultPng from "@/assets/byok-vault.png";
import multiModelBenchmarkPng from "@/assets/multi-model-benchmark.png";

export function DocumentationPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as "overview" | "quickstart" | "rubric" | "pipeline" | "byok" | null;
  const initialSection = tabParam && ["overview", "quickstart", "rubric", "pipeline", "byok"].includes(tabParam)
    ? tabParam
    : "overview";

  const [activeSection, setActiveSection] = useState<
    "overview" | "quickstart" | "rubric" | "pipeline" | "byok"
  >(initialSection);

  useEffect(() => {
    if (tabParam && ["overview", "quickstart", "rubric", "pipeline", "byok"].includes(tabParam)) {
      setActiveSection(tabParam);
    }
  }, [tabParam]);

  const handleSectionChange = (section: "overview" | "quickstart" | "rubric" | "pipeline" | "byok") => {
    setActiveSection(section);
    setSearchParams({ tab: section });
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <ThreadSidebar />

      <main className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto">
        <HeaderBar />

        {/* Hero Section */}
        <div className="border-b border-border bg-card/60 px-8 py-8">
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5">
                <BookOpen className="h-3 w-3 text-accent" />
                Documentation & Academic Guide
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-accent/20 text-accent-foreground border border-accent/30 text-[10px] font-bold tracking-wider uppercase">
                Columbia SIPA · Peer-Review Standard
              </span>
            </div>

            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Empirical Legislative Delegation & Discretion
              </h1>
              <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                A scientific framework and turnkey LLM-assisted coding platform for measuring administrative authority in legislative statutes.
              </p>
            </div>

            {/* Quick Navigation Tabs */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {[
                { id: "overview", label: "Academic Foundation", icon: Scale },
                { id: "quickstart", label: "3-Step Quickstart", icon: Sparkles },
                { id: "rubric", label: "Variables & Coding Rubric", icon: Hash },
                { id: "pipeline", label: "Deterministic Pipeline (DAG)", icon: GitBranch },
                { id: "byok", label: "Privacy & BYOK Vault", icon: ShieldCheck },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeSection === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleSectionChange(tab.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 max-w-5xl w-full mx-auto px-8 py-8 space-y-10">
          {/* SECTION 1: OVERVIEW & ACADEMIC FOUNDATION */}
          {activeSection === "overview" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Scale className="h-5 w-5 text-primary" />
                  Academic Foundation: Standard Discretion &amp; Delegation Theory
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Why does Congress delegate authority to executive agencies? When does it constrain administrators with rigid procedures?
                </p>
              </div>

              {/* Visual Delegation & Auditing Framework */}
              <div className="w-full flex items-center justify-center py-2">
                <img 
                  src={delegationFrameworkPng} 
                  alt="Legislative Delegation and Auditing Framework" 
                  className="w-full max-w-4xl h-auto object-contain max-h-[360px] select-none pointer-events-none" 
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card className="rounded-xl border-border bg-card shadow-xs">
                  <CardHeader className="pb-2.5">
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      <span className="h-6 w-6 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs">⚖️</span>
                      The Lawmaker's Dilemma
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Policy Expertise vs. Political Control
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground leading-relaxed space-y-2.5">
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span><strong className="text-foreground">Why Congress delegates:</strong> Lawmakers aren't banking or environmental specialists. For complex statutory issues, Congress grants regulatory power to expert agencies (e.g. SEC, EPA, FDA).</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span><strong className="text-foreground">Why Congress constrains:</strong> When political interests conflict (e.g. divided government), legislators impose strict deadlines, mandatory hearings, and reporting mandates to prevent agency drift.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span><strong className="text-foreground">The strategic balance:</strong> Every federal statute balances administrative discretion (freedom to act) against statutory guardrails (limits on power).</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="rounded-xl border-border bg-card shadow-xs">
                  <CardHeader className="pb-2.5">
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      <span className="h-6 w-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs">⚡</span>
                      The AI Auditing Engine
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Automated &amp; Mathematical Statutory Coding
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground leading-relaxed space-y-2.5">
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span><strong className="text-foreground">The old manual way:</strong> Auditing major public laws required teams of legal scholars spending years manually reading and categorizing thousands of statutory provisions.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span><strong className="text-foreground">The platform approach:</strong> Executes frozen directed acyclic graph (DAG) pipelines across competing LLMs (GPT-4o, Claude, DeepSeek) simultaneously.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span><strong className="text-foreground">Verifiable citations:</strong> Audits 500+ statutes in minutes, pairs every score with exact statutory provisions, and calculates inter-model consensus (Kappa).</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-xs">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <span>The Core Research Question We Measure</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
                  <div className="p-3 rounded-lg bg-background/60 border border-border/60">
                    <span className="font-bold text-foreground block">1. Delegation Gate</span>
                    <span className="text-[11px] text-muted-foreground mt-0.5 block">Does this law grant new or expanded authority to an executive agency? (<code className="text-primary font-mono font-bold">delegate_law</code>: 0 or 1)</span>
                  </div>
                  <div className="p-3 rounded-lg bg-background/60 border border-border/60">
                    <span className="font-bold text-foreground block">2. Discretion Scale</span>
                    <span className="text-[11px] text-muted-foreground mt-0.5 block">How much regulatory leeway is granted? (<code className="text-primary font-mono font-bold">discretion_rank</code>: 0 to 5)</span>
                  </div>
                  <div className="p-3 rounded-lg bg-background/60 border border-border/60">
                    <span className="font-bold text-foreground block">3. Statutory Safeguards</span>
                    <span className="text-[11px] text-muted-foreground mt-0.5 block">What procedural constraints, oversight, and deadlines bind the agency?</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: 3-STEP QUICKSTART */}
          {activeSection === "quickstart" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-accent" />
                  The 3-Step Turnkey Replication Journey
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Replicating the official Standard Discretion empirical coding benchmark takes less than 2 minutes.
                </p>
              </div>

              {/* Visual Workflow Steps Graphic */}
              <div className="w-full flex items-center justify-center py-2">
                <img 
                  src={workflowStepsSvg} 
                  alt="3-Step Legislative Auditing Workflow: 1. Upload Corpus -> 2. Benchmark LLMs -> 3. Generate Consensus Matrix & Export" 
                  className="w-full max-w-4xl h-auto dark:invert dark:opacity-90 object-contain max-h-[380px] select-none pointer-events-none" 
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {/* Step 1 */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-3 relative shadow-xs flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                      1
                    </span>
                    <h3 className="text-sm font-bold text-foreground">Select Law Corpus</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Choose from pre-loaded historical public laws (e.g. Clean Air Act, Dodd-Frank) or upload a folder of new legislative bills in text or PDF format.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/documents")}
                    className="text-xs h-8 rounded-lg border-border justify-between"
                  >
                    <span>Open Law Corpus</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>

                {/* Step 2 */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-3 relative shadow-xs flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="h-6 w-6 rounded-full bg-accent/20 text-accent-foreground font-bold text-xs flex items-center justify-center">
                      2
                    </span>
                    <h3 className="text-sm font-bold text-foreground">One-Click Pipeline</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Navigate to <strong>Workflows &rarr; Library</strong> and select <em>"Official Administrative Delegation & Discretion Coder v1.0"</em> with frozen DAG routing.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/workflows")}
                    className="text-xs h-8 rounded-lg border-border justify-between"
                  >
                    <span>View Workflows</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>

                {/* Step 3 */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-3 relative shadow-xs flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                      3
                    </span>
                    <h3 className="text-sm font-bold text-foreground">Audit & Export Data</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      View real-time discrete variables (<code className="text-primary font-mono font-bold">delegate_law</code> and <code className="text-primary font-mono font-bold">discretion_rank</code>) and export clean CSV datasets for regression analysis.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/campaigns")}
                    className="text-xs h-8 rounded-lg border-border justify-between"
                  >
                    <span>Go to Campaigns</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: VARIABLES & CODING RUBRIC */}
          {activeSection === "rubric" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Hash className="h-5 w-5 text-primary" />
                  Key Coding Variables & Methodology Rubric
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Definitions of the primary discrete variables emitted by the Standard Discretion legislative coding framework.
                </p>
              </div>

              {/* Variable 1 */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                      delegate_law
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      Binary Delegation Indicator (0 or 1)
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">
                    Stage 1 Screening
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Identifies whether Congress grants authority to an executive agency, department, commission, or administrator to promulgate rules, execute regulations, issue licenses, or hold administrative hearings.
                </p>
                <div className="grid gap-2 sm:grid-cols-2 pt-1 text-xs">
                  <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
                    <span className="font-bold text-foreground">delegate_law = 0</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Statute contains no administrative delegation (e.g. commemorative resolutions, direct appropriations, or self-executing statutory commands).
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
                    <span className="font-bold text-foreground">delegate_law = 1</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Statute delegates regulatory, adjudicative, or enforcement authority to an agency or executive officer.
                    </p>
                  </div>
                </div>
              </div>

              {/* Variable 2: Discretion Rank Scale */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-accent/20 text-accent-foreground border border-accent/40">
                      discretion_rank
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      Degrees of Administrative Leeway (Scale 0 to 5)
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">
                    Stage 2 Classification
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Evaluates statutory constraint strength against agency leeway. If <code className="text-primary font-mono">delegate_law == 0</code>, discretion is deterministically set to 0.
                </p>

                {/* Staircase Infographic */}
                <div className="pt-2 flex flex-col items-center">
                  <div className="w-full max-w-3xl rounded-2xl border border-border/70 bg-white p-4 sm:p-6 shadow-xs flex flex-col items-center">
                    <img
                      src={rubricStaircasePng}
                      alt="Degrees of Administrative Leeway (Scale 0 to 5)"
                      className="w-full max-h-[520px] object-contain rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 4: PIPELINE DAG */}
          {activeSection === "pipeline" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-primary" />
                  Deterministic 2-Stage Verification Pipeline
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  How our frozen directed acyclic graph (DAG) avoids hallucinated scores and saves up to 40% in API costs.
                </p>
              </div>

              {/* Interactive Pipeline Stepper Component */}
              <TwoStagePipelineStepper />

              {/* Multi-Model Consensus Architecture Diagram */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <span className="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs">⚖️</span>
                      Multi-Model Consensus &amp; Legal Benchmark Architecture
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Parallel execution across competing LLM architectures to eliminate single-model bias.
                    </p>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full shrink-0 self-start sm:self-auto">
                    Inter-Annotator Agreement
                  </span>
                </div>

                {/* Visual Multi-Model Benchmark Diagram */}
                <div className="w-full flex items-center justify-center py-2">
                  <img 
                    src={multiModelBenchmarkPng} 
                    alt="Multi-Model Legal Benchmark: Law Corpus Input + Parallel Evaluation (OpenAI, Gemini, Claude) + Inter-Annotator Agreement + Standard Rubric Score -> Legal Benchmark" 
                    className="w-full max-w-xl h-auto object-contain max-h-[380px] select-none pointer-events-none" 
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3 pt-1 text-xs">
                  <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
                    <span className="font-bold text-foreground block">1. Law Corpus Input</span>
                    <span className="text-[11px] text-muted-foreground mt-0.5 block">Statutory provisions ingested and pre-formatted for parallel model prompts.</span>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
                    <span className="font-bold text-foreground block">2. Parallel Evaluation</span>
                    <span className="text-[11px] text-muted-foreground mt-0.5 block">Independent execution across OpenAI, Gemini, and Claude simultaneously.</span>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
                    <span className="font-bold text-foreground block">3. Mathematical Kappa</span>
                    <span className="text-[11px] text-muted-foreground mt-0.5 block">Automated Cohen's and Fleiss' Kappa matrix generation for peer review.</span>
                  </div>
                </div>
              </div>

              {/* Technical Specifications */}
              <div className="grid gap-4 md:grid-cols-2 pt-1">
                <Card className="rounded-xl border-border bg-card shadow-xs">
                  <CardHeader className="pb-2.5">
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      <span className="h-6 w-6 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs">⚡</span>
                      Short-Circuit Token Economics
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Eliminating wasted compute on non-delegating laws
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground leading-relaxed space-y-2">
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                        <span><strong className="text-foreground">35%–45% non-delegating:</strong> Commemorative bills, land conveyances, and direct appropriations contain zero administrative discretion.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                        <span><strong className="text-foreground">Immediate branch halt:</strong> Branching on <code className="font-mono text-primary font-bold">delegate_law == 0</code> sets discretion to 0 instantly, skipping Stage 2 and cutting API costs by up to 40%.</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="rounded-xl border-border bg-card shadow-xs">
                  <CardHeader className="pb-2.5">
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      <span className="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs">📜</span>
                      Verifiable Verbatim Citations
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Traceable back to statutory text
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground leading-relaxed space-y-2">
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span><strong className="text-foreground">Direct statutory mapping:</strong> Every discrete flag is paired with verbatim excerpts and coordinates (Section, Subsection, Paragraph).</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span><strong className="text-foreground">Empirical replicability:</strong> Cross-reference citations against the US Code or export clean CSVs for econometric regression analysis.</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* SECTION 5: PRIVACY & BYOK */}
          {activeSection === "byok" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  Zero Host Fallback &amp; Pure BYOK Architecture
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enterprise-grade credential encryption and multi-tenant isolation designed for open-source academic deployment.
                </p>
              </div>

              {/* Visual Zero-Knowledge Vault Infographic */}
              <div className="w-full flex items-center justify-center py-2">
                <img 
                  src={byokVaultPng} 
                  alt="What does the Zero-Knowledge API Key Vault include? User API Key, AES-256-GCM Encryption, Direct Provider Execution, Zero Exposure" 
                  className="w-full max-w-2xl h-auto object-contain max-h-[420px] select-none pointer-events-none" 
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card className="rounded-xl border-border bg-card shadow-xs">
                  <CardHeader className="pb-2.5">
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      <span className="h-6 w-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs">🛡️</span>
                      Zero Server Host Fallbacks
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Developer &amp; Host Isolation
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground leading-relaxed space-y-2">
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                        <span><strong className="text-foreground">Explicit credentials only:</strong> Server environment keys are never used as silent fallbacks. All evaluations require explicit, encrypted keys.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                        <span><strong className="text-foreground">No accidental billing:</strong> If a model call lacks an active key, the pipeline halts immediately with an actionable warning.</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="rounded-xl border-border bg-card shadow-xs">
                  <CardHeader className="pb-2.5">
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      <span className="h-6 w-6 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs">🔒</span>
                      AES-256-GCM / Fernet Encryption
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      In-Memory Lifespan Only
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground leading-relaxed space-y-2">
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                        <span><strong className="text-foreground">Pre-flight handshake:</strong> Every key entered is verified with a live test query before encryption and storage.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                        <span><strong className="text-foreground">Ephemeral memory:</strong> Plaintext keys exist in RAM strictly during that specific HTTP request—never written to disk or logs.</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {/* Action Callout */}
              <div className="rounded-xl border border-border bg-card p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="space-y-0.5 text-center sm:text-left">
                  <span className="text-xs font-bold text-foreground block">Ready to connect your LLM provider keys?</span>
                  <span className="text-[11px] text-muted-foreground block">Add personal keys or workspace pooled credentials in Settings.</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => navigate("/settings")}
                  className="text-xs h-8 rounded-lg bg-primary text-primary-foreground font-semibold px-4 shrink-0 gap-1.5 shadow-xs"
                >
                  <span>Open BYOK Vault in Settings</span>
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
