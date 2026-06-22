"""API routes for uploading and managing documents."""
import logging
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile, status, Depends

from app.core.deps import CurrentUserDep, get_workspace_id
from app.core.workspace import get_active_workspace
from app.schemas.document import DocumentRow, DocumentStatus, DocumentUploadResponse, RetryBatchRequest
from app.services import document_service, ingestion_service
from app.core.client import get_user_client

from app.core.constants import MAX_FILE_SIZE_BYTES

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    current_user: CurrentUserDep,
    file: UploadFile = File(...),
    relative_path: str = Form(None),
    workspace_id: str = Form(None),
    tags: str = Form(None),
):
    """Upload a document file, checking for duplicates or updates using a content hash under a workspace.

    Triggers background chunking, LLM metadata extraction, and vector embedding indexing.
    """
    if not current_user.can_add and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to add documents."
        )

    workspace_id = get_workspace_id(workspace_id)
    client = get_user_client(current_user.jwt, workspace_id)
    
    filename = relative_path or file.filename
    if not filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is required"
        )
    content_type = file.content_type or "text/plain"
    
    content = await file.read()
    file_size = len(content)
    
    if file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {MAX_FILE_SIZE_BYTES / (1024 * 1024):.0f}MB"
        )

    parsed_tags = [t.strip() for t in tags.split(",")] if tags else []

    # 1. Compute hash of file content
    content_hash = ingestion_service.calculate_hash(content)
    
    try:
        # 2. Check if a document with the same name already exists in this workspace
        existing_doc = document_service.get_document_by_name(client, workspace_id, filename)
        
        if existing_doc:
            # If the document is already chunked (completed) or currently processing/pending in this workspace, ignore it
            if existing_doc.status in (DocumentStatus.completed, DocumentStatus.processing, DocumentStatus.pending):
                logger.info(
                    "Duplicate upload detected for '%s' in workspace '%s' (status: %s). Skipping processing to avoid duplicate chunking/storage.",
                    filename,
                    workspace_id,
                    existing_doc.status
                )
                return DocumentUploadResponse(
                    id=existing_doc.id,
                    filename=existing_doc.filename,
                    status=existing_doc.status,
                    created_at=existing_doc.created_at,
                    upserted=False,
                )
            
            # Branch 2: Content changed, clear old chunks and reprocess (Upsert Inplace)
            logger.info(
                "Modified upload detected for '%s' in workspace '%s' (hash changed). Overwriting and clearing old chunks.",
                filename,
                workspace_id
            )
            # Clear old vector chunks
            document_service.delete_document_chunks(client, str(existing_doc.id))
            
            # Update DB metadata and reset status to pending
            doc_row = document_service.update_document_metadata(
                client=client,
                doc_id=str(existing_doc.id),
                file_size=file_size,
                content_type=content_type,
                content_hash=content_hash,
                status=DocumentStatus.pending,
                metadata={},  # Clear old metadata to prepare for fresh LLM extraction
            )
            
            # Replace storage file
            document_service.upload_file_to_storage(
                client=client,
                user_id=current_user.id,
                doc_id=str(doc_row.id),
                filename=filename,
                content=content,
                content_type=content_type,
            )
            
            # Enqueue background worker
            ingestion_service.enqueue_document_ingestion(
                doc_id=str(doc_row.id),
                user_id=current_user.id,
                filename=filename,
                content=content,
                content_type=content_type,
                workspace_id=workspace_id,
            )
            
            return DocumentUploadResponse(
                id=doc_row.id,
                filename=doc_row.filename,
                status=doc_row.status,
                created_at=doc_row.created_at,
                upserted=True,
            )

        # Branch 3: New document ingestion
        logger.info("New upload detected for '%s' in workspace '%s'. Initializing ingestion.", filename, workspace_id)
        
        # Pre-reserve database record
        doc_row = document_service.create_document(
            client=client,
            user_id=current_user.id,
            filename=filename,
            file_path="",  # placeholder
            file_size=file_size,
            content_type=content_type,
            content_hash=content_hash,
            metadata={"tags": parsed_tags} if parsed_tags else {},
            workspace_id=workspace_id,
        )
        
        doc_id = str(doc_row.id)
        
        # Upload to Storage
        storage_path = document_service.upload_file_to_storage(
            client=client,
            user_id=current_user.id,
            doc_id=doc_id,
            filename=filename,
            content=content,
            content_type=content_type,
        )
        
        # Save exact storage path
        document_service.update_document_file_path(client, doc_id, storage_path)
        
        # Enqueue background processing
        ingestion_service.enqueue_document_ingestion(
            doc_id=doc_id,
            user_id=current_user.id,
            filename=filename,
            content=content,
            content_type=content_type,
            workspace_id=workspace_id,
        )
        
        return DocumentUploadResponse(
            id=doc_row.id,
            filename=doc_row.filename,
            status=DocumentStatus.pending,
            created_at=doc_row.created_at,
            upserted=True,
        )
        
    except Exception as e:
        logger.error("Failed to upload/register document: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process file upload: {e}"
        )


@router.get("", response_model=list[DocumentRow])
async def list_documents(
    current_user: CurrentUserDep,
    workspace_id: str = Depends(get_workspace_id),
):
    """Retrieve all documents belonging to the workspace."""
    client = get_user_client(current_user.jwt, workspace_id)
    return document_service.list_documents(client, workspace_id)


from pydantic import BaseModel
class DocumentTagsUpdate(BaseModel):
    tags: list[str]

