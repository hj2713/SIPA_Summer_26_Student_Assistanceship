export type WorkflowNodeKind =
  | "document_input"
  | "llm"
  | "condition"
  | "set_value"
  | "validation"
  | "output"
  | "rank_descriptor";

export interface WorkflowOutputField {
  key: string;
  label?: string;
  type: string;
  required?: boolean;
  options?: string[];
  minimum?: number;
  maximum?: number;
  visibility?: "internal" | "final";
}

export interface WorkflowNodeDefinition {
  id: string;
  kind: WorkflowNodeKind;
  name: string;
  description: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface WorkflowEdgeDefinition {
  id: string;
  source: string;
  target: string;
  source_handle?: string;
  target_handle?: string;
  label?: string;
}

export interface WorkflowDefinition {
  schema_version: number;
  nodes: WorkflowNodeDefinition[];
  edges: WorkflowEdgeDefinition[];
  outputs: Array<Record<string, unknown>>;
  viewport: { x: number; y: number; zoom: number };
  metadata?: Record<string, unknown>;
}

export interface DiscretionBuilderStage {
  title: string;
  purpose: string;
  instructions: string;
  outputs: WorkflowOutputField[];
}

export interface DiscretionBuilderConfig {
  kind: "discretion_workflow";
  version: number;
  source_policy: "campaign_source" | "cq_summary" | "major_provisions" | "full_text";
  mode: "binary" | "multiclass" | "cascade";
  calibration_enabled: boolean;
  label_overrides: {
    binary_high_class: string;
    binary_low_class: string;
  };
  stages: Record<string, DiscretionBuilderStage>;
}

export interface WorkflowBuilderSummaryField {
  key: string;
  label: string;
  source: string;
}

export interface WorkflowBuilderSummary {
  mode: "binary" | "multiclass" | "cascade";
  calibration_enabled: boolean;
  final_outputs: WorkflowBuilderSummaryField[];
  internal_outputs: WorkflowBuilderSummaryField[];
}

export interface CodingWorkflow {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  status: "draft" | "published" | "archived";
  definition: WorkflowDefinition;
  revision: number;
  latest_version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowTemplate {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  status: "active" | "archived";
  definition: WorkflowDefinition;
  revision: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  node_id?: string;
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: number;
  warnings: number;
  issues: WorkflowValidationIssue[];
}
