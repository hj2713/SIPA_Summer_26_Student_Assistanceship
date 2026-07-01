import type {
  DiscretionBuilderConfig,
  WorkflowBuilderSummary,
  WorkflowDefinition,
  WorkflowNodeDefinition,
  WorkflowOutputField,
} from "@/types/workflow";

function field(
  key: string,
  label: string,
  type: string,
  extras: Partial<WorkflowOutputField> = {},
): WorkflowOutputField {
  return {
    key,
    label,
    type,
    visibility: "internal",
    ...extras,
  };
}

export function createDefaultDiscretionBuilder(): DiscretionBuilderConfig {
  return {
    kind: "discretion_workflow",
    version: 1,
    source_policy: "full_text",
    mode: "cascade",
    calibration_enabled: false,
    label_overrides: {
      binary_high_class: "agency",
      binary_low_class: "bounded",
    },
    stages: {
      delegation: {
        title: "Delegation Gate",
        purpose: "Keep Prompt_v8 as the delegation gate before any discretion ranking happens.",
        instructions:
          "Apply the current Prompt_v8 benchmark-aligned delegation logic. Do not treat a mere agency mention, filing requirement, exemption, or procedural amendment as delegation by itself.",
        outputs: [
          field("delegate_law", "Delegate Law", "boolean", { required: true, visibility: "final" }),
          field("delegation_rationale", "Delegation rationale", "string", { required: true }),
          field("administrative_actors", "Administrative actors", "list[string]"),
          field("delegated_authorities", "Delegated authorities", "list[string]"),
          field("constraints_summary", "Constraints summary", "string"),
          field("constraint_strength", "Constraint strength", "enum", {
            required: true,
            options: ["none", "weak", "moderate", "strong"],
          }),
          field("delegation_breadth", "Delegation breadth", "enum", {
            required: true,
            options: ["none", "narrow", "moderate", "broad"],
          }),
          field("delegation_centrality", "Delegation centrality", "enum", {
            required: true,
            options: ["none", "minor", "supporting", "central"],
          }),
        ],
      },
      inventory: {
        title: "Discretion Inventory",
        purpose: "Inventory affirmative discretion signals, constraints, and residual leeway before the final rank decision.",
        instructions:
          "Inventory first, judge second, rank last. Identify delegated authority, affirmative discretion signals, constraint evidence, residual leeway, and the most likely provisional rank.",
        outputs: [
          field("delegated_authority_summary", "Delegated authority summary", "string", { required: true }),
          field("affirmative_discretion_signals", "Affirmative discretion signals", "list[string]"),
          field("constraint_evidence", "Constraint evidence", "list[string]"),
          field("residual_leeway", "Residual leeway", "enum", {
            required: true,
            options: ["None", "Low", "Bounded", "Substantial", "High"],
          }),
          field("provisional_rank", "Provisional rank", "integer", { required: true, minimum: 1, maximum: 4 }),
          field("boundary_decision", "Boundary decision", "string", { required: true }),
        ],
      },
      multiclass: {
        title: "Multiclass Rank",
        purpose: "Assign one discretion rank from 1 to 4 in a single stage while still surfacing signals and constraints.",
        instructions:
          "Use the M9 multiclass framing. Prefer the lower rank when the evidence is mixed. Do not inflate a score merely because the statute uses broad verbs such as regulate, determine, waive, or exempt.",
        outputs: [
          field("affirmative_discretion_signals", "Affirmative discretion signals", "list[string]"),
          field("constraint_evidence", "Constraint evidence", "list[string]"),
          field("residual_leeway", "Residual leeway", "enum", {
            required: true,
            options: ["None", "Low", "Bounded", "Substantial", "High"],
          }),
          field("boundary_decision", "Boundary decision", "string", { required: true }),
          field("discretion_rank", "Discretion Rank", "integer", {
            required: true,
            minimum: 1,
            maximum: 4,
            visibility: "final",
          }),
          field("discretion_rationale", "Discretion rationale", "string", { required: true }),
        ],
      },
      binary_split: {
        title: "Binary Split",
        purpose: "Classify the law into the lower or higher discretion band before choosing the final adjacent rank.",
        instructions:
          "Use the streamlined binary screen first: distinguish lower-bounded discretion from the higher policy-shaping band. Treat the higher class label as the professor's requested 'agency' label.",
        outputs: [
          field("discretion_band", "Discretion band", "enum", {
            required: true,
            options: ["bounded", "agency"],
          }),
          field("band_rationale", "Band rationale", "string", { required: true }),
          field("affirmative_discretion_signals", "Affirmative discretion signals", "list[string]"),
          field("constraint_evidence", "Constraint evidence", "list[string]"),
        ],
      },
      low_rank: {
        title: "Rank 1 vs 2",
        purpose: "Resolve whether the lower band is minimal discretion or bounded discretion.",
        instructions:
          "If the case is in the lower band, distinguish rank 1 from rank 2. Use rank 1 for narrow, ministerial, procedural, or mechanical authority; use rank 2 for real but bounded authority.",
        outputs: [
          field("discretion_rank", "Discretion Rank", "integer", {
            required: true,
            minimum: 1,
            maximum: 2,
            visibility: "final",
          }),
          field("discretion_rationale", "Discretion rationale", "string", { required: true }),
          field("boundary_decision", "Boundary decision", "string", { required: true }),
        ],
      },
      high_rank: {
        title: "Rank 3 vs 4",
        purpose: "Resolve whether the higher band is substantial discretion or the professor's agency-labeled high class.",
        instructions:
          "If the case is in the higher band, distinguish rank 3 from rank 4. Do not assign the top class merely because authority is broad in wording; require genuine policy-shaping leeway.",
        outputs: [
          field("discretion_rank", "Discretion Rank", "integer", {
            required: true,
            minimum: 3,
            maximum: 4,
            visibility: "final",
          }),
          field("discretion_rationale", "Discretion rationale", "string", { required: true }),
          field("boundary_decision", "Boundary decision", "string", { required: true }),
        ],
      },
      decision: {
        title: "Final Rank Decision",
        purpose: "Turn the inventory stage into the final ranked discretion judgment.",
        instructions:
          "Use the provisional rank, residual leeway, and boundary analysis to assign the final rank. Prefer the lower rank when evidence is mixed or broad verbs are not supported by real policy choice.",
        outputs: [
          field("discretion_rank", "Discretion Rank", "integer", {
            required: true,
            minimum: 1,
            maximum: 4,
            visibility: "final",
          }),
          field("discretion_rationale", "Discretion rationale", "string", { required: true }),
        ],
      },
      calibration: {
        title: "Optional Calibration",
        purpose: "Adjust only boundary cases by one rank when the evidence clearly falls at the lower or upper edge of the provisional class.",
        instructions:
          "Calibration is optional. Use it only for close boundary cases. Do not recalibrate by more than one rank, and do not move upward without clear evidence of broader substantive policy choice.",
        outputs: [
          field("discretion_rank", "Discretion Rank", "integer", {
            required: true,
            minimum: 1,
            maximum: 4,
            visibility: "final",
          }),
          field("discretion_rationale", "Discretion rationale", "string", { required: true }),
          field("recalibration_summary", "Recalibration summary", "string"),
        ],
      },
    },
  };
}

