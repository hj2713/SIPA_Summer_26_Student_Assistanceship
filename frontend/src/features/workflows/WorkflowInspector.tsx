import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkflowNodeDefinition, WorkflowOutputField } from "@/types/workflow";
import { NODE_META } from "./WorkflowNodeCard";

interface WorkflowInspectorProps {
  node: WorkflowNodeDefinition | null;
  availableFields: string[];
  onChange: (node: WorkflowNodeDefinition) => void;
  onDelete: () => void;
  onClose: () => void;
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full rounded-md border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/30 ${props.className || ""}`} />;
}

export function WorkflowInspector({ node, availableFields, onChange, onDelete, onClose }: WorkflowInspectorProps) {
  if (!node) {
    return (
      <aside className="flex w-80 shrink-0 items-center justify-center border-l bg-card/50 p-6 text-center text-xs text-muted-foreground">
        Select a workflow node to configure its inputs, rules, and outputs.
      </aside>
    );
  }

  const patch = (updates: Partial<WorkflowNodeDefinition>) => onChange({ ...node, ...updates });
  const patchConfig = (updates: Record<string, unknown>) => patch({ config: { ...node.config, ...updates } });
  const outputs = (node.config.outputs as WorkflowOutputField[] | undefined) || [];
  const assignments = (node.config.assignments as Array<{ field: string; type: string; value: unknown }> | undefined) || [];
  const expression = (node.config.expression as { op?: string; left?: { field?: string }; right?: { literal?: unknown } } | undefined) || {};
  const meta = NODE_META[node.kind];
  const Icon = meta.icon;

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <span className={`rounded-md border p-1.5 ${meta.color}`}><Icon size={14} /></span>
          <div><p className="text-xs font-bold">Configure node</p><p className="text-[10px] text-muted-foreground">{meta.label}</p></div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}><X size={14} /></Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <section className="space-y-3">
          <div><label className="text-[10px] font-bold uppercase text-muted-foreground">Name</label><Input value={node.name} onChange={(event) => patch({ name: event.target.value })} className="mt-1" /></div>
          <div><label className="text-[10px] font-bold uppercase text-muted-foreground">Description</label><TextArea rows={3} value={node.description} onChange={(event) => patch({ description: event.target.value })} className="mt-1" /></div>
        </section>

        {node.kind === "document_input" && (
          <section className="space-y-2 border-t pt-4">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Source policy</label>
            <select value={String(node.config.source_policy || "campaign_source")} onChange={(event) => patchConfig({ source_policy: event.target.value })} className="w-full rounded-md border bg-background px-3 py-2 text-xs">
              <option value="campaign_source">Selected by campaign</option><option value="cq_summary">CQ summary only</option><option value="major_provisions">Major provisions</option><option value="full_text">Full statutory text</option>
            </select>
          </section>
        )}

        {node.kind === "llm" && (
          <>
            <section className="space-y-3 border-t pt-4">
              <div><label className="text-[10px] font-bold uppercase text-muted-foreground">Instructions / rubric</label><TextArea rows={7} value={String(node.config.instructions || "")} onChange={(event) => patchConfig({ instructions: event.target.value })} className="mt-1" /></div>
              <div><label className="text-[10px] font-bold uppercase text-muted-foreground">Document context</label><select value={String(node.config.document_context || "source_text")} onChange={(event) => patchConfig({ document_context: event.target.value })} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-xs"><option value="source_text">Include source text</option><option value="evidence_only">Evidence only</option><option value="none">Prior outputs only</option></select></div>
              <div>
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Prior outputs included</label>
                <div className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
                  {availableFields.length === 0 ? <p className="p-2 text-[10px] text-muted-foreground">No upstream output fields are available yet.</p> : availableFields.map((field) => {
                    const selected = ((node.config.input_fields as string[] | undefined) || []).includes(field);
                    return <label key={field} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[10px] hover:bg-muted"><input type="checkbox" checked={selected} onChange={() => { const current = (node.config.input_fields as string[] | undefined) || []; patchConfig({ input_fields: selected ? current.filter((item) => item !== field) : [...current, field] }); }} /><span className="truncate font-mono">{field}</span></label>;
                  })}
                </div>
              </div>
            </section>
            <section className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase text-muted-foreground">Typed outputs</p><p className="text-[10px] text-muted-foreground">One AI step may create several dashboard fields.</p></div><Button size="xs" variant="outline" onClick={() => patchConfig({ outputs: [...outputs, { key: `new_field_${outputs.length + 1}`, label: "New field", type: "string", required: false }] })}><Plus size={11} /> Field</Button></div>
              {outputs.map((output, index) => (
                <div key={`${index}-${output.key}`} className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
                  <div className="flex gap-2"><Input value={output.key} onChange={(event) => patchConfig({ outputs: outputs.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item) })} placeholder="field_key" className="font-mono text-[10px]" /><Button variant="ghost" size="icon-sm" onClick={() => patchConfig({ outputs: outputs.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="text-destructive" size={12} /></Button></div>
                  <div className="grid grid-cols-2 gap-2"><Input value={output.label || ""} onChange={(event) => patchConfig({ outputs: outputs.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} placeholder="Human label" className="text-[10px]" /><select value={output.type} onChange={(event) => patchConfig({ outputs: outputs.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value } : item) })} className="rounded-md border bg-background px-2 text-[10px]"><option value="boolean">Boolean</option><option value="integer">Integer</option><option value="decimal">Decimal</option><option value="string">String</option><option value="enum">Enum</option><option value="list[string]">List of strings</option><option value="evidence[]">Evidence list</option></select></div>
                  <label className="flex items-center gap-2 text-[10px] text-muted-foreground"><input type="checkbox" checked={Boolean(output.required)} onChange={(event) => patchConfig({ outputs: outputs.map((item, itemIndex) => itemIndex === index ? { ...item, required: event.target.checked } : item) })} />Required output</label>
                </div>
              ))}
            </section>
          </>
        )}

        {node.kind === "condition" && (
          <section className="space-y-3 border-t pt-4">
            <p className="text-[10px] leading-relaxed text-muted-foreground">Route the document using a typed value produced by an earlier node.</p>
            <div><label className="text-[10px] font-bold uppercase text-muted-foreground">Field</label><select value={expression.left?.field || ""} onChange={(event) => patchConfig({ expression: { ...expression, left: { field: event.target.value } } })} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-xs"><option value="">Select upstream field…</option>{availableFields.map((field) => <option key={field} value={field}>{field}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-2"><div><label className="text-[10px] font-bold uppercase text-muted-foreground">Operator</label><select value={expression.op || "eq"} onChange={(event) => patchConfig({ expression: { ...expression, op: event.target.value } })} className="mt-1 w-full rounded-md border bg-background px-2 py-2 text-xs"><option value="eq">is equal to</option><option value="neq">is not equal to</option><option value="gt">is greater than</option><option value="gte">is at least</option><option value="lt">is less than</option><option value="lte">is at most</option><option value="present">is present</option></select></div><div><label className="text-[10px] font-bold uppercase text-muted-foreground">Comparison value</label><Input value={String(expression.right?.literal ?? "")} disabled={expression.op === "present"} onChange={(event) => { const raw = event.target.value; const literal = raw === "true" ? true : raw === "false" ? false : raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw; patchConfig({ expression: { ...expression, right: { literal } } }); }} placeholder="false, 0, or category" className="mt-1 text-xs" /></div></div>
          </section>
        )}

        {node.kind === "set_value" && (
          <section className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase text-muted-foreground">Assignments</p><Button size="xs" variant="outline" onClick={() => patchConfig({ assignments: [...assignments, { field: `new_value_${assignments.length + 1}`, type: "string", value: "" }] })}><Plus size={11} /> Assignment</Button></div>
            {assignments.map((assignment, index) => <div key={index} className="space-y-2 rounded-lg border p-2.5"><div className="flex gap-2"><Input value={assignment.field} onChange={(event) => patchConfig({ assignments: assignments.map((item, itemIndex) => itemIndex === index ? { ...item, field: event.target.value } : item) })} placeholder="output_field" className="font-mono text-[10px]" /><Button variant="ghost" size="icon-sm" onClick={() => patchConfig({ assignments: assignments.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="text-destructive" size={12} /></Button></div><div className="grid grid-cols-2 gap-2"><select value={assignment.type} onChange={(event) => patchConfig({ assignments: assignments.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value } : item) })} className="rounded-md border bg-background px-2 text-[10px]"><option value="string">String</option><option value="integer">Integer</option><option value="boolean">Boolean</option></select><Input value={String(assignment.value ?? "")} onChange={(event) => { const nextValue = assignment.type === "integer" ? Number(event.target.value) : assignment.type === "boolean" ? event.target.value === "true" : event.target.value; patchConfig({ assignments: assignments.map((item, itemIndex) => itemIndex === index ? { ...item, value: nextValue } : item) }); }} placeholder="Value" className="text-[10px]" /></div></div>)}
          </section>
        )}

        {node.kind === "validation" && <section className="border-t pt-4 text-[10px] leading-relaxed text-muted-foreground">Validation rule editing will expand after the core branching workflow is tested. Existing template consistency rules are preserved.</section>}
        {node.kind === "output" && <section className="space-y-2 border-t pt-4"><p className="text-[10px] font-bold uppercase text-muted-foreground">Fields exposed to campaigns</p><p className="text-[10px] leading-relaxed text-muted-foreground">Select the typed values this workflow will eventually materialize as grouped dashboard columns.</p><div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">{availableFields.length === 0 ? <p className="p-2 text-[10px] text-muted-foreground">Connect producing nodes before this output node.</p> : availableFields.map((field) => { const selected = ((node.config.fields as string[] | undefined) || []).includes(field); return <label key={field} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[10px] hover:bg-muted"><input type="checkbox" checked={selected} onChange={() => { const current = (node.config.fields as string[] | undefined) || []; patchConfig({ fields: selected ? current.filter((item) => item !== field) : [...current, field] }); }} /><span className="truncate font-mono">{field}</span></label>; })}</div><p className="rounded-md bg-amber-500/10 p-2 text-[9px] leading-relaxed text-amber-700">Campaign integration remains intentionally disabled in this release.</p></section>}
      </div>

      <div className="border-t p-3"><Button variant="destructive" size="sm" className="w-full" onClick={onDelete}><Trash2 size={13} /> Delete node</Button></div>
    </aside>
  );
}
