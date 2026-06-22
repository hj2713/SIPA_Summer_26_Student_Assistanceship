import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, Braces, CheckCircle2, FileInput, GitBranch, TableProperties } from "lucide-react";
import type { WorkflowNodeDefinition, WorkflowNodeKind } from "@/types/workflow";

export interface WorkflowCanvasNodeData extends Record<string, unknown> {
  definition: WorkflowNodeDefinition;
}

const NODE_META: Record<WorkflowNodeKind, { label: string; color: string; icon: typeof Bot }> = {
  document_input: { label: "Input", color: "text-blue-600 bg-blue-500/10 border-blue-500/25", icon: FileInput },
  llm: { label: "AI analysis", color: "text-violet-600 bg-violet-500/10 border-violet-500/25", icon: Bot },
  condition: { label: "Condition", color: "text-amber-600 bg-amber-500/10 border-amber-500/25", icon: GitBranch },
  set_value: { label: "Set value", color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/25", icon: Braces },
  validation: { label: "Validation", color: "text-rose-600 bg-rose-500/10 border-rose-500/25", icon: CheckCircle2 },
  output: { label: "Output", color: "text-cyan-600 bg-cyan-500/10 border-cyan-500/25", icon: TableProperties },
};

export function WorkflowNodeCard({ data, selected }: NodeProps) {
  const definition = (data as WorkflowCanvasNodeData).definition;
  const meta = NODE_META[definition.kind];
  const Icon = meta.icon;
  const outputCount = Array.isArray(definition.config.outputs) ? definition.config.outputs.length : 0;

  return (
    <div className={`w-60 rounded-xl border bg-card shadow-sm transition-all ${selected ? "ring-2 ring-primary shadow-lg" : "hover:shadow-md"}`}>
      {definition.kind !== "document_input" && <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-background !bg-primary" />}
      <div className="p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${meta.color}`}>
            <Icon size={12} /> {meta.label}
          </span>
          {definition.kind === "llm" && <span className="text-[9px] text-muted-foreground">{outputCount} outputs</span>}
        </div>
        <p className="truncate text-sm font-semibold">{definition.name}</p>
        <p className="mt-1 line-clamp-2 min-h-8 text-[10px] leading-relaxed text-muted-foreground">
          {definition.description || "No description yet."}
        </p>
      </div>
      {definition.kind === "condition" ? (
        <>
          <Handle id="true" type="source" position={Position.Right} style={{ top: "42%" }} className="!h-3 !w-3 !border-2 !border-background !bg-emerald-500" />
          <Handle id="false" type="source" position={Position.Right} style={{ top: "76%" }} className="!h-3 !w-3 !border-2 !border-background !bg-rose-500" />
          <span className="pointer-events-none absolute -right-10 top-[35%] text-[9px] font-semibold text-emerald-600">TRUE</span>
          <span className="pointer-events-none absolute -right-10 top-[69%] text-[9px] font-semibold text-rose-600">FALSE</span>
        </>
      ) : definition.kind !== "output" ? (
        <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-background !bg-primary" />
      ) : null}
    </div>
  );
}

export { NODE_META };

