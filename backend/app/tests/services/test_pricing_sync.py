"""Tests for Model Pricing Synchronization, Prompt Caching Discounts, and OpenRouter Reconciliation."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.database import get_db_conn
from app.llm.registry import calculate_cost, get_model_rates, invalidate_pricing_cache
from app.services.pricing_sync_service import (
    seed_default_model_pricing,
    sync_litellm_model_pricing,
    reconcile_openrouter_cost,
)


def test_seed_default_model_pricing():
    """Verify that default model pricing is seeded into the database."""
    invalidate_pricing_cache()
    seeded = seed_default_model_pricing()
    assert seeded >= 0

    with get_db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM model_pricing;")
        count = cursor.fetchone()[0]
        assert count > 0


def test_calculate_cost_standard_and_cached():
    """Verify standard pricing without cache, and discounted pricing with prompt caching."""
    invalidate_pricing_cache()
    # 1. Standard calculation without cache
    in_tokens = 10_000
    out_tokens = 2_000
    standard_cost = calculate_cost("gpt-4o-mini", in_tokens, out_tokens)
    # gpt-4o-mini: input = $0.15 / 1M, output = $0.60 / 1M
    expected_standard = (10_000 * 0.15 / 1_000_000) + (2_000 * 0.60 / 1_000_000)
    assert pytest.approx(standard_cost, rel=1e-5) == expected_standard

    # 2. Calculation with 8,000 cached tokens (75% cache discount)
    cached_cost = calculate_cost("gpt-4o-mini", in_tokens, out_tokens, cached_tokens=8_000)
    # regular input: 2,000 * 0.15 / 1M = 0.0003
    # cached input: 8,000 * (0.15 * 0.25) / 1M = 0.0003
    # output: 2,000 * 0.60 / 1M = 0.0012
    # total = 0.0018 vs standard 0.0027 (substantial savings!)
    assert cached_cost < standard_cost
    expected_cached = (2_000 * 0.15 / 1_000_000) + (8_000 * (0.15 * 0.25) / 1_000_000) + (2_000 * 0.60 / 1_000_000)
    assert pytest.approx(cached_cost, rel=1e-5) == round(expected_cached, 6)


@pytest.mark.asyncio
async def test_sync_litellm_model_pricing_delta():
    """Verify that LiteLLM pricing sync updates only when prices differ."""
    mock_data = {
        "gpt-4o": {
            "input_cost_per_token": 0.0000025,
            "output_cost_per_token": 0.00001,
            "cache_read_input_token_cost": 0.00000125,
            "litellm_provider": "openai",
        },
        "gemini-1.5-flash": {
            "input_cost_per_token": 0.000000075,
            "output_cost_per_token": 0.0000003,
            "litellm_provider": "gemini",
        },
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json = MagicMock(return_value=mock_data)

    class MockAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

        async def get(self, url, **kwargs):
            return mock_resp

    with patch("httpx.AsyncClient", return_value=MockAsyncClient()):
        # Run 1: initial sync or update
        res1 = await sync_litellm_model_pricing(force=True)
        assert res1["status"] == "success"

        # Run 2: immediately run again with identical data — prices unchanged, 0 updates
        res2 = await sync_litellm_model_pricing(force=True)
        assert res2["status"] == "success"
        assert res2["updated"] == 0
        assert res2["unchanged"] >= 2

        # Run 3: price change in upstream data for gpt-4o
        mock_data["gpt-4o"]["input_cost_per_token"] = 0.0000020  # Price drop from 2.50 to 2.00
        res3 = await sync_litellm_model_pricing(force=True)
        assert res3["status"] == "success"
        assert res3["updated"] == 1  # Only gpt-4o was updated!


@pytest.mark.asyncio
async def test_reconcile_openrouter_cost():
    """Verify that OpenRouter generation cost reconciliation queries upstream and updates DB."""
    gen_id = "gen-test-reconcile-999"
    with get_db_conn() as conn:
        conn.execute(
            """
            INSERT INTO llm_usage_logs (
                id, provider, model, service, input_tokens, output_tokens, calculated_cost, generation_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            ("log-recon-1", "openrouter", "deepseek-chat", "eval", 1000, 200, 0.0050, gen_id)
        )
        conn.commit()

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json = MagicMock(return_value={"data": {"total_cost": 0.00314}})

    class MockAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

        async def get(self, url, **kwargs):
            return mock_resp

    with patch("httpx.AsyncClient", return_value=MockAsyncClient()):
        reconciled = await reconcile_openrouter_cost(gen_id, api_key="sk-or-test")
        assert reconciled == 0.00314

        # Check that DB was updated
        with get_db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT calculated_cost FROM llm_usage_logs WHERE generation_id = ?;", (gen_id,))
            row = cursor.fetchone()
            assert row[0] == 0.00314


def test_pricing_matrix_endpoints(client, auth_headers):
    """Verify GET /api/auth/pricing and POST /api/auth/pricing/sync."""
    # 1. GET pricing
    res = client.get("/api/auth/pricing", headers=auth_headers)
    assert res.status_code == 200
    items = res.json()
    assert isinstance(items, list)
    assert len(items) > 0
    assert "model_id" in items[0]
    assert "input_cost_per_million" in items[0]

    # 2. POST pricing sync
    mock_data = {
        "gpt-4o-mini": {
            "input_cost_per_token": 0.00000015,
            "output_cost_per_token": 0.0000006,
            "litellm_provider": "openai",
        }
    }
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json = MagicMock(return_value=mock_data)

    class MockAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

        async def get(self, url, **kwargs):
            return mock_resp

    with patch("httpx.AsyncClient", return_value=MockAsyncClient()):
        res_sync = client.post("/api/auth/pricing/sync", headers=auth_headers)
        assert res_sync.status_code == 200
        assert res_sync.json()["status"] == "success"

