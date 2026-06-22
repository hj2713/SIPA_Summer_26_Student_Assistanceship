from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

class BaseUserRepository(ABC):
    @abstractmethod
    def get_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def get_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def create(self, user_id: str, email: str, password_hash: str, is_admin: int, can_add: int, can_delete: int) -> Dict[str, Any]:
        pass

    @abstractmethod
    def update(self, user_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        pass

    @abstractmethod
    def list_all(self) -> List[Dict[str, Any]]:
        pass

class BaseWorkspaceRepository(ABC):
    @abstractmethod
    def get_by_id(self, workspace_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def get_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def create(self, workspace_id: str, name: str) -> Dict[str, Any]:
        pass

    @abstractmethod
    def list_all(self) -> List[Dict[str, Any]]:
        pass

class BaseDocumentRepository(ABC):
    @abstractmethod
    def get_by_id(self, doc_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def get_by_filename(self, workspace_id: str, filename: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def create(self, doc_id: str, user_id: str, workspace_id: str, filename: str, file_path: str, file_size: int, content_type: str, status: str, content_hash: Optional[str], metadata: str) -> Dict[str, Any]:
        pass

    @abstractmethod
    def update(self, doc_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        pass

    @abstractmethod
    def delete(self, doc_id: str) -> None:
        pass

    @abstractmethod
    def list_by_workspace(self, workspace_id: str) -> List[Dict[str, Any]]:
        pass

class BaseDocumentChunkRepository(ABC):
    @abstractmethod
    def create_chunks(self, chunks: List[Dict[str, Any]]) -> None:
        pass

    @abstractmethod
    def delete_by_document(self, document_id: str) -> None:
        pass

    @abstractmethod
    def get_chunks_by_document(self, document_id: str) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def similarity_search(self, workspace_id: str, query_embedding: List[float], limit: int, threshold: float, document_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def get_all_chunks_for_workspace(self, workspace_id: str, document_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        pass

class BaseDashboardRepository(ABC):
    @abstractmethod
    def get_by_id(self, dashboard_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def create(self, dashboard_id: str, workspace_id: str, name: str, description: str, prompt: str, schema: str, model: Optional[str]) -> Dict[str, Any]:
        pass

    @abstractmethod
    def update(self, dashboard_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        pass

    @abstractmethod
    def delete(self, dashboard_id: str) -> None:
        pass

    @abstractmethod
    def list_by_workspace(self, workspace_id: str) -> List[Dict[str, Any]]:
        pass

class BaseDashboardDocumentRepository(ABC):
    @abstractmethod
    def get(self, dashboard_id: str, document_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def create_or_update(self, dashboard_id: str, document_id: str, coded_values: str, status: str, error_message: Optional[str] = None, error_type: Optional[str] = None, current_step: int = 0, total_steps: int = 7) -> Dict[str, Any]:
        pass

    @abstractmethod
    def update_status(self, dashboard_id: str, document_id: str, status: str, error_message: Optional[str] = None, error_type: Optional[str] = None) -> None:
        pass

    @abstractmethod
    def update_progress(self, dashboard_id: str, document_id: str, current_step: int, total_steps: int) -> None:
        pass

    @abstractmethod
    def update_coded_values(self, dashboard_id: str, document_id: str, coded_values: str, status: str = "completed") -> None:
        pass

    @abstractmethod
    def list_by_dashboard(self, dashboard_id: str) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def list_by_dashboard_with_documents(self, dashboard_id: str) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def link_document_if_not_exists(self, dashboard_id: str, document_id: str) -> None:
        pass

    @abstractmethod
    def get_linked_document_ids(self, dashboard_id: str, document_ids: List[str]) -> List[str]:
        pass

    @abstractmethod
    def get_failed_document_ids(self, dashboard_id: str) -> List[str]:
        pass

    @abstractmethod
    def reset_documents_to_pending(self, dashboard_id: str, document_ids: List[str]) -> None:
        pass

    @abstractmethod
    def delete_by_document(self, document_id: str) -> None:
        pass

class BaseWorkflowRepository(ABC):
    @abstractmethod
    def get_by_id(self, workflow_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def create(self, workflow_id: str, workspace_id: str, name: str, description: str, draft_definition: str, created_by: str) -> Dict[str, Any]:
        pass

    @abstractmethod
    def update(self, workflow_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        pass

    @abstractmethod
    def delete(self, workflow_id: str) -> None:
        pass

    @abstractmethod
    def list_by_workspace(self, workspace_id: str) -> List[Dict[str, Any]]:
        pass

class BaseWorkflowVersionRepository(ABC):
    @abstractmethod
    def create(self, version_id: str, workflow_id: str, version: int, definition_json: str, definition_hash: str, changelog: str, created_by: str) -> Dict[str, Any]:
        pass

    @abstractmethod
    def get(self, workflow_id: str, version: int) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def list_by_workflow(self, workflow_id: str) -> List[Dict[str, Any]]:
        pass

class BaseThreadRepository(ABC):
    @abstractmethod
    def get_by_id(self, thread_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def create(self, thread_id: str, user_id: str, title: str, provider: str, provider_thread_id: Optional[str], model: Optional[str], dashboard_id: Optional[str]) -> Dict[str, Any]:
        pass

    @abstractmethod
    def update(self, thread_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        pass

    @abstractmethod
    def delete(self, thread_id: str) -> None:
        pass

    @abstractmethod
    def list_by_user(self, user_id: str) -> List[Dict[str, Any]]:
        pass

class BaseMessageRepository(ABC):
    @abstractmethod
    def get_by_id(self, message_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def create(self, message_id: str, thread_id: str, user_id: str, role: str, content: str, provider_response_id: Optional[str], tokens_input: Optional[int], tokens_output: Optional[int]) -> Dict[str, Any]:
        pass

    @abstractmethod
    def list_by_thread(self, thread_id: str) -> List[Dict[str, Any]]:
        pass

class BaseLlmUsageLogRepository(ABC):
    @abstractmethod
    def create(self, log_id: str, provider: str, model: str, service: str, campaign_id: Optional[str], thread_id: Optional[str], input_tokens: int, output_tokens: int, calculated_cost: float) -> None:
        pass

    @abstractmethod
    def get_usage_stats(self, timeframe: str, campaign_id: Optional[str] = None, thread_id: Optional[str] = None) -> Dict[str, Any]:
        pass

class BaseUnitOfWork(ABC):
    @property
    @abstractmethod
    def users(self) -> BaseUserRepository:
        pass

    @property
    @abstractmethod
    def workspaces(self) -> BaseWorkspaceRepository:
        pass

    @property
    @abstractmethod
    def documents(self) -> BaseDocumentRepository:
        pass

    @property
    @abstractmethod
    def chunks(self) -> BaseDocumentChunkRepository:
        pass

    @property
    @abstractmethod
    def dashboards(self) -> BaseDashboardRepository:
        pass

    @property
    @abstractmethod
    def dashboard_documents(self) -> BaseDashboardDocumentRepository:
        pass

    @property
    @abstractmethod
    def workflows(self) -> BaseWorkflowRepository:
        pass

    @property
    @abstractmethod
    def workflow_versions(self) -> BaseWorkflowVersionRepository:
        pass

    @property
    @abstractmethod
    def threads(self) -> BaseThreadRepository:
        pass

    @property
    @abstractmethod
    def messages(self) -> BaseMessageRepository:
        pass

    @property
    @abstractmethod
    def usage_logs(self) -> BaseLlmUsageLogRepository:
        pass

    @abstractmethod
    def commit(self) -> None:
        pass

    @abstractmethod
    def rollback(self) -> None:
        pass

    @abstractmethod
    def close(self) -> None:
        pass

    def __enter__(self) -> "BaseUnitOfWork":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        try:
            if exc_type is not None:
                self.rollback()
            else:
                self.commit()
        finally:
            self.close()
