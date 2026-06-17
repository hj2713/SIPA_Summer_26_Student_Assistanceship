from typing import Protocol, runtime_checkable

@runtime_checkable
class StorageProvider(Protocol):
    """Protocol defining file upload, download, and delete interfaces."""

    def upload_file(
        self,
        user_id: str,
        doc_id: str,
        filename: str,
        content: bytes,
        content_type: str,
    ) -> str:
        """Upload raw file content and return the unique storage path."""
        ...

    def delete_file(self, storage_path: str) -> None:
        """Delete file at the specified storage path."""
        ...

    def download_file(self, storage_path: str) -> bytes:
        """Download file content at the specified storage path."""
        ...
