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
    <aside className="flex h-full w-64 flex-col border-r bg-muted/30">
      {/* Workspace Selector */}
      <div className="p-3 pb-2 border-b border-muted/50">
        <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1">
          Active Workspace
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between font-semibold border-muted-foreground/20 hover:bg-muted px-2.5"
              >
                <span className="truncate">{activeWorkspace?.name ?? "Select Workspace"}</span>
                <span className="text-[10px] text-muted-foreground ml-1">▼</span>
              </Button>
            }
          />
          <DropdownMenuContent className="w-56" align="start">
            {workspaces.map((w) => (
              <DropdownMenuItem
                key={w.id}
                className={cn(activeWorkspace?.id === w.id && "bg-muted font-bold")}
                onClick={() => setActiveWorkspace(w)}
              >
                {w.name}
              </DropdownMenuItem>
            ))}
            <Separator className="my-1" />
            <DropdownMenuItem
              className="text-primary font-medium focus:text-primary cursor-pointer"
              onClick={() => setShowWorkspaceModal(true)}
            >
              + Create Workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="p-3">
        <Button onClick={handleNewThread} className="w-full" size="sm">
          + New chat
        </Button>
      </div>
      <Separator />

      {/* Inline Workspace Creation Modal */}
      {showWorkspaceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowWorkspaceModal(false)}>
          <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Create Workspace</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Enter a name for the new workspace. Files and search queries will be isolated within this workspace.
            </p>
            <input
              type="text"
              placeholder="e.g. TEST, MARKETING"
              className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mb-4 uppercase"
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
          variant={pathname.startsWith("/campaigns") ? "secondary" : "outline"}
          size="sm"
          className="w-full gap-2"
          onClick={() => navigate("/campaigns")}
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
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
          Research Campaigns
        </Button>

        <Button
          variant={pathname.startsWith("/dashboard") ? "secondary" : "outline"}
          size="sm"
          className="w-full gap-2"
          onClick={() => navigate("/dashboard")}
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
            <rect width="7" height="9" x="3" y="3" rx="1" />
            <rect width="7" height="5" x="14" y="3" rx="1" />
            <rect width="7" height="9" x="14" y="12" rx="1" />
            <rect width="7" height="5" x="3" y="16" rx="1" />
          </svg>
          Document Dashboard
        </Button>

        <Button
          variant={pathname.startsWith("/documents") ? "secondary" : "outline"}
          size="sm"
          className="w-full gap-2"
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
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
          </svg>
          Manage Documents
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
