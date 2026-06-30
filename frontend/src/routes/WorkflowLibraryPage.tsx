import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpenCheck, Copy, Download, GitBranch, Layers3, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useAuthContext } from "@/context/AuthContext";
import { workflowApi } from "@/lib/workflowApi";
import type { CodingWorkflow, WorkflowTemplate } from "@/types/workflow";

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function WorkflowLibraryPage() {
  const navigate = useNavigate();
  const { session, activeWorkspace } = useAuthContext();
  const jwt = session?.access_token || "";
  const workspaceId = activeWorkspace?.id || "TEST";
  const [workflows, setWorkflows] = useState<CodingWorkflow[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [importJson, setImportJson] = useState("");
  const [deleteWorkflowTarget, setDeleteWorkflowTarget] = useState<CodingWorkflow | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<WorkflowTemplate | null>(null);

  useEffect(() => {
    if (!jwt) return;
    let active = true;
    Promise.all([workflowApi.list(jwt, workspaceId), workflowApi.listTemplates(jwt, workspaceId)])
      .then(([workflowItems, templateItems]) => {
        if (!active) return;
        setWorkflows(workflowItems);
        setTemplates(templateItems);
        setTemplateId((current) => current || templateItems[0]?.id || "");
      })
      .catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Failed to load coding workflows"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [jwt, workspaceId]);

  const createWorkflow = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !templateId) return;
    setCreating(true);
    try {
      const workflow = await workflowApi.create({ name: name.trim(), description: description.trim(), template_id: templateId }, jwt, workspaceId);
      toast.success("Workflow draft created");
      setShowCreate(false);
      navigate(`/workflows/${workflow.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create workflow");
    } finally {
      setCreating(false);
    }
  };

  const deleteWorkflow = async () => {
    if (!deleteWorkflowTarget) return;
    try {
      await workflowApi.remove(deleteWorkflowTarget.id, jwt, workspaceId);
      setWorkflows((current) => current.filter((item) => item.id !== deleteWorkflowTarget.id));
      setDeleteWorkflowTarget(null);
      toast.success("Workflow deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete workflow");
    }
  };

  const deleteTemplate = async () => {
    if (!deleteTemplateTarget) return;
    try {
      await workflowApi.removeTemplate(deleteTemplateTarget.id, jwt, workspaceId);
      setTemplates((current) => current.filter((item) => item.id !== deleteTemplateTarget.id));
      setDeleteTemplateTarget(null);
      toast.success("Template deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete template");
    }
  };

  const duplicateTemplate = async (template: WorkflowTemplate) => {
    try {
      const copy = await workflowApi.duplicateTemplate(template.id, jwt, workspaceId);
      setTemplates((current) => [copy, ...current]);
      toast.success("Template duplicated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to duplicate template");
    }
  };

  const exportTemplate = async (template: WorkflowTemplate) => {
    try {
      const fullTemplate = await workflowApi.exportTemplate(template.id, jwt, workspaceId);
      downloadJson(`${template.slug || template.id}.workflow-template.json`, fullTemplate);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export template");
    }
  };

  const importTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    setImporting(true);
    try {
      const parsed = JSON.parse(importJson);
      const template = await workflowApi.importTemplate({
        name: parsed.name || "Imported Workflow Template",
        description: parsed.description || "",
        category: parsed.category || "Imported",
        definition: parsed.definition || parsed,
      }, jwt, workspaceId);
      setTemplates((current) => [template, ...current]);
      setImportJson("");
      setShowImport(false);
      toast.success("Template imported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import template JSON");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <ThreadSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-8">
          <header className="mb-8 flex items-start justify-between gap-6">
            <div>
              <div className="mb-2 flex items-center gap-2 text-primary"><GitBranch size={22} /><span className="text-xs font-bold uppercase tracking-[0.18em]">Research method library</span></div>
              <h1 className="text-3xl font-bold tracking-tight">Coding Workflows</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Build and test DB-managed research workflows without redeploying for prompt, branch, or output changes.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="lg" onClick={() => setShowImport(true)}><Upload size={16} /> Import template</Button>
              <Button size="lg" onClick={() => setShowCreate(true)}><Plus size={16} /> New workflow</Button>
            </div>
          </header>

          <div className="mb-7 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border bg-card p-4"><BookOpenCheck className="mb-3 text-violet-600" size={20} /><p className="text-sm font-semibold">DB-managed templates</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Workflow definitions can be edited, imported, exported, and reused from the database.</p></div>
            <div className="rounded-xl border bg-card p-4"><GitBranch className="mb-3 text-amber-600" size={20} /><p className="text-sm font-semibold">Deterministic + AI logic</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Conditions can skip unnecessary LLM calls and set exact values.</p></div>
            <div className="rounded-xl border bg-card p-4"><Layers3 className="mb-3 text-cyan-600" size={20} /><p className="text-sm font-semibold">Immutable published versions</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Drafts can change freely; published workflow versions stay auditable.</p></div>
          </div>

          <section className="mb-10">
            <div className="mb-3 flex items-center justify-between">
              <div><h2 className="text-lg font-bold">Workflow Templates</h2><p className="text-xs text-muted-foreground">These are reusable DB records. Creating a workflow copies template JSON into an editable draft.</p></div>
            </div>
            {loading ? <div className="rounded-xl border py-10 text-center text-sm text-muted-foreground">Loading templates…</div> : templates.length === 0 ? (
              <div className="rounded-xl border border-dashed py-10 text-center text-xs text-muted-foreground">No templates found. Import a JSON template or reload to seed defaults.</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {templates.map((template) => (
                  <Card 
                    key={template.id}
                    className="cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md"
                    onClick={() => navigate(`/workflows/${template.id}?type=template`)}
                  >
                    <CardHeader className="border-b">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle>{template.name}</CardTitle>
                          <CardDescription className="mt-1 line-clamp-2 min-h-10 text-xs">{template.description || "No description yet."}</CardDescription>
                        </div>
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-bold uppercase text-primary">{template.category}</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(new Set(template.definition.nodes.map((node) => node.kind))).map((kind) => <span key={kind} className="rounded bg-muted px-2 py-1 text-[9px] font-medium uppercase text-muted-foreground">{kind.replace("_", " ")}</span>)}
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t pt-3 text-[10px] text-muted-foreground">
                        <span>{template.definition.nodes.length} nodes · rev {template.revision}</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon-xs" title="Export JSON" onClick={(e) => { e.stopPropagation(); void exportTemplate(template); }}><Download size={12} /></Button>
                          <Button variant="ghost" size="icon-xs" title="Duplicate" onClick={(e) => { e.stopPropagation(); void duplicateTemplate(template); }}><Copy size={12} /></Button>
                          <Button variant="ghost" size="icon-xs" title="Delete" onClick={(e) => { e.stopPropagation(); setDeleteTemplateTarget(template); }}><Trash2 className="text-destructive" size={12} /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold">Workflow Drafts</h2>
            {loading ? <div className="py-20 text-center text-sm text-muted-foreground">Loading workflows…</div> : workflows.length === 0 ? (
              <div className="rounded-2xl border border-dashed py-20 text-center"><Sparkles className="mx-auto mb-4 text-muted-foreground" size={30} /><h2 className="font-semibold">Create your first reusable coding method</h2><p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">Start from a DB template, then edit and test the copied draft freely.</p><Button className="mt-5" onClick={() => setShowCreate(true)}><Plus size={14} /> Create workflow</Button></div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{workflows.map((workflow) => {
                const kinds = new Set(workflow.definition.nodes.map((node) => node.kind));
                return <Card key={workflow.id} className="cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md" onClick={() => navigate(`/workflows/${workflow.id}`)}><CardHeader className="border-b"><div className="flex items-start justify-between gap-2"><div><CardTitle>{workflow.name}</CardTitle><CardDescription className="mt-1 line-clamp-2 min-h-10 text-xs">{workflow.description || "No description yet."}</CardDescription></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${workflow.status === "published" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>{workflow.status}</span></div></CardHeader><CardContent><div className="flex flex-wrap gap-1.5">{Array.from(kinds).map((kind) => <span key={kind} className="rounded bg-muted px-2 py-1 text-[9px] font-medium uppercase text-muted-foreground">{kind.replace("_", " ")}</span>)}</div><div className="mt-4 flex items-center justify-between border-t pt-3 text-[10px] text-muted-foreground"><span>{workflow.definition.nodes.length} nodes · v{workflow.latest_version || "draft"}</span><Button variant="ghost" size="icon-xs" onClick={(event) => { event.stopPropagation(); setDeleteWorkflowTarget(workflow); }}><Trash2 className="text-destructive" size={12} /></Button></div></CardContent></Card>;
              })}</div>
            )}
          </section>
        </div>
      </main>

      <Dialog open={showCreate} onOpenChange={setShowCreate}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Create coding workflow</DialogTitle></DialogHeader><form className="space-y-5" onSubmit={createWorkflow}><div><label className="text-xs font-bold uppercase text-muted-foreground">Workflow name</label><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Law Delegation + Discretion Rank" className="mt-1" required /></div><div><label className="text-xs font-bold uppercase text-muted-foreground">Description</label><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What research method does this workflow implement?" rows={3} className="mt-1 w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></div><div><label className="text-xs font-bold uppercase text-muted-foreground">Starting template</label><div className="mt-2 grid max-h-72 gap-3 overflow-y-auto sm:grid-cols-2">{templates.map((template) => <button key={template.id} type="button" onClick={() => setTemplateId(template.id)} className={`rounded-xl border p-4 text-left ${templateId === template.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/40"}`}><BookOpenCheck className="mb-2 text-primary" size={18} /><p className="text-xs font-semibold">{template.name}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{template.description || `${template.definition.nodes.length} node template`}</p></button>)}</div></div><div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button><Button type="submit" disabled={creating || !templateId}>{creating ? "Creating…" : "Create draft"}</Button></div></form></DialogContent></Dialog>

      <Dialog open={showImport} onOpenChange={setShowImport}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Import workflow template JSON</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={importTemplate}><p className="text-xs leading-relaxed text-muted-foreground">Paste an exported workflow-template JSON object. If you paste only a workflow definition, it will be imported as “Imported Workflow Template”.</p><textarea value={importJson} onChange={(event) => setImportJson(event.target.value)} rows={14} placeholder='{"name":"My Template","definition":{"schema_version":1,"nodes":[],"edges":[],"outputs":[],"viewport":{"x":0,"y":0,"zoom":1}}}' className="w-full rounded-md border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-primary/30" required /><div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => setShowImport(false)}>Cancel</Button><Button type="submit" disabled={importing || !importJson.trim()}>{importing ? "Importing…" : "Import template"}</Button></div></form></DialogContent></Dialog>

      <ConfirmationDialog open={deleteWorkflowTarget !== null} onOpenChange={(open) => !open && setDeleteWorkflowTarget(null)} title="Delete coding workflow" description={`Delete “${deleteWorkflowTarget?.name || "this workflow"}”? Its published versions will also be removed. Existing campaigns are unaffected because workflow adoption is not enabled yet.`} confirmText="Delete workflow" variant="destructive" onConfirm={deleteWorkflow} />
      <ConfirmationDialog open={deleteTemplateTarget !== null} onOpenChange={(open) => !open && setDeleteTemplateTarget(null)} title="Delete workflow template" description={`Delete “${deleteTemplateTarget?.name || "this template"}”? Existing workflow drafts copied from it are unaffected.`} confirmText="Delete template" variant="destructive" onConfirm={deleteTemplate} />
    </div>
  );
}
