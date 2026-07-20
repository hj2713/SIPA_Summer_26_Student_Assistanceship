import logging
import httpx
from app.core.config import settings
from app.services.storage.base import StorageProvider

logger = logging.getLogger(__name__)

class SupabaseStorageProvider(StorageProvider):
    """StorageProvider implementation delegating to Supabase Storage REST API."""

    def __init__(
        self,
        supabase_url: str | None = None,
        service_key: str | None = None,
        bucket: str | None = None,
    ) -> None:
        self.supabase_url = (supabase_url or settings.SUPABASE_URL).rstrip("/")
        self.service_key = service_key or settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY
        self.bucket = bucket or settings.STORAGE_BUCKET_NAME or "documents"
        self._ensure_bucket_exists()

    def _get_headers(self, content_type: str = "application/json") -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.service_key}",
            "apikey": self.service_key,
            "Content-Type": content_type,
        }

    def _ensure_bucket_exists(self) -> None:
        """Create the target bucket if it does not exist yet."""
        if not self.supabase_url or not self.service_key:
            return
        url = f"{self.supabase_url}/storage/v1/bucket"
        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.get(f"{url}/{self.bucket}", headers=self._get_headers())
                if res.status_code == 404:
                    client.post(
                        url,
                        headers=self._get_headers(),
                        json={"id": self.bucket, "name": self.bucket, "public": True},
                    )
                    logger.info("Created Supabase Storage bucket '%s'", self.bucket)
        except Exception as e:
            logger.warning("Failed to check/create Supabase Storage bucket '%s': %s", self.bucket, e)

    def upload_file(
        self,
        user_id: str,
        doc_id: str,
        filename: str,
        content: bytes,
        content_type: str,
    ) -> str:
        storage_path = f"{user_id}/{doc_id}/{filename}"
        if not self.supabase_url or not self.service_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for SupabaseStorageProvider.")

        url = f"{self.supabase_url}/storage/v1/object/{self.bucket}/{storage_path}"
        headers = self._get_headers(content_type or "application/octet-stream")
        headers["x-upsert"] = "true"

        with httpx.Client(timeout=30.0) as client:
            res = client.post(url, headers=headers, content=content)
            if res.status_code not in (200, 201):
                logger.error("Supabase Storage upload failed [%d]: %s", res.status_code, res.text)
                res.raise_for_status()

        logger.info("Successfully uploaded file to Supabase Storage: %s", storage_path)
        return storage_path

    def download_file(self, storage_path: str) -> bytes:
        if not self.supabase_url or not self.service_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for SupabaseStorageProvider.")

        url = f"{self.supabase_url}/storage/v1/object/authenticated/{self.bucket}/{storage_path}"
        headers = {
            "Authorization": f"Bearer {self.service_key}",
            "apikey": self.service_key,
        }

        with httpx.Client(timeout=30.0) as client:
            res = client.get(url, headers=headers)
            if res.status_code != 200:
                public_url = f"{self.supabase_url}/storage/v1/object/public/{self.bucket}/{storage_path}"
                res = client.get(public_url, headers=headers)
                if res.status_code != 200:
                    logger.error("Supabase Storage download failed [%d]: %s for path=%s", res.status_code, res.text, storage_path)
                    res.raise_for_status()

            return res.content

    def delete_file(self, storage_path: str) -> None:
        if not self.supabase_url or not self.service_key:
            return

        url = f"{self.supabase_url}/storage/v1/object/{self.bucket}"
        headers = self._get_headers()

        with httpx.Client(timeout=10.0) as client:
            try:
                client.request("DELETE", url, headers=headers, json={"prefixes": [storage_path]})
                logger.info("Deleted file from Supabase Storage: %s", storage_path)
            except Exception as e:
                logger.error("Failed to delete file from Supabase Storage %s: %s", storage_path, e)
