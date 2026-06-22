import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { useAuthContext } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { API_BASE_URL } from "@/constants";
import { Trash2, Plus, Play, Sparkles, BookOpen, Layers, AlertTriangle, X, Upload } from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";


interface Campaign {
  id: string;
  name: string;
  description: string;
  prompt: string;
  schema: any[];
  created_at: string;
}

export function DashboardListPage() {
  const { session, user } = useAuthContext();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [columnsList, setColumnsList] = useState<{ name: string; type: string; description: string; options_raw?: string; prompt?: string; depends_on_raw?: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [deleteCampaignId, setDeleteCampaignId] = useState<string | null>(null);


  const fetchCampaigns = async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      const data = await res.json();
      setCampaigns(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load research campaigns");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCampaigns();
  }, [session]);

  const handleCsvColumnImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const lines = text.split(/\r?\n/);
      if (lines.length > 0 && lines[0].trim()) {
        const headers = lines[0]
          .split(",")
          .map(h => h.trim().replace(/^["']|["']$/g, ""))
          .filter(h => h.length > 0);
        
        const newCols = headers.map(h => ({
          name: h,
          type: "string",
          description: ""
        }));
        
        setColumnsList(prev => [...prev, ...newCols]);
        toast.success(`Imported ${newCols.length} columns from ${file.name}`);
      } else {
        toast.error("CSV file is empty or invalid.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) {
      toast.error("Name and Prompt/Codebook are required.");
      return;
    }

    // Validate column names
    for (const col of columnsList) {
      if (!col.name.trim()) {
        toast.error("Column names cannot be blank.");
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(col.name.trim())) {
        toast.error(`Column name "${col.name}" is invalid. Use alphanumeric characters and underscores only.`);
        return;
      }
    }

    setCreating(true);
    toast.info("Analyzing system prompt and generating variable schema...", { duration: 4000 });
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          prompt: prompt.trim(),
          user_columns: columnsList.length > 0 ? columnsList.map(c => ({
            name: c.name.trim(),
            type: c.type,
            description: c.description.trim() || undefined,
            options: c.options_raw ? c.options_raw.split(",").map(o => o.trim()).filter(Boolean) : null,
            prompt: c.prompt?.trim() || undefined,
            depends_on: c.depends_on_raw ? c.depends_on_raw.split(",").map(o => o.trim()).filter(Boolean) : []
          })) : null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to create campaign");
      }

      const newCampaign = await res.json();
      toast.success("Campaign created successfully!");
      setShowCreateModal(false);
      setName("");
      setPrompt("");
      setColumnsList([]);
      
      // Redirect to campaign detail page
      navigate(`/campaigns/${newCampaign.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create campaign");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCampaignClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteCampaignId(id);
  };

  const executeDeleteCampaign = async () => {
    if (!deleteCampaignId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboards/${deleteCampaignId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to delete campaign");
      toast.success("Campaign deleted");
      setCampaigns((prev) => prev.filter((c) => c.id !== deleteCampaignId));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete campaign");
    } finally {
      setDeleteCampaignId(null);
    }
  };


  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setPrompt(event.target.result as string);
        toast.success(`Loaded prompt from ${file.name}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <ThreadSidebar />

      <main className="flex-1 flex flex-col h-full overflow-y-auto p-8 max-w-7xl mx-auto w-full">
        {/* Header Section */}
        <div className="flex justify-between items-center mb-8 border-b pb-6 border-border/40">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Research Campaigns
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Define codebooks, extract variables from document sets, and manage structured policy analysis datasets.
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="gap-2 shadow-sm">
            <Plus size={16} /> Create Campaign
          </Button>
        </div>

        {/* Campaign Grid List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-48 rounded-xl border bg-muted/20 animate-pulse" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted/50 rounded-2xl p-16 text-center max-w-2xl mx-auto my-12 bg-muted/5">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
              <Layers size={28} />
            </div>
            <h3 className="text-lg font-bold">No research campaigns yet</h3>
            <p className="text-muted-foreground text-sm max-w-sm mt-2 mb-6">
              Create your first campaign to define a research codebook and extract structured variables from legal and policy documents.
            </p>
            <Button onClick={() => setShowCreateModal(true)} className="gap-2">
              <Plus size={16} /> Create Campaign
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
            {campaigns.map((c) => (
              <Card 
                key={c.id} 
                className="group relative border border-border/50 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden flex flex-col justify-between"
                onClick={() => navigate(`/campaigns/${c.id}`)}
              >
                <div className="p-6">
                  <div className="flex justify-between items-start gap-4 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <BookOpen size={20} />
                    </div>
                    {(user?.is_admin || user?.can_delete) && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8 rounded-md"
                        onClick={(e) => handleDeleteCampaignClick(c.id, e)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    )}
                  </div>
                  
                  <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors">
                    {c.name}
                  </CardTitle>
                  <CardDescription className="text-muted-foreground line-clamp-3 text-xs mt-2 leading-relaxed">
                    {c.description}
                  </CardDescription>
                </div>

                <div className="border-t border-border/30 bg-muted/10 px-6 py-4 flex justify-between items-center text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Layers size={13} className={c.schema?.length ? "text-primary/70" : "text-amber-500"} />
                    {c.schema?.length || 0} columns defined
                    {(!c.schema || c.schema.length === 0) && (
                      <span className="ml-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                        Schema extraction failed — retry inside
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 text-primary font-bold group-hover:underline">
                    Analyze <Play size={10} className="fill-primary" />
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Create Campaign Modal */}
        <Dialog open={showCreateModal} onOpenChange={(open) => !creating && setShowCreateModal(open)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="text-primary animate-pulse" size={20} />
                New Research Campaign
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreateCampaign} className="space-y-5 mt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Campaign Name
                </label>
                <Input
                  required
                  placeholder="e.g. Agency Discretion Coding"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={creating}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    System Prompt / Codebook
                  </label>
                  <label className="text-xs text-primary font-medium hover:underline cursor-pointer">
                    Upload .md/.txt File
                    <input
                      type="file"
                      accept=".txt,.md"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={creating}
                    />
                  </label>
                </div>
                <Textarea
                  required
                  rows={8}
                  placeholder="Paste research rules, scoring rubrics, or coding instructions here. The AI will analyze this to generate a dataset schema."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={creating}
                  className="font-mono text-sm leading-relaxed max-h-72 overflow-y-auto"
                />
              </div>

              <div className="space-y-3 border-t pt-4">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                      Predefined Dataset Columns (Optional)
                    </label>
                    <p className="text-[10px] text-muted-foreground leading-normal mt-0.5">
                      Import columns from a CSV file header or add them manually to guide the LLM's classification.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <label className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-7 px-2.5 cursor-pointer gap-1 shadow-sm">
                      <Upload size={12} /> Import CSV
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleCsvColumnImport}
                        className="hidden"
                        disabled={creating}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setColumnsList(prev => [...prev, { name: "", type: "string", description: "", prompt: "", depends_on_raw: "" }])}
                      className="h-7 text-xs gap-1"
                      disabled={creating}
                    >
                      <Plus size={12} /> Add Column
                    </Button>
                  </div>
                </div>

                {columnsList.length > 0 && (
                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                    {columnsList.map((col, idx) => (
                      <div key={idx} className="p-3 border rounded-lg bg-card/50 space-y-2 relative">
                        <div className="flex justify-between items-center border-b pb-1.5 border-border/40">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Column #{idx + 1}</span>
                          <div className="flex items-center gap-2">
                            {!col.description.trim() && (
                              <span className="flex items-center gap-1 text-[9px] text-amber-500 font-semibold bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded animate-pulse">
                                <AlertTriangle size={10} /> Missing Description
                              </span>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setColumnsList(prev => prev.filter((_, i) => i !== idx))}
                              className="h-5 w-5 hover:bg-destructive/15 text-destructive rounded"
                            >
                              <X size={12} />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase">Column Name</label>
                            <Input
                              value={col.name}
                              onChange={(e) => setColumnsList(prev => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                              placeholder="e.g. discretion_score"
                              className="mt-0.5 text-xs h-7"
                              required
                            />
                          </div>
                          <div className="col-span-1">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase">Type</label>
                            <select
                              value={col.type}
                              onChange={(e) => setColumnsList(prev => prev.map((c, i) => i === idx ? { ...c, type: e.target.value } : c))}
                              className="w-full bg-background border border-input rounded mt-0.5 px-2 h-7 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              <option value="string">String</option>
                              <option value="number">Number</option>
                              <option value="boolean">Boolean</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-muted-foreground uppercase">
                            Description / LLM Criteria
                          </label>
                          <textarea
                            value={col.description}
                            onChange={(e) => setColumnsList(prev => prev.map((c, i) => i === idx ? { ...c, description: e.target.value } : c))}
                            placeholder="Explain exactly how the LLM should evaluate and score this variable..."
                            className="w-full bg-background border border-input rounded mt-0.5 p-1.5 text-xs min-h-[40px] focus:outline-none focus:ring-1 focus:ring-primary font-sans leading-normal"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] font-bold text-muted-foreground uppercase">
                              Column Prompt / Rubric
                            </label>
                            <textarea
                              value={col.prompt || ""}
                              onChange={(e) => setColumnsList(prev => prev.map((c, i) => i === idx ? { ...c, prompt: e.target.value } : c))}
                              placeholder="Optional prompt used specifically for this column..."
                              className="w-full bg-background border border-input rounded mt-0.5 p-1.5 text-xs min-h-[48px] focus:outline-none focus:ring-1 focus:ring-primary font-sans leading-normal"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-muted-foreground uppercase">
                              Depends On
                            </label>
                            <Input
                              value={col.depends_on_raw || ""}
                              onChange={(e) => setColumnsList(prev => prev.map((c, i) => i === idx ? { ...c, depends_on_raw: e.target.value } : c))}
                              placeholder="Comma separated, e.g. law_delegation"
                              className="mt-0.5 text-xs h-7"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={creating} className="gap-2">
                  {creating ? (
                    <>
                      <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    "Create Campaign"
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <ConfirmationDialog
          open={deleteCampaignId !== null}
          onOpenChange={(open) => !open && setDeleteCampaignId(null)}
          title="Delete Research Campaign"
          description="Are you sure you want to delete this research campaign? All associated classifications and grid data will be lost."
          onConfirm={executeDeleteCampaign}
          confirmText="Delete"
          variant="destructive"
        />
      </main>
    </div>
  );
}
