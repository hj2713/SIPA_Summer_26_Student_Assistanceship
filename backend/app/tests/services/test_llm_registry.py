from unittest.mock import patch

from app.llm.registry import get_llm_for_model


def test_get_llm_for_model_uses_primary_model_from_multi_model_string():
    with patch("app.llm.registry._get_request_llm_credentials", return_value=None), \
         patch("app.llm.registry._raise_if_server_fallback_disabled"), \
         patch("app.llm.registry._build_service_for_provider", return_value="sentinel") as mock_build:
        result = get_llm_for_model("gemini-1.5-flash,gpt-4o-mini")

    assert result == "sentinel"
    mock_build.assert_called_once_with("openrouter", "gemini-1.5-flash", user_creds=None)
