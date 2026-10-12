# Backend Business Logic Services Architecture

This directory contains the business logic layer of the application. Services execute research workflows, document ingestion, LLM schema extractions, RAG retrieval, email notifications, and evaluation campaigns while enforcing multi-tenant workspace boundaries.

---

## 📁 Service Modules Overview

| Service File | Domain & Primary Responsibilities |
| :--- | :--- |
| [`campaign_service.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/services/campaign_service.py) | Research campaign dashboard management, linking/unlinking documents, grid cell overrides, cell & row LLM re-evaluations, model addition/deletion, and token limits. |
| [`document_service.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/services/document_service.py) | Workspace document CRUD operations, database queries for document metadata, chunk associations, and paginated document listings. |
| [`ingestion_service.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/services/ingestion_service.py) | Document ingestion pipeline: content hash computation, PDF text extraction, text chunking, vector embedding generation, and metadata tag extraction. |
| [`coding_service.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/services/coding_service.py) | LLM prompt schema generation, structured field extraction routines, and sequential background document coding execution. |
| [`workflow_service.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/services/workflow_service.py) | Visual workflow builder logic: workflow drafts, publishing version snapshots, template management, and export/import. |
| [`workflow_dashboard_service.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/services/workflow_dashboard_service.py) | Execution engine for custom DAG workflows linked to research dashboards, execution tracing, and context logging. |
| [`retrieval_service.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/services/retrieval_service.py) | Vector search, semantic document chunk retrieval, and cross-encoder reranking over workspace documents. |
| [`chat_service.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/services/chat_service.py) | RAG chat streaming, conversation context generation, and integration with search retrieval. |
| [`thread_service.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/services/thread_service.py) | Thread lifecycle, title generation, and message history persistence. |
| [`message_service.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/services/message_service.py) | Persistence layer for individual user and assistant chat messages. |
| [`benchmark_evaluation_service.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/services/benchmark_evaluation_service.py) | Ground-truth benchmark evaluation comparing campaign LLM extractions against professor reference datasets. |
| [`email_service.py`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/backend/app/services/email_service.py) | Resend API integration for sending workspace invitation emails. |

---

## 🔒 Workspace Isolation in Services

Services receive the `workspace_id` from route controllers or dependency injectors and include it in all database queries:

1. **Dashboard Queries**: `session.dashboards.list_by_workspace(workspace_id)` filters dashboards strictly to the target workspace.
2. **Document Ingestion**: Content hashes and chunk embeddings are stored with an explicit `workspace_id` foreign key.
3. **Retrieval & RAG**: Semantic vector searches filter candidate document chunks by `workspace_id` before performing similarity calculations, preventing cross-tenant information leakage.
