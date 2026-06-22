import { Check, GitBranch } from "lucide-react";

export interface DependencyColumn {
  name: string;
  depends_on?: string[];
}

interface ColumnDependencySelectorProps {
  columns: DependencyColumn[];
  columnIndex: number;
  value: string[];
  onChange: (dependencies: string[]) => void;
}

export function ColumnDependencySelector({
  columns,
  columnIndex,
  value,
  onChange,
}: ColumnDependencySelectorProps) {
  const priorColumns = columns
    .slice(0, columnIndex)
    .map((column, index) => ({ name: column.name.trim(), index }))
    .filter((column) => column.name.length > 0);
  const validPriorNames = new Set(priorColumns.map((column) => column.name));
  const invalidDependencies = value.filter((dependency) => !validPriorNames.has(dependency));

  const toggleDependency = (name: string) => {
    onChange(
      value.includes(name)
        ? value.filter((dependency) => dependency !== name)
        : [...value, name],
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <GitBranch size={14} className="mt-0.5 shrink-0 text-primary" />
        <div>
          <p className="text-[11px] font-semibold">Uses outputs from</p>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Select earlier steps whose completed value and reasoning are needed for this rule.
          </p>
        </div>
      </div>

      {priorColumns.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
          This is the first step, so it runs independently.
        </div>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {priorColumns.map((column) => {
            const checked = value.includes(column.name);
            return (
              <button
                key={`${column.index}-${column.name}`}
                type="button"
                onClick={() => toggleDependency(column.name)}
                className={`flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                  checked
                    ? "border-primary/40 bg-primary/5 text-foreground"
                    : "bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted/40"
                }`}
                aria-pressed={checked}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    checked ? "border-primary bg-primary text-primary-foreground" : "border-input"
                  }`}
                >
                  {checked && <Check size={11} strokeWidth={3} />}
                </span>
                <span className="min-w-0 truncate font-mono text-[10px]">{column.name}</span>
                <span className="ml-auto shrink-0 text-[9px] text-muted-foreground">Step {column.index + 1}</span>
              </button>
            );
          })}
        </div>
      )}

      {invalidDependencies.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[10px] text-destructive">
          Remove outdated dependencies: {invalidDependencies.map((dependency) => (
            <button
              key={dependency}
              type="button"
              onClick={() => onChange(value.filter((item) => item !== dependency))}
              className="ml-1 rounded border border-destructive/30 px-1.5 py-0.5 font-mono hover:bg-destructive/10"
            >
              {dependency} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
