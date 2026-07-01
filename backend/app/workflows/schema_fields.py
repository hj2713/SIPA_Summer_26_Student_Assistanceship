from __future__ import annotations

from typing import Any


def extract_dashboard_schema_fields(definition: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Map workflow output-node fields to dashboard schema columns.

    Output nodes store final dashboard columns in ``config.fields``. This helper
    resolves the column key/source plus best-effort type/label metadata from the
    upstream node outputs or set-value assignments that produce those values.
    """
    def_dict = definition or {}
    nodes = def_dict.get("nodes") or []

    source_meta: dict[str, dict[str, Any]] = {}
    key_meta: dict[str, dict[str, Any]] = {}

    for node in nodes:
        node_id = node.get("id")
        config = node.get("config") or {}

        for output in config.get("outputs") or []:
            key = output.get("key")
            if not key:
                continue
            meta = {
                "type": output.get("type") or "string",
                "label": output.get("label") or key,
                "options": output.get("options") or None,
            }
            source_meta[f"{node_id}.{key}"] = meta
            key_meta.setdefault(key, meta)

        for assignment in config.get("assignments") or []:
            key = assignment.get("field")
            if not key:
                continue
            meta = {
                "type": assignment.get("type") or "string",
                "label": key,
                "options": None,
            }
            source_meta[f"{node_id}.{key}"] = meta
            key_meta.setdefault(key, meta)

    schema_fields: list[dict[str, Any]] = []
    seen: set[str] = set()

    for node in nodes:
        if node.get("kind") != "output":
            continue
        config = node.get("config") or {}
        for field in config.get("fields") or []:
            if isinstance(field, dict):
                source = str(field.get("source") or field.get("field") or "").strip()
                key = str(field.get("key") or source).strip()
                label = field.get("label")
            else:
                source = str(field).strip()
                key = source
                label = None

            if not key or key in seen:
                continue

            meta = source_meta.get(source) or key_meta.get(source.split(".")[-1]) or key_meta.get(key) or {}
            schema_fields.append({
                "name": key,
                "type": meta.get("type") or "string",
                "description": label or meta.get("label") or f"Workflow Output: {key}",
                "options": meta.get("options") or None,
                "prompt": "",
                "depends_on": [],
                "workflow_source": source or key,
            })
            seen.add(key)

    return schema_fields
