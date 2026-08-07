import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, TrendingUp, Cpu, Coins, KeyRound, ShieldCheck, Users, UserPlus } from "lucide-react";
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
    <div className="flex h-screen bg-background">
      <ThreadSidebar />
      
      <div className="flex-1 flex flex-col overflow-y-auto w-full">
        <HeaderBar title="Usage & Settings" description="Manage Google Auth linking, team workspace invitations, and LLM credentials." />

        <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
          {/* Header Controls */}
          <div className="flex justify-between items-center border-b pb-4 border-border/50">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                Platform Overview
              </h1>
              <p className="text-muted-foreground text-xs mt-0.5">
                Workspace: <strong className="text-foreground">{activeWorkspace?.name}</strong> • User: <strong className="text-foreground">{user?.email}</strong>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="flex gap-1 border border-border/60 rounded-xl p-1 bg-muted/40 text-xs">
                <Button
                  variant={usageScope === "personal" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setUsageScope("personal")}
                  className="text-xs h-7 rounded-lg"
                >
                  👤 My Personal Usage
                </Button>
                <Button
                  variant={usageScope === "workspace" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setUsageScope("workspace")}
                  className="text-xs h-7 rounded-lg"
                >
                  🏢 Workspace Team Usage
                </Button>
                <Button
                  variant={usageScope === "personal_in_workspace" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setUsageScope("personal_in_workspace")}
                  className="text-xs h-7 rounded-lg"
                >
                  🎯 My Usage in {activeWorkspace?.name || "Workspace"}
                </Button>
              </div>

              <div className="flex gap-1 border border-border/60 rounded-xl p-1 bg-muted/40">
                {(["last_hour", "last_day", "last_7_days", "all"] as const).map((t) => (
                  <Button
                    key={t}
                    variant={timeframe === t ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setTimeframe(t)}
                    className="text-xs h-7 rounded-lg"
                  >
                    {t.replace(/_/g, " ")}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Google Auth & Workspace Team Card (Admin Only) */}
          {user?.is_admin && (
            <Card className="p-6 glass-panel border-border/60 rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">Google Auth & Workspace Collaboration</h2>
                  <p className="text-xs text-muted-foreground">Link your account to Google and invite team members to your active workspace.</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6 pt-2">
                {/* Account Link Box */}
                <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-3">
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
                      className="h-9 text-xs rounded-xl bg-background border-border/80"
                    />
                    <Button size="sm" onClick={handleLinkGoogle} disabled={linkingLoading} className="h-9 text-xs font-semibold rounded-xl whitespace-nowrap shadow-sm">
                      {linkingLoading ? "Linking..." : "Link Google Account"}
                    </Button>
                  </div>
                </div>

                {/* Invite Workspace Members Box */}
                <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-3">
                  <h3 className="text-xs font-bold text-foreground flex items-center gap-2 uppercase tracking-wider">
                    <UserPlus className="w-4 h-4 text-indigo-500" />
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
                      className="h-9 text-xs rounded-xl bg-background border-border/80"
                    />
                    <Button size="sm" onClick={handleInviteMember} disabled={inviteLoading} className="h-9 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white whitespace-nowrap shadow-sm">
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
            <Card className="p-6 glass-panel border-border/60 rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-500 border border-violet-500/20">
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
                        ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500"
                        : "border-border/60 bg-muted/20 hover:border-border"
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
              <Card className="p-6 glass-panel border-border/60 rounded-2xl shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
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
                      <div key={prov.id} className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground flex items-center gap-2">
                            <span>{prov.icon}</span> {prov.name}
                          </span>
                          {isWsSaved ? (
                            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
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
                            className="h-8 text-xs rounded-xl bg-background border-border/80"
                          />
                          <Button
                            size="sm"
                            disabled={isWsTesting}
                            onClick={() => handleVerifyAndSaveWorkspaceKey(prov.id, wsInput)}
                            className="h-8 text-xs font-semibold rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white whitespace-nowrap"
                          >
                            {isWsTesting ? "Saving..." : "Save Workspace Key"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <Card className="p-6 glass-panel border-border/60 rounded-2xl shadow-sm space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-indigo-500" />
                    <h3 className="font-bold text-base text-foreground tracking-tight">
                      LLM Provider Credentials & Key Verification
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter API keys for your preferred LLM providers. Each key is tested with a live test call and securely encrypted in the database.
                  </p>
                </div>
              </div>

              {credentialsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="animate-spin text-primary h-6 w-6" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    { id: "openai", name: "OpenAI API Key", defaultModel: "gpt-4o-mini", placeholder: "sk-proj-...", icon: "🤖", color: "border-emerald-500/30 text-emerald-500 bg-emerald-500/10" },
                    { id: "openrouter", name: "OpenRouter API Key", defaultModel: "openai/gpt-4o-mini", placeholder: "sk-or-v1-...", icon: "🌐", color: "border-cyan-500/30 text-cyan-500 bg-cyan-500/10" },
                    { id: "google", name: "Gemini API Key", defaultModel: "gemini-3.1-flash-lite-preview", placeholder: "AIzaSy...", icon: "✨", color: "border-blue-500/30 text-blue-500 bg-blue-500/10" },
                    { id: "anthropic", name: "Anthropic API Key", defaultModel: "claude-3-5-sonnet-latest", placeholder: "sk-ant-...", icon: "🧠", color: "border-amber-500/30 text-amber-500 bg-amber-500/10" },
                  ].map((provider) => {
                    const normProvName = provider.id === "google" ? "gemini" : provider.id;
                    const savedItem = credentials.saved_keys?.find((k) => k.provider === normProvName);
                    const isSaved = !!savedItem || (credentials.provider === normProvName && credentials.has_api_key);
                    const currentInput = providerKeysInput[provider.id] || "";
                    const isTesting = verifyingProvider[provider.id] || false;

                    return (
                      <div key={provider.id} className="p-5 rounded-2xl border border-border/60 bg-muted/20 space-y-4 shadow-sm hover:border-border transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className={`text-base p-1.5 rounded-xl border ${provider.color}`}>{provider.icon}</span>
                            <div>
                              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">{provider.name}</h4>
                              <p className="text-[10px] text-muted-foreground">Default: {savedItem?.model || provider.defaultModel}</p>
                            </div>
                          </div>
                          {isSaved ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              Verified & Saved
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border/60">
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
                            className="h-9 text-xs rounded-xl bg-background border-border/80"
                          />
                          <div className="flex items-center justify-between gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={isTesting || !currentInput.trim()}
                              onClick={() => handleVerifyAndSaveProviderKey(provider.id, currentInput)}
                              className="h-8 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-95 shadow-sm"
                            >
                              {isTesting ? "Testing API Call..." : "Test & Save API Key"}
                            </Button>
                            {isSaved && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteKey(normProvName)}
                                className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl"
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
              <Card className="p-5 flex flex-col justify-between border-violet-500/20 bg-violet-500/5 hover:border-violet-500/30 transition-all">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs uppercase font-bold tracking-wider">Total Cost</span>
                  <Coins className="h-4 w-4 text-violet-500" />
                </div>
                <div className="mt-4">
                  <span className="text-3xl font-black text-violet-700 dark:text-violet-400">
                    ${stats?.summary.total_cost.toFixed(5)}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-1">Local pricing matrix estimate</p>
                </div>
              </Card>

              <Card className="p-5 flex flex-col justify-between border-indigo-500/20 bg-indigo-500/5 hover:border-indigo-500/30 transition-all">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs uppercase font-bold tracking-wider">API Invocations</span>
                  <Cpu className="h-4 w-4 text-indigo-500" />
                </div>
                <div className="mt-4">
                  <span className="text-3xl font-black text-indigo-700 dark:text-indigo-400">
                    {stats?.summary.total_calls}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-1">Completed LLM runs</p>
                </div>
              </Card>

              <Card className="p-5 flex flex-col justify-between border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/30 transition-all">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs uppercase font-bold tracking-wider">Prompt Tokens</span>
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="mt-4">
                  <span className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400">
                    {stats?.summary.input_tokens.toLocaleString()}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-1">Total tokens read</p>
                </div>
              </Card>

              <Card className="p-5 flex flex-col justify-between border-amber-500/20 bg-amber-500/5 hover:border-amber-500/30 transition-all">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs uppercase font-bold tracking-wider">Completion Tokens</span>
                  <TrendingUp className="h-4 w-4 text-amber-500" />
                </div>
                <div className="mt-4">
                  <span className="text-2xl font-extrabold text-amber-700 dark:text-amber-400">
                    {stats?.summary.output_tokens.toLocaleString()}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-1">Total tokens generated</p>
                </div>
              </Card>
            </div>

            {/* Custom SVG/CSS Bar Chart for Cost Trends */}
            <Card className="p-6">
              <h3 className="font-bold text-sm text-foreground uppercase tracking-wide mb-6">
                Cost Trends over Time
              </h3>
              {(!stats?.timeline || stats.timeline.length === 0) ? (
                <div className="text-center py-12 text-muted-foreground text-xs">
                  No LLM usage records logged within this timeframe.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-end justify-between gap-2 h-48 border-b pb-2 pt-4">
                    {stats.timeline.map((item, idx) => {
                      const pct = maxTimelineCost > 0 ? (item.cost / maxTimelineCost) * 100 : 0;
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                          <div 
                            style={{ height: `${Math.max(pct, 4)}%` }}
                            className="w-full max-w-[24px] bg-gradient-to-t from-indigo-500 to-violet-500 rounded-t-md hover:from-indigo-600 hover:to-violet-600 transition-all cursor-pointer"
                          />
                          {/* Tooltip */}
                          <div className="absolute bottom-full mb-1 hidden group-hover:block bg-popover text-popover-foreground text-[10px] p-2 rounded shadow border whitespace-nowrap z-20">
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
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="font-bold text-sm text-foreground uppercase tracking-wide">
                  Model & Provider Breakdown
                </h3>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Manage saved provider keys and track historical usage costs.
                </p>
              </div>



              {/* Divider */}
              <div className="border-t pt-6">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Usage & Metrics
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground uppercase font-bold tracking-wider">
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
                          <tr key={index} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-3 pr-4 font-bold text-indigo-600 capitalize">{row.provider}</td>
                            <td className="py-3 pr-4 font-mono font-medium text-foreground">{row.model}</td>
                            <td className="py-3 pr-4 text-right font-semibold">{row.calls}</td>
                            <td className="py-3 pr-4 text-right text-muted-foreground">{row.input_tokens.toLocaleString()}</td>
                            <td className="py-3 pr-4 text-right text-muted-foreground">{row.output_tokens.toLocaleString()}</td>
                            <td className="py-3 text-right font-black text-emerald-600">${row.cost.toFixed(5)}</td>
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
