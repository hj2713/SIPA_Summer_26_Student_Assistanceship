import os
import logging

logger = logging.getLogger(__name__)

class LocalStorageProvider:
    """StorageProvider implementation targeting local filesystem storage."""

    def __init__(self, storage_dir: str = "data/storage") -> None:
        self.storage_dir = storage_dir

    def upload_file(
        self,
        user_id: str,
        doc_id: str,
        filename: str,
        content: bytes,
        content_type: str,
    ) -> str:
        storage_path = f"{user_id}/{doc_id}/{filename}"
        full_path = os.path.join(self.storage_dir, storage_path)
        try:
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "wb") as f:
                f.write(content)
            logger.info("Uploaded file to local storage: %s", storage_path)
            return storage_path
        except Exception as e:
            logger.error("Failed to save file to local filesystem: %s", e)
            raise

    def delete_file(self, storage_path: str) -> None:
        full_path = os.path.join(self.storage_dir, storage_path)
        try:
            if os.path.exists(full_path):
                os.remove(full_path)
                logger.info("Deleted file from local storage: %s", storage_path)
                # Clean up empty parent directories
                parent_dir = os.path.dirname(full_path)
                if os.path.exists(parent_dir) and not os.listdir(parent_dir):
                    os.rmdir(parent_dir)
                    grandparent_dir = os.path.dirname(parent_dir)
                    if os.path.exists(grandparent_dir) and not os.listdir(grandparent_dir):
                        os.rmdir(grandparent_dir)
        except Exception as e:
            logger.error("Failed to delete local file from storage: %s", e)

    def download_file(self, storage_path: str) -> bytes:
        full_path = os.path.join(self.storage_dir, storage_path)
        try:
            with open(full_path, "rb") as f:
                return f.read()
        except Exception as e:
            logger.error("Failed to download local file: %s", e)
            raise
