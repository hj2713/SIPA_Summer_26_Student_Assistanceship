import logging
from app.services.storage.base import StorageProvider
from app.services.storage.providers.local_provider import LocalStorageProvider

logger = logging.getLogger(__name__)

class StorageService:
    """Facade for StorageProvider interactions."""

    def __init__(self, provider: StorageProvider) -> None:
        self._provider = provider

    @property
    def provider(self) -> StorageProvider:
        return self._provider

    def upload_file(
        self,
        user_id: str,
        doc_id: str,
        filename: str,
        content: bytes,
        content_type: str,
    ) -> str:
        return self._provider.upload_file(user_id, doc_id, filename, content, content_type)

    def delete_file(self, storage_path: str) -> None:
        self._provider.delete_file(storage_path)

    def download_file(self, storage_path: str) -> bytes:
        return self._provider.download_file(storage_path)


_storage_singleton: StorageService | None = None


def get_storage() -> StorageService:
    """Return the process-wide StorageService singleton."""
    global _storage_singleton
    if _storage_singleton is None:
        from app.core.config import settings
        if settings.STORAGE_PROVIDER == "supabase" or (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY):
            from app.services.storage.providers.supabase_provider import SupabaseStorageProvider
            provider = SupabaseStorageProvider()
            logger.info("StorageService initialized with SupabaseStorageProvider")
        else:
            provider = LocalStorageProvider()
            logger.info("StorageService initialized with LocalStorageProvider")
        _storage_singleton = StorageService(provider)
    return _storage_singleton


def reset_storage() -> None:
    """Reset the storage singleton (primarily for testing)."""
    global _storage_singleton
    _storage_singleton = None
