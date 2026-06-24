import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkflowNodeDefinition, WorkflowOutputField } from "@/types/workflow";
import { NODE_META } from "./WorkflowNodeCard";

type OutputFieldMapping = string | { source: string; key?: string; label?: string };

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

function formatExpression(expr: any): string {
  if (!expr) return "";
  const getOperandString = (opObj: any) => {
    if (!opObj) return "";
    if (opObj.field) return opObj.field;
    if (opObj.literal !== undefined) {
      if (typeof opObj.literal === "string") return `"${opObj.literal}"`;
      return String(opObj.literal);
    }
    return JSON.stringify(opObj);
  };

  if (expr.op === "and" || expr.op === "or") {
    const args = expr.args || [];
    const formattedArgs = args.map((arg: any) => {
      const isNestedLogical = arg.op === "and" || arg.op === "or";
      return isNestedLogical ? `(${formatExpression(arg)})` : formatExpression(arg);
    });
    return formattedArgs.join(` ${expr.op.toUpperCase()} `);
  }

  const left = getOperandString(expr.left);
  const right = getOperandString(expr.right);
  const opStr = {
    eq: "==",
    neq: "!=",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<=",
    present: "is present"
  }[expr.op as string] || expr.op || "";

  if (expr.op === "present") {
    return `${left} ${opStr}`;
  }

  return `${left} ${opStr} ${right}`;
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
  const exposedFields = (node.config.fields as OutputFieldMapping[] | undefined) || [];
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
            {/* Step 1: Inputs & Context */}
            <section className="space-y-3 border-t pt-4">
              <div className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">1</span>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Input Data & Upstream Context</p>
              </div>
              <p className="text-[10px] text-muted-foreground leading-normal">Configure what information is sent to the LLM for analysis.</p>
              
              <div>
                <label className="text-[9px] font-bold uppercase text-muted-foreground/80">Document Context</label>
                <select value={String(node.config.document_context || "source_text")} onChange={(event) => patchConfig({ document_context: event.target.value })} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-xs">
                  <option value="source_text">Include full source text of file</option>
                  <option value="evidence_only">Include highlighted evidence snippets only</option>
                  <option value="none">Prior outputs only (no file text)</option>
                </select>
              </div>
              
              <div>
                <label className="text-[9px] font-bold uppercase text-muted-foreground/80">Prior Upstream Outputs (Inject context)</label>
                <div className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
                  {availableFields.length === 0 ? (
                    <p className="p-2 text-[10px] text-muted-foreground italic">No upstream fields from earlier steps are available yet.</p>
                  ) : (
                    availableFields.map((field) => {
                      const selected = ((node.config.input_fields as string[] | undefined) || []).includes(field);
                      return (
                        <label key={field} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[10px] hover:bg-muted">
                          <input type="checkbox" checked={selected} onChange={() => { const current = (node.config.input_fields as string[] | undefined) || []; patchConfig({ input_fields: selected ? current.filter((item) => item !== field) : [...current, field] }); }} />
                          <span className="truncate font-mono text-muted-foreground">{field}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </section>

            {/* Step 2: Prompt Instructions */}
            <section className="space-y-3 border-t pt-4">
              <div className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">2</span>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">AI Instructions & Rubric</p>
              </div>
              <p className="text-[10px] text-muted-foreground leading-normal">Tell the AI how to evaluate the documents and outputs from Step 1.</p>
              <div>
                <TextArea rows={8} value={String(node.config.instructions || "")} onChange={(event) => patchConfig({ instructions: event.target.value })} className="mt-1 font-sans placeholder:text-muted-foreground/50" placeholder="e.g. Analyze if this statute grants discretionary rulemaking authority to a federal agency..." />
              </div>
            </section>

            {/* Step 3: Typed Outputs */}
            <section className="space-y-3 border-t pt-4">
              <div className="flex items-center gap-1.5 justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">3</span>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Generated Fields (Outputs)</p>
                </div>
                <Button size="xs" variant="outline" onClick={() => patchConfig({ outputs: [...outputs, { key: `new_field_${outputs.length + 1}`, label: "New field", type: "string", required: false }] })}>
                  <Plus size={11} /> Add Field
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground leading-normal">Specify the exact structured values the LLM must generate.</p>
              
              <div className="space-y-2.5 mt-2">
                {outputs.map((output, index) => (
                  <div key={`${index}-${output.key}`} className="space-y-2.5 rounded-lg border bg-muted/25 p-3">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[8px] font-bold uppercase text-muted-foreground block mb-0.5">Field Key (JSON/code-safe)</label>
                        <Input value={output.key} onChange={(event) => patchConfig({ outputs: outputs.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item) })} placeholder="field_key" className="font-mono text-[10px]" />
                      </div>
                      <div className="self-end pb-0.5">
                        <Button variant="ghost" size="icon-sm" onClick={() => patchConfig({ outputs: outputs.filter((_, itemIndex) => itemIndex !== index) })}>
                          <Trash2 className="text-destructive" size={12} />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[8px] font-bold uppercase text-muted-foreground block mb-0.5">Display Label</label>
                        <Input value={output.label || ""} onChange={(event) => patchConfig({ outputs: outputs.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} placeholder="Human label" className="text-[10px]" />
                      </div>
                      <div>
                        <label className="text-[8px] font-bold uppercase text-muted-foreground block mb-0.5">Value Type</label>
                        <select value={output.type} onChange={(event) => patchConfig({ outputs: outputs.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value } : item) })} className="w-full rounded-md border bg-background px-2 py-1.5 text-[10px]">
                          <option value="boolean">Boolean (True/False)</option>
                          <option value="integer">Integer (Number)</option>
                          <option value="decimal">Decimal (Float)</option>
                          <option value="string">String (Text)</option>
                          <option value="enum">Enum (Multiple Choice)</option>
                          <option value="object">Object (JSON / Details)</option>
                          <option value="list[string]">List of strings</option>
                          <option value="evidence[]">Evidence list</option>
                        </select>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-[10px] text-muted-foreground cursor-pointer">
                      <input type="checkbox" checked={Boolean(output.required)} onChange={(event) => patchConfig({ outputs: outputs.map((item, itemIndex) => itemIndex === index ? { ...item, required: event.target.checked } : item) })} />
                      <span>Required output field</span>
                    </label>
                  </div>
                ))}
                {outputs.length === 0 && (
                  <p className="text-[10px] text-muted-foreground italic text-center py-4 border border-dashed rounded-lg bg-card/50">Click "Add Field" to define output variables.</p>
                )}
              </div>
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

        {node.kind === "validation" && (
          <section className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Validation Rules / Guardrails</p>
                <p className="text-[10px] text-muted-foreground">Logical rules enforced before outputs are written to the database.</p>
              </div>
            </div>
            <div className="space-y-3 mt-2">
              {((node.config.rules as any[]) || []).map((rule, idx) => (
                <div key={idx} className="rounded-lg border bg-muted/10 p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-foreground">{rule.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${rule.severity === "error" ? "bg-destructive/15 text-destructive border border-destructive/20" : "bg-amber-500/15 text-amber-600 border border-amber-500/20"}`}>
                      {rule.severity}
                    </span>
                  </div>
                  <div className="font-mono text-[9px] bg-muted/40 p-2 rounded border border-border/30 text-muted-foreground whitespace-pre-wrap break-all leading-normal">
                    {formatExpression(rule.expression)}
                  </div>
                </div>
              ))}
              {((node.config.rules as any[]) || []).length === 0 && (
                <p className="text-[10px] text-muted-foreground italic">No validation rules configured for this node.</p>
              )}
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground/60 border-t pt-2 mt-2">
              Validation rule editing will expand after the core branching workflow is tested. Existing template consistency rules are preserved.
            </p>
          </section>
        )}
        {node.kind === "output" && <section className="space-y-2 border-t pt-4"><p className="text-[10px] font-bold uppercase text-muted-foreground">Fields exposed to campaigns</p><p className="text-[10px] leading-relaxed text-muted-foreground">Select only final research variables. Internal details can remain available in traces without becoming dashboard columns.</p><div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">{availableFields.length === 0 ? <p className="p-2 text-[10px] text-muted-foreground">Connect producing nodes before this output node.</p> : availableFields.map((field) => { const selected = exposedFields.some((item) => typeof item === "string" ? item === field : item.source === field); return <label key={field} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[10px] hover:bg-muted"><input type="checkbox" checked={selected} onChange={() => { const nextFields = selected ? exposedFields.filter((item) => typeof item === "string" ? item !== field : item.source !== field) : [...exposedFields, { source: field, key: field.split(".").pop() || field }]; patchConfig({ fields: nextFields }); }} /><span className="truncate font-mono">{field}</span></label>; })}</div>{exposedFields.length > 0 && <div className="space-y-1 rounded-md bg-muted/30 p-2"><p className="text-[9px] font-bold uppercase text-muted-foreground">Final output mapping</p>{exposedFields.map((item, index) => { const source = typeof item === "string" ? item : item.source; const key = typeof item === "string" ? item : item.key || item.source; return <div key={`${source}-${index}`} className="flex items-center gap-1 text-[9px]"><span className="truncate font-mono text-muted-foreground">{source}</span><span>→</span><span className="font-mono font-semibold">{key}</span></div>; })}</div>}<p className="rounded-md bg-amber-500/10 p-2 text-[9px] leading-relaxed text-amber-700">Campaign integration remains intentionally disabled in this release.</p></section>}
      </div>

      <div className="border-t p-3"><Button variant="destructive" size="sm" className="w-full" onClick={onDelete}><Trash2 size={13} /> Delete node</Button></div>
    </aside>
  );
}