function isDiscretionBuilder(builder: unknown): builder is DiscretionBuilderConfig {
  return Boolean(builder && typeof builder === "object" && (builder as DiscretionBuilderConfig).kind === "discretion_workflow");
}

function section(title: string, body: string) {
  return `${title}\n\n${body}`.trim();
}

function stagePrompt(stage: { title: string; purpose: string; instructions: string }, body: string) {
  return [stage.title ? `Stage: ${stage.title}` : "", stage.purpose ? `Purpose: ${stage.purpose}` : "", body.trim(), stage.instructions ? `Project-specific guidance:\n${stage.instructions}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

function finalOutputsFromBuilder(builder: DiscretionBuilderConfig) {
  const sourceMap: Record<string, string> = {
    delegate_law: "law_delegation.delegate_law",
    discretion_rank: "discretion_rank",
    discretion_rationale: "discretion_rationale",
    recalibration_summary: "recalibration_review.recalibration_summary",
  };
  const finalOutputs: Array<{ key: string; label: string; source: string }> = [];
  const internalOutputs: Array<{ key: string; label: string; source: string }> = [];

  const activeStageKeys = relevantStageKeys(builder);
  activeStageKeys.forEach((stageKey) => {
    const stage = builder.stages[stageKey];
    stage.outputs.forEach((output) => {
      const source = sourceMap[output.key];
      if (!source) return;
      const item = { key: output.key, label: output.label || output.key, source };
      if (output.visibility === "final") {
        if (!finalOutputs.some((candidate) => candidate.key === item.key && candidate.source === item.source)) finalOutputs.push(item);
      } else if (!internalOutputs.some((candidate) => candidate.key === item.key && candidate.source === item.source)) {
        internalOutputs.push(item);
      }
    });
  });

  if (finalOutputs.length === 0) {
    finalOutputs.push(
      { key: "delegate_law", label: "Delegate Law", source: "law_delegation.delegate_law" },
      { key: "discretion_rank", label: "Discretion Rank", source: "discretion_rank" },
    );
  }

  return { finalOutputs, internalOutputs };
}

function relevantStageKeys(builder: DiscretionBuilderConfig): string[] {
  const byMode: Record<DiscretionBuilderConfig["mode"], string[]> = {
    cascade: ["delegation", "inventory", "decision"],
    multiclass: ["delegation", "multiclass"],
    binary: ["delegation", "binary_split", "low_rank", "high_rank"],
  };
  const stages = [...byMode[builder.mode]];
  if (builder.calibration_enabled) stages.push("calibration");
  return stages;
}

function llmNode(
  id: string,
  name: string,
  description: string,
  position: { x: number; y: number },
  instructions: string,
  inputFields: string[],
  outputs: WorkflowOutputField[],
): WorkflowNodeDefinition {
  return {
    id,
    kind: "llm",
    name,
    description,
    position,
    config: {
      document_context: "source_text",
      instructions,
      input_fields: inputFields,
      outputs,
    },
  };
}

export function compileDiscretionWorkflow(definition: WorkflowDefinition): WorkflowDefinition {
  const builder = definition.metadata?.builder;
  if (!isDiscretionBuilder(builder)) return definition;

  const nextDefinition: WorkflowDefinition = {
    ...definition,
    nodes: [],
    edges: [],
    outputs: [],
    viewport: definition.viewport || { x: 0, y: 0, zoom: 0.6 },
    metadata: { ...(definition.metadata || {}) },
  };

  const mode = builder.mode;
  const highLabel = builder.label_overrides.binary_high_class || "agency";
  const lowLabel = builder.label_overrides.binary_low_class || "bounded";

  nextDefinition.nodes = [
    {
      id: "document_input",
      kind: "document_input",
      name: "Law file input",
      description: "The law file text being coded by this research workflow.",
      position: { x: 40, y: 260 },
      config: { source_policy: builder.source_policy },
    },
    llmNode(
      "law_delegation",
      "Law Delegation feature",
      "Prompt_v8 delegation gate with structured audit outputs.",
      { x: 340, y: 260 },
      stagePrompt(
        builder.stages.delegation,
        section(
          "Prompt_v8 gate",
          "Use Prompt_v8 as the delegation gate. Anti-inflation rule: a mere agency mention, exemption, filing requirement, or procedural amendment does not automatically count as delegation.",
        ),
      ),
      [],
      builder.stages.delegation.outputs,
    ),
    {
      id: "delegation_gate",
      kind: "condition",
      name: "delegate_law = false?",
      description: "Skip discretion ranking when there is no meaningful delegation.",
      position: { x: 690, y: 260 },
      config: {
        expression: {
          op: "eq",
          left: { field: "law_delegation.delegate_law" },
          right: { literal: false },
        },
        true_label: "No delegation",
        false_label: "Delegation found",
      },
    },
    {
      id: "rank_zero",
      kind: "set_value",
      name: "Set discretion_rank = 0",
      description: "No delegation means no discretion.",
      position: { x: 1020, y: 100 },
      config: {
        assignments: [
          { field: "discretion_rank", type: "integer", value: 0 },
          { field: "discretion_rationale", type: "string", value: "No meaningful delegation was identified, so the discretion rank is 0." },
        ],
      },
    },
  ];

  nextDefinition.edges = [
    { id: "e-input-delegation", source: "document_input", target: "law_delegation" },
    { id: "e-delegation-gate", source: "law_delegation", target: "delegation_gate" },
    { id: "e-gate-zero", source: "delegation_gate", target: "rank_zero", source_handle: "true", label: "No delegation" },
  ];

  let validationSources = ["rank_zero"];
  let downstreamStageId: string | null = null;

  if (mode === "cascade") {
    nextDefinition.nodes.push(
      llmNode(
        "discretion_inventory",
        "Discretion Inventory",
        "Inventory signals, constraints, residual leeway, and a provisional rank.",
        { x: 1040, y: 420 },
        stagePrompt(
          builder.stages.inventory,
          section(
            "Cascade inventory",
            "Inventory first, judge second, rank last. Identify affirmative discretion signals, constraints, residual leeway, a provisional rank, and the key boundary decision.",
          ),
        ),
        [
          "law_delegation.delegate_law",
          "law_delegation.delegation_rationale",
          "law_delegation.administrative_actors",
          "law_delegation.delegated_authorities",
          "law_delegation.constraints_summary",
          "law_delegation.constraint_strength",
          "law_delegation.delegation_breadth",
          "law_delegation.delegation_centrality",
        ],
        builder.stages.inventory.outputs,
      ),
      llmNode(
        "discretion_decision",
        "Final Rank Decision",
        "Turn the inventory into the final discretion rank.",
        { x: 1370, y: 420 },
        stagePrompt(
          builder.stages.decision,
          section(
            "Final cascade rank",
            "Use the provisional rank, residual leeway, and boundary analysis to assign the final rank. Prefer the lower rank when evidence is mixed.",
          ),
        ),
        [
          "law_delegation.delegate_law",
          "law_delegation.delegation_rationale",
          "discretion_inventory.delegated_authority_summary",
          "discretion_inventory.affirmative_discretion_signals",
          "discretion_inventory.constraint_evidence",
          "discretion_inventory.residual_leeway",
          "discretion_inventory.provisional_rank",
          "discretion_inventory.boundary_decision",
        ],
        builder.stages.decision.outputs,
      ),
    );
    nextDefinition.edges.push(
      { id: "e-gate-inventory", source: "delegation_gate", target: "discretion_inventory", source_handle: "false", label: "Delegation found" },
      { id: "e-inventory-decision", source: "discretion_inventory", target: "discretion_decision" },
    );
    validationSources.push("discretion_decision");
    downstreamStageId = "discretion_decision";
  } else if (mode === "multiclass") {
    nextDefinition.nodes.push(
      llmNode(
        "discretion_analysis",
        "Multiclass Discretion Rank",
        "Assign one discretion rank directly with audit signals and constraints.",
        { x: 1040, y: 420 },
        stagePrompt(
          builder.stages.multiclass,
          section(
            "M9 multiclass",
            `Assign one discretion rank from 1 to 4 directly. ${builder.calibration_enabled ? "Calibration is enabled, so treat boundary cases explicitly." : "Calibration is disabled, so choose the best direct rank."} Do not inflate the score because authority sounds broad in wording.`,
          ),
        ),
        [
          "law_delegation.delegate_law",
          "law_delegation.delegation_rationale",
          "law_delegation.administrative_actors",
          "law_delegation.delegated_authorities",
          "law_delegation.constraints_summary",
          "law_delegation.constraint_strength",
          "law_delegation.delegation_breadth",
          "law_delegation.delegation_centrality",
        ],
        builder.stages.multiclass.outputs,
      ),
    );
    nextDefinition.edges.push({ id: "e-gate-multiclass", source: "delegation_gate", target: "discretion_analysis", source_handle: "false", label: "Delegation found" });
    validationSources.push("discretion_analysis");
    downstreamStageId = "discretion_analysis";
  } else {
    const binarySplitOutputs = builder.stages.binary_split.outputs.map((output) =>
      output.key === "discretion_band" ? { ...output, options: [lowLabel, highLabel] } : output,
    );
    nextDefinition.nodes.push(
      llmNode(
        "binary_split",
        "Binary Split",
        "Separate the lower bounded band from the professor's agency band.",
        { x: 1010, y: 420 },
        stagePrompt(
          builder.stages.binary_split,
          section(
            "Binary decomposition",
            `Classify the law into the ${lowLabel} band (ranks 1 or 2) or the ${highLabel} band (ranks 3 or 4). Do not move into the ${highLabel} band merely because the law mentions delegation or uses broad verbs.`,
          ),
        ),
        [
          "law_delegation.delegate_law",
          "law_delegation.delegation_rationale",
          "law_delegation.administrative_actors",
          "law_delegation.delegated_authorities",
          "law_delegation.constraints_summary",
          "law_delegation.constraint_strength",
          "law_delegation.delegation_breadth",
          "law_delegation.delegation_centrality",
        ],
        binarySplitOutputs,
      ),
      {
        id: "binary_gate",
        kind: "condition",
        name: `Band = ${lowLabel}?`,
        description: `Route the case into the ${lowLabel} or ${highLabel} adjacent-rank classifier.`,
        position: { x: 1310, y: 420 },
        config: {
          expression: {
            op: "eq",
            left: { field: "binary_split.discretion_band" },
            right: { literal: lowLabel },
          },
          true_label: lowLabel,
          false_label: highLabel,
        },
      },
      llmNode(
        "low_rank_classifier",
        "Rank 1 vs 2",
        "Resolve whether the lower band is minimal or bounded discretion.",
        { x: 1600, y: 260 },
        stagePrompt(builder.stages.low_rank, section("Lower-band decision", `Choose rank 1 or 2 within the ${lowLabel} band. Use the lower rank when the evidence is mixed.`)),
        [
          "binary_split.discretion_band",
          "binary_split.band_rationale",
          "binary_split.affirmative_discretion_signals",
          "binary_split.constraint_evidence",
          "law_delegation.constraints_summary",
        ],
        builder.stages.low_rank.outputs,
      ),
      llmNode(
        "high_rank_classifier",
        "Rank 3 vs 4",
        "Resolve whether the higher band is substantial discretion or the agency-labeled top class.",
        { x: 1600, y: 570 },
        stagePrompt(builder.stages.high_rank, section("Higher-band decision", `Choose rank 3 or 4 within the ${highLabel} band. Require genuine policy-shaping leeway before using the top class.`)),
        [
          "binary_split.discretion_band",
          "binary_split.band_rationale",
          "binary_split.affirmative_discretion_signals",
          "binary_split.constraint_evidence",
          "law_delegation.constraints_summary",
        ],
        builder.stages.high_rank.outputs,
      ),
    );
    nextDefinition.edges.push(
      { id: "e-gate-binary-split", source: "delegation_gate", target: "binary_split", source_handle: "false", label: "Delegation found" },
      { id: "e-binary-gate", source: "binary_split", target: "binary_gate" },
      { id: "e-binary-low", source: "binary_gate", target: "low_rank_classifier", source_handle: "true", label: lowLabel },
      { id: "e-binary-high", source: "binary_gate", target: "high_rank_classifier", source_handle: "false", label: highLabel },
    );
    validationSources.push("low_rank_classifier", "high_rank_classifier");
  }

  if (builder.calibration_enabled) {
    nextDefinition.nodes.push(
      llmNode(
        "recalibration_review",
        "Optional Calibration Review",
        "Adjust only close boundary cases by at most one rank.",
        { x: mode === "binary" ? 1880 : 1690, y: 420 },
        stagePrompt(builder.stages.calibration, section("Optional calibration", "Adjust only close boundary cases, and by at most one rank.")),
        [
          "law_delegation.delegate_law",
          "discretion_rank",
          "discretion_rationale",
          "boundary_decision",
          "law_delegation.constraints_summary",
          "law_delegation.constraint_strength",
        ],
        builder.stages.calibration.outputs,
      ),
    );
    if (mode === "binary") {
      nextDefinition.edges.push(
        { id: "e-low-calibration", source: "low_rank_classifier", target: "recalibration_review" },
        { id: "e-high-calibration", source: "high_rank_classifier", target: "recalibration_review" },
      );
    } else if (downstreamStageId) {
      nextDefinition.edges.push({ id: "e-rank-calibration", source: downstreamStageId, target: "recalibration_review" });
    }
    validationSources = ["rank_zero", "recalibration_review"];
  }

  nextDefinition.nodes.push(
    {
      id: "consistency_check",
      kind: "validation",
      name: "Consistency check",
      description: "Ensure the final rank respects the delegation gate and final range.",
      position: { x: mode === "binary" ? 2140 : 1960, y: 260 },
      config: {
        rules: [
          {
            name: "No delegation implies rank zero",
            expression: {
              op: "or",
              args: [
                { op: "neq", left: { field: "law_delegation.delegate_law" }, right: { literal: false } },
                { op: "eq", left: { field: "discretion_rank" }, right: { literal: 0 } },
              ],
            },
            severity: "error",
          },
          {
            name: "Delegation true implies rank one through four",
            expression: {
              op: "or",
              args: [
                { op: "neq", left: { field: "law_delegation.delegate_law" }, right: { literal: true } },
                {
                  op: "and",
                  args: [
                    { op: "gte", left: { field: "discretion_rank" }, right: { literal: 1 } },
                    { op: "lte", left: { field: "discretion_rank" }, right: { literal: 4 } },
                  ],
                },
              ],
            },
            severity: "error",
          },
        ],
      },
    },
  );

  validationSources.forEach((source) => {
    nextDefinition.edges.push({ id: `e-${source}-validate`, source, target: "consistency_check" });
  });

  const { finalOutputs, internalOutputs } = finalOutputsFromBuilder(builder);
  nextDefinition.nodes.push({
    id: "dashboard_output",
    kind: "output",
    name: "Final dashboard outputs",
    description: "Only final campaign-facing fields are exposed as dashboard columns.",
    position: { x: mode === "binary" ? 2400 : 2220, y: 260 },
    config: {
      fields: finalOutputs.map((output) => ({ source: output.source, key: output.key, label: output.label })),
    },
  });
  nextDefinition.edges.push({ id: "e-validate-output", source: "consistency_check", target: "dashboard_output" });
  nextDefinition.outputs = finalOutputs.map((output) => ({ key: output.key, source: output.source, group: "Final" }));

  (nextDefinition.metadata as Record<string, unknown>).builder_summary = {
    mode: builder.mode,
    calibration_enabled: builder.calibration_enabled,
    final_outputs: finalOutputs,
    internal_outputs: internalOutputs,
  } satisfies WorkflowBuilderSummary;

  return nextDefinition;
}

export function ensureDiscretionBuilder(definition: WorkflowDefinition): WorkflowDefinition {
  if (isDiscretionBuilder(definition.metadata?.builder)) return compileDiscretionWorkflow(definition);
  return compileDiscretionWorkflow({
    ...definition,
    metadata: {
      ...(definition.metadata || {}),
      builder: createDefaultDiscretionBuilder(),
    },
  });
}

export function getPromptPreview(definition: WorkflowDefinition): Array<{ id: string; name: string; instructions: string }> {
  return definition.nodes
    .filter((node) => node.kind === "llm")
    .map((node) => ({
      id: node.id,
      name: node.name,
      instructions: String(node.config.instructions || ""),
    }));
}
