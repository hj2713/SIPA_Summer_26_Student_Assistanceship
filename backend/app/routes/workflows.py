from typing import List

from fastapi import APIRouter, HTTPException, status, Depends

from app.core.deps import CurrentUserDep, get_workspace_id
from app.schemas.workflow import (
    WorkflowCreate,
    WorkflowPublish,
    WorkflowRow,
    WorkflowUpdate,
    WorkflowTestRequest,
    WorkflowTestResult,
    WorkflowValidationResult,
    WorkflowVersionRow,
)
from app.services.workflow_service import workflow_service
from app.workflows.templates import WORKFLOW_TEMPLATES
from app.workflows.executor import WorkflowExecutionError, workflow_executor


router = APIRouter(prefix="/api/workflows", tags=["workflows"])


def _require_editor(current_user: CurrentUserDep) -> None:
    if not current_user.is_admin and not current_user.can_add:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to modify workflows.")


@router.get("/templates")
def list_templates(current_user: CurrentUserDep):
    return [
        {"id": "delegation_discretion", "name": "Delegation + Rough Guide Discretion", "description": "A staged LLM and deterministic branching workflow."},
        {"id": "blank", "name": "Blank Workflow", "description": "Start with document input and dashboard output."},
    ]


@router.get("/templates/{template_id}")
def get_template(template_id: str, current_user: CurrentUserDep):
    factory = WORKFLOW_TEMPLATES.get(template_id)
    if not factory:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow template not found.")
    return factory()


@router.post("", response_model=WorkflowRow, status_code=status.HTTP_201_CREATED)
def create_workflow(payload: WorkflowCreate, current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    _require_editor(current_user)
    return workflow_service.create(payload, workspace_id, current_user.id)


@router.get("", response_model=List[WorkflowRow])
def list_workflows(current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    return workflow_service.list(workspace_id)


@router.get("/{workflow_id}", response_model=WorkflowRow)
def get_workflow(workflow_id: str, current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    return workflow_service.get(workflow_id, workspace_id)


@router.patch("/{workflow_id}", response_model=WorkflowRow)
def update_workflow(workflow_id: str, payload: WorkflowUpdate, current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    _require_editor(current_user)
    return workflow_service.update(workflow_id, payload, workspace_id)


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workflow(workflow_id: str, current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    _require_editor(current_user)
    workflow_service.delete(workflow_id, workspace_id)


@router.post("/{workflow_id}/validate", response_model=WorkflowValidationResult)
def validate_workflow(workflow_id: str, current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    return workflow_service.validate(workflow_id, workspace_id)


@router.post("/{workflow_id}/test", response_model=WorkflowTestResult)
async def test_workflow(workflow_id: str, payload: WorkflowTestRequest, current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    _require_editor(current_user)
    workflow = workflow_service.get(workflow_id, workspace_id)
    try:
        return await workflow_executor.execute(workflow.definition.model_dump(), payload.source_text)
    except WorkflowExecutionError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.post("/{workflow_id}/publish", response_model=WorkflowVersionRow, status_code=status.HTTP_201_CREATED)
def publish_workflow(workflow_id: str, payload: WorkflowPublish, current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    _require_editor(current_user)
    return workflow_service.publish(workflow_id, payload, workspace_id, current_user.id)


@router.get("/{workflow_id}/versions", response_model=List[WorkflowVersionRow])
def list_workflow_versions(workflow_id: str, current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    return workflow_service.list_versions(workflow_id, workspace_id)


@router.get("/{workflow_id}/versions/{version}", response_model=WorkflowVersionRow)
def get_workflow_version(workflow_id: str, version: int, current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    return workflow_service.get_version(workflow_id, version, workspace_id)
