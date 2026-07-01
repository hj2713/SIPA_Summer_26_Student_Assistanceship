import logging
from typing import List, Optional
from pydantic import BaseModel

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile, status, Depends, Query

from app.core.deps import CurrentUserDep, get_workspace_id
from app.schemas.dashboard import DashboardCreate, DashboardUpdate, DashboardRow, DashboardDocumentRow, DashboardDocumentPage, DocumentCampaignMappingRequest, DocumentCampaignMappingRow, CampaignStatusSummary, CellUpdatePayload, ReevaluateCellPayload, ReevaluateColumnPayload, ReevaluateRowPayload, BenchmarkComparisonSummary, LinkWorkflowPayload
from app.services import campaign_service
from app.services.benchmark_evaluation_service import benchmark_evaluation_service
from app.services.coding_service import generate_schema_and_description, enqueue_sequential_coding
from app.core.client import get_user_client
from app.core.constants import MAX_FILE_SIZE_BYTES

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])


@router.post("", response_model=DashboardRow, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: DashboardCreate,
    current_user: CurrentUserDep,
    workspace_id: str = Depends(get_workspace_id)
):
    """Create a new research campaign dashboard.
    
    Calls generate_schema_and_description directly to allow route-level test patch mocking.
    """
    if not current_user.can_add and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to create campaigns."
        )

    # Skip prompt schema generation if this campaign is linked to a workflow
    if payload.workflow_id:
        generated = {"description": payload.description or "Workflow evaluation campaign.", "schema": []}
    else:
        generated = await generate_schema_and_description(payload.prompt, payload.user_columns)
    return campaign_service.create_campaign_with_schema(payload, generated, workspace_id)


@router.get("", response_model=List[DashboardRow])
def list_campaigns(
    current_user: CurrentUserDep,
    workspace_id: str = Depends(get_workspace_id)
):
    """List all research campaign dashboards in the workspace."""
    return campaign_service.list_campaigns(workspace_id)


@router.post("/document-mapping", response_model=List[DocumentCampaignMappingRow])
def get_document_campaign_mapping(
    payload: DocumentCampaignMappingRequest,
    current_user: CurrentUserDep,
    workspace_id: str = Depends(get_workspace_id),
):
    """Resolve campaign memberships for the current visible document page in one query."""
    return campaign_service.get_document_campaign_mapping(workspace_id, payload.document_ids)


@router.get("/{id}", response_model=DashboardRow)
def get_campaign(
    id: str,
    current_user: CurrentUserDep
):
    """Retrieve details for a specific campaign dashboard."""
    return campaign_service.get_campaign(id)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(
    id: str,
    current_user: CurrentUserDep
):
    """Delete a research campaign dashboard."""
    if not current_user.is_admin and not current_user.can_delete:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete campaigns."
        )
    
    deleted = campaign_service.delete_campaign(id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign dashboard not found."
        )


@router.put("/{id}", response_model=DashboardRow)
def update_campaign(
    id: str,
    payload: DashboardUpdate,
    current_user: CurrentUserDep
):
    """Update campaign name, description, prompt, or column schema."""
    if not current_user.is_admin and not current_user.can_add:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify campaigns."
        )
    return campaign_service.update_campaign(id, payload)


@router.patch("/{id}/link-workflow", response_model=DashboardRow)
def link_workflow(
    id: str,
    payload: LinkWorkflowPayload,
    current_user: CurrentUserDep,
):
    """Link (or unlink) a workflow to an existing dashboard.
    
    Pass workflow_id to link, or null to unlink. No documents are re-processed;
    new uploads and retries will automatically use the linked workflow.
    """
    if not current_user.is_admin and not current_user.can_add:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify campaigns."
        )
    return campaign_service.link_workflow_to_campaign(id, payload.workflow_id)



@router.get("/{id}/documents", response_model=List[DashboardDocumentRow])
def list_campaign_documents(
    id: str,
    current_user: CurrentUserDep
):
    """List all documents linked to this campaign, along with their coded values and processing statuses."""
    return campaign_service.list_campaign_documents(id)


