from typing import Any, Dict, List, Optional

from pydantic import Field, create_model

from app.llm.registry import get_llm, get_llm_for_model
from app.llm.types import LLMMessage
from app.workflows.expressions import evaluate_expression
from app.workflows.validator import validate_workflow_definition


FIELD_TYPES = {
    "boolean": bool,
    "integer": int,
    "decimal": float,
    "string": str,
    "enum": str,
    "list[string]": List[str],
    "evidence[]": List[str],
    "object": Dict[str, Any],
}


class WorkflowExecutionError(ValueError):
    pass


class WorkflowExecutor:
    """Execute a validated workflow draft without coupling it to campaign storage."""

    def _ordered_nodes(self, definition: Dict[str, Any]) -> List[Dict[str, Any]]:
        nodes = definition.get("nodes") or []
        by_id = {node["id"]: node for node in nodes}
        adjacency = {node_id: [] for node_id in by_id}
        indegree = {node_id: 0 for node_id in by_id}
        for edge in definition.get("edges") or []:
            if edge.get("source") in by_id and edge.get("target") in by_id:
                adjacency[edge["source"]].append(edge["target"])
                indegree[edge["target"]] += 1
        ready = [node_id for node_id, degree in indegree.items() if degree == 0]
        ordered = []
        while ready:
            current = ready.pop(0)
            ordered.append(by_id[current])
            for target in adjacency[current]:
                indegree[target] -= 1
                if indegree[target] == 0:
                    ready.append(target)
        if len(ordered) != len(nodes):
            raise WorkflowExecutionError("Workflow contains a cycle.")
        return ordered

    def _llm_schema(self, node: Dict[str, Any]):
        fields = {}
        for output in node.get("config", {}).get("outputs") or []:
            key = output["key"]
            python_type = FIELD_TYPES.get(output.get("type"), str)
            if output.get("required", False):
                fields[key] = (python_type, Field(..., description=output.get("label") or key))
            else:
                fields[key] = (python_type | None, Field(default=None, description=output.get("label") or key))
        return create_model(f"WorkflowNode_{node['id']}", **fields)

    def _context_value(self, context: Dict[str, Any], source: str) -> Any:
        if source in context:
            return context[source]
        current: Any = context
        for part in str(source).split("."):
            if not isinstance(current, dict) or part not in current:
                return None
            current = current[part]
        return current

    async def execute(
        self,
        definition: Dict[str, Any],
        source_text: str,
        model_name: Optional[str] = None,
        log_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        issues = validate_workflow_definition(definition)
        errors = [issue.to_dict() for issue in issues if issue.severity == "error"]
        if errors:
            raise WorkflowExecutionError(f"Workflow is invalid: {errors[0]['message']}")

        ordered = self._ordered_nodes(definition)
        incoming: Dict[str, List[Dict[str, Any]]] = {node["id"]: [] for node in ordered}
        outgoing: Dict[str, List[Dict[str, Any]]] = {node["id"]: [] for node in ordered}
        for edge in definition.get("edges") or []:
            if edge.get("target") in incoming and edge.get("source") in outgoing:
                incoming[edge["target"]].append(edge)
                outgoing[edge["source"]].append(edge)

        context: Dict[str, Any] = {"document.text": source_text}
        edge_active: Dict[str, bool] = {}
        trace = []

        for node in ordered:
            node_id = node["id"]
            node_kind = node["kind"]
            node_incoming = incoming[node_id]
            active = not node_incoming or any(edge_active.get(edge["id"], False) for edge in node_incoming)
            if not active:
                trace.append({"node_id": node_id, "name": node["name"], "kind": node_kind, "status": "skipped", "outputs": {}, "message": "This branch was not selected."})
                for edge in outgoing[node_id]:
                    edge_active[edge["id"]] = False
                continue

            config = node.get("config") or {}
            outputs: Dict[str, Any] = {}
            message = ""
            if node_kind == "document_input":
                outputs = {"text_length": len(source_text), "source_policy": config.get("source_policy", "campaign_source")}
            elif node_kind == "llm":
                selected_inputs = {field: context.get(field) for field in config.get("input_fields") or []}
                document_context = config.get("document_context", "source_text")
                prompt_parts = [
                    f"=== STAGE ===\n{node['name']}",
                    f"=== INSTRUCTIONS ===\n{config.get('instructions', '')}",
                    f"=== DECLARED PRIOR OUTPUTS ===\n{selected_inputs or 'None'}",
                ]
                if document_context != "none":
                    prompt_parts.append(f"=== SOURCE TEXT ===\n{source_text}")
                
                llm = get_llm_for_model(model_name)
                llm_log_context = {"service": "workflow_test", "workflow_node_id": node_id}
                if log_context:
                    llm_log_context.update(log_context)
                parsed = await llm.parse_structured(
                    [
                        LLMMessage(
                            role="system",
                            content="You are executing one stage of a versioned research coding workflow. Return only the requested structured fields.",
                        ),
                        LLMMessage(role="user", content="\n\n".join(prompt_parts)),
                    ],
                    schema=self._llm_schema(node),
                    log_context=llm_log_context,
                )
                outputs = parsed.model_dump()
            elif node_kind == "condition":
                result = evaluate_expression(config.get("expression") or {}, context)
                outputs = {"result": result}
                message = "TRUE branch selected." if result else "FALSE branch selected."
                for edge in outgoing[node_id]:
                    handle = edge.get("source_handle")
                    edge_active[edge["id"]] = (handle == "true" and result) or (handle == "false" and not result) or handle not in {"true", "false"}
            elif node_kind == "set_value":
                for assignment in config.get("assignments") or []:
                    outputs[assignment["field"]] = assignment.get("value")
            elif node_kind == "validation":
                rule_results = []
                for rule in config.get("rules") or []:
                    passed = evaluate_expression(rule.get("expression") or {}, context)
                    rule_results.append({"name": rule.get("name", "Validation rule"), "passed": passed, "severity": rule.get("severity", "error")})
                outputs = {"rules": rule_results, "valid": all(item["passed"] for item in rule_results)}
            elif node_kind == "output":
                for field in config.get("fields") or []:
                    if isinstance(field, dict):
                        source = str(field.get("source") or field.get("field") or "")
                        key = str(field.get("key") or source)
                    else:
                        source = str(field)
                        key = source
                    if source:
                        outputs[key] = self._context_value(context, source)

            for key, value in outputs.items():
                context[f"{node_id}.{key}"] = value
                if key not in context:
                    context[key] = value
            if node_kind != "condition":
                for edge in outgoing[node_id]:
                    edge_active[edge["id"]] = True
            trace.append({"node_id": node_id, "name": node["name"], "kind": node_kind, "status": "completed", "outputs": outputs, "message": message})

        output_nodes = [item for item in trace if item["kind"] == "output" and item["status"] == "completed"]
        final_outputs = output_nodes[-1]["outputs"] if output_nodes else {}
        return {"trace": trace, "outputs": final_outputs, "context": context}


workflow_executor = WorkflowExecutor()
