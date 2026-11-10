import { useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { toast } from "sonner";
import {
  BarChart3,
  GitBranch,
  FileText,
  MessagesSquare,
  CreditCard,
  HelpCircle,
  LogOut,
  Plus,
  ChevronDown,
  Building2,
  Trash2,
  Edit2,
  MoreVertical,
  Scale,
  Sparkles,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useThreads } from "@/hooks/useThreads";
import { useAuthContext } from "@/context/AuthContext";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { Thread } from "@/types/thread";
import { cn } from "@/lib/utils";

export function ThreadSidebar() {
  const { id: activeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { session, signOut, workspaces, activeWorkspace, setActiveWorkspace, createWorkspace } =
    useAuthContext();
  const { threads, loading, createThread, deleteThread, renameThread } = useThreads();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpStep, setHelpStep] = useState(1);

  const isChatRoute = pathname.startsWith("/chat");

  const handleNewThread = async () => {
    try {
      const thread = await createThread({ title: "New conversation" });
      navigate(`/chat/${thread.id}`);
    } catch {
      toast.error("Failed to create thread");
    }
  };

  const handleCreateWorkspace = async () => {
    const name = newWorkspaceName.trim();
    if (!name) return;
    try {
      await createWorkspace(name);
      toast.success(`Workspace "${name.toUpperCase()}" created!`);
      setShowWorkspaceModal(false);
      setNewWorkspaceName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create workspace");
    }
  };

  const handleDeleteThread = async (thread: Thread) => {
    try {
      await deleteThread(thread.id);
      if (activeId === thread.id) {
        navigate("/chat", { replace: true });
      }
    } catch {
      toast.error("Failed to delete thread");
    }
  };

  const handleRenameStart = (thread: Thread) => {
    setRenamingId(thread.id);
    setRenameValue(thread.title);
  };

  const handleRenameSubmit = async (threadId: string) => {
    if (!renameValue.trim()) return;
    try {
      await renameThread(threadId, { title: renameValue.trim() });
    } catch {
      toast.error("Failed to rename thread");
    } finally {
      setRenamingId(null);
    }
  };

  const navItems = [
    {
      label: "Campaigns",
      path: "/campaigns",
      icon: BarChart3,
      isActive:
        pathname.startsWith("/campaigns") ||
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/evaluation"),
      badge: null,
    },
    {
      label: "Workflows",
      path: "/workflows",
      icon: GitBranch,
      isActive: pathname.startsWith("/workflows"),
      badge: "Frozen v1.0",
    },
    {
      label: "Law Corpus",
      path: "/documents",
      icon: FileText,
      isActive: pathname.startsWith("/documents"),
      badge: null,
    },
    {
      label: "Conversations",
      path: "/chat",
      icon: MessagesSquare,
      isActive: pathname.startsWith("/chat"),
      badge: null,
    },
  ];

  return (
    <aside className="flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground select-none shadow-xl">
      {/* Brand Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-accent text-accent-foreground flex items-center justify-center shadow-md font-black">
            <Scale className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              Law Delegation
            </div>
            <div className="text-[10px] text-stone-300 font-medium tracking-wide">
              Columbia SIPA · Research
            </div>
          </div>
        </div>
        <ThemeToggle />
      </div>

      {/* Workspace Selector */}
      <div className="px-3 py-2.5 border-b border-white/10 bg-black/10">
        <div className="text-[9px] uppercase font-bold tracking-wider text-stone-400 mb-1.5 px-1 flex items-center justify-between">
          <span>Active Workspace</span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-stone-200 transition-colors">
                <span className="truncate flex items-center gap-2 font-medium">
                  <Building2 className="h-3.5 w-3.5 text-accent" />
                  {activeWorkspace?.name ?? "Select Workspace"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-stone-400" />
              </button>
            }
          />
          <DropdownMenuContent className="w-56 rounded-xl border-border bg-card text-foreground shadow-xl" align="start">
            <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Your Workspaces
            </div>
            {workspaces
              .filter((w) => w.id !== "QA" && w.id !== "TEST")
              .map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  className={cn(
                    "rounded-lg cursor-pointer text-xs font-medium py-1.5",
                    activeWorkspace?.id === w.id && "bg-primary/10 text-primary font-bold"
                  )}
                  onClick={() => setActiveWorkspace(w)}
                >
                  <span className="truncate">{w.name}</span>
                </DropdownMenuItem>
              ))}
            <Separator className="my-1" />
            <DropdownMenuItem
              className="text-primary font-semibold text-xs cursor-pointer focus:text-primary py-1.5"
              onClick={() => setShowWorkspaceModal(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1 text-accent" />
              Create Workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Main 5-Pillar Navigation */}
      <div className="px-2 py-3 space-y-1">
        <div className="text-[9px] uppercase font-bold tracking-wider text-stone-400 px-2 pb-1">
          Research Workbench
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-all group",
                item.isActive
                  ? "bg-white/15 text-white font-semibold shadow-inner border-l-2 border-accent"
                  : "text-stone-300 hover:bg-white/5 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    item.isActive ? "text-accent" : "text-stone-400 group-hover:text-stone-200"
                  )}
                />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-semibold tracking-tight border border-accent/30">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Separator className="bg-white/10" />

      {/* Contextual Middle Section: Chat Threads when in Chat, or Quick Summary otherwise */}
      <div className="flex-1 flex flex-col min-h-0">
        {isChatRoute ? (
          <>
            <div className="p-2.5 flex items-center justify-between">
              <span className="text-[9px] uppercase font-bold tracking-wider text-stone-400 px-1">
                Chat Threads
              </span>
              <Button
                onClick={handleNewThread}
                size="sm"
                className="h-7 px-2.5 rounded-lg text-xs font-semibold bg-accent hover:bg-accent/90 text-accent-foreground gap-1 shadow-sm"
              >
                <Plus className="h-3 w-3" />
                New
              </Button>
            </div>
            <ScrollArea className="flex-1 px-2">
              <div className="space-y-0.5 pb-2">
                {loading && (
                  <div className="space-y-1 p-1">
                    <Skeleton className="h-7 w-full bg-white/10" />
                    <Skeleton className="h-7 w-full bg-white/10" />
                    <Skeleton className="h-7 w-full bg-white/10" />
                  </div>
                )}
                {threads.map((thread) => (
                  <div
                    key={thread.id}
                    className={cn(
                      "group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs cursor-pointer transition-colors",
                      activeId === thread.id
                        ? "bg-white/20 text-white font-semibold"
                        : "text-stone-300 hover:bg-white/10 hover:text-white"
                    )}
                    onClick={() => navigate(`/chat/${thread.id}`)}
                  >
                    {renamingId === thread.id ? (
                      <input
                        className="flex-1 bg-black/40 rounded px-1.5 py-0.5 text-xs text-white outline-none ring-1 ring-[#E6AA4C]"
                        value={renameValue}
                        autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => void handleRenameSubmit(thread.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRenameSubmit(thread.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="flex-1 truncate">{thread.title}</span>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button
                            className="h-5 w-5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/20 flex items-center justify-center text-stone-300"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-3 w-3" />
                          </button>
                        }
                      />
                      <DropdownMenuContent align="end" className="bg-white text-stone-800 text-xs">
                        <DropdownMenuItem onClick={() => handleRenameStart(thread)}>
                          <Edit2 className="h-3 w-3 mr-1.5 text-stone-500" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => void handleDeleteThread(thread)}
                        >
                          <Trash2 className="h-3 w-3 mr-1.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 px-3 py-4 flex flex-col justify-end text-[11px] text-stone-400">
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-stone-200 font-semibold text-xs">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <span>Standard Discretion Rubric</span>
              </div>
              <p className="leading-relaxed text-[11px] text-stone-300">
                Auditing legislative discretion with deterministic 2-stage verification across Congress public laws.
              </p>
              <button
                onClick={() => setShowHelpModal(true)}
                className="text-[10px] text-accent hover:underline flex items-center gap-1 font-medium pt-1"
              >
                <span>Read methodology rubric</span>
                <ExternalLink className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <Separator className="bg-white/10" />

      {/* Footer Navigation (Tutorial, Cost Tracking, Help, Profile) */}
      <div className="p-2.5 space-y-1">
        <button
          onClick={() => navigate("/docs")}
          className={cn(
            "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            pathname.startsWith("/docs")
              ? "bg-white/15 text-white font-semibold"
              : "text-stone-300 hover:bg-white/5 hover:text-white"
          )}
        >
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-accent" />
            <span>Tutorial & Guide</span>
          </div>
          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-accent/20 text-accent font-semibold tracking-wide border border-accent/30">
            Docs
          </span>
        </button>

        <button
          onClick={() => navigate("/settings")}
          className={cn(
            "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            pathname.startsWith("/settings")
              ? "bg-white/15 text-white font-semibold"
              : "text-stone-300 hover:bg-white/5 hover:text-white"
          )}
        >
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-accent" />
            <span>Cost Tracking & BYOK</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-stone-300 font-mono">
            Vault
          </span>
        </button>

        <button
          onClick={() => setShowHelpModal(true)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-300 hover:bg-white/5 hover:text-white transition-colors"
        >
          <HelpCircle className="h-4 w-4 text-stone-400" />
          <span>Help & Methodology</span>
        </button>

        {/* User Card */}
        <div className="pt-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="h-7 w-7 rounded-full bg-accent text-accent-foreground font-bold text-xs flex items-center justify-center shrink-0">
              {session?.user?.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="overflow-hidden leading-tight">
              <div className="text-xs font-medium text-white truncate max-w-[120px]">
                {session?.user?.email || "Guest"}
              </div>
              <div className="text-[10px] text-stone-400 truncate">
                {activeWorkspace?.name || "Workspace"}
              </div>
            </div>
          </div>
          <button
            onClick={() => void signOut()}
            title="Sign Out"
            className="h-7 w-7 rounded-lg text-stone-400 hover:text-red-400 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Inline Workspace Creation Modal */}
      {showWorkspaceModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowWorkspaceModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl text-foreground animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-foreground mb-1">Create Workspace</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Enter a unique workspace identifier for your research group or project.
            </p>
            <input
              type="text"
              placeholder="e.g. COLUMBIA_SIPA, BANKING_LAWS"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary mb-4 uppercase"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateWorkspace();
                if (e.key === "Escape") {
                  setShowWorkspaceModal(false);
                  setNewWorkspaceName("");
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowWorkspaceModal(false);
                  setNewWorkspaceName("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={handleCreateWorkspace}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Methodology & Help Modal (DARE-Style Interactive Tour / Guide) */}
      <Dialog open={showHelpModal} onOpenChange={setShowHelpModal}>
        <DialogContent className="sm:max-w-2xl rounded-2xl border border-border bg-card text-card-foreground p-0 overflow-hidden shadow-2xl">
          {/* Top Brand Header */}
          <div className="pt-6 pb-4 px-6 text-center border-b border-border/60">
            <div className="mx-auto h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-base shadow-sm mb-2">
              <Scale className="h-5 w-5 text-accent" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Law Delegation Platform
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Empirical legislative coding & discretion audit framework · Columbia SIPA
            </p>
          </div>

          {/* Carousel / Tab Content Area */}
          <div className="p-6 space-y-4 min-h-[300px]">
            {helpStep === 1 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="rounded-xl bg-secondary/50 p-4 border border-border/60 space-y-2">
                  <div className="font-bold text-primary text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                    Academic Foundation
                  </div>
                  <h3 className="text-base font-bold text-foreground">
                    Auditing Legislative Delegation & Administrative Discretion
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Based on the Standard Discretion &amp; Delegation Framework (<em>Delegating Powers: A Law and Economics Approach to Politics, Regulation, and the Economy</em>). This system automates the scientific audit of statutory language to determine whether, to whom, and under what constraints Congress delegates regulatory authority.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="p-3.5 rounded-xl border border-border/60 bg-card">
                    <div className="font-bold text-foreground text-xs">Deterministic Coding</div>
                    <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      Statutory conditions gate expensive LLM calls: non-delegating laws are deterministically assigned discretion 0.
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl border border-border/60 bg-card">
                    <div className="font-bold text-foreground text-xs">Reproducible Datasets</div>
                    <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      Every prompt, model temperature, and intermediate rationale is recorded and exportable to CSV for peer-reviewed replication.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {helpStep === 2 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div>
                  <h3 className="text-base font-bold text-foreground">Core Research Variables</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Standardized empirical coding outputs produced by the official benchmark pipeline.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-4 rounded-xl border-2 border-primary/20 bg-primary/5 space-y-1.5">
                    <div className="font-mono font-bold text-primary text-xs flex items-center justify-between">
                      <span>delegate_law</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10">Binary (0 or 1)</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Screens whether Congress delegates rulemaking, administrative, or adjudicative authority to an executive agency or commission.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border-2 border-accent/40 bg-accent/10 space-y-1.5">
                    <div className="font-mono font-bold text-accent-foreground text-xs flex items-center justify-between">
                      <span>discretion_rank</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20">Scale 0 to 5</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Rank 0: No delegation. Rank 1–2: Strict procedural constraints & required hearings. Rank 4–5: Broad administrative leeway.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-border/60 bg-secondary/30 text-[11px] text-muted-foreground">
                  <strong className="text-foreground">Audit Traces:</strong> Behind-the-scenes variables (administrative actors, statutory citations, constraint strength) are stored in the execution trace drawer for verification.
                </div>
              </div>
            )}

            {helpStep === 3 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div>
                  <h3 className="text-base font-bold text-foreground">Deterministic 2-Stage Pipeline</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    How the official Standard Discretion pipeline guarantees scientific rigor while saving API costs.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-secondary/50 border border-border/60 font-mono text-xs text-foreground space-y-2">
                  <div className="text-primary font-bold">1. Statute Ingestion (Raw Text / PDF)</div>
                  <div className="pl-4 border-l-2 border-primary/30 space-y-1 text-[11px] text-muted-foreground">
                    <div>↓ Node 1: Delegation Screening LLM → Extracts <code>delegate_law</code></div>
                    <div className="pl-4 border-l-2 border-accent/40 text-foreground">
                      ├─ If <code>delegate_law == 0</code> → Deterministic Node: Set <code>discretion_rank = 0</code> (0 LLM cost)
                    </div>
                    <div className="pl-4 border-l-2 border-accent/40 text-foreground">
                      └─ If <code>delegate_law == 1</code> → Node 2: Discretion Classifier (1–5 scale based on constraint rubrics)
                    </div>
                  </div>
                  <div className="text-accent font-bold pt-1">2. Published Table: Exact Columns + Full Audit Drawer</div>
                </div>

                <div className="text-xs text-muted-foreground leading-relaxed">
                  External researchers can replicate this exact workflow on their own statutes with 1-click in the <strong>Workflows → Library</strong> tab.
                </div>
              </div>
            )}
          </div>

          {/* DARE-Style Bottom Navigation Bar */}
          <div className="px-6 py-3.5 bg-secondary/30 border-t border-border/60 flex items-center justify-between">
            {/* Step Indicators */}
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map((step) => (
                <button
                  key={step}
                  onClick={() => setHelpStep(step)}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    helpStep === step ? "w-6 bg-primary" : "w-2 bg-border hover:bg-muted-foreground"
                  )}
                  aria-label={`Go to slide ${step}`}
                />
              ))}
              <span className="text-[10px] text-muted-foreground font-medium ml-2">
                {helpStep} / 3
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground h-8"
                onClick={() => {
                  setShowHelpModal(false);
                  setHelpStep(1);
                }}
              >
                Skip
              </Button>
              {helpStep > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => setHelpStep((prev) => prev - 1)}
                >
                  Back
                </Button>
              )}
              {helpStep < 3 ? (
                <Button
                  size="sm"
                  className="text-xs font-semibold h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => setHelpStep((prev) => prev + 1)}
                >
                  Next
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="text-xs font-semibold h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => {
                    setShowHelpModal(false);
                    setHelpStep(1);
                  }}
                >
                  Got it
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
