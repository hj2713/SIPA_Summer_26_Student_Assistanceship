# Reusable Research Coding Workflows

Status: Standalone workflow foundation and visual builder implemented; campaign adoption deferred  
Date: 2026-06-22

## Implementation Snapshot — 2026-06-22

Implemented as a new isolated feature:

- workspace-scoped Workflow Library;
- delegation/discretion and blank templates;
- visual DAG builder with typed node cards and connections;
- LLM nodes with multiple typed outputs and explicit source/context selection;
- condition nodes using a safe declarative expression AST;
- deterministic Set Value nodes;
- validation and dashboard-output nodes;
- upstream-only field selection;
- server-side graph, cycle, reference, and node-configuration validation;
- optimistic draft revisions;
- immutable published versions with content hashes and changelogs;
- SQLite and PostgreSQL persistence;
- reference expression evaluator and regression tests.
- isolated draft test execution with real LLM stages, deterministic branching, skipped-node tracking, and a node-by-node trace.

Intentionally not connected yet:

- campaign creation;
- campaign document execution;
- current dashboard schemas or coding results;
- migration of existing campaigns.

Those boundaries preserve all current features until the workflow engine is deliberately adopted by campaigns.

## Executive Decision

Replace campaign-specific prompt-and-column configuration with reusable, versioned **Coding Workflows**.

A workflow is the research instrument: it defines typed outputs, deterministic rules, LLM steps, dependencies, source-text policy, validation, and review behavior. A campaign is a run container: it selects one published workflow version and applies it to a set of documents.

The product should provide a visual directed-graph editor, but the graph canvas must be a view over a validated workflow definition. Canvas coordinates must never be the executable source of truth.

## Why This Fits The Research

The professor's June 19 workflow describes staged, auditable social-science coding:

1. hold the test set fixed;
2. control the source universe;
3. execute stages in order;
4. preserve intermediate findings;
5. compare final values against a benchmark;
6. inspect errors law by law;
7. revise and version the method;
8. rerun under controlled conditions.

That is a versioned computational coding protocol, not a generic AI spreadsheet. The likely direction is a reusable method for constructing a law-level dataset containing delegation, actors, authority, centrality, constraints, constraint categories, discretion, evidence, rationales, and review metadata.

## Product Vocabulary

Use these terms consistently:

- **Workflow**: reusable research-coding method owned by a workspace.
- **Workflow Version**: immutable published snapshot of a workflow.
- **Node**: one executable stage in the workflow.
- **Output Field**: one typed value produced by a node.
- **Campaign**: a document collection configured to use one workflow version.
- **Run**: one execution of a workflow version against campaign documents.
- **Node Result**: stored output, reasoning, evidence, status, cost, and provenance for one document and node.
- **Benchmark Set**: versioned expected outputs for a controlled source set.

Do not call workflow nodes “columns.” A node may produce several related output fields, which the dashboard renders as grouped columns.

## Core Example

The initial workflow should look like this:

```text
Document input (CQ summary)
        |
        v
Delegation analysis [LLM]
  outputs:
  - delegate_law: boolean
  - administrative_actors: list[string]
  - delegated_authorities: list[string]
  - authority_evidence: list[evidence]
  - delegation_centrality: enum
  - rationale: string
        |
        v
Is delegate_law false? [Condition]
       / \
    yes   no
     |     |
     v     v
Set discretion_rank = 0    Discretion analysis [LLM]
                           inputs:
                           - selected prior outputs
                           - CQ summary
                           - discretion rubric
                           outputs:
                           - discretion_rank: integer 1..4
                           - discretion_rationale: string
                           - rank_evidence: list[evidence]
       \     /
        v   v
Validate final result
        |
        v
Dashboard output
```

The false branch makes no LLM call. The true branch receives the selected delegation outputs and the source text. This saves cost and makes the methodological rule explicit.

## Workflow Builder User Experience

### 1. Workflow Library

Add a top-level **Coding Workflows** navigation item.

The library page shows:

- workflow name and description;
- draft or published status;
- latest version;
- output fields;
- last benchmark result;
- campaigns using each version;
- duplicate, archive, compare versions, and create actions.

Initial templates:

1. Delegation + Rough Guide Discretion;
2. Delegation Screen Only;
3. Blank Workflow.

