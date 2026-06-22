from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class WorkflowDefinition(BaseModel):
    schema_version: int = 1
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)
    outputs: List[Dict[str, Any]] = Field(default_factory=list)
    viewport: Dict[str, Any] = Field(default_factory=lambda: {"x": 0, "y": 0, "zoom": 1})


class WorkflowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    template: Literal["blank", "delegation_discretion"] = "blank"


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
