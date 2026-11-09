import { useState, useEffect } from "react";
import {
  Users,
  Mail,
  Copy,
  Check,
  Trash2,
  UserCheck,
  Clock,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthContext } from "@/context/AuthContext";

export interface WorkspaceMember {
  id: string;
  email: string;
  is_admin: boolean;
  can_add: boolean;
  can_delete: boolean;
  role: string;
  status: "Active" | "Invited";
}

interface ShareWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMemberChange?: () => void;
}

export function ShareWorkspaceModal({
  isOpen,
  onClose,
  onMemberChange,
}: ShareWorkspaceModalProps) {
  const { session, user, activeWorkspace } = useAuthContext();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [inviting, setInviting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const workspaceId = activeWorkspace?.id || "";
  const workspaceName = activeWorkspace?.name || workspaceId;
  const jwt = session?.access_token || "";

  // Base URL for shareable invite link
  const originUrl = typeof window !== "undefined" ? window.location.origin : "";
  const genericInviteUrl = `${originUrl}/login?workspace=${encodeURIComponent(workspaceId)}`;

  const fetchMembers = async () => {
    if (!workspaceId || !jwt) return;
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/auth/workspaces/${encodeURIComponent(workspaceId)}/members`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) {
        throw new Error("Failed to load workspace members");
      }
      const data = await res.json();
      setMembers(data);
    } catch (err: any) {
      console.error("Error loading members:", err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const fetchPendingInvites = async () => {
    if (!jwt) return;
    try {
      const res = await fetch("/api/auth/invitations/pending", {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPendingInvites(data);
      }
    } catch {}
  };

  useEffect(() => {
    if (isOpen && workspaceId && jwt) {
      fetchMembers();
      fetchPendingInvites();
      setLastInviteLink(null);
    }
  }, [isOpen, workspaceId, jwt]);

  const handleAcceptInvite = async (wsId: string) => {
    try {
      const res = await fetch(`/api/auth/workspaces/${encodeURIComponent(wsId)}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        toast.success("Joined workspace!");
        fetchPendingInvites();
        onMemberChange?.();
      }
    } catch {
      toast.error("Failed to accept invitation");
    }
  };

  const handleDeclineInvite = async (wsId: string) => {
    try {
      const res = await fetch(`/api/auth/workspaces/${encodeURIComponent(wsId)}/decline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        toast.info("Invitation declined");
        fetchPendingInvites();
      }
    } catch {
      toast.error("Failed to decline invitation");
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailToInvite = inviteEmail.trim().toLowerCase();
    if (!emailToInvite) {
      toast.error("Please enter a valid email address");
      return;
    }

    setInviting(true);
    try {
      const res = await fetch(`/api/auth/workspaces/${encodeURIComponent(workspaceId)}/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          email: emailToInvite,
          role: inviteRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.message || "Failed to send invitation");
      }

      if (data.invite_link) {
        setLastInviteLink(data.invite_link);
      }

      if (data.email_sent) {
        toast.success(`Invitation email sent to ${emailToInvite}`);
      } else {
        toast.success(`Added ${emailToInvite} to workspace! Copy the invite link to share.`);
      }

      setInviteEmail("");
      fetchMembers();
      onMemberChange?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to invite collaborator");
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (emailToRemove: string) => {
    if (!confirm(`Are you sure you want to remove ${emailToRemove} from this workspace?`)) {
      return;
    }

    try {
      const res = await fetch(
        `/api/auth/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(emailToRemove)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${jwt}` },
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.message || "Failed to remove member");
      }

      toast.success(`Removed ${emailToRemove} from workspace`);
      fetchMembers();
      onMemberChange?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member");
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(true);
      toast.success("Invite link copied to clipboard!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl p-0 overflow-hidden rounded-2xl bg-card border-border shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-border/60 bg-muted/30">
          <DialogHeader className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Users className="h-4 w-4" />
              </div>
              <DialogTitle className="text-base font-bold text-foreground">
                Share Workspace & Workflows
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Invite collaborators to <span className="font-semibold text-foreground">{workspaceName}</span>.
              Members can view, create, and audit workflows, empirical campaigns, and statute documents together.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Pending Invitations for Current User (if any) */}
          {pendingInvites.length > 0 && (
            <div className="p-4 rounded-xl border border-accent/40 bg-accent/10 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-accent-foreground">
                <Clock className="h-4 w-4 text-accent" />
                <span>Pending Workspace Invitations for You ({pendingInvites.length})</span>
              </div>
              <div className="space-y-2">
                {pendingInvites.map((inv) => (
                  <div
                    key={inv.workspace_id}
                    className="p-3 rounded-lg border border-border/80 bg-background flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-foreground">
                        {inv.workspace_name || inv.workspace_id}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Invited as <span className="capitalize font-medium">{inv.role}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => handleAcceptInvite(inv.workspace_id)}
                        className="h-7 px-3 text-xs bg-primary text-primary-foreground font-semibold"
                      >
                        Accept
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeclineInvite(inv.workspace_id)}
                        className="h-7 px-2.5 text-xs text-muted-foreground hover:text-destructive"
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 1: Invite by Email Form */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-primary" />
              Invite Collaborator by Email
            </label>
            <form onSubmit={handleSendInvite} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Input
                  type="email"
                  placeholder="colleague@university.edu"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="text-xs h-9 bg-background border-border text-foreground pr-8"
                  disabled={inviting}
                />
              </div>

              {/* Role Select */}
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
                className="h-9 px-3 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                disabled={inviting}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>

              <Button
                type="submit"
                size="sm"
                disabled={inviting || !inviteEmail.trim()}
                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shrink-0 gap-1.5"
              >
                <Mail className="h-3.5 w-3.5" />
                {inviting ? "Inviting…" : "Invite"}
              </Button>
            </form>
          </div>

          {/* Section 2: 1-Click Shareable Link */}
          <div className="p-4 rounded-xl border border-border/80 bg-background space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                Direct Workspace Invite Link
              </span>
              <span className="text-[10px] text-muted-foreground">
                Zero configuration required
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Anyone with this link can sign in and will automatically have access to this workspace and its shared workflows.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-[11px] text-muted-foreground font-mono truncate select-all">
                {lastInviteLink || genericInviteUrl}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(lastInviteLink || genericInviteUrl)}
                className="h-8 px-3 rounded-lg border-border text-xs gap-1.5 shrink-0"
              >
                {copiedLink ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Link
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Section 3: Collaborators List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-primary" />
                Workspace Collaborators ({members.length})
              </h4>
              <span className="text-[11px] text-muted-foreground">
                {members.filter((m) => m.status === "Active").length} active ·{" "}
                {members.filter((m) => m.status === "Invited").length} pending
              </span>
            </div>

            {loadingMembers ? (
              <div className="py-8 text-center text-xs text-muted-foreground border border-border rounded-xl">
                Loading collaborators…
              </div>
            ) : members.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                No collaborators added yet.
              </div>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden divide-y divide-border/60 bg-background">
                {members.map((member) => {
                  const isCurrent = member.email.toLowerCase() === user?.email?.toLowerCase();
                  const isOwner = member.role.toLowerCase() === "owner";
                  return (
                    <div
                      key={member.email}
                      className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Avatar Pill */}
                        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-[11px] shrink-0">
                          {member.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground truncate">
                              {member.email}
                            </span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.2 rounded bg-muted text-[10px] text-muted-foreground font-medium">
                                you
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            {member.status === "Active" ? (
                              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                <UserCheck className="h-3 w-3" /> Active
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                                <Clock className="h-3 w-3" /> Pending Acceptance
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isOwner
                              ? "bg-primary/10 text-primary border border-primary/20"
                              : member.role.toLowerCase() === "admin"
                              ? "bg-accent/20 text-accent-foreground border border-accent/30"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {member.role}
                        </span>

                        {!isOwner && !isCurrent && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveMember(member.email)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                            title="Remove collaborator"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/60 bg-muted/20 flex items-center justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs h-8 px-4 rounded-lg"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
