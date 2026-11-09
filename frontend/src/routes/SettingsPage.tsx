import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, TrendingUp, Cpu, Coins, KeyRound, ShieldCheck, Users, UserPlus, Plus } from "lucide-react";
import { API_BASE_URL } from "@/constants";
import { useAuthContext } from "@/context/AuthContext";
import { HeaderBar } from "@/components/ui/HeaderBar";

interface UsageSummary {
  input_tokens: number;
  output_tokens: number;
  total_cost: number;
  total_calls: number;
}

interface UsageBreakdown {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  calls: number;
}

interface UsageTimeline {
  time_bucket: string;
  cost: number;
  calls: number;
}

interface UsageStatsResponse {
  summary: UsageSummary;
  breakdown: UsageBreakdown[];
  timeline: UsageTimeline[];
}

interface SavedProviderKey {
  provider: string;
  model: string;
  base_url: string;
  has_api_key: boolean;
}

interface LLMCredentialsSettings {
  provider: "openai" | "openrouter" | "gemini" | "anthropic";
  model: string;
  base_url: string;
  has_api_key: boolean;
  saved_keys?: SavedProviderKey[];
}

const DEFAULT_MODEL_BY_PROVIDER: Record<LLMCredentialsSettings["provider"], string> = {
  openai: "gpt-4o-mini",
  openrouter: "openai/gpt-4o-mini",
  gemini: "gemini-3.1-flash-lite-preview",
  anthropic: "claude-3-5-sonnet-latest",
};

