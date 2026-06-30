import sqlite3
import os
import json
import math
import re
from typing import Any, Dict, List, Optional
from app.repositories.base import (
    BaseUserRepository,
    BaseWorkspaceRepository,
    BaseDocumentRepository,
    BaseDocumentChunkRepository,
    BaseDashboardRepository,
    BaseDashboardDocumentRepository,
    BaseWorkflowRepository,
    BaseWorkflowTemplateRepository,
    BaseWorkflowVersionRepository,
    BaseThreadRepository,
    BaseMessageRepository,
    BaseLlmUsageLogRepository,
    BaseUnitOfWork,
)
from app.core.vectors import deserialize_embedding

STOPWORDS = {
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", 
    "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", "herself", 
    "it", "its", "itself", "they", "them", "their", "theirs", "themselves", "what", "which", 
    "who", "whom", "this", "that", "these", "those", "am", "is", "are", "was", "were", "be", 
    "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "a", "an", 
    "the", "and", "but", "if", "or", "because", "as", "until", "while", "of", "at", "by", "for", 
    "with", "about", "against", "between", "into", "through", "during", "before", "after", 
    "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", 
    "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", 
    "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", 
    "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", "just", "don", 
    "should", "now"
}

def tokenize(text: str) -> List[str]:
    return re.findall(r'\w+', text.lower())

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot_product = sum(a * b for a, b in zip(v1, v2))
    magnitude1 = math.sqrt(sum(a * a for a in v1))
    magnitude2 = math.sqrt(sum(b * b for b in v2))
    if not magnitude1 or not magnitude2:
        return 0.0
    return dot_product / (magnitude1 * magnitude2)

def matches_filter(doc_meta: Dict[str, Any], filter_meta: Dict[str, Any]) -> bool:
    if not filter_meta:
        return True
    for k, v in filter_meta.items():
        if k == "tags":
            doc_tags = doc_meta.get("tags", [])
            if not isinstance(doc_tags, list):
                return False
            for tag in v:
                if tag not in doc_tags:
                    return False
        else:
            if doc_meta.get(k) != v:
                return False
    return True

