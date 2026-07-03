import json

from app.core.main import _normalize_dashboard_coded_values_for_restart


def test_normalize_dashboard_coded_values_for_restart_marks_stale_model_runs_failed():
    coded_values = {
        "deepseek-r1": {
            "status": "processing",
            "values": {},
        },
        "z-ai/glm-5.2": {
            "status": "pending",
            "values": {},
        },
        "gemini-3.1-flash-lite": {
            "status": "completed",
            "values": {"delegate_law": True},
        },
    }

    normalized = json.loads(
        _normalize_dashboard_coded_values_for_restart(
            json.dumps(coded_values),
            "Coding was interrupted due to server restart or reload.",
        )
    )

    assert normalized["deepseek-r1"]["status"] == "failed"
    assert normalized["deepseek-r1"]["error_type"] == "API_FAILURE"
    assert normalized["z-ai/glm-5.2"]["status"] == "failed"
    assert normalized["gemini-3.1-flash-lite"]["status"] == "completed"

