from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class WorkflowDefinition(BaseModel):
    schema_version: int = 1
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)
    outputs: List[Dict[str, Any]] = Field(default_factory=list)
    viewport: Dict[str, Any] = Field(default_factory=lambda: {"x": 0, "y": 0, "zoom": 1})
    metadata: Dict[str, Any] = Field(default_factory=dict)


class WorkflowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    template_id: Optional[str] = None
    template: Optional[Literal["blank", "delegation_discretion", "law_delegation_discretion_rank", "professor_discretion_prompt_suite", "professor_discretion_prompt_suite_detailed"]] = None


class WorkflowUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    definition: Optional[WorkflowDefinition] = None
    revision: int = Field(ge=1)


class WorkflowPublish(BaseModel):
    changelog: str = Field(default="", max_length=2000)


class WorkflowTestRequest(BaseModel):
    source_text: str = Field(min_length=1, max_length=500000)


class WorkflowTestResult(BaseModel):
    trace: List[Dict[str, Any]]
    outputs: Dict[str, Any]
    context: Dict[str, Any]


class WorkflowDashboardRequest(BaseModel):
    source: Literal["draft", "published"] = "draft"
    version: Optional[int] = None


class WorkflowRunTextRequest(WorkflowDashboardRequest):
    name: str = Field(min_length=1, max_length=255)
    source_text: str = Field(min_length=1, max_length=500000)
    rerun: bool = False


class WorkflowRunDocumentsRequest(WorkflowDashboardRequest):
    document_ids: List[str] = Field(default_factory=list)
    rerun_document_ids: List[str] = Field(default_factory=list)


class WorkflowRunResult(BaseModel):
    dashboard: Dict[str, Any]
    row: Dict[str, Any] | None = None
    rows: List[Dict[str, Any]] = Field(default_factory=list)
    skipped: List[str] = Field(default_factory=list)


class WorkflowRow(BaseModel):
    id: str
    workspace_id: str
    name: str
    description: str
    status: Literal["draft", "published", "archived"]
    definition: WorkflowDefinition
    revision: int
    latest_version: int
    created_by: str
    created_at: datetime
    updated_at: datetime


class WorkflowVersionRow(BaseModel):
    id: str
    workflow_id: str
    version: int
    definition: WorkflowDefinition
    definition_hash: str
    changelog: str
    created_by: str
    created_at: datetime


class WorkflowTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    category: str = Field(default="General", max_length=120)
    definition: WorkflowDefinition


class WorkflowTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    category: Optional[str] = Field(default=None, max_length=120)
    status: Optional[Literal["active", "archived"]] = None
    definition: Optional[WorkflowDefinition] = None
    revision: int = Field(ge=1)


class WorkflowTemplateImport(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    category: str = Field(default="Imported", max_length=120)
    definition: WorkflowDefinition


class WorkflowTemplateRow(BaseModel):
    id: str
    workspace_id: str
    slug: str
    name: str
    description: str
    category: str
    status: Literal["active", "archived"]
    definition: WorkflowDefinition
    revision: int
    created_by: str
    created_at: datetime
    updated_at: datetime


class WorkflowValidationIssue(BaseModel):
    severity: Literal["error", "warning"]
    code: str
    message: str
    node_id: Optional[str] = None


class WorkflowValidationResult(BaseModel):
    valid: bool
    errors: int
    warnings: int
    issues: List[WorkflowValidationIssue]