class SQLiteUserRepository(BaseUserRepository):
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def get_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?;", (str(user_id),))
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?;", (str(email).strip().lower(),))
        row = cursor.fetchone()
        return dict(row) if row else None

    def create(self, user_id: str, email: str, password_hash: str, is_admin: int, can_add: int, can_delete: int) -> Dict[str, Any]:
        self.conn.execute(
            "INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (?, ?, ?, ?, ?, ?);",
            (str(user_id), str(email).strip().lower(), password_hash, int(is_admin), int(can_add), int(can_delete))
        )
        return self.get_by_id(user_id)

    def update(self, user_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        if not updates:
            return self.get_by_id(user_id)
        keys = []
        values = []
        for k, v in updates.items():
            keys.append(f"{k} = ?")
            values.append(v)
        values.append(str(user_id))
        self.conn.execute(f"UPDATE users SET {', '.join(keys)} WHERE id = ?;", values)
        return self.get_by_id(user_id)

    def list_all(self) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM users ORDER BY email ASC;")
        return [dict(r) for r in cursor.fetchall()]

class SQLiteWorkspaceRepository(BaseWorkspaceRepository):
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def get_by_id(self, workspace_id: str) -> Optional[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM workspaces WHERE id = ?;", (str(workspace_id),))
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM workspaces WHERE name = ?;", (str(name),))
        row = cursor.fetchone()
        return dict(row) if row else None

    def create(self, workspace_id: str, name: str) -> Dict[str, Any]:
        self.conn.execute("INSERT INTO workspaces (id, name) VALUES (?, ?);", (str(workspace_id), str(name)))
        return self.get_by_id(workspace_id)

    def list_all(self) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM workspaces ORDER BY name ASC;")
        return [dict(r) for r in cursor.fetchall()]

class SQLiteDocumentRepository(BaseDocumentRepository):
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def get_by_id(self, doc_id: str) -> Optional[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM documents WHERE id = ?;", (str(doc_id),))
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_by_filename(self, workspace_id: str, filename: str) -> Optional[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM documents WHERE workspace_id = ? AND filename = ?;", (str(workspace_id), str(filename)))
        row = cursor.fetchone()
        return dict(row) if row else None

    def create(self, doc_id: str, user_id: str, workspace_id: str, filename: str, file_path: str, file_size: int, content_type: str, status: str, content_hash: Optional[str], metadata: str) -> Dict[str, Any]:
        self.conn.execute(
            """
            INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status, content_hash, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (str(doc_id), str(user_id), str(workspace_id), filename, file_path, file_size, content_type, status, content_hash, metadata)
        )
        return self.get_by_id(doc_id)

    def update(self, doc_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        if not updates:
            return self.get_by_id(doc_id)
        keys = []
        values = []
        for k, v in updates.items():
            keys.append(f"{k} = ?")
            values.append(v)
        values.append(str(doc_id))
        self.conn.execute(f"UPDATE documents SET {', '.join(keys)} WHERE id = ?;", values)
        return self.get_by_id(doc_id)

    def delete(self, doc_id: str) -> None:
        self.conn.execute("DELETE FROM documents WHERE id = ?;", (str(doc_id),))

    def list_by_workspace(self, workspace_id: str) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM documents WHERE workspace_id = ? ORDER BY created_at DESC;", (str(workspace_id),))
        return [dict(r) for r in cursor.fetchall()]

    def count_by_workspace(self, workspace_id: str) -> int:
        cursor = self.conn.cursor()
        cursor.execute("SELECT count(*) AS total FROM documents WHERE workspace_id = ?;", (str(workspace_id),))
        return int(cursor.fetchone()["total"])

    def list_page_by_workspace(self, workspace_id: str, limit: int, offset: int) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT * FROM documents WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?;",
            (str(workspace_id), int(limit), int(offset)),
        )
        return [dict(r) for r in cursor.fetchall()]

class SQLiteDocumentChunkRepository(BaseDocumentChunkRepository):
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def create_chunks(self, chunks: List[Dict[str, Any]]) -> None:
        self.conn.executemany(
            """
            INSERT INTO document_chunks (id, document_id, user_id, workspace_id, content, embedding, metadata)
            VALUES (:id, :document_id, :user_id, :workspace_id, :content, :embedding, :metadata);
            """,
            chunks
        )

    def delete_by_document(self, document_id: str) -> None:
        self.conn.execute("DELETE FROM document_chunks WHERE document_id = ?;", (str(document_id),))

    def get_chunks_by_document(self, document_id: str) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM document_chunks WHERE document_id = ?;", (str(document_id),))
        return [dict(r) for r in cursor.fetchall()]

    def similarity_search(self, workspace_id: str, query: str, query_embedding: List[float], limit: int, threshold: float, document_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        # Fetch candidate chunks
        all_chunks = self.get_all_chunks_for_workspace(workspace_id, document_ids)
        
        # Dense leg (Vector search)
        dense_candidates = []
        for chunk in all_chunks:
            emb = deserialize_embedding(chunk["embedding"])
            if not emb:
                continue
            sim = cosine_similarity(query_embedding, emb)
            if sim > threshold:
                dense_candidates.append({
                    "id": chunk["id"],
                    "document_id": chunk["document_id"],
                    "filename": chunk["filename"],
                    "content": chunk["content"],
                    "metadata": json.loads(chunk["chunk_metadata"]) if chunk["chunk_metadata"] else {},
                    "similarity": sim,
                })
        dense_candidates.sort(key=lambda x: x["similarity"], reverse=True)
        dense_candidates = dense_candidates[:limit]
        dense_ranks = {item["id"]: (idx + 1) for idx, item in enumerate(dense_candidates)}

        # Sparse leg (Keyword search)
        query_tokens = set(tokenize(query))
        meaningful_tokens = {t for t in query_tokens if t not in STOPWORDS}
        search_tokens = meaningful_tokens if meaningful_tokens else query_tokens
        
        sparse_candidates = []
        for chunk in all_chunks:
            chunk_tokens = tokenize(chunk["content"])
            score = sum(chunk_tokens.count(term) for term in search_tokens) if chunk_tokens else 0
            
            filename_lower = chunk["filename"].lower()
            filename_match = False
            for token in search_tokens:
                if len(token) > 4 and token in filename_lower:
                    filename_match = True
                    break
            if filename_match:
                score += 100.0
                
            if score > 0:
                sparse_candidates.append({
                    "id": chunk["id"],
                    "document_id": chunk["document_id"],
                    "filename": chunk["filename"],
                    "content": chunk["content"],
                    "metadata": json.loads(chunk["chunk_metadata"]) if chunk["chunk_metadata"] else {},
                    "score": score,
                })
        sparse_candidates.sort(key=lambda x: x["score"], reverse=True)
        sparse_candidates = sparse_candidates[:limit]
        sparse_ranks = {item["id"]: (idx + 1) for idx, item in enumerate(sparse_candidates)}

        # Reciprocal Rank Fusion (RRF)
        all_candidate_ids = set(dense_ranks.keys()).union(sparse_ranks.keys())
        rrf_scores = []
        
        # Helper lookup map - add sparse candidates first, then dense candidates so dense candidates overwrite and preserve similarity values
        id_to_candidate = {}
        for c in sparse_candidates:
            id_to_candidate[c["id"]] = c
        for c in dense_candidates:
            id_to_candidate[c["id"]] = c

        for cid in all_candidate_ids:
            r_dense = dense_ranks.get(cid, 1e9)
            r_sparse = sparse_ranks.get(cid, 1e9)
            rrf_score = (1.0 / (60.0 + r_dense)) + (1.0 / (60.0 + r_sparse))
            
            candidate = id_to_candidate[cid]
            rrf_scores.append({
                "chunk_id": candidate["id"],
                "document_id": candidate["document_id"],
                "filename": candidate["filename"],
                "content": candidate["content"],
                "metadata": candidate["metadata"],
                "similarity": candidate.get("similarity", 0.0),
                "rrf_score": rrf_score
            })
            
        rrf_scores.sort(key=lambda x: x["rrf_score"], reverse=True)
        return rrf_scores[:limit]

    def get_all_chunks_for_workspace(self, workspace_id: str, document_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        if document_ids:
            placeholders = ",".join("?" for _ in document_ids)
            query_str = f"""
                SELECT dc.id, dc.document_id, dc.content, dc.embedding, dc.metadata as chunk_metadata,
                       d.filename, d.metadata as doc_metadata
                FROM document_chunks dc
                JOIN documents d ON dc.document_id = d.id
                WHERE dc.workspace_id = ? AND dc.document_id IN ({placeholders});
            """
            cursor.execute(query_str, [str(workspace_id)] + [str(d_id) for d_id in document_ids])
        else:
            query_str = """
                SELECT dc.id, dc.document_id, dc.content, dc.embedding, dc.metadata as chunk_metadata,
                       d.filename, d.metadata as doc_metadata
                FROM document_chunks dc
                JOIN documents d ON dc.document_id = d.id
                WHERE dc.workspace_id = ?;
            """
            cursor.execute(query_str, (str(workspace_id),))
        return [dict(row) for row in cursor.fetchall()]

class SQLiteDashboardRepository(BaseDashboardRepository):
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def get_by_id(self, dashboard_id: str) -> Optional[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM dashboards WHERE id = ?;", (str(dashboard_id),))
        row = cursor.fetchone()
        return dict(row) if row else None

    def create(self, dashboard_id: Any, workspace_id: Optional[str] = None, name: Optional[str] = None, description: Optional[str] = None, prompt: Optional[str] = None, schema: Optional[str] = None, model: Optional[str] = None, dashboard_type: Optional[str] = None, token_limit: Optional[int] = None) -> Dict[str, Any]:
        import uuid
        if isinstance(dashboard_id, dict):
            payload = dashboard_id
            dashboard_id = payload.get("id") or str(uuid.uuid4())
            workspace_id = payload.get("workspace_id")
            name = payload.get("name")
            description = payload.get("description")
            prompt = payload.get("prompt")
            schema = payload.get("schema")
            model = payload.get("model")
            dashboard_type = payload.get("dashboard_type") or "campaign"
            workflow_id = payload.get("workflow_id")
            workflow_source = payload.get("workflow_source")
            workflow_version = payload.get("workflow_version")
            workflow_revision = payload.get("workflow_revision")
            workflow_definition_json = payload.get("workflow_definition_json")
            token_limit = payload.get("token_limit") or 2500000
        else:
            dashboard_type = dashboard_type or "campaign"
            workflow_id = None
            workflow_source = None
            workflow_version = None
            workflow_revision = None
            workflow_definition_json = None
            token_limit = token_limit if token_limit is not None else 2500000

        self.conn.execute(
            """
            INSERT INTO dashboards (
                id, workspace_id, name, description, prompt, schema, model,
                dashboard_type, workflow_id, workflow_source, workflow_version,
                workflow_revision, workflow_definition_json, token_limit
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                str(dashboard_id), str(workspace_id), name, description, prompt, schema, model,
                dashboard_type, workflow_id, workflow_source, workflow_version,
                workflow_revision, workflow_definition_json, token_limit
            )
        )
        return self.get_by_id(dashboard_id)

    def update(self, dashboard_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        if not updates:
            return self.get_by_id(dashboard_id)
        keys = []
        values = []
        for k, v in updates.items():
            keys.append(f"{k} = ?")
            values.append(v)
        values.append(str(dashboard_id))
        self.conn.execute(f"UPDATE dashboards SET {', '.join(keys)} WHERE id = ?;", values)
        return self.get_by_id(dashboard_id)

    def delete(self, dashboard_id: str) -> None:
        self.conn.execute("DELETE FROM dashboards WHERE id = ?;", (str(dashboard_id),))

    def list_by_workspace(self, workspace_id: str) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM dashboards WHERE workspace_id = ? ORDER BY created_at DESC;", (str(workspace_id),))
        return [dict(r) for r in cursor.fetchall()]

class SQLiteDashboardDocumentRepository(BaseDashboardDocumentRepository):
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def get(self, dashboard_id: str, document_id: str) -> Optional[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM dashboard_documents WHERE dashboard_id = ? AND document_id = ?;", (str(dashboard_id), str(document_id)))
        row = cursor.fetchone()
        return dict(row) if row else None

    def create_or_update(self, dashboard_id: str, document_id: str, coded_values: str, status: str, error_message: Optional[str] = None, error_type: Optional[str] = None, current_step: int = 0, total_steps: int = 7) -> Dict[str, Any]:
        self.conn.execute(
            """
            INSERT INTO dashboard_documents (dashboard_id, document_id, coded_values, status, error_message, error_type, current_step, total_steps)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(dashboard_id, document_id) DO UPDATE SET
                coded_values = excluded.coded_values,
                status = excluded.status,
                error_message = excluded.error_message,
                error_type = excluded.error_type,
                current_step = excluded.current_step,
                total_steps = excluded.total_steps;
            """,
            (str(dashboard_id), str(document_id), coded_values, status, error_message, error_type, current_step, total_steps)
        )
        return self.get(dashboard_id, document_id)

    def update_status(self, dashboard_id: str, document_id: str, status: str, error_message: Optional[str] = None, error_type: Optional[str] = None) -> None:
        self.conn.execute(
            """
            UPDATE dashboard_documents
            SET status = ?, error_message = ?, error_type = ?
            WHERE dashboard_id = ? AND document_id = ?;
            """,
            (status, error_message, error_type, str(dashboard_id), str(document_id))
        )

    def update_progress(self, dashboard_id: str, document_id: str, current_step: int, total_steps: int) -> None:
        self.conn.execute(
            """
            UPDATE dashboard_documents
            SET current_step = ?, total_steps = ?
            WHERE dashboard_id = ? AND document_id = ?;
            """,
            (current_step, total_steps, str(dashboard_id), str(document_id))
        )

    def update_coded_values(self, dashboard_id: str, document_id: str, coded_values: str, status: str = "completed") -> None:
        self.conn.execute(
            """
            UPDATE dashboard_documents
            SET coded_values = ?, status = ?, error_message = NULL, error_type = NULL
            WHERE dashboard_id = ? AND document_id = ?;
            """,
            (coded_values, status, str(dashboard_id), str(document_id))
        )

    def update_workflow_result(self, dashboard_id: str, document_id: str, coded_values: str, workflow_trace: str, workflow_context: str, status: str = "completed", error_message: Optional[str] = None, error_type: Optional[str] = None) -> None:
        self.conn.execute(
            """
            UPDATE dashboard_documents
            SET coded_values = ?, workflow_trace = ?, workflow_context = ?, status = ?,
                error_message = ?, error_type = ?, current_step = total_steps
            WHERE dashboard_id = ? AND document_id = ?;
            """,
            (coded_values, workflow_trace, workflow_context, status, error_message, error_type, str(dashboard_id), str(document_id)),
        )

    def get_workflow_result(self, dashboard_id: str, document_id: str) -> Optional[Dict[str, Any]]:
        row = self.conn.execute(
            """
            SELECT d.id as document_id, d.filename, d.file_size,
                   dd.status, dd.coded_values, dd.error_message, dd.error_type,
                   dd.current_step, dd.total_steps, dd.workflow_trace, dd.workflow_context
            FROM dashboard_documents dd
            JOIN documents d ON dd.document_id = d.id
            WHERE dd.dashboard_id = ? AND dd.document_id = ?;
            """,
            (str(dashboard_id), str(document_id)),
        ).fetchone()
        return dict(row) if row else None

    def list_by_dashboard(self, dashboard_id: str) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM dashboard_documents WHERE dashboard_id = ?;", (str(dashboard_id),))
        return [dict(r) for r in cursor.fetchall()]

    def list_by_dashboard_with_documents(self, dashboard_id: str) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT d.id as document_id, d.filename, d.file_size, d.metadata as doc_metadata,
                   dd.status, dd.coded_values, dd.error_message, dd.error_type,
                   dd.current_step, dd.total_steps
            FROM dashboard_documents dd
            JOIN documents d ON dd.document_id = d.id
            WHERE dd.dashboard_id = ?
            ORDER BY dd.created_at DESC;
            """,
            (str(dashboard_id),)
        )
        return [dict(r) for r in cursor.fetchall()]

    def count_by_dashboard(self, dashboard_id: str) -> int:
        cursor = self.conn.cursor()
        cursor.execute("SELECT count(*) AS total FROM dashboard_documents WHERE dashboard_id = ?;", (str(dashboard_id),))
        return int(cursor.fetchone()["total"])

    def list_page_by_dashboard_with_documents(self, dashboard_id: str, limit: int, offset: int) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT d.id as document_id, d.filename, d.file_size, d.metadata as doc_metadata,
                   dd.status, dd.coded_values, dd.error_message, dd.error_type,
                   dd.current_step, dd.total_steps
            FROM dashboard_documents dd
            JOIN documents d ON dd.document_id = d.id
            WHERE dd.dashboard_id = ?
            ORDER BY dd.created_at DESC
            LIMIT ? OFFSET ?;
            """,
            (str(dashboard_id), int(limit), int(offset)),
        )
        return [dict(r) for r in cursor.fetchall()]

    def list_mapping_by_document_ids(self, workspace_id: str, document_ids: List[str]) -> List[Dict[str, Any]]:
        if not document_ids:
            return []
        placeholders = ",".join("?" for _ in document_ids)
        cursor = self.conn.cursor()
        cursor.execute(
            f"""
            SELECT dd.document_id, d.id AS campaign_id, d.name AS campaign_name,
                   dd.status, dd.error_message, dd.error_type
            FROM dashboard_documents dd
            JOIN dashboards d ON d.id = dd.dashboard_id
            WHERE d.workspace_id = ? AND dd.document_id IN ({placeholders});
            """,
            [str(workspace_id)] + [str(doc_id) for doc_id in document_ids],
        )
        return [dict(r) for r in cursor.fetchall()]

    def get_status_counts(self, dashboard_id: str) -> Dict[str, int]:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT count(*) AS total,
                   sum(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
                   sum(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
                   sum(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
                   sum(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
            FROM dashboard_documents
            WHERE dashboard_id = ?;
            """,
            (str(dashboard_id),),
        )
        row = dict(cursor.fetchone())
        return {key: int(value or 0) for key, value in row.items()}

    def link_document_if_not_exists(self, dashboard_id: str, document_id: str) -> None:
        self.conn.execute(
            """
            INSERT OR IGNORE INTO dashboard_documents (dashboard_id, document_id, status)
            VALUES (?, ?, 'pending');
            """,
            (str(dashboard_id), str(document_id))
        )

    def get_linked_document_ids(self, dashboard_id: str, document_ids: List[str]) -> List[str]:
        if not document_ids:
            return []
        placeholders = ",".join("?" for _ in document_ids)
        cursor = self.conn.cursor()
        cursor.execute(
            f"""
            SELECT document_id FROM dashboard_documents
            WHERE dashboard_id = ? AND document_id IN ({placeholders});
            """,
            [str(dashboard_id)] + [str(d_id) for d_id in document_ids]
        )
        return [r[0] for r in cursor.fetchall()]

    def get_failed_document_ids(self, dashboard_id: str) -> List[str]:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT document_id FROM dashboard_documents
            WHERE dashboard_id = ? AND status = 'failed';
            """,
            (str(dashboard_id),)
        )
        return [r[0] for r in cursor.fetchall()]

    def reset_documents_to_pending(self, dashboard_id: str, document_ids: List[str]) -> None:
        if not document_ids:
            return
        placeholders = ",".join("?" for _ in document_ids)
        self.conn.execute(
            f"""
            UPDATE dashboard_documents
            SET status = 'pending', error_message = NULL, error_type = NULL
            WHERE dashboard_id = ? AND document_id IN ({placeholders});
            """,
            [str(dashboard_id)] + [str(d_id) for d_id in document_ids]
        )

    def delete_by_document(self, document_id: str) -> None:
        self.conn.execute("DELETE FROM dashboard_documents WHERE document_id = ?;", (str(document_id),))

    def delete_relations(self, dashboard_id: str, document_ids: List[str]) -> None:
        if not document_ids:
            return
        placeholders = ",".join("?" for _ in document_ids)
        self.conn.execute(
            f"DELETE FROM dashboard_documents WHERE dashboard_id = ? AND document_id IN ({placeholders});",
            [str(dashboard_id)] + [str(d_id) for d_id in document_ids]
        )

class SQLiteWorkflowRepository(BaseWorkflowRepository):
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def get_by_id(self, workflow_id: str) -> Optional[Dict[str, Any]]:
        row = self.conn.execute("SELECT * FROM coding_workflows WHERE id = ?;", (workflow_id,)).fetchone()
        return dict(row) if row else None

    def create(self, workflow_id: str, workspace_id: str, name: str, description: str, draft_definition: str, created_by: str) -> Dict[str, Any]:
        self.conn.execute(
            """
            INSERT INTO coding_workflows
                (id, workspace_id, name, description, status, draft_definition, revision, latest_version, created_by)
            VALUES (?, ?, ?, ?, 'draft', ?, 1, 0, ?);
            """,
            (workflow_id, workspace_id, name, description, draft_definition, created_by),
        )
        return self.get_by_id(workflow_id)

    def update(self, workflow_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        if updates:
            keys = list(updates.keys())
            assignments = ", ".join(f"{key} = ?" for key in keys)
            values = [updates[key] for key in keys] + [workflow_id]
            self.conn.execute(
                f"UPDATE coding_workflows SET {assignments}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?;",
                values,
            )
        return self.get_by_id(workflow_id)

    def delete(self, workflow_id: str) -> None:
        self.conn.execute("DELETE FROM coding_workflows WHERE id = ?;", (workflow_id,))

    def list_by_workspace(self, workspace_id: str) -> List[Dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM coding_workflows WHERE workspace_id = ? ORDER BY updated_at DESC;",
            (workspace_id,),
        ).fetchall()
        return [dict(row) for row in rows]


class SQLiteWorkflowTemplateRepository(BaseWorkflowTemplateRepository):
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def get_by_id(self, template_id: str) -> Optional[Dict[str, Any]]:
        row = self.conn.execute("SELECT * FROM coding_workflow_templates WHERE id = ?;", (template_id,)).fetchone()
        return dict(row) if row else None

    def get_by_slug(self, workspace_id: str, slug: str) -> Optional[Dict[str, Any]]:
        row = self.conn.execute(
            "SELECT * FROM coding_workflow_templates WHERE workspace_id = ? AND slug = ?;",
            (workspace_id, slug),
        ).fetchone()
        return dict(row) if row else None

    def create(self, template_id: str, workspace_id: str, slug: str, name: str, description: str, category: str, definition_json: str, created_by: str, status: str = "active") -> Dict[str, Any]:
        self.conn.execute(
            """
            INSERT INTO coding_workflow_templates
                (id, workspace_id, slug, name, description, category, status, definition_json, revision, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?);
            """,
            (template_id, workspace_id, slug, name, description, category, status, definition_json, created_by),
        )
        return self.get_by_id(template_id)

    def update(self, template_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        if updates:
            keys = list(updates.keys())
            assignments = ", ".join(f"{key} = ?" for key in keys)
            values = [updates[key] for key in keys] + [template_id]
            self.conn.execute(
                f"UPDATE coding_workflow_templates SET {assignments}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?;",
                values,
            )
        return self.get_by_id(template_id)

    def delete(self, template_id: str) -> None:
        self.conn.execute("DELETE FROM coding_workflow_templates WHERE id = ?;", (template_id,))

    def list_by_workspace(self, workspace_id: str) -> List[Dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM coding_workflow_templates WHERE workspace_id = ? ORDER BY updated_at DESC;",
            (workspace_id,),
        ).fetchall()
        return [dict(row) for row in rows]


class SQLiteWorkflowVersionRepository(BaseWorkflowVersionRepository):
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def create(self, version_id: str, workflow_id: str, version: int, definition_json: str, definition_hash: str, changelog: str, created_by: str) -> Dict[str, Any]:
        self.conn.execute(
            """
            INSERT INTO coding_workflow_versions
                (id, workflow_id, version, definition_json, definition_hash, changelog, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
            (version_id, workflow_id, version, definition_json, definition_hash, changelog, created_by),
        )
        return self.get(workflow_id, version)

    def get(self, workflow_id: str, version: int) -> Optional[Dict[str, Any]]:
        row = self.conn.execute(
            "SELECT * FROM coding_workflow_versions WHERE workflow_id = ? AND version = ?;",
            (workflow_id, version),
        ).fetchone()
        return dict(row) if row else None

    def list_by_workflow(self, workflow_id: str) -> List[Dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM coding_workflow_versions WHERE workflow_id = ? ORDER BY version DESC;",
            (workflow_id,),
        ).fetchall()
        return [dict(row) for row in rows]


class SQLiteThreadRepository(BaseThreadRepository):
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def get_by_id(self, thread_id: str) -> Optional[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM threads WHERE id = ?;", (str(thread_id),))
        row = cursor.fetchone()
        return dict(row) if row else None

    def create(self, thread_id: str, user_id: str, title: str, provider: str, provider_thread_id: Optional[str], model: Optional[str], dashboard_id: Optional[str]) -> Dict[str, Any]:
        self.conn.execute(
            """
            INSERT INTO threads (id, user_id, title, provider, provider_thread_id, model, dashboard_id)
            VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
            (str(thread_id), str(user_id), title, provider, provider_thread_id, model, str(dashboard_id) if dashboard_id else None)
        )
        return self.get_by_id(thread_id)

    def update(self, thread_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        if not updates:
            return self.get_by_id(thread_id)
        keys = []
        values = []
        for k, v in updates.items():
            keys.append(f"{k} = ?")
            values.append(v)
        values.append(str(thread_id))
        self.conn.execute(f"UPDATE threads SET {', '.join(keys)} WHERE id = ?;", values)
        return self.get_by_id(thread_id)

    def delete(self, thread_id: str) -> None:
        self.conn.execute("DELETE FROM threads WHERE id = ?;", (str(thread_id),))

    def list_by_user(self, user_id: str) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM threads WHERE user_id = ? ORDER BY updated_at DESC;", (str(user_id),))
        return [dict(r) for r in cursor.fetchall()]

class SQLiteMessageRepository(BaseMessageRepository):
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def get_by_id(self, message_id: str) -> Optional[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM messages WHERE id = ?;", (str(message_id),))
        row = cursor.fetchone()
        return dict(row) if row else None

    def create(self, message_id: str, thread_id: str, user_id: str, role: str, content: str, provider_response_id: Optional[str], tokens_input: Optional[int], tokens_output: Optional[int]) -> Dict[str, Any]:
        self.conn.execute(
            """
            INSERT INTO messages (id, thread_id, user_id, role, content, provider_response_id, tokens_input, tokens_output)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (str(message_id), str(thread_id), str(user_id), role, content, provider_response_id, tokens_input, tokens_output)
        )
        return self.get_by_id(message_id)

    def list_by_thread(self, thread_id: str) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC;", (str(thread_id),))
        return [dict(r) for r in cursor.fetchall()]

class SQLiteLlmUsageLogRepository(BaseLlmUsageLogRepository):
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def create(self, log_id: str, provider: str, model: str, service: str, campaign_id: Optional[str], thread_id: Optional[str], input_tokens: int, output_tokens: int, calculated_cost: float) -> None:
        self.conn.execute(
            """
            INSERT INTO llm_usage_logs (id, provider, model, service, campaign_id, thread_id, input_tokens, output_tokens, calculated_cost)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (str(log_id), provider, model, service, str(campaign_id) if campaign_id else None, str(thread_id) if thread_id else None, input_tokens, output_tokens, calculated_cost)
        )

    def get_usage_stats(self, timeframe: str, campaign_id: Optional[str] = None, thread_id: Optional[str] = None) -> Dict[str, Any]:
        conditions = []
        params = {}

        if timeframe == "last_hour":
            conditions.append("timestamp >= datetime('now', '-1 hour')")
        elif timeframe == "last_day":
            conditions.append("timestamp >= datetime('now', '-24 hours')")
        elif timeframe == "last_7_days":
            conditions.append("timestamp >= datetime('now', '-7 days')")

        if campaign_id:
            conditions.append("campaign_id = :campaign_id")
            params["campaign_id"] = campaign_id
        if thread_id:
            conditions.append("thread_id = :thread_id")
            params["thread_id"] = thread_id

        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)

        summary_query = f"""
            SELECT 
                COALESCE(SUM(input_tokens), 0) as input_tokens,
                COALESCE(SUM(output_tokens), 0) as output_tokens,
                COALESCE(SUM(calculated_cost), 0.0) as total_cost,
                COUNT(*) as total_calls
            FROM llm_usage_logs
            {where_clause}
        """

        breakdown_query = f"""
            SELECT 
                provider,
                model,
                COALESCE(SUM(input_tokens), 0) as input_tokens,
                COALESCE(SUM(output_tokens), 0) as output_tokens,
                COALESCE(SUM(calculated_cost), 0.0) as cost,
                COUNT(*) as calls
            FROM llm_usage_logs
            {where_clause}
            GROUP BY provider, model
            ORDER BY cost DESC
        """

        if timeframe in ("last_hour", "last_day"):
            bucket_format = "%Y-%m-%dT%H:00:00Z"
        else:
            bucket_format = "%Y-%m-%dZ"

        timeline_query = f"""
            SELECT 
                strftime('{bucket_format}', timestamp) as time_bucket,
                COALESCE(SUM(calculated_cost), 0.0) as cost,
                COUNT(*) as calls
            FROM llm_usage_logs
            {where_clause}
            GROUP BY time_bucket
            ORDER BY time_bucket ASC
        """

        cursor = self.conn.cursor()
        
        cursor.execute(summary_query, params)
        sum_row = cursor.fetchone()
        summary = {
            "input_tokens": sum_row["input_tokens"],
            "output_tokens": sum_row["output_tokens"],
            "total_cost": sum_row["total_cost"],
            "total_calls": sum_row["total_calls"]
        }

        cursor.execute(breakdown_query, params)
        breakdown = [dict(r) for r in cursor.fetchall()]

        cursor.execute(timeline_query, params)
        timeline = [dict(r) for r in cursor.fetchall()]

        return {
            "summary": summary,
            "breakdown": breakdown,
            "timeline": timeline,
        }

class SQLiteUnitOfWork(BaseUnitOfWork):
    def __init__(self, db_path: Optional[str] = None, conn: Optional[sqlite3.Connection] = None):
        self.db_path = db_path
        if conn is not None:
            self.conn = conn
        else:
            if not db_path:
                raise ValueError("Either db_path or conn must be provided to SQLiteUnitOfWork")
            self.conn = sqlite3.connect(db_path, timeout=30.0)
            self.conn.execute("PRAGMA foreign_keys = ON;")
            self.conn.row_factory = sqlite3.Row
        
        if os.environ.get("TEST_MODE", "").lower() in ("1", "true", "yes"):
            from app.tests.base import SafeTestConnection
            self.conn = SafeTestConnection(self.conn)
            
        self._users = SQLiteUserRepository(self.conn)
        self._workspaces = SQLiteWorkspaceRepository(self.conn)
        self._documents = SQLiteDocumentRepository(self.conn)
        self._chunks = SQLiteDocumentChunkRepository(self.conn)
        self._dashboards = SQLiteDashboardRepository(self.conn)
        self._dashboard_documents = SQLiteDashboardDocumentRepository(self.conn)
        self._workflows = SQLiteWorkflowRepository(self.conn)
        self._workflow_templates = SQLiteWorkflowTemplateRepository(self.conn)
        self._workflow_versions = SQLiteWorkflowVersionRepository(self.conn)
        self._threads = SQLiteThreadRepository(self.conn)
        self._messages = SQLiteMessageRepository(self.conn)
        self._usage_logs = SQLiteLlmUsageLogRepository(self.conn)

    @property
    def users(self) -> BaseUserRepository:
        return self._users

    @property
    def workspaces(self) -> BaseWorkspaceRepository:
        return self._workspaces

    @property
    def documents(self) -> BaseDocumentRepository:
        return self._documents

    @property
    def chunks(self) -> BaseDocumentChunkRepository:
        return self._chunks

    @property
    def dashboards(self) -> BaseDashboardRepository:
        return self._dashboards

    @property
    def dashboard_documents(self) -> BaseDashboardDocumentRepository:
        return self._dashboard_documents

    @property
    def workflows(self) -> BaseWorkflowRepository:
        return self._workflows

    @property
    def workflow_versions(self) -> BaseWorkflowVersionRepository:
        return self._workflow_versions

    @property
    def workflow_templates(self) -> BaseWorkflowTemplateRepository:
        return self._workflow_templates

    @property
    def threads(self) -> BaseThreadRepository:
        return self._threads

    @property
    def messages(self) -> BaseMessageRepository:
        return self._messages

    @property
    def usage_logs(self) -> BaseLlmUsageLogRepository:
        return self._usage_logs

    def commit(self) -> None:
        self.conn.commit()

    def rollback(self) -> None:
        self.conn.rollback()

    def close(self) -> None:
        self.conn.close()