### 2. Workflow Builder Page

Use a three-panel layout:

- **Left — Node palette**: inputs, AI analysis, condition, set value, transform, validation, review, output.
- **Center — Graph canvas**: nodes and typed connections, zoom, fit, minimap, auto-layout.
- **Right — Inspector**: configuration for the selected node.

Header actions:

- workflow name;
- Draft / Published badge;
- undo / redo;
- validate;
- test with one document;
- compare versions;
- publish version.

Also provide a **Steps view** beside the canvas. It renders the same graph as an accessible ordered outline. Researchers must not be forced to manipulate a canvas for simple pipelines.

### 3. Node Inspector

Every node inspector should answer five questions:

1. What does this step do?
2. What inputs can it read?
3. What outputs does it produce?
4. When does it run?
5. What should happen if it fails?

For LLM nodes, configure:

- instructions / rubric;
- model policy (workflow default or override);
- source input: none, selected summary, full document, or extracted evidence only;
- prior outputs to include;
- typed output schema;
- evidence requirement;
- temperature and retry policy under an Advanced section;
- estimated calls and cost.

For condition nodes, configure with a form builder:

```text
WHEN [delegation.delegate_law] [is] [false]
THEN follow branch “No delegation”
ELSE follow branch “Delegation found”
```

Support nested AND/OR groups, comparisons, membership, missing/present, and numeric ranges.

For set-value nodes:

```text
SET [discretion.discretion_rank] TO [0]
SET [discretion.discretion_rationale] TO ["No delegation was identified."]
```

### 4. Workflow Testing Drawer

Before publishing, a researcher selects one or more existing documents and runs the draft.

Show:

- path taken through the graph;
- inputs supplied to every node;
- outputs and validation errors;
- skipped nodes and the reason they were skipped;
- LLM prompt preview;
- token/cost usage;
- elapsed time;
- final dashboard columns.

Allow a node to be rerun after editing without rerunning unaffected ancestors.

### 5. Campaign Creation

Replace prompt/schema construction with:

1. campaign name;
2. select a published workflow;
3. select an immutable workflow version;
4. choose the document source universe (CQ summaries, major provisions, full text, or another labeled source set);
5. select/upload documents;
6. optional benchmark set;
7. review estimated calls and outputs;
8. create campaign.

The user may **fork workflow into a new draft**, but cannot edit a published workflow from inside a campaign.

### 6. Dashboard

The dashboard remains document rows × output fields, with improvements:

- group related fields beneath their producing node;
- show the workflow name and pinned version;
- expose the execution path for each document;
- distinguish LLM, deterministic, manual, and skipped values;
- show source universe prominently;
- inspect node inputs, output, evidence, rationale, prompt/model, and cost;
- override a value and explicitly choose whether to recompute downstream nodes;
- never silently mutate historical results after a workflow changes.

## Node Types

### Required For Version 1

1. **Document Input** — exposes law identifier, source type, parsed text, and metadata.
2. **LLM Analysis** — produces one or more typed fields plus evidence/rationale.
3. **Condition** — routes execution based on prior typed outputs.
4. **Set Value** — writes deterministic constants or safe expressions.
5. **Validation** — asserts cross-field consistency and flags/rejects invalid results.
6. **Output** — selects and groups fields shown in the dashboard/export.

### Later

1. Human Review Gate.
2. Evidence Extractor.
3. Multi-model Vote / Consensus.
4. Lookup Table.
5. Formula / Transform.
6. Reusable Sub-workflow.
7. Classifier node for a trained local model.
8. Benchmark Comparison node.

## Output Model

An LLM node must support multiple typed outputs. Initial field types:

- boolean;
- integer;
- decimal;
- string;
- enum;
- list of scalar values;
- evidence list: quote, source location, explanation;
- structured object using a constrained nested schema.

Every stored field value needs provenance:

- producing node and workflow version;
- source document/version;
- input values/hash;
- method: LLM, deterministic rule, manual, imported;
- model and prompt version when relevant;
- timestamp;
- confidence if supplied;
- reasoning/evidence;
- override history.

## Safe Rule Model

Do not execute arbitrary Python or JavaScript entered by users. `eval`, shell execution, imports, filesystem access, and network access are out of scope.

Version 1 conditions should be stored as a typed JSON abstract syntax tree created by the visual form:

