import { useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { toast } from "sonner";
import {
  BarChart3,
  GitBranch,
  FileText,
  MessagesSquare,
  FlaskConical,
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
      isActive: pathname.startsWith("/campaigns") || pathname.startsWith("/dashboard"),
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
    {
      label: "Evaluation",
      path: "/evaluation",
      icon: FlaskConical,
      isActive: pathname.startsWith("/evaluation"),
      badge: "Multi-Model",
    },
  ];

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[#1B4D45]/40 bg-[#0B3B36] text-stone-100 select-none shadow-xl">
      {/* Brand Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-[#E6AA4C] text-[#0B3B36] flex items-center justify-center shadow-md font-black">
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
                  <Building2 className="h-3.5 w-3.5 text-[#E6AA4C]" />
                  {activeWorkspace?.name ?? "Select Workspace"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-stone-400" />
              </button>
            }
          />
          <DropdownMenuContent className="w-56 rounded-xl border-stone-200 bg-white text-stone-800 shadow-xl" align="start">
            <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-400">
              Your Workspaces
            </div>
            {workspaces
              .filter((w) => w.id !== "QA" && w.id !== "TEST")
              .map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  className={cn(
                    "rounded-lg cursor-pointer text-xs font-medium py-1.5",
                    activeWorkspace?.id === w.id && "bg-[#0B3B36]/10 text-[#0B3B36] font-bold"
                  )}
                  onClick={() => setActiveWorkspace(w)}
                >
                  <span className="truncate">{w.name}</span>
                </DropdownMenuItem>
              ))}
            <Separator className="my-1" />
            <DropdownMenuItem
              className="text-[#0B3B36] font-semibold text-xs cursor-pointer focus:text-[#0B3B36] py-1.5"
              onClick={() => setShowWorkspaceModal(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1 text-[#E6AA4C]" />
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
                  ? "bg-white/15 text-white font-semibold shadow-inner border-l-2 border-[#E6AA4C]"
                  : "text-stone-300 hover:bg-white/5 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    item.isActive ? "text-[#E6AA4C]" : "text-stone-400 group-hover:text-stone-200"
                  )}
                />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#E6AA4C]/20 text-[#E6AA4C] font-semibold tracking-tight border border-[#E6AA4C]/30">
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
                className="h-7 px-2.5 rounded-lg text-xs font-semibold bg-[#E6AA4C] hover:bg-[#d89b35] text-[#0B3B36] gap-1 shadow-sm"
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
                <Sparkles className="h-3.5 w-3.5 text-[#E6AA4C]" />
                <span>O'Halloran Rubric</span>
              </div>
              <p className="leading-relaxed text-[11px] text-stone-300">
                Auditing legislative discretion with deterministic 2-stage verification across Congress public laws.
              </p>
              <button
                onClick={() => setShowHelpModal(true)}
                className="text-[10px] text-[#E6AA4C] hover:underline flex items-center gap-1 font-medium pt-1"
              >
                <span>Read methodology rubric</span>
                <ExternalLink className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <Separator className="bg-white/10" />

      {/* Footer Navigation (Cost Tracking, Help, Profile) */}
      <div className="p-2.5 space-y-1">
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
            <CreditCard className="h-4 w-4 text-[#E6AA4C]" />
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
            <div className="h-7 w-7 rounded-full bg-[#E6AA4C] text-[#0B3B36] font-bold text-xs flex items-center justify-center shrink-0">
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
            className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl text-stone-800 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-stone-900 mb-1">Create Workspace</h3>
            <p className="text-xs text-stone-500 mb-4">
              Enter a unique workspace identifier for your research group or project.
            </p>
            <input
              type="text"
              placeholder="e.g. COLUMBIA_SIPA, BANKING_LAWS"
              className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3B36] mb-4 uppercase"
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
                className="bg-[#0B3B36] hover:bg-[#0B3B36]/90 text-white"
                onClick={handleCreateWorkspace}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Methodology & Help Modal */}
      <Dialog open={showHelpModal} onOpenChange={setShowHelpModal}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl border-stone-200 bg-white text-stone-900 p-6">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-6 w-6 rounded-lg bg-[#E6AA4C] text-[#0B3B36] flex items-center justify-center font-bold text-xs">
                §
              </span>
              <DialogTitle className="text-lg font-bold text-stone-900">
                Law Delegation & Discretion Methodology
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-stone-500">
              Empirical legislative coding framework formulated by Professor Sharyn O'Halloran.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-3 text-xs text-stone-700 leading-relaxed">
            <div className="rounded-xl bg-[#F6F2EC] p-3 border border-stone-200 space-y-1.5">
              <div className="font-bold text-[#0B3B36] text-xs">Academic Foundations</div>
              <p>
                Based on <em>Delegating Powers: A Law and Economics Approach to Politics, Regulation, and the Economy</em> (Epstein & O'Halloran). This platform automates the audit of statutory language to determine whether and how much discretion Congress delegates to executive agencies.
              </p>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-stone-900 text-xs uppercase tracking-wide">
                Key Coding Variables
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg border border-stone-200 bg-white">
                  <div className="font-bold text-stone-900 text-xs">delegate_law (0 or 1)</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    Binary indicator of whether Congress delegates regulatory, adjudicative, or rulemaking authority to an agency or department.
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-stone-200 bg-white">
                  <div className="font-bold text-stone-900 text-xs">discretion_rank (0 to 5)</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    Degrees of administrative leeway. A rank of 0 indicates no delegation; 1–2 denotes tight statutory constraints; 4–5 denotes broad discretionary authority.
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-stone-900 text-xs uppercase tracking-wide">
                Deterministic 2-Stage Pipeline
              </div>
              <p>
                To avoid hallucinated discretion scores and save API costs, the official pipeline uses deterministic branching:
              </p>
              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 font-mono text-[11px] text-stone-800">
                Statute Text → Node 1 (Delegation Detection) <br />
                &nbsp;&nbsp;├─ If delegate_law == 0 → Node 2A: Set discretion_rank = 0 (No LLM call) <br />
                &nbsp;&nbsp;└─ If delegate_law == 1 → Node 2B: Evaluate Discretion Rank (Scale 1–5)
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                size="sm"
                className="bg-[#0B3B36] hover:bg-[#0B3B36]/90 text-white"
                onClick={() => setShowHelpModal(false)}
              >
                Close Rubric
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