@router.patch("/{document_id}/tags", response_model=DocumentRow)
async def update_document_tags(document_id: str, tags_update: DocumentTagsUpdate, current_user: CurrentUserDep):
    if not current_user.can_add and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    client = get_user_client(current_user.jwt)
    doc = document_service.get_document(client, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    metadata = doc.metadata or {}
    metadata["tags"] = tags_update.tags
    
    doc_row = document_service.update_document_metadata(
        client=client,
        doc_id=document_id,
        file_size=doc.file_size,
        content_type=doc.content_type,
        content_hash=doc.content_hash or "",
        status=doc.status,
        metadata=metadata
    )
    return doc_row


class DocumentMoveRequest(BaseModel):
    new_filename: str

@router.patch("/{document_id}/move", response_model=DocumentRow)
async def move_document(document_id: str, move_req: DocumentMoveRequest, current_user: CurrentUserDep):
    if not current_user.can_add and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    client = get_user_client(current_user.jwt)
    try:
        doc_row = document_service.move_document(client, document_id, move_req.new_filename)
        return doc_row
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to move document %s: %s", document_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to move document: {e}")



import os
from fastapi.responses import FileResponse

@router.get("/{document_id}/content")
async def get_document_content(document_id: str, current_user: CurrentUserDep):
    """Serve the actual document file for previewing, falling back to database chunks if missing from disk."""
    client = get_user_client(current_user.jwt)
    doc = document_service.get_document(client, document_id)
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    if doc.file_path:
        full_path = os.path.join("data/storage", doc.file_path)
        if os.path.exists(full_path):
            return FileResponse(full_path, media_type=doc.content_type, filename=doc.filename)
            
    # Fallback: retrieve from document_chunks table
    from app.repositories import get_db_session
    import json
    with get_db_session() as session:
        chunks = session.chunks.get_chunks_by_document(str(document_id))
        
    if not chunks:
        raise HTTPException(status_code=404, detail="Document content not found on disk or database")
        
    chunks_with_index = []
    for chunk in chunks:
        content = chunk.get("content", "")
        meta = chunk.get("metadata", {})
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}
        idx = meta.get("chunk_index", 0) if isinstance(meta, dict) else 0
        chunks_with_index.append((idx, content))
        
    chunks_with_index.sort(key=lambda x: x[0])
    full_text = "\n\n".join(c[1] for c in chunks_with_index)
    
    from fastapi.responses import Response
    return Response(content=full_text, media_type="text/plain", headers={"Content-Disposition": f"attachment; filename={os.path.basename(doc.filename)}"})



@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: str, current_user: CurrentUserDep):
    """Delete a document, cascade delete its vector chunks, and remove it from storage."""
    if not current_user.can_delete and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete documents."
        )

    client = get_user_client(current_user.jwt)
    
    doc = document_service.get_document(client, document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    deleted = document_service.delete_document(client, document_id)
    if not deleted:
         raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    if doc.file_path:
        document_service.delete_file_from_storage(client, doc.file_path)
    
    return


@router.post("/{document_id}/retry", response_model=DocumentRow)
async def retry_document_ingestion(
    document_id: str,
    background_tasks: BackgroundTasks,
    current_user: CurrentUserDep,
):
    """Retry processing a failed document by downloading its file from storage and triggering background ingestion again."""
    if not current_user.can_add and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to add/retry documents."
        )

    client = get_user_client(current_user.jwt)
    
    doc = document_service.get_document(client, document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
        
    try:
        content = document_service.download_file_from_storage(client, doc.file_path)
    except Exception as e:
        logger.error("Failed to download file from storage for retry: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve file from storage: {e}"
        )
        
    document_service.delete_document_chunks(client, str(doc.id))
    
    doc_row = document_service.update_document_metadata(
        client=client,
        doc_id=str(doc.id),
        file_size=doc.file_size,
        content_type=doc.content_type,
        content_hash=doc.content_hash or "",
        status=DocumentStatus.pending,
        metadata={},
    )
    
    ingestion_service.enqueue_document_ingestion(
        doc_id=str(doc_row.id),
        user_id=current_user.id,
        filename=doc_row.filename,
        content=content,
        content_type=doc_row.content_type,
        workspace_id=doc.workspace_id or DEFAULT_WORKSPACE_ID,
    )
    
    return doc_row


@router.post("/retry-batch", response_model=list[DocumentUploadResponse])
async def retry_documents_batch(
    request: RetryBatchRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUserDep,
):
    """Retry processing a batch of documents by downloading files and triggering background ingestion."""
    if not current_user.can_add and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to add/retry documents."
        )

    client = get_user_client(current_user.jwt)
    response_docs = []
    
    for doc_id in request.document_ids:
        try:
            doc = document_service.get_document(client, str(doc_id))
            if not doc:
                logger.warning("Document %s not found during retry batch", doc_id)
                continue
                
            content = document_service.download_file_from_storage(client, doc.file_path)
            
            document_service.delete_document_chunks(client, str(doc.id))
            
            doc_row = document_service.update_document_metadata(
                client=client,
                doc_id=str(doc.id),
                file_size=doc.file_size,
                content_type=doc.content_type,
                content_hash=doc.content_hash or "",
                status=DocumentStatus.pending,
                metadata={},
            )
            
            ingestion_service.enqueue_document_ingestion(
            doc_id=str(doc_row.id),
            user_id=current_user.id,
            filename=doc_row.filename,
            content=content,
            content_type=doc_row.content_type,
            workspace_id=doc.workspace_id or DEFAULT_WORKSPACE_ID,
        )
            
            response_docs.append(
                DocumentUploadResponse(
                    id=doc_row.id,
                    filename=doc_row.filename,
                    status=DocumentStatus.pending,
                    created_at=doc_row.created_at,
                    upserted=True,
                )
            )
        except Exception as e:
            logger.error("Failed to retry document %s in batch: %s", doc_id, e, exc_info=True)
            
    return response_docs