```json
{
  "op": "eq",
  "left": { "field": "delegation.delegate_law" },
  "right": { "literal": false }
}
```

The backend validates field existence and types when the workflow is saved and again when it is published.

An advanced text mode can later use Common Expression Language (CEL), which is designed for parse/check/evaluate workflows and safe embedded expressions. The visual AST should remain the primary representation until the node model and field types stabilize.

“Custom code” should later mean administrator-installed, tested node plugins from a server-side registry—not code pasted into a workflow.

## Workflow Definition

Persist semantics independently from canvas layout:

```json
{
  "workflow_version": 1,
  "nodes": [
    {
      "id": "delegation",
      "kind": "llm",
      "config": {
        "document_context": "source_text",
        "input_fields": [],
        "instructions_version_id": "...",
        "outputs": [
          { "key": "delegate_law", "type": "boolean", "required": true },
          { "key": "administrative_actors", "type": "list[string]" },
          { "key": "delegated_authorities", "type": "list[string]" },
          { "key": "authority_evidence", "type": "evidence[]" }
        ]
      }
    },
    {
      "id": "no_delegation",
      "kind": "condition",
      "config": {
        "expression": {
          "op": "eq",
          "left": { "field": "delegation.delegate_law" },
          "right": { "literal": false }
        }
      }
    }
  ],
  "edges": [],
  "outputs": [],
  "layout": { "nodes": {}, "viewport": {} }
}
```

## Validation Rules

A draft cannot be published unless:

- graph is acyclic;
- all required node inputs are connected;
- every referenced field exists upstream;
- expression types are valid;
- every branch either reaches an output or is explicitly terminal;
- output keys are unique and stable;
- required outputs are produced on every reachable path;
- LLM output schemas are supported;
- no orphan nodes exist unless marked disabled;
- deterministic rules cannot write incompatible types;
- workflow has passed at least one test execution;
- source policy is explicit.

Warnings, not blockers:

- an LLM is called when a deterministic branch could avoid it;
- a full document is sent when prior outputs/evidence may suffice;
- a downstream node requests every prior field;
- no evidence field exists for a substantive classification;
- a benchmarked workflow is being published with worse metrics.

## Execution Semantics

For every document:

1. create a document-run record pinned to workflow version and source snapshot;
2. topologically schedule ready nodes;
3. evaluate conditions and record the selected path;
4. execute deterministic nodes locally;
5. build minimal LLM context from the node's declared inputs;
6. validate and store each node result immediately;
7. retry transient LLM failures according to policy;
8. stop, continue, or request review according to node failure policy;
9. materialize selected workflow outputs for the dashboard;
10. record run metrics and cost.

Independent nodes may run in parallel later. Begin with deterministic per-document ordering for easier debugging.

### Caching And Recalculation

Hash each node's effective inputs, node configuration, model, prompt, and source snapshot. Reuse a successful result only when the hash matches exactly.

When an upstream value is changed:

- mark dependent descendants stale;
- leave unaffected branches untouched;
- let the user preview recomputation scope;
- retain all superseded results in history.

## Versioning

Workflow states:

1. Draft — editable.
2. Published — immutable and available to campaigns.
3. Archived — retained for reproducibility but hidden from normal selection.

Publishing creates version `1`, `2`, and so on. Editing a published workflow creates a new draft based on it.

Campaigns pin a specific version. Offer an explicit **Upgrade workflow** action showing:

- node/edge changes;
- prompt changes;
- output schema changes;
- invalidated dashboard columns;
- estimated rerun scope;
- benchmark comparison.

## Database Additions

Introduce normalized records rather than storing the whole research method inside `dashboards.schema`:

1. `coding_workflows`
   - id, workspace_id, name, description, status, latest_version, created_by, timestamps.
2. `coding_workflow_versions`
   - id, workflow_id, version, definition_json, definition_hash, changelog, published_by, published_at.
3. `campaign_workflows`
   - campaign_id, workflow_version_id, source_policy_json.
4. `coding_runs`
   - id, campaign_id, workflow_version_id, status, source_set, model policy, timestamps, aggregate cost.
5. `coding_document_runs`
   - id, run_id, document_id, source_snapshot_hash, status, path_json, timestamps.
