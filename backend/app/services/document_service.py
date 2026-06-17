"""Local database and storage operations for documents using SQLite and generic StorageService.
Supports workspaces and visibility changes.
"""
import os
import json
import logging
from typing import Any
from uuid import UUID

from app.core.database import get_db_conn
from app.schemas.document import DocumentRow, DocumentStatus
from app.services.storage import get_storage, StorageService

logger = logging.getLogger(__name__)


class DocumentService:
    """Class encapsulating all document database operations and storage interactions."""

    def __init__(self, db_conn_factory=None, storage_service: StorageService = None) -> None:
        self._db_conn_factory = db_conn_factory
        self._storage_service = storage_service

    @property
    def db_conn_factory(self) -> Any:
        if self._db_conn_factory is None:
            global get_db_conn
            return get_db_conn
        return self._db_conn_factory

    @property
    def storage_service(self) -> StorageService:
        if self._storage_service is None:
            return get_storage()
        return self._storage_service

    def _row_to_doc(self, row: Any) -> DocumentRow:
        """Helper to convert a SQLite Row to a DocumentRow Pydantic model."""
        d = dict(row)
        if "metadata" in d and d["metadata"]:
            d["metadata"] = json.loads(d["metadata"])
        else:
            d["metadata"] = {}
        return DocumentRow.model_validate(d)

    def list_documents(self, client: Any, workspace_id: str) -> list[DocumentRow]:
        """List all documents belonging to a workspace, most recently created first."""
        with self.db_conn_factory() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM documents WHERE workspace_id = ? ORDER BY created_at DESC;",
                (str(workspace_id),)
            )
            rows = cursor.fetchall()
            return [self._row_to_doc(row) for row in rows]

    def create_document(
        self,
        client: Any,
        user_id: str,
        filename: str,
        file_path: str,
        file_size: int,
        content_type: str,
        content_hash: str | None = None,
        metadata: dict[str, Any] | None = None,
        workspace_id: str = "TEST",
    ) -> DocumentRow:
        """Create a new document record in the local database under a specific workspace."""
        import uuid
        doc_id = str(uuid.uuid4())
        row = {
            "id": doc_id,
            "user_id": str(user_id),
            "workspace_id": str(workspace_id),
            "filename": filename,
            "file_path": file_path,
            "file_size": file_size,
            "content_type": content_type,
            "status": DocumentStatus.pending.value,
            "content_hash": content_hash,
            "metadata": json.dumps(metadata or {}),
        }
        with self.db_conn_factory() as conn:
            conn.execute(
                """
                INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status, content_hash, metadata)
                VALUES (:id, :user_id, :workspace_id, :filename, :file_path, :file_size, :content_type, :status, :content_hash, :metadata);
                """,
                row
            )
            conn.commit()
            
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM documents WHERE id = ?;", (doc_id,))
            new_row = cursor.fetchone()
            if not new_row:
                raise ValueError("Failed to retrieve newly created document")
            return self._row_to_doc(new_row)

    def get_document(self, client: Any, doc_id: str, user_id: str = None) -> DocumentRow | None:
        """Fetch a document. Returns None if not found (user_id is ignored for global workspace visibility)."""
        with self.db_conn_factory() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM documents WHERE id = ?;", (str(doc_id),))
            row = cursor.fetchone()
            return self._row_to_doc(row) if row else None

    def get_document_by_name(self, client: Any, workspace_id: str, filename: str) -> DocumentRow | None:
        """Fetch a document by its filename for a specific workspace."""
        with self.db_conn_factory() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM documents WHERE workspace_id = ? AND filename = ?;",
                (str(workspace_id), filename)
            )
            row = cursor.fetchone()
            return self._row_to_doc(row) if row else None

    def delete_document(self, client: Any, doc_id: str, user_id: str = None) -> bool:
        """Delete a document record from the database. Returns True if deleted."""
        with self.db_conn_factory() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM documents WHERE id = ?;", (str(doc_id),))
            conn.commit()
            return cursor.rowcount > 0

    def delete_document_chunks(self, client: Any, doc_id: str) -> None:
        """Delete all chunks belonging to a document."""
        with self.db_conn_factory() as conn:
            conn.execute("DELETE FROM document_chunks WHERE document_id = ?;", (str(doc_id),))
            conn.commit()
            logger.info("Deleted all document chunks for document %s", doc_id)

    def get_document_by_id_no_user(self, client: Any, doc_id: str) -> DocumentRow | None:
        """Fetch a document by ID only."""
        return self.get_document(client, doc_id)

    def update_document_metadata(
        self,
        client: Any,
        doc_id: str,
        file_size: int,
        content_type: str,
        content_hash: str,
        status: DocumentStatus = DocumentStatus.pending,
        metadata: dict[str, Any] | None = None,
    ) -> DocumentRow:
        """Update document metadata fields and reset status."""
        with self.db_conn_factory() as conn:
            if metadata is not None:
                conn.execute(
                    """
                    UPDATE documents
                    SET file_size = ?, content_type = ?, content_hash = ?, status = ?, error_message = NULL, metadata = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                    WHERE id = ?;
                    """,
                    (file_size, content_type, content_hash, status.value, json.dumps(metadata), str(doc_id))
                )
            else:
                conn.execute(
                    """
                    UPDATE documents
                    SET file_size = ?, content_type = ?, content_hash = ?, status = ?, error_message = NULL, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                    WHERE id = ?;
                    """,
                    (file_size, content_type, content_hash, status.value, str(doc_id))
                )
            conn.commit()
            
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM documents WHERE id = ?;", (str(doc_id),))
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Failed to find document {doc_id} after metadata update")
            return self._row_to_doc(row)

    def update_document_status(
        self,
        client: Any,
        doc_id: str,
        status: DocumentStatus,
        error_message: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> DocumentRow:
        """Update status/error details of a document. Used by background processing."""
        with self.db_conn_factory() as conn:
            if metadata is not None:
                conn.execute(
                    """
                    UPDATE documents
                    SET status = ?, error_message = ?, metadata = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                    WHERE id = ?;
                    """,
                    (status.value, error_message, json.dumps(metadata), str(doc_id))
                )
            else:
                conn.execute(
                    """
                    UPDATE documents
                    SET status = ?, error_message = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                    WHERE id = ?;
                    """,
                    (status.value, error_message, str(doc_id))
                )
            conn.commit()
            
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM documents WHERE id = ?;", (str(doc_id),))
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Failed to find document {doc_id} after status update")
            return self._row_to_doc(row)

    def update_document_file_path(self, client: Any, doc_id: str, file_path: str) -> None:
        """Update file_path for a document in SQLite."""
        with self.db_conn_factory() as conn:
            conn.execute(
                "UPDATE documents SET file_path = ? WHERE id = ?;",
                (file_path, str(doc_id))
            )
            conn.commit()

    def move_document(self, client: Any, doc_id: str, new_filename: str) -> DocumentRow:
        """Move a document to a new filename (path) in the workspace.

        Updates both filename and file_path in SQLite and relocates the physical file in storage.
        """
        with self.db_conn_factory() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM documents WHERE id = ?;", (str(doc_id),))
            row = cursor.fetchone()
            if not row:
                raise ValueError("Document not found")
            doc = self._row_to_doc(row)

            # Check if new filename already exists in the same workspace to prevent duplicates
            cursor.execute(
                "SELECT id FROM documents WHERE workspace_id = ? AND filename = ? AND id != ?;",
                (doc.workspace_id, new_filename, str(doc.id))
            )
            if cursor.fetchone():
                raise ValueError(f"A document with name '{new_filename}' already exists in this workspace.")

            old_file_path = doc.file_path
            # Compute new file path in storage: user_id/doc_id/new_filename
            new_file_path = f"{doc.user_id}/{doc.id}/{new_filename}"

            # Move file in storage
            if old_file_path:
                try:
                    content = self.storage_service.download_file(old_file_path)
                    self.storage_service.upload_file(
                        doc.user_id, doc.id, new_filename, content, doc.content_type
                    )
                    self.storage_service.delete_file(old_file_path)
                except Exception as e:
                    logger.error("Failed to move storage file during document rename: %s", e)

            # Update database record
            conn.execute(
                """
                UPDATE documents
                SET filename = ?, file_path = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                WHERE id = ?;
                """,
                (new_filename, new_file_path, str(doc_id))
            )
            conn.commit()

            cursor.execute("SELECT * FROM documents WHERE id = ?;", (str(doc_id),))
            updated_row = cursor.fetchone()
            if not updated_row:
                raise ValueError("Failed to retrieve document after move")
            return self._row_to_doc(updated_row)

    # Adding storage methods directly on the class for backward-compatibility with patching
    def upload_file_to_storage(
        self,
        client: Any,
        user_id: str,
        doc_id: str,
        filename: str,
        content: bytes,
        content_type: str,
    ) -> str:
        return self.storage_service.upload_file(user_id, doc_id, filename, content, content_type)

    def delete_file_from_storage(
        self,
        client: Any,
        storage_path: str,
    ) -> None:
        self.storage_service.delete_file(storage_path)

    def download_file_from_storage(
        self,
        client: Any,
        storage_path: str,
    ) -> bytes:
        return self.storage_service.download_file(storage_path)


# Process-wide singleton instance for dependency injection & route integration
document_service = DocumentService()


# Backward-compatible functional delegates delegating to the singleton + storage service
def list_documents(client: Any, workspace_id: str) -> list[DocumentRow]:
    return document_service.list_documents(client, workspace_id)


def create_document(
    client: Any,
    user_id: str,
    filename: str,
    file_path: str,
    file_size: int,
    content_type: str,
    content_hash: str | None = None,
    metadata: dict[str, Any] | None = None,
    workspace_id: str = "TEST",
) -> DocumentRow:
    return document_service.create_document(
        client, user_id, filename, file_path, file_size, content_type, content_hash, metadata, workspace_id
    )


def get_document(client: Any, doc_id: str, user_id: str = None) -> DocumentRow | None:
    return document_service.get_document(client, doc_id, user_id)


def get_document_by_name(client: Any, workspace_id: str, filename: str) -> DocumentRow | None:
    return document_service.get_document_by_name(client, workspace_id, filename)


def delete_document(client: Any, doc_id: str, user_id: str = None) -> bool:
    return document_service.delete_document(client, doc_id, user_id)


def delete_document_chunks(client: Any, doc_id: str) -> None:
    document_service.delete_document_chunks(client, doc_id)


def get_document_by_id_no_user(client: Any, doc_id: str) -> DocumentRow | None:
    return document_service.get_document_by_id_no_user(client, doc_id)


def update_document_metadata(
    client: Any,
    doc_id: str,
    file_size: int,
    content_type: str,
    content_hash: str,
    status: DocumentStatus = DocumentStatus.pending,
    metadata: dict[str, Any] | None = None,
) -> DocumentRow:
    return document_service.update_document_metadata(
        client, doc_id, file_size, content_type, content_hash, status, metadata
    )


def update_document_status(
    client: Any,
    doc_id: str,
    status: DocumentStatus,
    error_message: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> DocumentRow:
    return document_service.update_document_status(client, doc_id, status, error_message, metadata)


def update_document_file_path(client: Any, doc_id: str, file_path: str) -> None:
    document_service.update_document_file_path(client, doc_id, file_path)


def move_document(client: Any, doc_id: str, new_filename: str) -> DocumentRow:
    return document_service.move_document(client, doc_id, new_filename)


def upload_file_to_storage(
    client: Any,
    user_id: str,
    doc_id: str,
    filename: str,
    content: bytes,
    content_type: str,
) -> str:
    return document_service.upload_file_to_storage(client, user_id, doc_id, filename, content, content_type)


def delete_file_from_storage(
    client: Any,
    storage_path: str,
) -> None:
    document_service.delete_file_from_storage(client, storage_path)


def download_file_from_storage(
    client: Any,
    storage_path: str,
) -> bytes:
    return document_service.download_file_from_storage(client, storage_path)
