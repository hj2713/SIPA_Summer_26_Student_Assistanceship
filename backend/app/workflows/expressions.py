from typing import Any, Dict


class ExpressionError(ValueError):
    pass


def _resolve(value: Any, context: Dict[str, Any]) -> Any:
    if not isinstance(value, dict):
        return value
    if "literal" in value:
        return value["literal"]
    if "field" in value:
        field = value["field"]
        if field in context:
            return context[field]
        current: Any = context
        for part in str(field).split("."):
            if not isinstance(current, dict) or part not in current:
                return None
            current = current[part]
        return current
    return value


def evaluate_expression(expression: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """Evaluate the safe declarative condition AST used by workflow nodes."""
    if not isinstance(expression, dict):
        raise ExpressionError("Expression must be an object.")
    op = expression.get("op")
    if op in {"and", "or"}:
        args = expression.get("args") or []
        if not isinstance(args, list) or not args:
            raise ExpressionError(f"{op} requires at least one expression.")
        values = [evaluate_expression(item, context) for item in args]
        return all(values) if op == "and" else any(values)
    if op == "not":
        return not evaluate_expression(expression.get("arg") or {}, context)

    left = _resolve(expression.get("left"), context)
    if op == "present":
        return left is not None
    right = _resolve(expression.get("right"), context)
    if op == "eq":
        return left == right
    if op == "neq":
        return left != right
    if op == "gt":
        return left > right
    if op == "gte":
        return left >= right
    if op == "lt":
        return left < right
    if op == "lte":
        return left <= right
    if op == "in":
        return left in right
    raise ExpressionError(f"Unsupported expression operator: {op!r}.")