@router.get("/{id}/documents/page", response_model=DashboardDocumentPage)
def list_campaign_documents_page(
    id: str,
    current_user: CurrentUserDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    items, total = campaign_service.list_campaign_documents_page(id, page, page_size)
    pages = max(1, (total + page_size - 1) // page_size)
    return DashboardDocumentPage(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.get("/{id}/documents/status-summary", response_model=CampaignStatusSummary)
def get_campaign_status_summary(id: str, current_user: CurrentUserDep):
    """Return lightweight aggregate job counts for polling without loading document rows."""
    return campaign_service.get_campaign_status_summary(id)


@router.get("/{id}/benchmark/professor", response_model=BenchmarkComparisonSummary)
def compare_professor_benchmark(id: str, current_user: CurrentUserDep):
    """Compare dashboard outputs against the project professor benchmark CSV."""
    return benchmark_evaluation_service.compare_professor_benchmark(id)


class BulkDeleteDocumentsRequest(BaseModel):
    document_ids: List[str]

@router.post("/{id}/documents/bulk-delete", status_code=status.HTTP_204_NO_CONTENT)
def bulk_delete_campaign_documents(
    id: str,
    payload: BulkDeleteDocumentsRequest,
    current_user: CurrentUserDep
):
    """Remove multiple documents from this campaign dashboard (unlinks the association)."""
    if not current_user.can_delete and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete documents from this campaign."
        )
    campaign_service.delete_dashboard_documents(id, payload.document_ids)
    return

@router.post("/{id}/documents/link", status_code=status.HTTP_200_OK)
def link_campaign_documents(
    id: str,
    document_ids: List[str],
    current_user: CurrentUserDep
):
    """Link existing global documents to this campaign and enqueue processing on this dashboard."""
    if not current_user.can_add and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify campaign documents."
        )

    campaign_service.link_campaign_documents(id, document_ids, current_user.id)
    return {"message": f"Successfully linked {len(document_ids)} documents and enqueued them for coding."}


@router.post("/{id}/documents/check-duplicates", status_code=status.HTTP_200_OK)
def check_duplicate_filenames(
    id: str,
    filenames: List[str],
    current_user: CurrentUserDep,
):
    """Given a list of filenames, return which ones are already linked to this dashboard."""
    existing = campaign_service.get_filenames_in_dashboard(id)
    duplicates = [f for f in filenames if f in existing]
    return {"duplicates": duplicates}


@router.post("/{id}/documents/upload", response_model=DashboardDocumentRow, status_code=status.HTTP_201_CREATED)
async def upload_campaign_document(
    id: str,
    background_tasks: BackgroundTasks,
    current_user: CurrentUserDep,
    file: UploadFile = File(...),
    relative_path: str = Form(None),
    workspace_id: str = Form(None),
    tags: str = Form(None),
):
    """Upload a file directly to a campaign: saves file globally first and links/codes in campaign."""
    if not current_user.can_add and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to add documents."
        )

    workspace_id = get_workspace_id(workspace_id)
    user_client = get_user_client(current_user.jwt, workspace_id)
    filename = relative_path or file.filename
    if not filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Filename is required")
        
    content_type = file.content_type or "text/plain"
    content = await file.read()
    file_size = len(content)
    
    if file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds maximum size limit."
        )

    try:
        return campaign_service.upload_campaign_document(
            id=id,
            user_client=user_client,
            current_user=current_user,
            file_content=content,
            filename=filename,
            content_type=content_type,
            file_size=file_size,
            workspace_id=workspace_id,
            tags=tags,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process upload: {e}"
        )


@router.post("/{id}/documents/retry", status_code=status.HTTP_200_OK)
def retry_failed_documents(
    id: str,
    current_user: CurrentUserDep,
    payload: Optional[List[str]] = None,
    model: Optional[str] = Query(None, description="Model to retry failed runs for specifically")
):
    """Retry coding execution for failed documents in a campaign dashboard."""
    if not current_user.can_add and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify campaign documents."
        )

    doc_ids = campaign_service.retry_failed_documents(id, current_user.id, payload, retry_model=model)
    if not doc_ids:
        return {"message": "No failed documents to retry."}
    return {"message": f"Successfully queued {len(doc_ids)} documents for retry."}


@router.post("/{id}/raise-token-limit", status_code=status.HTTP_200_OK)
def raise_token_limit(
    id: str,
    current_user: CurrentUserDep
):
    """Increase token limit by 2.5M and retry any suspended documents."""
    if not current_user.can_add and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify campaigns."
        )

    from app.repositories import get_db_session
    with get_db_session() as session:
        dashboard = session.dashboards.get_by_id(id)
        if not dashboard:
            raise HTTPException(status_code=404, detail="Dashboard not found")
        current_limit = dashboard.get("token_limit") or 5000000
        new_limit = current_limit + 5000000
        session.dashboards.update(id, {"token_limit": new_limit})

    doc_ids = campaign_service.retry_failed_documents(id, current_user.id)
    return {"message": f"Successfully raised token limit to {new_limit} and queued suspended documents for retry.", "new_limit": new_limit}


