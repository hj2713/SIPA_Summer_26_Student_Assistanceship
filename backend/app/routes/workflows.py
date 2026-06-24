from pathlib import Path
from typing import List

from fastapi import APIRouter, File, HTTPException, UploadFile, status, Depends

from app.core.constants import ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES
from app.core.deps import CurrentUserDep, get_workspace_id
from app.schemas.workflow import (
    WorkflowCreate,
    WorkflowPublish,
    WorkflowRow,
    WorkflowUpdate,
    WorkflowTestRequest,
    WorkflowTestResult,
    WorkflowTemplateCreate,
    WorkflowTemplateImport,
    WorkflowTemplateRow,
    WorkflowTemplateUpdate,
    WorkflowValidationResult,
    WorkflowVersionRow,
)
from app.services.workflow_service import workflow_service
from app.services.ingestion_service import extract_text
from app.workflows.templates import WORKFLOW_TEMPLATES
from app.workflows.executor import WorkflowExecutionError, workflow_executor


router = APIRouter(prefix="/api/workflows", tags=["workflows"])


def _require_editor(current_user: CurrentUserDep) -> None:
    if not current_user.is_admin and not current_user.can_add:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to modify workflows.")


@router.get("/templates")
def list_templates(current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    return workflow_service.list_templates(workspace_id)


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


@router.post("/{workflow_id}/test-file", response_model=WorkflowTestResult)
async def test_workflow_file(
    workflow_id: str,
    current_user: CurrentUserDep,
    workspace_id: str = Depends(get_workspace_id),
    file: UploadFile = File(...),
):
    _require_editor(current_user)
    filename = file.filename or "law-file"
    extension = Path(filename).suffix.lower().lstrip(".")
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type for workflow testing.")

    content = await file.read()
    if not content or len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty or exceeds the maximum size limit.")

    try:
        source_text = extract_text(content, file.content_type or "application/octet-stream", filename=filename)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Could not extract text from file: {exc}") from exc

    workflow = workflow_service.get(workflow_id, workspace_id)
    try:
        return await workflow_executor.execute(workflow.definition.model_dump(), source_text)
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


template_router = APIRouter(prefix="/api/workflow-templates", tags=["workflow-templates"])


@template_router.get("", response_model=List[WorkflowTemplateRow])
def list_workflow_templates(current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    return workflow_service.list_templates(workspace_id)


@template_router.get("/{template_id}", response_model=WorkflowTemplateRow)
def get_workflow_template(template_id: str, current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    return workflow_service.get_template(template_id, workspace_id)


@template_router.post("", response_model=WorkflowTemplateRow, status_code=status.HTTP_201_CREATED)
def create_workflow_template(payload: WorkflowTemplateCreate, current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    _require_editor(current_user)
    return workflow_service.create_template(payload, workspace_id, current_user.id)


@template_router.patch("/{template_id}", response_model=WorkflowTemplateRow)
def update_workflow_template(template_id: str, payload: WorkflowTemplateUpdate, current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    _require_editor(current_user)
    return workflow_service.update_template(template_id, payload, workspace_id)


@template_router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workflow_template(template_id: str, current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    _require_editor(current_user)
    workflow_service.delete_template(template_id, workspace_id)


@template_router.post("/{template_id}/duplicate", response_model=WorkflowTemplateRow, status_code=status.HTTP_201_CREATED)
def duplicate_workflow_template(template_id: str, current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    _require_editor(current_user)
    return workflow_service.duplicate_template(template_id, workspace_id, current_user.id)


@template_router.post("/import", response_model=WorkflowTemplateRow, status_code=status.HTTP_201_CREATED)
def import_workflow_template(payload: WorkflowTemplateImport, current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    _require_editor(current_user)
    return workflow_service.create_template(payload, workspace_id, current_user.id)


@template_router.get("/{template_id}/export", response_model=WorkflowTemplateRow)
def export_workflow_template(template_id: str, current_user: CurrentUserDep, workspace_id: str = Depends(get_workspace_id)):
    return workflow_service.get_template(template_id, workspace_id)
