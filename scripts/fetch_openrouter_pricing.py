import os, sys, requests, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(ROOT, "backend")
sys.path.insert(0, BACKEND)
os.chdir(BACKEND)

from app.core.config import settings

api_key = settings.OPEN_ROUTER_API_KEY
headers = {"Authorization": f"Bearer {api_key}"}

resp = requests.get("https://openrouter.ai/api/v1/models", headers=headers)
if resp.status_code == 200:
    data = resp.json().get("data", [])
    target_ids = [
        "deepseek/deepseek-v3.2-exp",
        "deepseek/deepseek-chat",
        "moonshotai/kimi-k2.5",
        "qwen/qwen3-235b-a22b-2507",
        "openai/gpt-oss-120b"
    ]
    print("=== OPENROUTER OFFICIAL MODEL PRICING ===")
    for m in data:
        mid = m.get("id")
        if mid in target_ids or any(t in mid for t in ["deepseek-v3", "kimi-k2.5", "gpt-oss", "qwen3-235b"]):
            pricing = m.get("pricing", {})
            prompt = float(pricing.get("prompt", 0)) * 1_000_000
            completion = float(pricing.get("completion", 0)) * 1_000_000
            print(f"ID: {mid}")
            print(f"  Name: {m.get('name')}")
            print(f"  Prompt Price / 1M: ${prompt:.4f}")
            print(f"  Completion Price / 1M: ${completion:.4f}")
            print(f"  Context Length: {m.get('context_length')}")
else:
    print(f"Failed to fetch models: {resp.status_code} {resp.text}")
