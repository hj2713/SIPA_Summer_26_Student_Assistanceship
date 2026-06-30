import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, TrendingUp, Cpu, Coins, KeyRound, Save, ShieldCheck } from "lucide-react";
import { API_BASE_URL } from "@/constants";
import { useAuthContext } from "@/context/AuthContext";

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

interface LLMCredentialsSettings {
  provider: "openai" | "openrouter" | "gemini" | "anthropic";
  model: string;
  base_url: string;
  has_api_key: boolean;
}

const DEFAULT_MODEL_BY_PROVIDER: Record<LLMCredentialsSettings["provider"], string> = {
  openai: "gpt-4o-mini",
  openrouter: "openai/gpt-4o-mini",
  gemini: "gemini-3.1-flash-lite-preview",
  anthropic: "claude-3-5-sonnet-latest",
};

const UI_PROVIDER_DEFAULTS = {
  google: { provider: "gemini", model: "gemini-3.1-flash-lite-preview", base_url: "" },
  anthropic: { provider: "anthropic", model: "claude-3-5-sonnet-latest", base_url: "" },
  openai: { provider: "openai", model: "gpt-4o-mini", base_url: "" },
  openrouter: { provider: "openrouter", model: "openai/gpt-4o-mini", base_url: "https://openrouter.ai/api/v1" },
  deepseek: { provider: "openrouter", model: "deepseek/deepseek-chat", base_url: "https://openrouter.ai/api/v1" },
  kimi: { provider: "openrouter", model: "moonshotai/kimi-latest", base_url: "https://openrouter.ai/api/v1" },
} as const;

