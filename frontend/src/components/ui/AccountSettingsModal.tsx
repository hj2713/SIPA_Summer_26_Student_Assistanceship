import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  User as UserIcon,
  Mail,
  Lock,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/constants";
import { useAuthContext } from "@/context/AuthContext";

interface AccountSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AccountProfile {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  can_add: boolean;
  can_delete: boolean;
  has_password: boolean;
  auth_method: string;
  created_at?: string;
}

export function AccountSettingsModal({ open, onOpenChange }: AccountSettingsModalProps) {
  const { session, user } = useAuthContext();
  const jwt = session?.access_token || "";

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);

  // Form states for password accounts
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isGoogleAccount =
    profile?.auth_method === "google" ||
    profile?.has_password === false ||
    (user?.email && user.email.toLowerCase() !== "test@test.com");

  // Fetch account details whenever modal opens
  useEffect(() => {
    if (!open || !jwt) return;

    let isMounted = true;
    setLoading(true);
    setErrorMessage(null);

    fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Auth-Provider": isGoogleAccount ? "google" : "",
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load profile (HTTP ${res.status})`);
        }
        return res.json();
      })
      .then((data: AccountProfile) => {
        if (!isMounted) return;
        setProfile(data);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Error fetching account profile:", err);
        setErrorMessage(err.message || "Failed to load account profile");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, jwt]);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!newPassword) {
      toast.info("No password changes entered.");
      onOpenChange(false);
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("New passwords do not match.");
      return;
    }
    if (profile?.has_password && !currentPassword) {
      setErrorMessage("Please enter your current password to set a new password.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/account`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || body.message || "Failed to update password");
      }

      toast.success("Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onOpenChange(false);
    } catch (err: any) {
      console.error("Password update error:", err);
      setErrorMessage(err.message || "Failed to save password changes.");
    } finally {
      setSaving(false);
    }
  };

  const displayName = profile?.name || (user?.email ? user.email.split("@")[0].replace(".", " ").toUpperCase() : "User");
  const userInitials = (user?.email || "TE").slice(0, 2).toUpperCase();
  const effectiveEmail = profile?.email || user?.email || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-lg md:max-w-lg rounded-2xl p-6 bg-card border-border shadow-xl overflow-hidden">
        <DialogHeader className="space-y-1 pb-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-sm shadow-xs uppercase shrink-0">
              {userInitials}
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Account Settings
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Your personal research identity and authentication profile.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Fetching account details...</span>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Profile Overview Card */}
            <div className="rounded-xl border border-border/80 bg-background/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <UserIcon className="h-3.5 w-3.5 text-primary" />
                  Account Identity
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <CheckCircle2 className="h-3 w-3" />
                  Active
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground block">Display Name</span>
                  <span className="font-semibold text-foreground block truncate">{displayName}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground block">Authentication</span>
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    {isGoogleAccount ? (
                      <>
                        <Sparkles className="h-3 w-3 text-accent" /> Google OAuth
                      </>
                    ) : (
                      <>
                        <KeyRound className="h-3 w-3 text-primary" /> Password Credentials
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Linked Email Address (Immutable / Read-only) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-primary" />
                Primary Account Email
              </label>
              <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/30 px-3.5 py-2.5">
                <span className="text-xs font-medium text-foreground select-all">{effectiveEmail}</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-background px-2 py-0.5 rounded-md border border-border/60">
                  <Lock className="h-3 w-3" />
                  Verified Identity
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground block">
                Your authenticated account email is permanent and cannot be altered.
              </span>
            </div>

            {/* Google OAuth State */}
            {isGoogleAccount ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.29v3.15C3.26 21.3 7.31 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.29C.47 8.21 0 10.05 0 12s.47 3.79 1.29 5.42l3.99-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.58l3.99 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                    <span className="text-xs font-bold text-foreground">Signed in via Google</span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3" />
                    Connected
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Your identity is secured and authenticated through Google Workspace / OAuth. Passwords, two-factor authentication, and single sign-on security are managed directly by Google.
                </p>
              </div>
            ) : (
              /* Password Management (Only for local test credentials like test@test.com) */
              <form onSubmit={handlePasswordUpdate} className="space-y-3 border-t border-border/60 pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-primary" />
                    Change Password
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    Developer credentials only
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-foreground block">Current Password</span>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password..."
                    className="h-8.5 text-xs rounded-xl bg-background border-border"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-foreground block">New Password</span>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 6 characters..."
                      className="h-8.5 text-xs rounded-xl bg-background border-border"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-foreground block">Confirm Password</span>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-type new password..."
                      className="h-8.5 text-xs rounded-xl bg-background border-border"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={saving}
                    className="h-8 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shadow-xs"
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    <span>Update Password</span>
                  </Button>
                </div>
              </form>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-end pt-2 border-t border-border/60">
              <Button
                type="button"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-8 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-5 shadow-xs"
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
