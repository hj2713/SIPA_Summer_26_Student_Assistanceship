import pytest

from app.services.coding_service import CodingService


class FakeLLM:
    def __init__(self):
        self.system_prompts = []

    async def parse_structured(self, messages, schema, log_context=None):
        self.system_prompts.append(messages[0].content)
        field_names = set(schema.model_fields.keys())
        if "law_delegation" in field_names:
            return schema(
                law_delegation=True,
                law_delegation_reasoning="The law delegates authority to an agency.",
            )
        return schema(
            discretion_rank=3.0,
            discretion_rank_reasoning="Delegation exists and leaves meaningful judgment.",
        )


@pytest.mark.asyncio
async def test_staged_coding_passes_prior_column_value_and_reasoning():
    service = CodingService()
    fake_llm = FakeLLM()
    schema_fields = [
        {
            "name": "discretion_rank",
            "type": "number",
            "description": "Rough Guide discretion rank.",
            "options": None,
            "prompt": "If law_delegation is false, assign 0. Otherwise rank discretion.",
            "depends_on": ["law_delegation"],
        },
        {
            "name": "law_delegation",
            "type": "boolean",
            "description": "Whether the law delegates authority.",
            "options": None,
            "prompt": "Determine whether delegation exists.",
            "depends_on": [],
        },
    ]

    coded = await service._code_document_staged(
        llm=fake_llm,
        campaign_prompt="Financial regulation coding campaign.",
        schema_fields=schema_fields,
        doc_text="The agency may issue rules and exemptions.",
        dashboard_id="dash-123",
    )

    assert coded["law_delegation"] is True
    assert coded["discretion_rank"] == 3.0
    assert "law_delegation: True" in fake_llm.system_prompts[1]
    assert "The law delegates authority to an agency." in fake_llm.system_prompts[1]
