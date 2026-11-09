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
                  Academic Foundation: Epstein & O'Halloran Formal Theory
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Why does Congress delegate authority to executive agencies? When does it constrain administrators with rigid procedures?
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card className="rounded-2xl border-border bg-card shadow-xs">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold text-foreground">
                      The Theoretical Problem
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Delegating Powers (Cambridge University Press)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground leading-relaxed space-y-2.5">
                    <p>
                      Formulated by <strong>Professor Sharyn O'Halloran</strong> (Columbia University & Trinity College Dublin) and David Epstein, formal models of legislative delegation show that legislators face a trade-off between policy expertise and political control.
                    </p>
                    <p>
                      When issues are technically complex, Congress delegates authority to expert agencies. But when the President and Congress represent conflicting political interests, legislators impose strict procedural hurdles, reporting mandates, and narrow discretion boundaries to limit executive drift.
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-border bg-card shadow-xs">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold text-foreground">
                      The Computational Solution
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Automated & Immutable Statutory Auditing
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground leading-relaxed space-y-2.5">
                    <p>
                      Historically, auditing major statutes required teams of legal researchers manually annotating thousands of statutory provisions over years of work.
                    </p>
                    <p>
                      This platform brings <strong>deterministic, multi-model LLM benchmarking</strong> to legislative studies. By executing frozen directed acyclic graph (DAG) pipelines, researchers can audit 500+ statutes in minutes, verify exact statutory citations, and replicate empirical findings across institutions with 100% mathematical fidelity.
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-2">
                <div className="flex items-center gap-2 text-primary font-bold text-xs">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <span>The Core Research Question</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Does a given statutory text delegate regulatory authority to the executive branch? If so, what degree of discretion is granted (Scale 1–5), and what procedural constraints are imposed to limit agency leeway?
                </p>
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
                  Replicating the official Epstein & O'Halloran empirical coding benchmark takes less than 2 minutes.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {/* Step 1 */}
                <div className="rounded-2xl border border-border bg-card p-5 space-y-3 relative shadow-xs flex flex-col justify-between">
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
                    className="text-xs h-8 rounded-xl border-border justify-between"
                  >
                    <span>Open Law Corpus</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>

                {/* Step 2 */}
                <div className="rounded-2xl border border-border bg-card p-5 space-y-3 relative shadow-xs flex flex-col justify-between">
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
                    className="text-xs h-8 rounded-xl border-border justify-between"
                  >
                    <span>View Workflows</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>

                {/* Step 3 */}
                <div className="rounded-2xl border border-border bg-card p-5 space-y-3 relative shadow-xs flex flex-col justify-between">
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
                    className="text-xs h-8 rounded-xl border-border justify-between"
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
                  Definitions of the primary discrete variables emitted by the O'Halloran legislative coding framework.
                </p>
              </div>

              {/* Variable 1 */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-3">
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
                  <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                    <span className="font-bold text-foreground">delegate_law = 0</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Statute contains no administrative delegation (e.g. commemorative resolutions, direct appropriations, or self-executing statutory commands).
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                    <span className="font-bold text-foreground">delegate_law = 1</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Statute delegates regulatory, adjudicative, or enforcement authority to an agency or executive officer.
                    </p>
                  </div>
                </div>
              </div>

              {/* Variable 2: Discretion Rank Scale */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
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

                <div className="space-y-2 pt-1">
                  {[
                    {
                      rank: 0,
                      label: "No Delegation",
                      desc: "Pure legislative command or symbolic act; no agency administrative power granted.",
                    },
                    {
                      rank: 1,
                      label: "Highly Constrained",
                      desc: "Extremely tight constraints: rigid deadlines, mandatory public hearings, inter-agency signoffs, zero rulemaking leeway.",
                    },
                    {
                      rank: 2,
                      label: "Constrained Discretion",
                      desc: "Statute establishes narrow parameters and specific standards; agency must follow detailed procedural rules.",
                    },
                    {
                      rank: 3,
                      label: "Moderate Discretion",
                      desc: "Agency is authorized to formulate substantive rules within general statutory criteria, with standard APA safeguards.",
                    },
                    {
                      rank: 4,
                      label: "Broad Discretion",
                      desc: "Congress sets open-ended goals; the agency determines standards, eligibility, enforcement procedures, and timelines.",
                    },
                    {
                      rank: 5,
                      label: "Plenary / Unbounded Discretion",
                      desc: "Agency given sweeping rulemaking power 'as deemed necessary and appropriate in the administrator’s judgment'.",
                    },
                  ].map((item) => (
                    <div
                      key={item.rank}
                      className="p-3 rounded-xl border border-border/60 bg-muted/20 flex items-start gap-3 text-xs"
                    >
                      <span className="h-6 w-6 rounded-lg bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                        {item.rank}
                      </span>
                      <div>
                        <span className="font-bold text-foreground">{item.label}</span>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  ))}
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

              <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Directed Execution Flow
                </h3>
                <div className="font-mono text-xs p-4 rounded-xl bg-muted/50 border border-border text-foreground space-y-2 leading-relaxed">
                  <div>Statute Text (PDF / TXT)</div>
                  <div className="text-muted-foreground pl-4">&darr;</div>
                  <div className="pl-4 font-bold text-primary">
                    [ Node 1: Delegation Detection ]
                  </div>
                  <div className="text-muted-foreground pl-4">
                    Outputs: delegate_law (0 or 1), rationale, administrative actors
                  </div>
                  <div className="text-muted-foreground pl-4">&darr;</div>
                  <div className="pl-4 text-accent font-semibold">
                    [ Deterministic Conditional Split ]
                  </div>
                  <div className="pl-8 space-y-1">
                    <div>&boxur; If delegate_law == 0:</div>
                    <div className="pl-4 text-emerald-600 dark:text-emerald-400 font-semibold">
                      &rarr; Node 2A: Set discretion_rank = 0 (No LLM call &mdash; 0 tokens wasted)
                    </div>
                    <div>&boxvr; If delegate_law == 1:</div>
                    <div className="pl-4 text-accent-plum font-semibold">
                      &rarr; Node 2B: Classify Discretion Rank (1–5) based on statutory constraints
                    </div>
                  </div>
                  <div className="text-muted-foreground pl-4">&darr;</div>
                  <div className="pl-4 font-bold">
                    [ Final Verified Output Record ]
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 5: PRIVACY & BYOK */}
          {activeSection === "byok" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  Zero Host Fallback & Pure BYOK Architecture
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enterprise-grade credential encryption and multi-tenant isolation designed for open-source academic deployment.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card className="rounded-2xl border-border bg-card shadow-xs">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold text-foreground">
                      Zero Server Host Fallbacks
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Developer & Host Security
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground leading-relaxed space-y-2">
                    <p>
                      In open-source deployments, host server environment keys are never used as silent fallbacks. All model calls require an explicit, encrypted user or workspace key.
                    </p>
                    <p>
                      If a user attempts an evaluation run without a configured key, the platform halts immediately with an actionable error directing them to Settings.
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-border bg-card shadow-xs">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold text-foreground">
                      AES-256-GCM / Fernet Encryption
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      In-Memory Scope Only
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground leading-relaxed space-y-2">
                    <p>
                      Every API key entered in Settings is verified via a live handshake call and encrypted in the database using authenticated AES-256-GCM.
                    </p>
                    <p>
                      Plaintext keys exist in server memory solely for the lifespan of that specific HTTP call and are never written to disk or recorded in logs.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
