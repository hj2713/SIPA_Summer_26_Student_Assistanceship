from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Set


ALLOWED_NODE_KINDS = {
    "document_input",
    "llm",
    "condition",
    "set_value",
    "validation",
    "output",
    "rank_descriptor",
}


@dataclass
class ValidationIssue:
    severity: str
    code: str
    message: str
    node_id: str | None = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def validate_workflow_definition(definition: Dict[str, Any]) -> List[ValidationIssue]:
    issues: List[ValidationIssue] = []
    nodes = definition.get("nodes") or []
    edges = definition.get("edges") or []

    if not nodes:
        return [ValidationIssue("error", "empty_workflow", "Add at least one node before publishing.")]

    node_ids = [str(node.get("id", "")).strip() for node in nodes]
    valid_ids = {node_id for node_id in node_ids if node_id}
    if len(valid_ids) != len(node_ids):
        issues.append(ValidationIssue("error", "duplicate_or_blank_node_id", "Every node must have a unique, non-empty identifier."))

    for node in nodes:
        node_id = str(node.get("id", "")).strip() or None
        kind = node.get("kind")
        if kind not in ALLOWED_NODE_KINDS:
            issues.append(ValidationIssue("error", "unsupported_node_kind", f"Unsupported node type: {kind!r}.", node_id))
        if not str(node.get("name", "")).strip():
            issues.append(ValidationIssue("error", "missing_node_name", "Give this node a clear name.", node_id))
        config = node.get("config") or {}
        if kind == "llm":
            if not str(config.get("instructions", "")).strip():
                issues.append(ValidationIssue("error", "missing_llm_instructions", "LLM nodes require instructions.", node_id))
            outputs = config.get("outputs") or []
            if not outputs:
                issues.append(ValidationIssue("error", "missing_llm_outputs", "LLM nodes must define at least one typed output.", node_id))
            output_keys = [output.get("key") for output in outputs]
            if any(not key for key in output_keys) or len(set(output_keys)) != len(output_keys):
                issues.append(ValidationIssue("error", "invalid_output_keys", "LLM output keys must be non-empty and unique within the node.", node_id))
        elif kind == "rank_descriptor":
            if not str(config.get("instructions", "")).strip():
                issues.append(ValidationIssue("warning", "empty_rank_descriptor", "Rank descriptor node has no prompt yet. Add criteria before publishing.", node_id))
        elif kind == "condition" and not config.get("expression"):
            issues.append(ValidationIssue("error", "missing_condition", "Condition nodes require an expression.", node_id))
        elif kind == "set_value" and not (config.get("assignments") or []):
            issues.append(ValidationIssue("error", "missing_assignments", "Set Value nodes require at least one assignment.", node_id))

    adjacency: Dict[str, Set[str]] = {node_id: set() for node_id in valid_ids}
    reverse_adjacency: Dict[str, Set[str]] = {node_id: set() for node_id in valid_ids}
    indegree: Dict[str, int] = {node_id: 0 for node_id in valid_ids}
    connected: Set[str] = set()
    edge_ids: Set[str] = set()
    for edge in edges:
        edge_id = str(edge.get("id", "")).strip()
        source = edge.get("source")
        target = edge.get("target")
        if not edge_id or edge_id in edge_ids:
            issues.append(ValidationIssue("error", "duplicate_or_blank_edge_id", "Every connection must have a unique identifier."))
        edge_ids.add(edge_id)
        if source not in valid_ids or target not in valid_ids:
            issues.append(ValidationIssue("error", "dangling_edge", "A connection references a node that no longer exists."))
            continue
        if source == target:
            issues.append(ValidationIssue("error", "self_cycle", "A node cannot connect to itself.", source))
            continue
        connected.update((source, target))
        if target not in adjacency[source]:
            adjacency[source].add(target)
            reverse_adjacency[target].add(source)
            indegree[target] += 1

    ready = [node_id for node_id, degree in indegree.items() if degree == 0]
    visited = 0
    while ready:
        current = ready.pop()
        visited += 1
        for target in adjacency[current]:
            indegree[target] -= 1
            if indegree[target] == 0:
                ready.append(target)
    if visited != len(valid_ids):
        issues.append(ValidationIssue("error", "cycle_detected", "Workflow connections must form an acyclic graph."))

    produced_by: Dict[str, str] = {}
    for node in nodes:
        node_id = node.get("id")
        config = node.get("config") or {}
        for output in config.get("outputs") or []:
            if output.get("key"):
                produced_by[f"{node_id}.{output['key']}"] = node_id
        for assignment in config.get("assignments") or []:
            if assignment.get("field"):
                produced_by[assignment["field"]] = node_id

    def ancestors(node_id: str) -> Set[str]:
        found: Set[str] = set()
        pending = list(reverse_adjacency.get(node_id, set()))
        while pending:
            current = pending.pop()
            if current in found:
                continue
            found.add(current)
            pending.extend(reverse_adjacency.get(current, set()))
        return found

    def expression_fields(expression: Any) -> Set[str]:
        if not isinstance(expression, dict):
            return set()
        fields = {expression["field"]} if expression.get("field") else set()
        for value in expression.values():
            if isinstance(value, dict):
                fields.update(expression_fields(value))
            elif isinstance(value, list):
                for item in value:
                    fields.update(expression_fields(item))
        return fields

    for node in nodes:
        node_id = node.get("id")
        if node_id not in valid_ids:
            continue
        config = node.get("config") or {}
        references = set(config.get("input_fields") or [])
        references.update(expression_fields(config.get("expression")))
        for rule in config.get("rules") or []:
            references.update(expression_fields(rule.get("expression")))
        allowed_ancestors = ancestors(node_id)
        for field in references:
            producer = produced_by.get(field)
            if producer is None:
                issues.append(ValidationIssue("error", "unknown_field_reference", f"Referenced field {field!r} is not produced by any workflow node.", node_id))
            elif producer not in allowed_ancestors:
                issues.append(ValidationIssue("error", "non_upstream_field_reference", f"Referenced field {field!r} must come from a connected upstream node.", node_id))

    kinds = {node.get("kind") for node in nodes}
    if "document_input" not in kinds:
        issues.append(ValidationIssue("warning", "missing_document_input", "This workflow has no Document Input node."))
    if "output" not in kinds:
        issues.append(ValidationIssue("error", "missing_output", "Add a Dashboard Output node before publishing."))
    for node in nodes:
        node_id = node.get("id")
        if len(nodes) > 1 and node_id not in connected:
            issues.append(ValidationIssue("warning", "orphan_node", "This node is not connected to the workflow.", node_id))

    output_keys = [output.get("key") for output in (definition.get("outputs") or [])]
    if len([key for key in output_keys if key]) != len(set(key for key in output_keys if key)):
        issues.append(ValidationIssue("error", "duplicate_workflow_output", "Dashboard output keys must be unique."))

    return issues
