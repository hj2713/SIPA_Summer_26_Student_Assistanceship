import { useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { toast } from "sonner";
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
import { useThreads } from "@/hooks/useThreads";
import { useAuthContext } from "@/context/AuthContext";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { Thread } from "@/types/thread";
import { cn } from "@/lib/utils";

export function ThreadSidebar() {
  const { id: activeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { signOut, workspaces, activeWorkspace, setActiveWorkspace, createWorkspace } = useAuthContext();
  const { threads, loading, createThread, deleteThread, renameThread } = useThreads();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

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

  const handleDelete = async (thread: Thread) => {
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

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border/50 bg-card/40 backdrop-blur-md">
      {/* Workspace & Theme Header */}
      <div className="p-3 border-b border-border/50 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
            Active Workspace
          </label>
          <ThemeToggle />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between font-semibold border-border/60 hover:bg-muted/80 px-2.5 h-9 rounded-xl text-xs"
              >
                <span className="truncate flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {activeWorkspace?.name ?? "Select Workspace"}
                </span>
                <span className="text-[10px] text-muted-foreground ml-1">▼</span>
              </Button>
            }
          />
          <DropdownMenuContent className="w-56 rounded-xl" align="start">
            {workspaces.filter(w => w.id !== "QA" && w.id !== "TEST").map((w) => (
              <DropdownMenuItem
                key={w.id}
                className={cn(
                  "rounded-lg cursor-pointer text-xs font-medium",
                  activeWorkspace?.id === w.id && "bg-primary/10 text-primary font-bold"
                )}
                onClick={() => setActiveWorkspace(w)}
              >
                {w.name}
              </DropdownMenuItem>
            ))}
            <Separator className="my-1" />
            <DropdownMenuItem
              className="text-primary font-semibold text-xs cursor-pointer focus:text-primary"
              onClick={() => setShowWorkspaceModal(true)}
            >
              + Create Workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="p-3">
        <Button onClick={handleNewThread} className="w-full h-9 rounded-xl font-semibold text-xs gap-1.5 shadow-sm" size="sm">
          + New Chat
        </Button>
      </div>
      <Separator className="opacity-50" />

      {/* Inline Workspace Creation Modal */}
      {showWorkspaceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setShowWorkspaceModal(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border/80 bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-foreground mb-1">Create Workspace</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Enter a unique workspace identifier (e.g., LEGAL, FINANCE).
            </p>
            <input
              type="text"
              placeholder="e.g. LEGAL, MARKETING"
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary mb-4 uppercase"
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
              <Button size="sm" onClick={handleCreateWorkspace}>
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-2">
          {loading && (
            <>
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </>
          )}
          {threads.map((thread) => (
            <div
              key={thread.id}
              className={cn(
                "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-muted cursor-pointer",
                activeId === thread.id && "bg-muted font-medium"
              )}
              onClick={() => navigate(`/chat/${thread.id}`)}
            >
              {renamingId === thread.id ? (
                <input
                  className="flex-1 bg-transparent text-sm outline-none"
                  value={renameValue}
                  autoFocus
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenameValue(e.target.value)}
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    />
                  }
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  ⋯
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleRenameStart(thread)}>
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => void handleDelete(thread)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </ScrollArea>
      <Separator />
      <div className="p-3 space-y-2">
        {(pathname.startsWith("/documents") || pathname.startsWith("/dashboard") || pathname.startsWith("/campaigns") || pathname.startsWith("/workflows")) ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => navigate("/chat")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
            </svg>
            Back to Chat
          </Button>
        ) : null}

        <Button
          variant={pathname.startsWith("/workflows") ? "secondary" : "outline"}
          size="sm"
          className="w-full gap-2"
          onClick={() => navigate("/workflows")}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="5" r="2" /><circle cx="18" cy="12" r="2" /><circle cx="6" cy="19" r="2" /><path d="M8 5h3a4 4 0 0 1 4 4v1" /><path d="M8 19h3a4 4 0 0 0 4-4v-1" />
          </svg>
          Coding Workflows
        </Button>

        <Button
          variant={(pathname.startsWith("/campaigns") || pathname.startsWith("/evaluation")) ? "secondary" : "outline"}
          size="sm"
          className="w-full gap-2 font-medium text-xs"
          onClick={() => navigate("/campaigns")}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
            <line x1="18" y1="20" x2="18" y2="14" />
          </svg>
          Campaigns & Model Evaluation
        </Button>

        <Button
          variant={(pathname.startsWith("/documents") || pathname.startsWith("/dashboard")) ? "secondary" : "outline"}
          size="sm"
          className="w-full gap-2 font-medium text-xs"
          onClick={() => navigate("/documents")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <line x1="10" y1="9" x2="8" y2="9"/>
          </svg>
          Documents & Dashboards
        </Button>

        <Button
          variant={pathname.startsWith("/settings") ? "secondary" : "outline"}
          size="sm"
          className="w-full gap-2"
          onClick={() => navigate("/settings")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Usage & Settings
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground hover:text-destructive"
          onClick={() => void signOut()}
        >
          Sign out
        </Button>
      </div>
    </aside>
  );
}