export function SettingsPage() {
  const { session, user, activeWorkspace, linkGoogleAccount, inviteMember } = useAuthContext();
  const jwt = session?.access_token ?? "";

  const [timeframe, setTimeframe] = useState<"last_hour" | "last_day" | "last_7_days" | "all">("last_day");
  const [usageScope, setUsageScope] = useState<"personal" | "workspace" | "personal_in_workspace">("personal");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UsageStatsResponse | null>(null);
  const [credentialsLoading, setCredentialsLoading] = useState(true);
  const [credentials, setCredentials] = useState<LLMCredentialsSettings>({
    provider: "gemini",
    model: DEFAULT_MODEL_BY_PROVIDER.gemini,
    base_url: "",
    has_api_key: false,
  });

  const [keyPreference, setKeyPreference] = useState<string>("USE_PERSONAL_IF_AVAILABLE");
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [workspaceKeys, setWorkspaceKeys] = useState<any[]>([]);
  const [wsProviderInput, setWsProviderInput] = useState<Record<string, string>>({});
  const [verifyingWsProvider, setVerifyingWsProvider] = useState<Record<string, boolean>>({});

  const [googleEmailInput, setGoogleEmailInput] = useState("");
  const [providerKeysInput, setProviderKeysInput] = useState<Record<string, string>>({});
  const [verifyingProvider, setVerifyingProvider] = useState<Record<string, boolean>>({});

  const handleVerifyAndSaveProviderKey = async (providerId: string, apiKey: string) => {
    if (!apiKey.trim()) {
      toast.error(`Please enter an API key for ${providerId.toUpperCase()}`);
      return;
    }
    setVerifyingProvider((prev) => ({ ...prev, [providerId]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/llm-credentials/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          provider: providerId,
          api_key: apiKey.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `API Key test call failed for ${providerId.toUpperCase()}`);
      }
      toast.success(`API Key verified & safely encrypted in DB for ${providerId.toUpperCase()}! Loaded ${data.models.length} models.`);
      setProviderKeysInput((prev) => ({ ...prev, [providerId]: "" }));
      await fetchCredentials();
    } catch (err: any) {
      toast.error(err.message || `Test call failed for ${providerId}`);
    } finally {
      setVerifyingProvider((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleVerifyAndSaveWorkspaceKey = async (providerId: string, apiKey: string) => {
    if (!activeWorkspace?.id) return;
    if (!apiKey.trim()) {
      toast.error(`Please enter a Workspace API key for ${providerId.toUpperCase()}`);
      return;
    }
    setVerifyingWsProvider((prev) => ({ ...prev, [providerId]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/workspaces/${activeWorkspace.id}/llm-credentials/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          provider: providerId,
          api_key: apiKey.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Workspace API Key verification failed for ${providerId.toUpperCase()}`);
      toast.success(`Workspace API Key verified & saved for ${providerId.toUpperCase()} in ${activeWorkspace.name}!`);
      setWsProviderInput((prev) => ({ ...prev, [providerId]: "" }));
      await fetchWorkspaceKeys();
    } catch (err: any) {
      toast.error(err.message || "Failed to save workspace key");
    } finally {
      setVerifyingWsProvider((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const [linkingLoading, setLinkingLoading] = useState(false);
  const [inviteEmailInput, setInviteEmailInput] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  const handleLinkGoogle = async () => {
    if (!googleEmailInput.trim()) {
      toast.error("Please enter a Google email address");
      return;
    }
    setLinkingLoading(true);
    try {
      await linkGoogleAccount(googleEmailInput.trim());
      toast.success(`Linked ${user?.email} with Google account (${googleEmailInput.trim()})!`);
      setGoogleEmailInput("");
    } catch (err: any) {
      toast.error(err.message || "Failed to link Google account");
    } finally {
      setLinkingLoading(false);
    }
  };

  const handleInviteMember = async () => {
    if (!inviteEmailInput.trim()) {
      toast.error("Please enter an email to invite");
      return;
    }
    setInviteLoading(true);
    try {
      await inviteMember(inviteEmailInput.trim());
      toast.success(`Invitation sent to ${inviteEmailInput.trim()} for workspace ${activeWorkspace?.name}!`);
      setInviteEmailInput("");
    } catch (err: any) {
      toast.error(err.message || "Failed to send invitation");
    } finally {
      setInviteLoading(false);
    }
  };

  const fetchKeyPreference = async () => {
    if (!jwt) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/user/key-preference`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.preference) setKeyPreference(data.preference);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveKeyPreference = async (newPref: string) => {
    if (!jwt) return;
    setPreferenceSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/user/key-preference`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ preference: newPref }),
      });
      if (!res.ok) throw new Error("Failed to save preference");
      setKeyPreference(newPref);
      toast.success("LLM key scope preference updated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to update preference");
    } finally {
      setPreferenceSaving(false);
    }
  };

  const fetchWorkspaceKeys = async () => {
    if (!jwt || !activeWorkspace?.id) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/workspaces/${activeWorkspace.id}/llm-credentials`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const data = await res.json();
        setWorkspaceKeys(data.credentials || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStats = async () => {
    if (!jwt) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/usage/stats?timeframe=${timeframe}&scope=${usageScope}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) throw new Error("Failed to load statistics");
      const data = await res.json();
      setStats(data);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to load usage statistics");
    } finally {
      setLoading(false);
    }
  };

  const fetchCredentials = async () => {
    if (!jwt) return;
    setCredentialsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/llm-credentials`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) throw new Error("Failed to load LLM credentials");
      const data = await res.json();
      setCredentials(data);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to load LLM credentials");
    } finally {
      setCredentialsLoading(false);
    }
  };

  const handleDeleteKey = async (targetProvider: string) => {
    if (!window.confirm(`Are you sure you want to delete your saved ${targetProvider.toUpperCase()} API key?`)) {
      return;
    }
    if (!jwt) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/llm-credentials`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          provider: targetProvider,
          clear_api_key: true,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Failed to clear ${targetProvider} API key`);
      }
      const data = await res.json();
      setCredentials(data);
      toast.success(`${targetProvider.toUpperCase()} API key deleted successfully`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to delete API key");
    }
  };

  useEffect(() => {
    fetchStats();
  }, [jwt, timeframe, usageScope]);

  useEffect(() => {
    fetchCredentials();
    fetchKeyPreference();
    fetchWorkspaceKeys();
  }, [jwt, activeWorkspace?.id]);

  // Max value calculation for custom SVG/CSS charting
  const maxTimelineCost = stats?.timeline && stats.timeline.length > 0
    ? Math.max(...stats.timeline.map(t => t.cost))
    : 0;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <ThreadSidebar />
      
      <div className="flex-1 flex flex-col overflow-y-auto w-full">
        <HeaderBar title="Cost Tracking & BYOK Vault" description="Manage LLM provider credentials, token expenses, Google OAuth, and workspace permissions." />

        <div className="p-8 max-w-6xl mx-auto w-full space-y-6">
          {/* DARE-Style Hero Banner */}
          <div className="rounded-2xl bg-gradient-to-r from-primary via-primary/95 to-primary/85 text-primary-foreground p-6 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold uppercase tracking-wider">
                  Academic Routing
                </span>
                <span className="text-xs opacity-80 font-medium">
                  Workspace: <strong className="text-primary-foreground">{activeWorkspace?.name}</strong>
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <Coins className="h-6 w-6 text-accent" />
                Cost Tracking & BYOK Vault
              </h1>
              <p className="text-xs opacity-80 max-w-xl leading-relaxed">
                Bring Your Own Key (BYOK) architecture. Connect your own OpenRouter, OpenAI, Gemini, Anthropic, or LiteLLM proxy keys with AES-256-GCM encryption.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const target = document.getElementById("provider-credentials-section");
                  target?.scrollIntoView({ behavior: "smooth" });
                }}
                className="h-9 px-3.5 rounded-xl border-white/20 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold gap-1.5"
              >
                + LiteLLM Key
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const target = document.getElementById("provider-credentials-section");
                  target?.scrollIntoView({ behavior: "smooth" });
                }}
                className="h-9 px-4 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-bold gap-1.5 shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Add BYO Key
              </Button>
            </div>
          </div>

          {/* DARE-Style BYOK Architecture Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <KeyRound className="h-4 w-4 text-accent-plum" />
                  BYOK Cipher Vault
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/20 text-accent-foreground">
                  AES-256-GCM
                </span>
              </div>
              <div className="text-xs font-semibold text-foreground pt-1">Direct Provider Keys</div>
              <p className="text-[11px] text-muted-foreground">User credentials are encrypted at rest with Fernet/AES-256-GCM and resolved on-demand per request.</p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  LiteLLM Gateway
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Ready
                </span>
              </div>
              <div className="text-xs font-semibold text-foreground pt-1">Proxy Architecture</div>
              <p className="text-[11px] text-muted-foreground">Centralized lab proxy endpoint routing for OpenRouter, custom OpenAI-compatible proxies, or institutional clusters.</p>
            </div>
          </div>

          {/* Controls Bar for Scope & Timeframe */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
            <div className="flex gap-1 border border-border rounded-xl p-1 bg-muted/50 text-xs">
              <Button
                variant={usageScope === "personal" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setUsageScope("personal")}
                className="text-xs h-7 rounded-lg font-medium"
              >
                👤 My Usage
              </Button>
              <Button
                variant={usageScope === "workspace" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setUsageScope("workspace")}
                className="text-xs h-7 rounded-lg font-medium"
              >
                🏢 Workspace Usage
              </Button>
            </div>

            <div className="flex gap-1 border border-border rounded-xl p-1 bg-muted/50">
              {(["last_hour", "last_day", "last_7_days", "all"] as const).map((t) => (
                <Button
                  key={t}
                  variant={timeframe === t ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setTimeframe(t)}
                  className="text-xs h-7 rounded-lg capitalize font-medium"
                >
                  {t.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          </div>

          {/* Google Auth & Workspace Team Card (Admin Only) */}
          {user?.is_admin && (
            <Card className="p-6 bg-card border-border rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">Google Auth & Workspace Collaboration</h2>
                  <p className="text-xs text-muted-foreground">Link your account to Google and invite team members to your active workspace.</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6 pt-2">
                {/* Account Link Box */}
                <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                  <h3 className="text-xs font-bold text-foreground flex items-center gap-2 uppercase tracking-wider">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    Link Account ({user?.email})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Link your primary <code className="px-1.5 py-0.5 rounded bg-muted text-primary font-mono text-[11px] font-semibold">{user?.email}</code> account to your Google email address for one-click Google Sign-In.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      placeholder="e.g. yourname@gmail.com"
                      value={googleEmailInput}
                      onChange={(e) => setGoogleEmailInput(e.target.value)}
                      className="h-9 text-xs rounded-xl bg-background border-border"
                    />
                    <Button size="sm" onClick={handleLinkGoogle} disabled={linkingLoading} className="h-9 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap shadow-xs">
                      {linkingLoading ? "Linking..." : "Link Google Account"}
                    </Button>
                  </div>
                </div>

                {/* Invite Workspace Members Box */}
                <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                  <h3 className="text-xs font-bold text-foreground flex items-center gap-2 uppercase tracking-wider">
                    <UserPlus className="w-4 h-4 text-primary" />
                    Invite to {activeWorkspace?.name || "Workspace"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Invite teammates or additional Google accounts to join your active workspace <strong className="text-foreground">{activeWorkspace?.name}</strong>.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      placeholder="teammate@gmail.com"
                      value={inviteEmailInput}
                      onChange={(e) => setInviteEmailInput(e.target.value)}
                      className="h-9 text-xs rounded-xl bg-background border-border"
                    />
                    <Button size="sm" onClick={handleInviteMember} disabled={inviteLoading} className="h-9 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground whitespace-nowrap shadow-xs">
                      {inviteLoading ? "Sending..." : "Send Workspace Invite"}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center min-h-[400px]">
            <Loader2 className="animate-spin text-primary h-8 w-8" />
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Key Preference Mode Card */}
            <Card className="p-6 bg-card border-border rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground tracking-tight">
                    API Key Scope Preference & Overrides
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Choose whether the platform uses your personal API keys, shared workspace keys, or fallbacks.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {[
                  {
                    id: "USE_PERSONAL_IF_AVAILABLE",
                    title: "Personal Key Override (Recommended)",
                    desc: "Uses your personal API keys first. If not provided, falls back to workspace keys.",
                    badge: "Default"
                  },
                  {
                    id: "USE_WORKSPACE_ONLY",
                    title: "Workspace Keys Only",
                    desc: "Always uses the shared workspace API keys set by the Workspace Admin.",
                    badge: "Team"
                  },
                  {
                    id: "ALWAYS_PERSONAL",
                    title: "Always Personal Key",
                    desc: "Strictly requires your personal API key. Fails if your personal key is missing.",
                    badge: "Strict"
                  }
                ].map((item) => (
                  <button
                    key={item.id}
                    disabled={preferenceSaving}
                    onClick={() => handleSaveKeyPreference(item.id)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      keyPreference === item.id
                        ? "border-primary bg-primary/10 ring-1 ring-primary text-foreground"
                        : "border-border bg-muted/20 hover:border-border text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-foreground">{item.title}</span>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {item.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{item.desc}</p>
                  </button>
                ))}
              </div>
            </Card>

            {/* Workspace Shared Keys (Admin Only) */}
            {user?.is_admin && (
              <Card className="p-6 bg-card border-border rounded-2xl shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-foreground tracking-tight">
                        Workspace Shared API Keys ({activeWorkspace?.name || "Workspace"})
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Configure shared LLM API keys for all members in the active workspace.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {[
                    { id: "openai", name: "Workspace OpenAI Key", icon: "🤖" },
                    { id: "openrouter", name: "Workspace OpenRouter Key", icon: "🌐" },
                    { id: "gemini", name: "Workspace Gemini Key", icon: "✨" },
                    { id: "anthropic", name: "Workspace Anthropic Key", icon: "🧠" },
                  ].map((prov) => {
                    const savedWsKey = workspaceKeys.find((k: any) => k.provider === prov.id);
                    const isWsSaved = !!savedWsKey?.is_configured;
                    const wsInput = wsProviderInput[prov.id] || "";
                    const isWsTesting = verifyingWsProvider[prov.id] || false;

                    return (
                      <div key={prov.id} className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground flex items-center gap-2">
                            <span>{prov.icon}</span> {prov.name}
                          </span>
                          {isWsSaved ? (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              Configured ({savedWsKey.masked_key})
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                              Not Configured
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Input
                            type="password"
                            placeholder="Enter Workspace API Key..."
                            value={wsInput}
                            onChange={(e) => setWsProviderInput((prev) => ({ ...prev, [prov.id]: e.target.value }))}
                            className="h-8 text-xs rounded-xl bg-background border-border"
                          />
                          <Button
                            size="sm"
                            disabled={isWsTesting}
                            onClick={() => handleVerifyAndSaveWorkspaceKey(prov.id, wsInput)}
                            className="h-8 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground whitespace-nowrap"
                          >
                            {isWsTesting ? "Saving..." : "Save Key"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* DARE-Style Minimalist Provider Credentials & Key Verification */}
            <Card id="provider-credentials-section" className="p-6 border border-border bg-card rounded-2xl shadow-sm space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-primary" />
                    <h3 className="font-bold text-base text-foreground tracking-tight">
                      LLM Provider Credentials & Key Verification
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Bring your own keys. Each key is verified with a live test call and securely stored using AES-256-GCM encryption.
                  </p>
                </div>
              </div>

              {credentialsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="animate-spin text-primary h-6 w-6" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { id: "openai", name: "OpenAI API Key", defaultModel: "gpt-4o-mini", placeholder: "sk-proj-...", icon: "🤖" },
                    { id: "openrouter", name: "OpenRouter API Key", defaultModel: "openai/gpt-4o-mini", placeholder: "sk-or-v1-...", icon: "🌐" },
                    { id: "google", name: "Gemini API Key", defaultModel: "gemini-3.1-flash-lite-preview", placeholder: "AIzaSy...", icon: "✨" },
                    { id: "anthropic", name: "Anthropic API Key", defaultModel: "claude-3-5-sonnet-latest", placeholder: "sk-ant-...", icon: "🧠" },
                  ].map((provider) => {
                    const normProvName = provider.id === "google" ? "gemini" : provider.id;
                    const savedItem = credentials.saved_keys?.find((k) => k.provider === normProvName);
                    const isSaved = !!savedItem || (credentials.provider === normProvName && credentials.has_api_key);
                    const currentInput = providerKeysInput[provider.id] || "";
                    const isTesting = verifyingProvider[provider.id] || false;

                    return (
                      <div key={provider.id} className="p-4 rounded-xl border border-border bg-background space-y-3 shadow-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm p-1 rounded-lg bg-muted text-foreground">{provider.icon}</span>
                            <div>
                              <h4 className="text-xs font-bold text-foreground uppercase tracking-wide">{provider.name}</h4>
                              <p className="text-[10px] text-muted-foreground font-mono">Default: {savedItem?.model || provider.defaultModel}</p>
                            </div>
                          </div>
                          {isSaved ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              Verified & Saved
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                              Not Configured
                            </span>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Input
                            type="password"
                            placeholder={isSaved ? "•••••••••••••••••••• (Encrypted in DB)" : provider.placeholder}
                            value={currentInput}
                            onChange={(e) => setProviderKeysInput((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                            className="h-8 text-xs rounded-lg bg-card border-border font-mono"
                          />
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <Button
                              type="button"
                              size="sm"
                              disabled={isTesting || !currentInput.trim()}
                              onClick={() => handleVerifyAndSaveProviderKey(provider.id, currentInput)}
                              className="h-7 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
                            >
                              {isTesting ? "Testing Call..." : "Test & Save"}
                            </Button>
                            {isSaved && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteKey(normProvName)}
                                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg px-2"
                              >
                                Delete Key
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Stat Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-5 flex flex-col justify-between border-border bg-card shadow-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs uppercase font-bold tracking-wider">Total Cost</span>
                  <Coins className="h-4 w-4 text-accent" />
                </div>
                <div className="mt-4">
                  <span className="text-3xl font-black text-primary font-mono">
                    ${stats?.summary.total_cost.toFixed(5)}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-1">Exact token usage pricing</p>
                </div>
              </Card>

              <Card className="p-5 flex flex-col justify-between border-border bg-card shadow-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs uppercase font-bold tracking-wider">API Invocations</span>
                  <Cpu className="h-4 w-4 text-primary" />
                </div>
                <div className="mt-4">
                  <span className="text-3xl font-black text-foreground">
                    {stats?.summary.total_calls}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-1">Completed LLM runs</p>
                </div>
              </Card>

              <Card className="p-5 flex flex-col justify-between border-border bg-card shadow-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs uppercase font-bold tracking-wider">Prompt Tokens</span>
                  <TrendingUp className="h-4 w-4 text-accent-plum" />
                </div>
                <div className="mt-4">
                  <span className="text-2xl font-extrabold text-foreground">
                    {stats?.summary.input_tokens.toLocaleString()}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-1">Total tokens read</p>
                </div>
              </Card>

              <Card className="p-5 flex flex-col justify-between border-border bg-card shadow-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs uppercase font-bold tracking-wider">Completion Tokens</span>
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="mt-4">
                  <span className="text-2xl font-extrabold text-foreground">
                    {stats?.summary.output_tokens.toLocaleString()}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-1">Total tokens generated</p>
                </div>
              </Card>
            </div>

            {/* Custom SVG/CSS Bar Chart for Cost Trends */}
            <Card className="p-6 border-border bg-card shadow-xs">
              <h3 className="font-bold text-sm text-foreground uppercase tracking-wide mb-6">
                Cost Trends over Time
              </h3>
              {(!stats?.timeline || stats.timeline.length === 0) ? (
                <div className="text-center py-12 text-muted-foreground text-xs">
                  No LLM usage records logged within this timeframe.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-end justify-between gap-2 h-48 border-b border-border pb-2 pt-4">
                    {stats.timeline.map((item, idx) => {
                      const pct = maxTimelineCost > 0 ? (item.cost / maxTimelineCost) * 100 : 0;
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                          <div 
                            style={{ height: `${Math.max(pct, 4)}%` }}
                            className="w-full max-w-[24px] bg-gradient-to-t from-primary to-primary/70 rounded-t-md hover:from-primary/90 hover:to-primary transition-all cursor-pointer"
                          />
                          {/* Tooltip */}
                          <div className="absolute bottom-full mb-1 hidden group-hover:block bg-popover text-popover-foreground text-[10px] p-2 rounded shadow border border-border whitespace-nowrap z-20">
                            <p className="font-semibold">${item.cost.toFixed(5)}</p>
                            <p className="text-muted-foreground">{item.calls} invocations</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* X axis labels */}
                  <div className="flex justify-between text-[9px] text-muted-foreground px-1 uppercase tracking-wider font-semibold">
                    <span>{stats.timeline[0]?.time_bucket}</span>
                    <span>{stats.timeline[stats.timeline.length - 1]?.time_bucket}</span>
                  </div>
                </div>
              )}
            </Card>

            {/* Models/Providers Breakdown Table */}
            <Card className="p-6 border-border bg-card shadow-xs space-y-6">
              <div>
                <h3 className="font-bold text-sm text-foreground uppercase tracking-wide">
                  Model & Provider Breakdown
                </h3>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Track historical usage costs across LLM providers and models.
                </p>
              </div>

              {/* Divider */}
              <div className="border-t border-border pt-6">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Usage & Metrics
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground uppercase font-bold tracking-wider">
                        <th className="pb-3 pr-4">Provider</th>
                        <th className="pb-3 pr-4">Model Name</th>
                        <th className="pb-3 pr-4 text-right">Runs</th>
                        <th className="pb-3 pr-4 text-right">Input Tokens</th>
                        <th className="pb-3 pr-4 text-right">Output Tokens</th>
                        <th className="pb-3 text-right">Estimated Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!stats?.breakdown || stats.breakdown.length === 0) ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-muted-foreground text-xs">
                            No model metrics recorded yet.
                          </td>
                        </tr>
                      ) : (
                        stats.breakdown.map((row, index) => (
                          <tr key={index} className="border-b border-border last:border-0 hover:bg-muted/30">
                            <td className="py-3 pr-4 font-bold text-primary capitalize">{row.provider}</td>
                            <td className="py-3 pr-4 font-mono font-medium text-foreground">{row.model}</td>
                            <td className="py-3 pr-4 text-right font-semibold">{row.calls}</td>
                            <td className="py-3 pr-4 text-right text-muted-foreground">{row.input_tokens.toLocaleString()}</td>
                            <td className="py-3 pr-4 text-right text-muted-foreground">{row.output_tokens.toLocaleString()}</td>
                            <td className="py-3 text-right font-black text-emerald-600 dark:text-emerald-400 font-mono">${row.cost.toFixed(5)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  </div>
);
}
