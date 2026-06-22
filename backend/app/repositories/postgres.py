import psycopg
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
    BaseThreadRepository,
    BaseMessageRepository,
    BaseLlmUsageLogRepository,
    BaseUnitOfWork,
)

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

def serialize_embedding_postgres(emb: List[float]) -> Optional[str]:
    if not emb:
        return None
    return "[" + ",".join(str(x) for x in emb) + "]"

def deserialize_embedding_postgres(val: Any) -> List[float]:
    if not val:
        return []
    if isinstance(val, list):
        return [float(x) for x in val]
    if isinstance(val, str):
        clean = val.strip("[]")
        if not clean:
            return []
        return [float(x) for x in clean.split(",")]
    return []

class PostgresUserRepository(BaseUserRepository):
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn

    def get_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM users WHERE id = %s;", (str(user_id),))
            row = cursor.fetchone()
            return row if row else None

    def get_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM users WHERE email = %s;", (str(email).strip().lower(),))
            row = cursor.fetchone()
            return row if row else None

    def create(self, user_id: str, email: str, password_hash: str, is_admin: int, can_add: int, can_delete: int) -> Dict[str, Any]:
        with self.conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (%s, %s, %s, %s, %s, %s);",
                (str(user_id), str(email).strip().lower(), password_hash, int(is_admin), int(can_add), int(can_delete))
            )
        return self.get_by_id(user_id)

    def update(self, user_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        if not updates:
            return self.get_by_id(user_id)
        keys = []
        values = []
        for k, v in updates.items():
            keys.append(f"{k} = %s")
            values.append(v)
        values.append(str(user_id))
        with self.conn.cursor() as cursor:
            cursor.execute(f"UPDATE users SET {', '.join(keys)} WHERE id = %s;", values)
        return self.get_by_id(user_id)

    def list_all(self) -> List[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM users ORDER BY email ASC;")
            return cursor.fetchall()

class PostgresWorkspaceRepository(BaseWorkspaceRepository):
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn

    def get_by_id(self, workspace_id: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM workspaces WHERE id = %s;", (str(workspace_id),))
            row = cursor.fetchone()
            return row if row else None

    def get_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM workspaces WHERE name = %s;", (str(name),))
            row = cursor.fetchone()
            return row if row else None

    def create(self, workspace_id: str, name: str) -> Dict[str, Any]:
        with self.conn.cursor() as cursor:
            cursor.execute("INSERT INTO workspaces (id, name) VALUES (%s, %s);", (str(workspace_id), str(name)))
        return self.get_by_id(workspace_id)

    def list_all(self) -> List[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM workspaces ORDER BY name ASC;")
            return cursor.fetchall()

class PostgresDocumentRepository(BaseDocumentRepository):
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn

    def get_by_id(self, doc_id: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM documents WHERE id = %s;", (str(doc_id),))
            row = cursor.fetchone()
            return row if row else None

    def get_by_filename(self, workspace_id: str, filename: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM documents WHERE workspace_id = %s AND filename = %s;", (str(workspace_id), str(filename)))
            row = cursor.fetchone()
            return row if row else None

    def create(self, doc_id: str, user_id: str, workspace_id: str, filename: str, file_path: str, file_size: int, content_type: str, status: str, content_hash: Optional[str], metadata: str) -> Dict[str, Any]:
        with self.conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status, content_hash, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
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
            keys.append(f"{k} = %s")
            values.append(v)
        values.append(str(doc_id))
        with self.conn.cursor() as cursor:
            cursor.execute(f"UPDATE documents SET {', '.join(keys)} WHERE id = %s;", values)
        return self.get_by_id(doc_id)

    def delete(self, doc_id: str) -> None:
        with self.conn.cursor() as cursor:
            cursor.execute("DELETE FROM documents WHERE id = %s;", (str(doc_id),))

    def list_by_workspace(self, workspace_id: str) -> List[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM documents WHERE workspace_id = %s ORDER BY created_at DESC;", (str(workspace_id),))
            return cursor.fetchall()

class PostgresDocumentChunkRepository(BaseDocumentChunkRepository):
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn

    def create_chunks(self, chunks: List[Dict[str, Any]]) -> None:
        with self.conn.cursor() as cursor:
            # Convert python dictionaries into postgres tuples.
            # Handle embedding conversion to vector representation.
            # Convert metadata string to dict if needed (psycopg jsonb supports dictionary direct binding).
            rows = []
            for chunk in chunks:
                emb = chunk.get("embedding")
                emb_str = None
                if emb:
                    if isinstance(emb, bytes):
                        # Quantized int8 bytes from vectors.py
                        from app.core.vectors import deserialize_embedding
                        emb_floats = deserialize_embedding(emb)
                        emb_str = serialize_embedding_postgres(emb_floats)
                    elif isinstance(emb, list):
                        emb_str = serialize_embedding_postgres(emb)
                
                meta_val = chunk.get("metadata", "{}")
                if isinstance(meta_val, str):
                    try:
                        meta_val = json.loads(meta_val)
                    except Exception:
                        meta_val = {}
                
                rows.append((
                    chunk["id"],
                    chunk["document_id"],
                    chunk["user_id"],
                    chunk["workspace_id"],
                    chunk["content"],
                    emb_str,
                    json.dumps(meta_val)
                ))
            
            cursor.executemany(
                """
                INSERT INTO document_chunks (id, document_id, user_id, workspace_id, content, embedding, metadata)
                VALUES (%s, %s, %s, %s, %s, cast(%s as vector), %s);
                """,
                rows
            )

    def delete_by_document(self, document_id: str) -> None:
        with self.conn.cursor() as cursor:
            cursor.execute("DELETE FROM document_chunks WHERE document_id = %s;", (str(document_id),))

    def get_chunks_by_document(self, document_id: str) -> List[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM document_chunks WHERE document_id = %s;", (str(document_id),))
            rows = cursor.fetchall()
            for r in rows:
                if "embedding" in r and r["embedding"]:
                    # De-serialize vector database value
                    r["embedding"] = deserialize_embedding_postgres(r["embedding"])
            return rows

    def similarity_search(self, workspace_id: str, query: str, query_embedding: List[float], limit: int, threshold: float, document_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        embedding_str = serialize_embedding_postgres(query_embedding)
        
        # Dense leg (Vector search via pgvector <=> operator)
        # NOTE: param order must match %s positions in the query:
        # 1st %s → embedding in SELECT clause (similarity calc)
        # 2nd %s → workspace_id in WHERE clause
        # 3rd %s → embedding in ORDER BY clause
        # 4th %s → limit
        dense_conditions = ["dc.workspace_id = %s"]
        dense_params: list = [embedding_str, str(workspace_id), embedding_str]
        
        if document_ids:
            placeholders = ",".join("%s" for _ in document_ids)
            dense_conditions.append(f"dc.document_id IN ({placeholders})")
            dense_params.extend(str(d_id) for d_id in document_ids)
        
        # Select slightly more candidates for Reciprocal Rank Fusion
        dense_params.append(limit * 2)
        
        dense_query = f"""
            SELECT dc.id, dc.document_id, dc.content, dc.embedding, dc.metadata as chunk_metadata,
                   d.filename, d.metadata as doc_metadata,
                   (1 - (dc.embedding <=> %s)) AS similarity
            FROM document_chunks dc
            JOIN documents d ON dc.document_id = d.id
            WHERE {" AND ".join(dense_conditions)}
            ORDER BY dc.embedding <=> %s LIMIT %s;
        """
        
        with self.conn.cursor() as cursor:
            cursor.execute(dense_query, dense_params)
            dense_rows = cursor.fetchall()

        dense_candidates = []
        for r in dense_rows:
            sim = float(r["similarity"] or 0.0)
            if sim > threshold:
                dense_candidates.append({
                    "id": r["id"],
                    "document_id": r["document_id"],
                    "filename": r["filename"],
                    "content": r["content"],
                    "metadata": json.loads(r["chunk_metadata"]) if isinstance(r["chunk_metadata"], str) else (r["chunk_metadata"] or {}),
                    "similarity": sim,
                })
        dense_candidates.sort(key=lambda x: x["similarity"], reverse=True)
        dense_candidates = dense_candidates[:limit]
        dense_ranks = {item["id"]: (idx + 1) for idx, item in enumerate(dense_candidates)}

        # Sparse leg (ILIKE database level keyword search)
        query_tokens = set(tokenize(query))
        meaningful_tokens = {t for t in query_tokens if t not in STOPWORDS}
        search_tokens = meaningful_tokens if meaningful_tokens else query_tokens
        
        sparse_candidates = []
        if search_tokens:
            sparse_conditions = ["dc.workspace_id = %s"]
            sparse_params = [str(workspace_id)]
            
            if document_ids:
                placeholders = ",".join("%s" for _ in document_ids)
                sparse_conditions.append(f"dc.document_id IN ({placeholders})")
                sparse_params.extend(str(d_id) for d_id in document_ids)
            
            # ILIKE terms
            term_clauses = []
            for token in search_tokens:
                term_clauses.append("dc.content ILIKE %s")
                sparse_params.append(f"%{token}%")
                term_clauses.append("d.filename ILIKE %s")
                sparse_params.append(f"%{token}%")
            
            sparse_conditions.append(f"({' OR '.join(term_clauses)})")
            
            sparse_query = f"""
                SELECT dc.id, dc.document_id, dc.content, dc.metadata as chunk_metadata,
                       d.filename
                FROM document_chunks dc
                JOIN documents d ON dc.document_id = d.id
                WHERE {" AND ".join(sparse_conditions)}
                LIMIT 100;
            """
            
            with self.conn.cursor() as cursor:
                cursor.execute(sparse_query, sparse_params)
                sparse_rows = cursor.fetchall()
            
            # Score them exactly like SQLite version
            for r in sparse_rows:
                chunk_tokens = tokenize(r["content"])
                score = sum(chunk_tokens.count(term) for term in search_tokens) if chunk_tokens else 0
                
                filename_lower = r["filename"].lower()
                filename_match = False
                for token in search_tokens:
                    if len(token) > 4 and token in filename_lower:
                        filename_match = True
                        break
                if filename_match:
                    score += 100.0
                    
                if score > 0:
                    sparse_candidates.append({
                        "id": r["id"],
                        "document_id": r["document_id"],
                        "filename": r["filename"],
                        "content": r["content"],
                        "metadata": json.loads(r["chunk_metadata"]) if isinstance(r["chunk_metadata"], str) else (r["chunk_metadata"] or {}),
                        "score": score,
                    })
            sparse_candidates.sort(key=lambda x: x["score"], reverse=True)
            sparse_candidates = sparse_candidates[:limit]
        
        sparse_ranks = {item["id"]: (idx + 1) for idx, item in enumerate(sparse_candidates)}

        # Reciprocal Rank Fusion (RRF)
        all_candidate_ids = set(dense_ranks.keys()).union(sparse_ranks.keys())
        rrf_scores = []
        
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
        with self.conn.cursor() as cursor:
            if document_ids:
                placeholders = ",".join("%s" for _ in document_ids)
                query_str = f"""
                    SELECT dc.id, dc.document_id, dc.content, dc.embedding, dc.metadata as chunk_metadata,
                           d.filename, d.metadata as doc_metadata
                    FROM document_chunks dc
                    JOIN documents d ON dc.document_id = d.id
                    WHERE dc.workspace_id = %s AND dc.document_id IN ({placeholders});
                """
                cursor.execute(query_str, [str(workspace_id)] + [str(d_id) for d_id in document_ids])
            else:
                query_str = """
                    SELECT dc.id, dc.document_id, dc.content, dc.embedding, dc.metadata as chunk_metadata,
                           d.filename, d.metadata as doc_metadata
                    FROM document_chunks dc
                    JOIN documents d ON dc.document_id = d.id
                    WHERE dc.workspace_id = %s;
                """
                cursor.execute(query_str, (str(workspace_id),))
            rows = cursor.fetchall()
            for r in rows:
                if "embedding" in r and r["embedding"]:
                    r["embedding"] = deserialize_embedding_postgres(r["embedding"])
            return rows

class PostgresDashboardRepository(BaseDashboardRepository):
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn

    def get_by_id(self, dashboard_id: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM dashboards WHERE id = %s;", (str(dashboard_id),))
            row = cursor.fetchone()
            return row if row else None

    def create(self, dashboard_id: str, workspace_id: str, name: str, description: str, prompt: str, schema: str, model: Optional[str]) -> Dict[str, Any]:
        with self.conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO dashboards (id, workspace_id, name, description, prompt, schema, model)
                VALUES (%s, %s, %s, %s, %s, %s, %s);
                """,
                (str(dashboard_id), str(workspace_id), name, description, prompt, schema, model)
            )
        return self.get_by_id(dashboard_id)

    def update(self, dashboard_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        if not updates:
            return self.get_by_id(dashboard_id)
        keys = []
        values = []
        for k, v in updates.items():
            keys.append(f"{k} = %s")
            values.append(v)
        values.append(str(dashboard_id))
        with self.conn.cursor() as cursor:
            cursor.execute(f"UPDATE dashboards SET {', '.join(keys)} WHERE id = %s;", values)
        return self.get_by_id(dashboard_id)

    def delete(self, dashboard_id: str) -> None:
        with self.conn.cursor() as cursor:
            cursor.execute("DELETE FROM dashboards WHERE id = %s;", (str(dashboard_id),))

    def list_by_workspace(self, workspace_id: str) -> List[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM dashboards WHERE workspace_id = %s ORDER BY created_at DESC;", (str(workspace_id),))
            return cursor.fetchall()

class PostgresDashboardDocumentRepository(BaseDashboardDocumentRepository):
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn

    def get(self, dashboard_id: str, document_id: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM dashboard_documents WHERE dashboard_id = %s AND document_id = %s;", (str(dashboard_id), str(document_id)))
            row = cursor.fetchone()
            return row if row else None

    def create_or_update(self, dashboard_id: str, document_id: str, coded_values: str, status: str, error_message: Optional[str] = None, error_type: Optional[str] = None, current_step: int = 0, total_steps: int = 7) -> Dict[str, Any]:
        with self.conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO dashboard_documents (dashboard_id, document_id, coded_values, status, error_message, error_type, current_step, total_steps)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT(dashboard_id, document_id) DO UPDATE SET
                    coded_values = EXCLUDED.coded_values,
                    status = EXCLUDED.status,
                    error_message = EXCLUDED.error_message,
                    error_type = EXCLUDED.error_type,
                    current_step = EXCLUDED.current_step,
                    total_steps = EXCLUDED.total_steps;
                """,
                (str(dashboard_id), str(document_id), coded_values, status, error_message, error_type, current_step, total_steps)
            )
        return self.get(dashboard_id, document_id)

    def update_status(self, dashboard_id: str, document_id: str, status: str, error_message: Optional[str] = None, error_type: Optional[str] = None) -> None:
        with self.conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE dashboard_documents
                SET status = %s, error_message = %s, error_type = %s
                WHERE dashboard_id = %s AND document_id = %s;
                """,
                (status, error_message, error_type, str(dashboard_id), str(document_id))
            )

    def update_progress(self, dashboard_id: str, document_id: str, current_step: int, total_steps: int) -> None:
        with self.conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE dashboard_documents
                SET current_step = %s, total_steps = %s
                WHERE dashboard_id = %s AND document_id = %s;
                """,
                (current_step, total_steps, str(dashboard_id), str(document_id))
            )

    def update_coded_values(self, dashboard_id: str, document_id: str, coded_values: str, status: str = "completed") -> None:
        with self.conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE dashboard_documents
                SET coded_values = %s, status = %s, error_message = NULL, error_type = NULL
                WHERE dashboard_id = %s AND document_id = %s;
                """,
                (coded_values, status, str(dashboard_id), str(document_id))
            )

    def list_by_dashboard(self, dashboard_id: str) -> List[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM dashboard_documents WHERE dashboard_id = %s;", (str(dashboard_id),))
            return cursor.fetchall()

    def list_by_dashboard_with_documents(self, dashboard_id: str) -> List[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT d.id as document_id, d.filename, d.file_size, d.metadata as doc_metadata,
                       dd.status, dd.coded_values, dd.error_message, dd.error_type,
                       dd.current_step, dd.total_steps
                FROM dashboard_documents dd
                JOIN documents d ON dd.document_id = d.id
                WHERE dd.dashboard_id = %s
                ORDER BY dd.created_at DESC;
                """,
                (str(dashboard_id),)
            )
            return cursor.fetchall()

    def link_document_if_not_exists(self, dashboard_id: str, document_id: str) -> None:
        with self.conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO dashboard_documents (dashboard_id, document_id, status)
                VALUES (%s, %s, 'pending')
                ON CONFLICT (dashboard_id, document_id) DO NOTHING;
                """,
                (str(dashboard_id), str(document_id))
            )

    def get_linked_document_ids(self, dashboard_id: str, document_ids: List[str]) -> List[str]:
        if not document_ids:
            return []
        placeholders = ",".join("%s" for _ in document_ids)
        with self.conn.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT document_id FROM dashboard_documents
                WHERE dashboard_id = %s AND document_id IN ({placeholders});
                """,
                [str(dashboard_id)] + [str(d_id) for d_id in document_ids]
            )
            return [r[0] for r in cursor.fetchall()]

    def get_failed_document_ids(self, dashboard_id: str) -> List[str]:
        with self.conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT document_id FROM dashboard_documents
                WHERE dashboard_id = %s AND status = 'failed';
                """,
                (str(dashboard_id),)
            )
            return [r[0] for r in cursor.fetchall()]

    def reset_documents_to_pending(self, dashboard_id: str, document_ids: List[str]) -> None:
        if not document_ids:
            return
        placeholders = ",".join("%s" for _ in document_ids)
        with self.conn.cursor() as cursor:
            cursor.execute(
                f"""
                UPDATE dashboard_documents
                SET status = 'pending', error_message = NULL, error_type = NULL
                WHERE dashboard_id = %s AND document_id IN ({placeholders});
                """,
                [str(dashboard_id)] + [str(d_id) for d_id in document_ids]
            )

    def delete_by_document(self, document_id: str) -> None:
        with self.conn.cursor() as cursor:
            cursor.execute("DELETE FROM dashboard_documents WHERE document_id = %s;", (str(document_id),))

class PostgresThreadRepository(BaseThreadRepository):
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn

    def get_by_id(self, thread_id: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM threads WHERE id = %s;", (str(thread_id),))
            row = cursor.fetchone()
            return row if row else None

    def create(self, thread_id: str, user_id: str, title: str, provider: str, provider_thread_id: Optional[str], model: Optional[str], dashboard_id: Optional[str]) -> Dict[str, Any]:
        with self.conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO threads (id, user_id, title, provider, provider_thread_id, model, dashboard_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s);
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
            keys.append(f"{k} = %s")
            values.append(v)
        values.append(str(thread_id))
        with self.conn.cursor() as cursor:
            cursor.execute(f"UPDATE threads SET {', '.join(keys)} WHERE id = %s;", values)
        return self.get_by_id(thread_id)

    def delete(self, thread_id: str) -> None:
        with self.conn.cursor() as cursor:
            cursor.execute("DELETE FROM threads WHERE id = %s;", (str(thread_id),))

    def list_by_user(self, user_id: str) -> List[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM threads WHERE user_id = %s ORDER BY updated_at DESC;", (str(user_id),))
            return cursor.fetchall()

class PostgresMessageRepository(BaseMessageRepository):
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn

    def get_by_id(self, message_id: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM messages WHERE id = %s;", (str(message_id),))
            row = cursor.fetchone()
            return row if row else None

    def create(self, message_id: str, thread_id: str, user_id: str, role: str, content: str, provider_response_id: Optional[str], tokens_input: Optional[int], tokens_output: Optional[int]) -> Dict[str, Any]:
        with self.conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO messages (id, thread_id, user_id, role, content, provider_response_id, tokens_input, tokens_output)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                """,
                (str(message_id), str(thread_id), str(user_id), role, content, provider_response_id, tokens_input, tokens_output)
            )
        return self.get_by_id(message_id)

    def list_by_thread(self, thread_id: str) -> List[Dict[str, Any]]:
        with self.conn.cursor() as cursor:
            cursor.execute("SELECT * FROM messages WHERE thread_id = %s ORDER BY created_at ASC;", (str(thread_id),))
            return cursor.fetchall()

class PostgresLlmUsageLogRepository(BaseLlmUsageLogRepository):
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn

    def create(self, log_id: str, provider: str, model: str, service: str, campaign_id: Optional[str], thread_id: Optional[str], input_tokens: int, output_tokens: int, calculated_cost: float) -> None:
        with self.conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO llm_usage_logs (id, provider, model, service, campaign_id, thread_id, input_tokens, output_tokens, calculated_cost)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
                """,
                (str(log_id), provider, model, service, str(campaign_id) if campaign_id else None, str(thread_id) if thread_id else None, input_tokens, output_tokens, calculated_cost)
            )

    def get_usage_stats(self, timeframe: str, campaign_id: Optional[str] = None, thread_id: Optional[str] = None) -> Dict[str, Any]:
        conditions = []
        params = []

        if timeframe == "last_hour":
            conditions.append("timestamp >= NOW() - INTERVAL '1 hour'")
        elif timeframe == "last_day":
            conditions.append("timestamp >= NOW() - INTERVAL '24 hours'")
        elif timeframe == "last_7_days":
            conditions.append("timestamp >= NOW() - INTERVAL '7 days'")

        if campaign_id:
            conditions.append("campaign_id = %s")
            params.append(campaign_id)
        if thread_id:
            conditions.append("thread_id = %s")
            params.append(thread_id)

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

        # Determine bucket granularity
        # Postgres TO_CHAR format: 'YYYY-MM-DD"T"HH24:00:00"Z"' vs 'YYYY-MM-DD"Z"'
        if timeframe in ("last_hour", "last_day"):
            bucket_format = 'YYYY-MM-DD"T"HH24:00:00"Z"'
        else:
            bucket_format = 'YYYY-MM-DD"Z"'

        timeline_query = f"""
            SELECT 
                TO_CHAR(timestamp, '{bucket_format}') as time_bucket,
                COALESCE(SUM(calculated_cost), 0.0) as cost,
                COUNT(*) as calls
            FROM llm_usage_logs
            {where_clause}
            GROUP BY time_bucket
            ORDER BY time_bucket ASC
        """

        with self.conn.cursor() as cursor:
            cursor.execute(summary_query, params)
            sum_row = cursor.fetchone()
            summary = {
                "input_tokens": sum_row["input_tokens"],
                "output_tokens": sum_row["output_tokens"],
                "total_cost": float(sum_row["total_cost"]),
                "total_calls": sum_row["total_calls"]
            }

            cursor.execute(breakdown_query, params)
            breakdown_rows = cursor.fetchall()
            breakdown = []
            for r in breakdown_rows:
                breakdown.append({
                    "provider": r["provider"],
                    "model": r["model"],
                    "input_tokens": r["input_tokens"],
                    "output_tokens": r["output_tokens"],
                    "cost": float(r["cost"]),
                    "calls": r["calls"]
                })

            cursor.execute(timeline_query, params)
            timeline_rows = cursor.fetchall()
            timeline = []
            for r in timeline_rows:
                timeline.append({
                    "time_bucket": r["time_bucket"],
                    "cost": float(r["cost"]),
                    "calls": r["calls"]
                })

        return {
            "summary": summary,
            "breakdown": breakdown,
            "timeline": timeline,
        }

class PostgresUnitOfWork(BaseUnitOfWork):
    def __init__(self, conn: psycopg.Connection, on_close_callback=None):
        self.conn = conn
        self.on_close_callback = on_close_callback
        
        self._users = PostgresUserRepository(self.conn)
        self._workspaces = PostgresWorkspaceRepository(self.conn)
        self._documents = PostgresDocumentRepository(self.conn)
        self._chunks = PostgresDocumentChunkRepository(self.conn)
        self._dashboards = PostgresDashboardRepository(self.conn)
        self._dashboard_documents = PostgresDashboardDocumentRepository(self.conn)
        self._threads = PostgresThreadRepository(self.conn)
        self._messages = PostgresMessageRepository(self.conn)
        self._usage_logs = PostgresLlmUsageLogRepository(self.conn)

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
        if self.on_close_callback:
            self.on_close_callback(self.conn)
        else:
            self.conn.close()