@router.post("/{id}/add-model", status_code=status.HTTP_200_OK)
def add_model_to_campaign(
    id: str,
    current_user: CurrentUserDep,
    model: str = Query(..., description="The LLM model name to add to the evaluation dashboard")
):
    """Add a new model to the evaluation dashboard and trigger evaluations for it."""
    if not current_user.can_add and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify campaigns."
        )

    from app.repositories import get_db_session
    with get_db_session() as session:
        dashboard = session.dashboards.get_by_id(id)
        if not dashboard:
            raise HTTPException(status_code=404, detail="Dashboard not found")
        
        current_models = [m.strip() for m in (dashboard.get("model") or "").split(",") if m.strip()]
        new_model = model.strip()
        if new_model in current_models:
            return {"message": f"Model {new_model} is already present in this dashboard.", "model": dashboard.get("model")}

        current_models.append(new_model)
        updated_model_str = ",".join(current_models)
        session.dashboards.update(id, {"model": updated_model_str})

    doc_ids = campaign_service.retry_failed_documents(id, current_user.id, payload=None, retry_model=new_model)
    return {
        "message": f"Successfully added {new_model} and queued {len(doc_ids)} documents for evaluation.",
        "model": updated_model_str
    }


@router.put("/{id}/documents/{doc_id}", status_code=status.HTTP_200_OK)
def update_coded_cell(
    id: str,
    doc_id: str,
    payload: CellUpdatePayload,
    current_user: CurrentUserDep
):
    """Override an AI-generated value in a specific spreadsheet grid cell."""
    if not current_user.can_add and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to edit values."
        )

    coded_values = campaign_service.update_coded_cell(
        id, doc_id, payload.column_name, payload.value, payload.reasoning
    )
    return {"message": "Cell updated successfully.", "coded_values": coded_values}


@router.post("/{id}/documents/{doc_id}/re-evaluate", status_code=status.HTTP_200_OK)
async def reevaluate_coded_cell(
    id: str,
    doc_id: str,
    payload: ReevaluateCellPayload,
    current_user: CurrentUserDep
):
    """Trigger LLM re-evaluation of a specific cell using researcher corrective feedback."""
    if not current_user.can_add and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to re-evaluate values."
        )

    coded_values = await campaign_service.reevaluate_coded_cell(
        id, doc_id, payload.column_name, payload.user_prompt
    )
    return {"message": "Cell re-evaluated successfully.", "coded_values": coded_values}


@router.post("/{id}/columns/{column_name}/reevaluate", response_model=DashboardRow)
async def reevaluate_campaign_column(
    id: str,
    column_name: str,
    payload: ReevaluateColumnPayload,
    background_tasks: BackgroundTasks,
    current_user: CurrentUserDep
):
    """Trigger LLM re-evaluation of a specific column across all documents."""
    if not current_user.can_add and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to re-evaluate columns."
        )
    return await campaign_service.reevaluate_column(id, column_name, payload.feedback_prompt, background_tasks)


@router.post("/{id}/documents/{doc_id}/reevaluate-row", status_code=status.HTTP_200_OK)
async def reevaluate_campaign_row(
    id: str,
    doc_id: str,
    payload: ReevaluateRowPayload,
    current_user: CurrentUserDep
):
    """Trigger LLM re-evaluation of all columns in a row (document) using feedback."""
    if not current_user.can_add and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to re-evaluate rows."
        )
    coded_values = await campaign_service.reevaluate_row(id, doc_id, payload.feedback_prompt)
    return {"message": "Row re-evaluated successfully.", "coded_values": coded_values}


@router.post("/{id}/regenerate-schema", response_model=DashboardRow)
async def regenerate_campaign_schema(
    id: str,
    current_user: CurrentUserDep
):
    """Regenerate campaign schema by running the LLM prompt extraction again."""
    if not current_user.can_add and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify campaigns."
        )
    return await campaign_service.regenerate_campaign_schema(id)


@router.get("/{id}/documents/{doc_id}/trace", response_model=DashboardDocumentRow)
def get_campaign_document_trace(
    id: str,
    doc_id: str,
    current_user: CurrentUserDep
):
    """Retrieve execution trace and context details for a specific campaign document."""
    from app.services.workflow_dashboard_service import workflow_dashboard_service
    return workflow_dashboard_service.get_trace(id, doc_id)