export function SettingsPage() {
  const { session } = useAuthContext();
  const jwt = session?.access_token ?? "";

  const [timeframe, setTimeframe] = useState<"last_hour" | "last_day" | "last_7_days" | "all">("last_day");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UsageStatsResponse | null>(null);
  const [credentialsLoading, setCredentialsLoading] = useState(true);
  const [credentialsSaving, setCredentialsSaving] = useState(false);
  const [credentials, setCredentials] = useState<LLMCredentialsSettings>({
    provider: "gemini",
    model: DEFAULT_MODEL_BY_PROVIDER.gemini,
    base_url: "",
    has_api_key: false,
  });
  const [apiKeyInput, setApiKeyInput] = useState("");

  const [uiProvider, setUiProvider] = useState<"google" | "anthropic" | "openai" | "openrouter" | "deepseek" | "kimi">("google");
  const [verifiedModels, setVerifiedModels] = useState<string[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [useCustomModelInput, setUseCustomModelInput] = useState(false);

  const fetchStats = async () => {
    if (!jwt) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/usage/stats?timeframe=${timeframe}`, {
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
      setApiKeyInput("");

      // Map backend provider/model to UI option
      if (data.provider === "gemini") {
        setUiProvider("google");
      } else if (data.provider === "anthropic") {
        setUiProvider("anthropic");
      } else if (data.provider === "openai") {
        setUiProvider("openai");
      } else if (data.provider === "openrouter") {
        if (data.model.includes("deepseek")) {
          setUiProvider("deepseek");
        } else if (data.model.includes("kimi") || data.model.includes("moonshot")) {
          setUiProvider("kimi");
        } else {
          setUiProvider("openrouter");
        }
      }
      setVerifiedModels([]);
      setUseCustomModelInput(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to load LLM credentials");
    } finally {
      setCredentialsLoading(false);
    }
  };

  const handleUiProviderChange = (newUiProvider: "google" | "anthropic" | "openai" | "openrouter" | "deepseek" | "kimi") => {
    setUiProvider(newUiProvider);
    const defaults = UI_PROVIDER_DEFAULTS[newUiProvider];
    setCredentials(prev => ({
      ...prev,
      provider: defaults.provider as any,
      model: defaults.model,
      base_url: defaults.base_url,
    }));
    setVerifiedModels([]);
    setUseCustomModelInput(false);
  };

  const handleVerifyKey = async () => {
    if (!jwt) return;
    if (!apiKeyInput.trim()) {
      toast.error("Please enter an API Key to verify.");
      return;
    }
    setIsVerifying(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/llm-credentials/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          provider: uiProvider,
          api_key: apiKeyInput.trim(),
          base_url: uiProvider === "openai" ? (credentials.base_url || null) : null
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Key verification failed.");
      }
      setVerifiedModels(data.models);
      if (data.models.length > 0) {
        if (!data.models.includes(credentials.model)) {
          setCredentials(prev => ({ ...prev, model: data.models[0] }));
        }
        toast.success(`Key verified! Loaded ${data.models.length} models.`);
      } else {
        toast.success("Key verified successfully!");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to verify API key.");
    } finally {
      setIsVerifying(false);
    }
  };

  const saveCredentials = async () => {
    if (!jwt) return;
    setCredentialsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/llm-credentials`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          provider: credentials.provider,
          model: credentials.model,
          base_url: credentials.base_url,
          api_key: apiKeyInput.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to save LLM credentials");
      }
      const data = await res.json();
      setCredentials(data);
      setApiKeyInput("");
      toast.success("LLM settings saved");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to save LLM credentials");
    } finally {
      setCredentialsSaving(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [jwt, timeframe]);

  useEffect(() => {
    fetchCredentials();
  }, [jwt]);

  // Max value calculation for custom SVG/CSS charting
  const maxTimelineCost = stats?.timeline && stats.timeline.length > 0
    ? Math.max(...stats.timeline.map(t => t.cost))
    : 0;

  return (
    <div className="flex h-screen bg-background">
      <ThreadSidebar />
      
      <div className="flex-1 flex flex-col overflow-y-auto p-8 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-8 border-b pb-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              Usage & Settings
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Track token counts, billing costs, and model configuration options.
            </p>
          </div>

          <div className="flex gap-1.5 border rounded-lg p-1 bg-muted/40">
            {(["last_hour", "last_day", "last_7_days", "all"] as const).map((t) => (
              <Button
                key={t}
                variant={timeframe === t ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setTimeframe(t)}
                className="text-xs capitalize h-8 px-3"
              >
                {t === "all" ? "Lifetime" : t.replace("_", " ")}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center min-h-[400px]">
            <Loader2 className="animate-spin text-primary h-8 w-8" />
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-300">
            <Card className="p-6">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-emerald-600" />
                    <h3 className="font-bold text-sm text-foreground uppercase tracking-wide">
                      LLM Credentials
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Saved per user and encrypted on the backend.
                  </p>
                </div>
                {credentials.has_api_key && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <ShieldCheck className="h-4 w-4" />
                    Key saved
                  </div>
                )}
              </div>

              {credentialsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="animate-spin text-primary h-5 w-5" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Provider
                    <select
                      value={uiProvider}
                      onChange={(event) => {
                        const val = event.target.value as any;
                        handleUiProviderChange(val);
                      }}
                      className="h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="google">Google Gemini</option>
                      <option value="anthropic">Anthropic / Claude</option>
                      <option value="openai">OpenAI</option>
                      <option value="deepseek">Deepseek (via OpenRouter)</option>
                      <option value="kimi">Kimi (via OpenRouter)</option>
                      <option value="openrouter">OpenRouter (Custom / General)</option>
                    </select>
                  </label>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">
                      Default Model
                    </label>
                    {verifiedModels.length > 0 && !useCustomModelInput ? (
                      <div className="flex gap-2">
                        <select
                          value={credentials.model}
                          onChange={(event) => setCredentials((prev) => ({ ...prev, model: event.target.value }))}
                          className="h-8 flex-1 rounded-lg border border-input bg-background px-2.5 py-1 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {verifiedModels.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setUseCustomModelInput(true)}
                          className="text-[10px] uppercase font-bold"
                        >
                          Custom
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          value={credentials.model}
                          onChange={(event) => setCredentials((prev) => ({ ...prev, model: event.target.value }))}
                          placeholder={DEFAULT_MODEL_BY_PROVIDER[credentials.provider]}
                          className="flex-1"
                        />
                        {verifiedModels.length > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setUseCustomModelInput(false)}
                            className="text-[10px] uppercase font-bold"
                          >
                            List
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">
                      API Key
                    </label>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        value={apiKeyInput}
                        onChange={(event) => setApiKeyInput(event.target.value)}
                        placeholder={credentials.has_api_key ? "Leave blank to keep existing key" : "Paste your provider API key"}
                        autoComplete="off"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleVerifyKey}
                        disabled={isVerifying || !apiKeyInput.trim()}
                        className="gap-1.5 shrink-0"
                      >
                        {isVerifying && <Loader2 className="h-3 w-3 animate-spin" />}
                        Verify & Load Models
                      </Button>
                    </div>
                  </div>

                  {(uiProvider === "openai" || uiProvider === "openrouter") && (
                    <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:col-span-2">
                      Base URL
                      <Input
                        value={credentials.base_url}
                        onChange={(event) => setCredentials((prev) => ({ ...prev, base_url: event.target.value }))}
                        placeholder={uiProvider === "openrouter" ? "https://openrouter.ai/api/v1" : "Optional OpenAI-compatible endpoint"}
                      />
                    </label>
                  )}

                  <div className="md:col-span-2 flex justify-end">
                    <Button
                      type="button"
                      onClick={saveCredentials}
                      disabled={credentialsSaving}
                      className="gap-2"
                    >
                      {credentialsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Settings
                    </Button>
                  </div>
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
            <Card className="p-6">
              <h3 className="font-bold text-sm text-foreground uppercase tracking-wide mb-6">
                Model & Provider Breakdown
              </h3>
              
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
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
