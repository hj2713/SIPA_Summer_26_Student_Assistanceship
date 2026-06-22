import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpenCheck, GitBranch, Layers3, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useAuthContext } from "@/context/AuthContext";
import { workflowApi } from "@/lib/workflowApi";
import type { CodingWorkflow } from "@/types/workflow";

export function WorkflowLibraryPage() {
  const navigate = useNavigate();
  const { session, activeWorkspace } = useAuthContext();
  const jwt = session?.access_token || "";
  const workspaceId = activeWorkspace?.id || "TEST";
  const [workflows, setWorkflows] = useState<CodingWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState("delegation_discretion");
  const [deleteTarget, setDeleteTarget] = useState<CodingWorkflow | null>(null);

  useEffect(() => {
    if (!jwt) return;
    let active = true;
    workflowApi.list(jwt, workspaceId)
      .then((items) => { if (active) setWorkflows(items); })
      .catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Failed to load coding workflows"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [jwt, workspaceId]);

  const createWorkflow = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const workflow = await workflowApi.create({ name: name.trim(), description: description.trim(), template }, jwt, workspaceId);
      toast.success("Workflow draft created");
      setShowCreate(false);
      navigate(`/workflows/${workflow.id}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to create workflow"); }
    finally { setCreating(false); }
  };

  const deleteWorkflow = async () => {
    if (!deleteTarget) return;
    try { await workflowApi.remove(deleteTarget.id, jwt, workspaceId); setWorkflows((current) => current.filter((item) => item.id !== deleteTarget.id)); setDeleteTarget(null); toast.success("Workflow deleted"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Failed to delete workflow"); }
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <ThreadSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-8">
          <header className="mb-8 flex items-start justify-between gap-6">
            <div><div className="mb-2 flex items-center gap-2 text-primary"><GitBranch size={22} /><span className="text-xs font-bold uppercase tracking-[0.18em]">Research method library</span></div><h1 className="text-3xl font-bold tracking-tight">Coding Workflows</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Build a research method once, publish an immutable version, and later reuse it across campaigns without redefining prompts, dependencies, or deterministic rules.</p></div>
            <Button size="lg" onClick={() => setShowCreate(true)}><Plus size={16} /> New workflow</Button>
          </header>

          <div className="mb-7 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border bg-card p-4"><BookOpenCheck className="mb-3 text-violet-600" size={20} /><p className="text-sm font-semibold">Versioned research instrument</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Published versions are immutable and auditable.</p></div>
            <div className="rounded-xl border bg-card p-4"><GitBranch className="mb-3 text-amber-600" size={20} /><p className="text-sm font-semibold">Deterministic + AI logic</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Conditions can skip unnecessary LLM calls and set exact values.</p></div>
            <div className="rounded-xl border bg-card p-4"><Layers3 className="mb-3 text-cyan-600" size={20} /><p className="text-sm font-semibold">Multiple typed outputs</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">One analysis stage can produce actors, evidence, labels, and scores.</p></div>
          </div>

          {loading ? <div className="py-20 text-center text-sm text-muted-foreground">Loading workflows…</div> : workflows.length === 0 ? (
            <div className="rounded-2xl border border-dashed py-20 text-center"><Sparkles className="mx-auto mb-4 text-muted-foreground" size={30} /><h2 className="font-semibold">Create your first reusable coding method</h2><p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">Start from the delegation and discretion template to see LLM extraction, deterministic branching, validation, and dashboard outputs together.</p><Button className="mt-5" onClick={() => setShowCreate(true)}><Plus size={14} /> Create workflow</Button></div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{workflows.map((workflow) => {
              const kinds = new Set(workflow.definition.nodes.map((node) => node.kind));
              return <Card key={workflow.id} className="cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md" onClick={() => navigate(`/workflows/${workflow.id}`)}><CardHeader className="border-b"><div className="flex items-start justify-between gap-2"><div><CardTitle>{workflow.name}</CardTitle><CardDescription className="mt-1 line-clamp-2 min-h-10 text-xs">{workflow.description || "No description yet."}</CardDescription></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${workflow.status === "published" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>{workflow.status}</span></div></CardHeader><CardContent><div className="flex flex-wrap gap-1.5">{Array.from(kinds).map((kind) => <span key={kind} className="rounded bg-muted px-2 py-1 text-[9px] font-medium uppercase text-muted-foreground">{kind.replace("_", " ")}</span>)}</div><div className="mt-4 flex items-center justify-between border-t pt-3 text-[10px] text-muted-foreground"><span>{workflow.definition.nodes.length} nodes · v{workflow.latest_version || "draft"}</span><Button variant="ghost" size="icon-xs" onClick={(event) => { event.stopPropagation(); setDeleteTarget(workflow); }}><Trash2 className="text-destructive" size={12} /></Button></div></CardContent></Card>;
            })}</div>
          )}
        </div>
      </main>

      <Dialog open={showCreate} onOpenChange={setShowCreate}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Create coding workflow</DialogTitle></DialogHeader><form className="space-y-5" onSubmit={createWorkflow}><div><label className="text-xs font-bold uppercase text-muted-foreground">Workflow name</label><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Delegation and discretion coding" className="mt-1" required /></div><div><label className="text-xs font-bold uppercase text-muted-foreground">Description</label><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What research method does this workflow implement?" rows={3} className="mt-1 w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></div><div><label className="text-xs font-bold uppercase text-muted-foreground">Starting template</label><div className="mt-2 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setTemplate("delegation_discretion")} className={`rounded-xl border p-4 text-left ${template === "delegation_discretion" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/40"}`}><GitBranch className="mb-2 text-primary" size={18} /><p className="text-xs font-semibold">Delegation + discretion</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Prebuilt conditional research flow.</p></button><button type="button" onClick={() => setTemplate("blank")} className={`rounded-xl border p-4 text-left ${template === "blank" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/40"}`}><Plus className="mb-2 text-primary" size={18} /><p className="text-xs font-semibold">Blank workflow</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Start from input and output.</p></button></div></div><div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button><Button type="submit" disabled={creating}>{creating ? "Creating…" : "Create draft"}</Button></div></form></DialogContent></Dialog>
      <ConfirmationDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete coding workflow" description={`Delete “${deleteTarget?.name || "this workflow"}”? Its published versions will also be removed. Existing campaigns are unaffected because workflow adoption is not enabled yet.`} confirmText="Delete workflow" variant="destructive" onConfirm={deleteWorkflow} />
    </div>
  );
}
