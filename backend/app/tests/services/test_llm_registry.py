from unittest.mock import patch

from app.llm.registry import get_llm_for_model


def test_get_llm_for_model_uses_primary_model_from_multi_model_string():
    with patch("app.llm.registry._get_request_llm_credentials", return_value=None), \
         patch("app.llm.registry._raise_if_server_fallback_disabled"), \
         patch("app.llm.registry._build_service_for_provider", return_value="sentinel") as mock_build:
        result = get_llm_for_model("gemini-1.5-flash,gpt-4o-mini")

    assert result == "sentinel"
    mock_build.assert_called_once_with("gemini", "gemini-1.5-flash", user_creds=None)


def test_get_llm_for_model_routing():
    from app.llm.registry import _classify_model, _resolve_openrouter_model

    # Gemini model classification remains native gemini
    assert _classify_model("gemini-1.5-flash") == "gemini"
    assert _classify_model("gemini-3.5-pro") == "gemini"

    # OpenAI / Anthropic model classification routes via openrouter
    assert _classify_model("gpt-4o-mini") == "openrouter"
    assert _classify_model("claude-3-5-sonnet") == "openrouter"
    assert _classify_model("deepseek-chat") == "openrouter"

    # Model resolution to OpenRouter namespace
    assert _resolve_openrouter_model("gpt-4o-mini") == "openai/gpt-4o-mini"
    assert _resolve_openrouter_model("claude-3-5-sonnet") == "anthropic/claude-3.5-sonnet"
    assert _resolve_openrouter_model("deepseek-chat") == "deepseek/deepseek-chat"


def test_get_llm_for_model_routes_gpt_to_openrouter():
    with patch("app.llm.registry._get_request_llm_credentials", return_value=None), \
         patch("app.llm.registry._raise_if_server_fallback_disabled"), \
         patch("app.llm.registry._build_service_for_provider", return_value="sentinel") as mock_build:
        result = get_llm_for_model("gpt-4o-mini")

    assert result == "sentinel"
    mock_build.assert_called_once_with("openrouter", "gpt-4o-mini", user_creds=None)

