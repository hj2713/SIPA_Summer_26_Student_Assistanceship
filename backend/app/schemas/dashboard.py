from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any, Union

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

class DashboardRow(BaseModel):
    id: str
    workspace_id: str
    name: str
    description: str
    prompt: str
    schema_fields: List[Dict[str, Any]] = Field(..., alias="schema")
    model: Optional[str] = None
    created_at: str

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

class DashboardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    prompt: Optional[str] = None
    schema_fields: Optional[List[Dict[str, Any]]] = Field(default=None, alias="schema")
    model: Optional[str] = None

class CellUpdatePayload(BaseModel):
    column_name: str
    value: Any
    reasoning: Optional[str] = None


class ReevaluateCellPayload(BaseModel):
    column_name: str
    user_prompt: str

