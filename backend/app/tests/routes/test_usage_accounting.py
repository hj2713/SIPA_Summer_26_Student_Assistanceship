import pytest
import uuid
from app.llm.registry import calculate_cost
from app.repositories import get_db_session

def test_calculate_cost_accuracy():
    """Verify that calculate_cost computes exact pricing according to PRICING_MAP."""
    # Test gpt-4o-mini: $0.15/1M input, $0.60/1M output
    in_tokens = 1_000_000
    out_tokens = 1_000_000
    expected_gpt4o_mini = 0.15 + 0.60  # $0.75
    actual = calculate_cost("gpt-4o-mini", in_tokens, out_tokens)
    assert pytest.approx(actual, rel=1e-5) == expected_gpt4o_mini

    # Test with fractional tokens: 10,000 in, 2,000 out on gpt-4o-mini
    expected = (10_000 * 0.00000015) + (2_000 * 0.00000060)
    assert pytest.approx(calculate_cost("gpt-4o-mini", 10_000, 2_000), rel=1e-5) == expected

    # Test openrouter prefix stripping (e.g. "openai/gpt-4o-mini")
    assert pytest.approx(calculate_cost("openai/gpt-4o-mini", 10_000, 2_000), rel=1e-5) == expected

    # Test zero tokens returns 0.0
    assert calculate_cost("gpt-4o-mini", 0, 0) == 0.0


def test_usage_logging_and_stats_aggregation(client, auth_headers):
    """Test full cycle: inserting usage logs and querying /api/usage/stats."""
    test_user_id = "00000000-0000-0000-0000-000000000001"
    test_ws_id = "TEST"
    
    # 1. Insert mock usage entries into llm_usage_logs
    with get_db_session() as session:
        cursor = session.conn.cursor()
        
        # Log 1: 50,000 in, 10,000 out for test_user_id
        c1 = calculate_cost("gpt-4o-mini", 50_000, 10_000)
        cursor.execute(
            """INSERT INTO llm_usage_logs 
               (id, provider, model, service, campaign_id, thread_id, input_tokens, output_tokens, calculated_cost, user_id, workspace_id, key_level_used)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);""",
            (str(uuid.uuid4()), "openai", "gpt-4o-mini", "chat", None, None, 50_000, 10_000, c1, test_user_id, test_ws_id, "personal")
        )
        
        # Log 2: 25,000 in, 5,000 out for test_user_id
        c2 = calculate_cost("gpt-4o-mini", 25_000, 5_000)
        cursor.execute(
            """INSERT INTO llm_usage_logs 
               (id, provider, model, service, campaign_id, thread_id, input_tokens, output_tokens, calculated_cost, user_id, workspace_id, key_level_used)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);""",
            (str(uuid.uuid4()), "openai", "gpt-4o-mini", "campaign", None, None, 25_000, 5_000, c2, test_user_id, test_ws_id, "workspace")
        )

        session.conn.commit()

    # Query usage stats for test_user_id (personal scope)
    client.workspace_id = test_ws_id
    res = client.get("/api/usage/stats?timeframe=all&scope=personal", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    
    summary = data["summary"]
    assert summary["input_tokens"] >= 75_000
    assert summary["output_tokens"] >= 15_000
    assert summary["total_cost"] >= (c1 + c2)
    assert summary["total_calls"] >= 2