6. `coding_node_results`
   - id, document_run_id, node_id, status, input_hash, inputs_json, outputs_json, evidence_json, rationale, execution_method, model, prompt hash, usage, error, timestamps.
7. `coding_output_values`
   - materialized dashboard/export values with provenance references.
8. `workflow_test_runs`
   - draft definition hash, document, results, validation status.
9. `benchmark_sets`, `benchmark_items`, `benchmark_runs`, `benchmark_run_items`.
10. `review_queue_items` and `manual_overrides`.

Use JSON for versioned definitions and node payloads, but normalized rows for executions, results, querying, metrics, and provenance.

## Backend Modules

Create a separate workflow package:

```text
backend/app/workflows/
  models.py
  validator.py
  graph.py
  expressions.py
  context.py
  executor.py
  registry.py
  nodes/
    base.py
    document_input.py
    llm_analysis.py
    condition.py
    set_value.py
    validation.py
    output.py
```

`CodingService` should become a compatibility adapter during migration, then delegate to `WorkflowExecutor`.

Every node implements a typed contract similar to:

```python
class WorkflowNode:
    def validate(config, graph_context) -> list[ValidationIssue]: ...
    async def execute(run_context, config) -> NodeResult: ...
```

## API Surface

Initial endpoints:

- `GET/POST /api/workflows`
- `GET/PATCH/DELETE /api/workflows/{id}`
- `POST /api/workflows/{id}/draft`
- `POST /api/workflows/{id}/validate`
- `POST /api/workflows/{id}/test-runs`
- `POST /api/workflows/{id}/publish`
- `GET /api/workflows/{id}/versions`
- `GET /api/workflows/{id}/versions/{version}`
- `GET /api/workflows/{id}/versions/compare`
- `POST /api/campaigns/{id}/workflow`
- `POST /api/campaigns/{id}/runs`
- `GET /api/runs/{id}`
- `GET /api/document-runs/{id}/trace`
- `POST /api/document-runs/{id}/recompute`

Use optimistic concurrency on draft updates with a revision number or ETag.

## Frontend Structure

Recommended routes:

- `/workflows`
- `/workflows/new`
- `/workflows/:id`
- `/workflows/:id/versions/:version`
- `/campaigns/:id` remains the dataset dashboard.

Recommended packages/components:

```text
frontend/src/features/workflows/
  WorkflowLibraryPage.tsx
  WorkflowBuilderPage.tsx
  WorkflowCanvas.tsx
  WorkflowStepsView.tsx
  NodePalette.tsx
  NodeInspector.tsx
  WorkflowTestDrawer.tsx
  VersionDiffDialog.tsx
  nodes/
  conditions/
  state/
  types.ts
```

A node-editor library such as React Flow is appropriate for the canvas and can serialize nodes, edges, and viewport. Store its layout separately from executable semantics.

## Benchmark And Review Integration

The workflow feature must not outrun research validation.

For every published version, retain:

- benchmark set and source universe;
- model version;
- per-class recall, balanced accuracy, confusion matrix;
- law-level mismatches;
- failure categories;
- professor corrections;
- version-to-version metric comparison.

The active-review queue should prioritize:

1. benchmark mismatches;
2. workflow-version disagreements;
3. model disagreements;
4. validation failures;
5. weak/missing evidence;
6. rare negative-class candidates.

## Migration From Current Campaigns

1. Keep existing campaigns readable.
2. Convert each current schema into a generated **Legacy Campaign Workflow** draft.
3. Map every current column with a prompt to an LLM node.
4. Convert `depends_on` to graph edges and selected prior-field inputs.
5. Map current column values and histories to imported node results/output values.
6. Require review and publishing before the generated workflow can be reused.
7. Remove schema editing from campaign settings only after migrated campaigns work end to end.

Do not attempt a destructive one-time migration.

## Delivery Plan

### Phase 0 — Contract And Prototype

Deliver:

- workflow definition schema;
- node contracts;
- delegation/discretion reference workflow fixture;
- graph validator;
- low-fidelity builder prototype;
- database migration design.

Exit gate: the example workflow validates, serializes, reloads, and produces identical semantics without relying on canvas position.

### Phase 1 — Headless Workflow Engine

Deliver:

