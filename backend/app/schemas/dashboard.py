from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any, Union, Literal
from datetime import datetime

WorkflowSource = Literal["draft", "published"]

class ColumnPromptHistoryItem(BaseModel):
    version: int
    prompt: str
    timestamp: str

class UserColumnInput(BaseModel):
    name: str = Field(..., description="The name of the column")
    type: Optional[str] = Field(default="string", description="The data type of the column")
    description: Optional[str] = Field(default=None, description="The description of the column for LLM context")
    options: Optional[List[str]] = Field(default=None, description="Allowed categorical values")
    prompt: Optional[str] = Field(default=None, description="Column-specific coding prompt or rubric")
    depends_on: Optional[List[str]] = Field(default=None, description="Prior column names this column depends on")
    prompt_version: Optional[int] = Field(default=1, description="The version of prompt instructions for this column")
    prompt_history: Optional[List[ColumnPromptHistoryItem]] = Field(default=None, description="The history of prompt instructions for this column")

class ReevaluateColumnPayload(BaseModel):
    feedback_prompt: str

class ReevaluateRowPayload(BaseModel):
    feedback_prompt: str


class DashboardCreate(BaseModel):
    name: str = Field(..., description="The name of the campaign dashboard")
    description: Optional[str] = Field(default=None, description="Optional description of the campaign dashboard")
    prompt: str = Field(..., description="The system prompt or rules (codebook) for this campaign")
    user_columns: Optional[List[Union[str, UserColumnInput, Dict[str, Any]]]] = Field(default=None, description="Predefined variable columns with optional schemas/descriptions (takes priority over LLM generated schema)")
    model: Optional[str] = Field(default=None, description="Dynamic model choice for campaign coding run")
    dashboard_type: Optional[str] = Field(default="campaign", description="The type of dashboard (e.g. campaign or model_comparison)")
    token_limit: Optional[int] = Field(default=2500000, description="The safety limit on cumulative token usage for LLM calls")
    workflow_id: Optional[str] = Field(default=None, description="Optional workflow ID to run evaluations via workflow nodes")
    workflow_source: Optional[str] = Field(default=None, description="Optional workflow source representation")


class LinkWorkflowPayload(BaseModel):
    """Payload for linking or unlinking a workflow from a dashboard."""
    workflow_id: Optional[str] = Field(default=None, description="Workflow ID to link. Pass null to unlink.")

class DashboardRow(BaseModel):
    id: str
    workspace_id: str
    name: str
    description: str
    prompt: str
    schema_fields: List[Dict[str, Any]] = Field(..., alias="schema")
    model: Optional[str] = None
    dashboard_type: str = "campaign"
    workflow_id: Optional[str] = None
    workflow_source: Optional[str] = None
    workflow_version: Optional[int] = None
    workflow_revision: Optional[int] = None
    created_at: datetime
    token_limit: Optional[int] = 2500000

    model_config = ConfigDict(populate_by_name=True)

class DashboardDocumentRow(BaseModel):
    document_id: str
    filename: str
    file_size: int
    status: str
    coded_values: Dict[str, Any]
    error_message: Optional[str] = None
    error_type: Optional[str] = None
    tags: List[str] = []
    current_step: Optional[int] = 0
    total_steps: Optional[int] = 7
    workflow_trace: Optional[List[Dict[str, Any]]] = None
    workflow_context: Optional[Dict[str, Any]] = None


class DashboardDocumentPage(BaseModel):
    items: List[DashboardDocumentRow]
    total: int
    page: int
    page_size: int
    pages: int


class DocumentCampaignMappingRequest(BaseModel):
    document_ids: List[str] = Field(default_factory=list, max_length=100)


class DocumentCampaignMappingRow(BaseModel):
    document_id: str
    campaign_id: str
    campaign_name: str
    status: str
    error_message: Optional[str] = None
    error_type: Optional[str] = None


class CampaignStatusSummary(BaseModel):
    total: int = 0
    pending: int = 0
    processing: int = 0
    completed: int = 0
    failed: int = 0


class BenchmarkMismatchRow(BaseModel):
    document_id: str
    filename: str
    split: str
    expected_delegate_law: Optional[bool] = None
    predicted_delegate_law: Optional[bool] = None
    expected_discretion_rank: Optional[int] = None
    predicted_discretion_rank: Optional[int] = None
    rank_difference: Optional[int] = None
    exact_rank_match: bool = False
    within_one_rank: bool = False
    model_rationale: Optional[str] = None
    likely_mismatch_reason: str


class BenchmarkSplitMetrics(BaseModel):
    matched_rows: int = 0
    rank_total: int = 0
    exact_rank_matches: int = 0
    exact_rank_accuracy: Optional[float] = None
    within_one_rank_matches: int = 0
    within_one_rank_accuracy: Optional[float] = None
    mean_absolute_error: Optional[float] = None


class BenchmarkComparisonSummary(BaseModel):
    benchmark_name: str
    benchmark_rows: int
    dashboard_rows: int
    matched_rows: int
    missing_dashboard_rows: int
    source_set: str
    source_alignment: str
    source_warning: str
    delegate_total: int
    delegate_matches: int
    delegate_accuracy: Optional[float] = None
    rank_total: int
    exact_rank_matches: int
    exact_rank_accuracy: Optional[float] = None
    within_one_rank_matches: int
    within_one_rank_accuracy: Optional[float] = None
    mean_absolute_error: Optional[float] = None
    split_metrics: Dict[str, BenchmarkSplitMetrics] = Field(default_factory=dict)
    confusion_matrix: Dict[str, Dict[str, int]] = Field(default_factory=dict)
    mismatches: List[BenchmarkMismatchRow] = Field(default_factory=list)

class DashboardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    prompt: Optional[str] = None
    schema_fields: Optional[List[Dict[str, Any]]] = Field(default=None, alias="schema")
    model: Optional[str] = None
    token_limit: Optional[int] = None

class CellUpdatePayload(BaseModel):
    column_name: str
    value: Any
    reasoning: Optional[str] = None


class ReevaluateCellPayload(BaseModel):
    column_name: str
    user_prompt: str
