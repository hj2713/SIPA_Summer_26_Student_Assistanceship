import importlib

import pytest

from app.services.coding_service import CodingService, GeneratedCampaignMeta, SchemaField


class FakeSchemaLLM:
    provider_name = "gemini"
    model = "gemini-3.1-flash-lite-preview"

    async def parse_structured(self, messages, schema, log_context=None):
        return GeneratedCampaignMeta(
            description="Codes delegation and discretion rank.",
            schema_fields=[
                SchemaField(
                    name="delegate_law",
                    type="boolean",
                    description="Whether the statute delegates authority.",
                ),
                SchemaField(
                    name="discretion_rank",
                    type="number",
                    description="How much discretion the statute grants.",
                ),
            ],
        )


@pytest.mark.asyncio
async def test_schema_generation_ignores_campaign_model_name(monkeypatch):
    service = CodingService()
    coding_service_module = importlib.import_module("app.services.coding_service")

    monkeypatch.setattr(service, "_schema_generation_llm", lambda: FakeSchemaLLM())

    def fail_if_used(model_name=None):
        raise AssertionError(f"schema generation should not use get_llm_for_model({model_name!r})")

    monkeypatch.setattr(coding_service_module, "get_llm_for_model", fail_if_used)

    generated = await service.generate_schema_and_description(
        "Determine whether the law delegates authority and how much discretion it grants.",
        model_name="gemini-3.1-flash-lite,gpt-4o-mini",
    )

    assert generated["description"] == "Codes delegation and discretion rank."
    assert [field["name"] for field in generated["schema"]] == ["delegate_law", "discretion_rank"]