- workflow/version persistence;
- condition AST evaluator;
- Document Input, LLM Analysis, Condition, Set Value, Validation, Output nodes;
- topological executor;
- node result persistence and traces;
- input hashing and descendant invalidation;
- unit/integration tests.

Exit gate: the delegation-false case deterministically yields rank 0 with zero rank-LLM calls; the true case calls the rank node with declared prior outputs and source text.

### Phase 2 — Builder UI

Deliver:

- workflow library;
- canvas and Steps view;
- inspectors for version-1 nodes;
- typed connections;
- validation panel;
- test drawer;
- draft autosave, undo/redo, publish flow.

Exit gate: a non-developer can recreate and test the reference workflow without typing identifiers or JSON.

### Phase 3 — Campaign And Dashboard Integration

Deliver:

- workflow selection in campaign creation;
- pinned versions;
- workflow executor for campaign documents;
- grouped output columns;
- per-document trace view;
- downstream recompute after overrides;
- CSV export with run metadata.

Exit gate: two campaigns can reuse the same published workflow on different files while retaining independent runs and review histories.

### Phase 4 — Benchmarking And Research Review

Deliver:

- benchmark sets and fixed source universes;
- workflow-version comparisons;
- confusion matrix and class-specific metrics;
- error taxonomy;
- review queue;
- professor correction capture.

Exit gate: Prompt/rule changes can be evaluated reproducibly on the fixed 15-law set before publication.

### Phase 5 — Advanced Research Methods

Possible additions after evidence supports them:

- multi-model voters and disagreement nodes;
- curated few-shot sets;
- reusable sub-workflows;
- human review gates;
- trained classifier nodes;
- advanced CEL expressions;
- larger-scale job workers and parallel branches;
- automatic prompt optimization only against a trustworthy benchmark.

## Testing Strategy

### Unit Tests

- graph cycle and reachability validation;
- field/type checking;
- condition evaluation;
- branch selection;
- deterministic assignments;
- context minimization;
- hashing/caching;
- downstream invalidation;
- version immutability.

### Integration Tests

- false delegation skips discretion LLM and sets rank 0;
- true delegation passes selected structured outputs and source text;
- node failure records partial trace;
- manual override marks descendants stale;
- campaign stays pinned after a new workflow version is published;
- source-summary and full-text runs cannot be confused.

### Research Acceptance Tests

- fixed 15-law benchmark is reproducible;
- exported rows preserve law identifiers and source universe;
- stage-by-stage outputs match the professor's required review fields;
- metrics include false-class recall, true-class recall, balanced accuracy, and confusion matrix;
- every final rank can be traced to delegation, authority, constraints, and evidence.

## Explicit Non-Decisions

Do not introduce these in the first implementation:

- arbitrary user code;
- loops in the graph;
- external API nodes;
- scheduling/time-based automation;
- autonomous agents choosing the workflow structure;
- Temporal or another distributed durable-workflow platform;
- a full weak-supervision framework;
- workflow edits that silently change existing campaign results.

The current workload can be executed with database-backed run/node states and an application worker. A distributed orchestrator is only justified when run volume, recovery requirements, or multi-worker coordination demand it.

## Questions For The Professor

The software can proceed before all answers are known, but these answers determine the next domain nodes:

1. What exact intermediate fields did the manual coding process record besides `DelegateLaw` and rank?
2. Are actor, authority, constraints, and centrality separate coded variables or only reasoning aids?
3. Which values must be law-level versus provision-level?
4. Is the target replication of a historical codebook or a revised substantive definition?
5. What are the allowed constraint categories and their definitions?
6. How should multiple delegations within one law aggregate to a law-level rank?
7. When summaries omit a fact, should the field be false, unknown, not applicable, or missing?
8. Which decisions require direct quoted evidence?
9. Which stages may use full text, and which must remain CQ-summary-only?
10. What disagreement should automatically require professor review?

## Architectural References

- React Flow supports serializable nodes, edges, and viewport for a visual editor: https://reactflow.dev/api-reference/types/react-flow-json-object
- CEL is designed for safe, typed, compile-once/evaluate-many embedded expressions: https://cel.dev/overview/cel-overview
- The methodological direction is already recorded in `Project-Tracking/METHODOLOGY_STRATEGY.md` under staged pipelines, active review, weak supervision, and benchmark discipline.
