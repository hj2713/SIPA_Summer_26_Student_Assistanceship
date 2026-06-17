import os
import json
import logging
import asyncio
import time
import re
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, create_model
from concurrent.futures import ThreadPoolExecutor

from app.core.database import get_db_conn
from app.llm import LLMMessage, get_llm, get_llm_for_model
from app.services.document_service import document_service as default_document_service, DocumentService

logger = logging.getLogger(__name__)


class SchemaField(BaseModel):
    name: str = Field(..., description="Clean snake_case name of the variable. E.g. 'discretion_score', 'has_penalty'")
    type: str = Field(..., description="The data type. One of 'string', 'number', 'boolean'")
    description: str = Field(..., description="Explanation of what this variable represents according to the prompt rules")
    options: Optional[List[str]] = Field(default=None, description="Optional list of allowed values/categories for this field")


class GeneratedCampaignMeta(BaseModel):
    description: str = Field(..., description="A short, user-friendly 1-2 sentence description of the campaign's research goals")
    schema_fields: List[SchemaField] = Field(..., description="The list of extracted variables the prompt asks to measure or code")


SCHEMA_GENERATION_SYSTEM_PROMPT = """You are a research database architect. 
Analyze the provided System Prompt / Research Guidelines (Codebook) and extract the variables/fields that the researcher wants to measure or code from the documents.
For each variable, determine:
1. A clean snake_case variable name (e.g. 'discretion_score', 'law_type', 'is_active').
2. The data type ('string', 'number', or 'boolean').
3. A description of what this variable measures.
4. Any allowed categorical values/categories if specified by the prompt.

Also, write a concise 1-2 sentence description summarizing the overall goal of this research campaign.
"""


class CodingService:
    """Class encapsulating campaigns' structured coding operations."""

    def __init__(self, db_conn_factory=None, doc_service: DocumentService = None) -> None:
        self.db_conn_factory = db_conn_factory or get_db_conn
        self._doc_service = doc_service or default_document_service
        self.coding_executor = ThreadPoolExecutor(max_workers=1)

    def sanitize_column_name(self, name: str) -> str:
        """Sanitize variable names to be safe snake_case database/json keys."""
        s = re.sub(r'[^a-zA-Z0-9_]', '', name.replace(' ', '_').replace('-', '_'))
        if s and s[0].isdigit():
            s = "_" + s
        return s.lower() or "unnamed_column"

    def get_document_text(self, doc_id: str) -> str:
        """Retrieve full text of a document from its stored chunks in database."""
        with self.db_conn_factory() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT content, metadata FROM document_chunks WHERE document_id = ?;", (str(doc_id),))
            rows = cursor.fetchall()
            if not rows:
                return ""
            
            chunks_with_index = []
            for row in rows:
                content = row[0]
                meta_str = row[1]
                idx = 0
                try:
                    meta = json.loads(meta_str)
                    idx = meta.get("chunk_index", 0)
                except Exception:
                    pass
                chunks_with_index.append((idx, content))
            
            chunks_with_index.sort(key=lambda x: x[0])
            return "\n\n".join(c[1] for c in chunks_with_index)

    async def generate_schema_and_description(self, prompt_text: str, user_columns: Optional[List[str]] = None) -> Dict[str, Any]:
        """Analyze the campaign prompt using the LLM to generate description and schema."""
        llm = get_llm()
        logger.info("Generating campaign schema using provider=%s model=%s", llm.provider_name, llm.model)

        try:
            parsed = await llm.parse_structured(
                [
                    LLMMessage(role="system", content=SCHEMA_GENERATION_SYSTEM_PROMPT),
                    LLMMessage(role="user", content=f"Analyze this prompt:\n\n{prompt_text}"),
                ],
                schema=GeneratedCampaignMeta,
                log_context={"service": "schema_generation"},
            )
            if not parsed:
                raise ValueError("Failed to parse campaign metadata response from LLM")
            
            description = parsed.description
            schema_fields = []
            
            # Add user-defined columns first if provided
            seen_names = set()
            if user_columns:
                for col in user_columns:
                    if hasattr(col, "model_dump"):
                        col_data = col.model_dump()
                    elif hasattr(col, "dict"):
                        col_data = col.dict()
                    elif isinstance(col, dict):
                        col_data = col
                    else:
                        col_data = None

                    if col_data is not None:
                        raw_name = col_data.get("name", "")
                        clean_name = self.sanitize_column_name(raw_name)
                        col_type = col_data.get("type") or "string"
                        col_desc = col_data.get("description") or f"User-defined column: {raw_name}"
                        col_opts = col_data.get("options")
                    else:
                        clean_name = self.sanitize_column_name(str(col))
                        col_type = "string"
                        col_desc = f"User-defined column: {col}"
                        col_opts = None

                    if clean_name and clean_name not in seen_names:
                        schema_fields.append({
                            "name": clean_name,
                            "type": col_type if col_type in ["string", "number", "boolean"] else "string",
                            "description": col_desc,
                            "options": col_opts
                        })
                        seen_names.add(clean_name)
                        
            # Add LLM proposed columns if they do not duplicate user columns
            for field in parsed.schema_fields:
                clean_name = self.sanitize_column_name(field.name)
                if clean_name not in seen_names:
                    schema_fields.append({
                        "name": clean_name,
                        "type": field.type if field.type in ["string", "number", "boolean"] else "string",
                        "description": field.description,
                        "options": field.options
                    })
                    seen_names.add(clean_name)
                    
            return {
                "description": description,
                "schema": schema_fields
            }
        except Exception as e:
            logger.error("LLM schema generation failed: %s", e, exc_info=True)
            fallback_schema = []
            if user_columns:
                for col in user_columns:
                    if hasattr(col, "model_dump"):
                        col_data = col.model_dump()
                    elif hasattr(col, "dict"):
                        col_data = col.dict()
                    elif isinstance(col, dict):
                        col_data = col
                    else:
                        col_data = None

                    if col_data is not None:
                        raw_name = col_data.get("name", "")
                        clean_name = self.sanitize_column_name(raw_name)
                        col_type = col_data.get("type") or "string"
                        col_desc = col_data.get("description") or f"User-defined column: {raw_name}"
                        col_opts = col_data.get("options")
                    else:
                        clean_name = self.sanitize_column_name(str(col))
                        col_type = "string"
                        col_desc = f"User-defined column: {col}"
                        col_opts = None

                    if clean_name:
                        fallback_schema.append({
                            "name": clean_name,
                            "type": col_type if col_type in ["string", "number", "boolean"] else "string",
                            "description": col_desc,
                            "options": col_opts
                        })
            return {
                "description": "Campaign created from system prompt.",
                "schema": fallback_schema
            }

    def enqueue_sequential_coding(self, dashboard_id: str, document_ids: List[str], user_id: str) -> None:
        """Submit coding job to the single-threaded sequential queue."""
        # Ensure the background loop thread is running
        self._ensure_loop_running()
        future = asyncio.run_coroutine_threadsafe(
            self.process_sequential_coding_queue(dashboard_id, document_ids, user_id),
            self._loop
        )
        # Log enqueue; errors surface in process_sequential_coding_queue
        future.add_done_callback(
            lambda f: logger.error("Coding job raised: %s", f.exception(), exc_info=f.exception())
            if f.exception() else None
        )
        logger.info("Enqueued coding job for dashboard %s, document_ids: %s", dashboard_id, document_ids)

    def _ensure_loop_running(self) -> None:
        """Start the persistent background event loop thread once, lazily."""
        if getattr(self, "_loop", None) is not None and self._loop.is_running():
            return
        import threading
        self._loop = asyncio.new_event_loop()
        t = threading.Thread(target=self._run_loop_forever, daemon=True, name="coding-event-loop")
        t.start()

    def _run_loop_forever(self) -> None:
        """Keep the event loop alive until the process exits."""
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()

    def run_sequential_coding_sync(self, dashboard_id: str, document_ids: List[str], user_id: str) -> None:
        """Synchronous bridge — kept for backward compatibility."""
        self._ensure_loop_running()
        future = asyncio.run_coroutine_threadsafe(
            self.process_sequential_coding_queue(dashboard_id, document_ids, user_id),
            self._loop
        )
        future.result()  # block until done

    async def process_sequential_coding_queue(self, dashboard_id: str, document_ids: List[str], user_id: str) -> None:
        """Process a batch of documents sequentially, parsing and coding each one."""
        logger.info("Starting sequential coding for dashboard %s", dashboard_id)
        
        with self.db_conn_factory() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT prompt, schema, model FROM dashboards WHERE id = ?;", (str(dashboard_id),))
            row = cursor.fetchone()
            if not row:
                logger.error("Dashboard %s not found. Aborting coding execution.", dashboard_id)
                return
            campaign_prompt = row[0]
            schema_json = row[1]
            model_name = row[2]
            try:
                schema_fields = json.loads(schema_json)
            except Exception:
                logger.error("Failed to parse schema for dashboard %s", dashboard_id)
                return

        for doc_id in document_ids:
            with self.db_conn_factory() as conn:
                conn.execute(
                    """
                    UPDATE dashboard_documents
                    SET status = 'processing', current_step = 1, total_steps = 7, error_message = NULL, error_type = NULL
                    WHERE dashboard_id = ? AND document_id = ?;
                    """,
                    (str(dashboard_id), str(doc_id))
                )
                conn.commit()
                
            logger.info("Coding document %s in dashboard %s", doc_id, dashboard_id)
            
            try:
                # Retrieve document text
                with self.db_conn_factory() as conn:
                    conn.execute(
                        "UPDATE dashboard_documents SET current_step = 2 WHERE dashboard_id = ? AND document_id = ?;",
                        (str(dashboard_id), str(doc_id))
                    )
                    conn.commit()
                doc_text = self.get_document_text(doc_id)
                if not doc_text or not doc_text.strip():
                    doc_record = self._doc_service.get_document(None, doc_id)
                    if doc_record and doc_record.status == "processing":
                        logger.info("Document %s is still processing globally, waiting 5 seconds...", doc_id)
                        await asyncio.sleep(5.0)
                        doc_text = self.get_document_text(doc_id)
                    
                    if not doc_text or not doc_text.strip():
                        raise ValueError("Document has no text content extracted yet. Ensure it completed global ingestion.")

                # Context length safety truncation
                with self.db_conn_factory() as conn:
                    conn.execute(
                        "UPDATE dashboard_documents SET current_step = 3 WHERE dashboard_id = ? AND document_id = ?;",
                        (str(dashboard_id), str(doc_id))
                    )
                    conn.commit()
                MAX_CODING_INPUT_CHARS = 80000
                if len(doc_text) > MAX_CODING_INPUT_CHARS:
                    logger.warning("Document %s exceeds coding limit (%d chars). Truncating text for LLM context.", doc_id, len(doc_text))
                    doc_text = doc_text[:MAX_CODING_INPUT_CHARS] + "\n\n... [TRUNCATED FOR CONTEXT LIMITS] ..."

                # Prepare dynamic Pydantic schema model
                with self.db_conn_factory() as conn:
                    conn.execute(
                        "UPDATE dashboard_documents SET current_step = 4 WHERE dashboard_id = ? AND document_id = ?;",
                        (str(dashboard_id), str(doc_id))
                    )
                    conn.commit()
                fields = {}
                for col in schema_fields:
                    name = col["name"]
                    col_type = col["type"]
                    desc = col.get("description", "")
                    opts = col.get("options")
                    
                    py_type = str
                    if col_type == "number":
                        py_type = float
                    elif col_type == "boolean":
                        py_type = bool
                        
                    if opts:
                        desc += f" Must be one of: {', '.join(opts)}"
                    
                    fields[name] = (Optional[py_type], Field(default=None, description=desc))
                    
                    # AI Reasoning/Evidence companion field for this variable
                    reasoning_desc = f"Exact reasoning, textual evidence, or quotes from the document supporting the value assigned to the '{name}' variable."
                    fields[f"{name}_reasoning"] = (Optional[str], Field(default=None, description=reasoning_desc))
                    
                CodedOutputModel = create_model("CodedOutputModel", **fields)

                # Structured LLM call
                with self.db_conn_factory() as conn:
                    conn.execute(
                        "UPDATE dashboard_documents SET current_step = 5 WHERE dashboard_id = ? AND document_id = ?;",
                        (str(dashboard_id), str(doc_id))
                    )
                    conn.commit()
                llm = get_llm_for_model(model_name)

                # Generate a textual representation of the columns and their rules for the prompt
                column_instructions = []
                for col in schema_fields:
                    name = col["name"]
                    col_type = col["type"]
                    desc = col.get("description", "")
                    opts = col.get("options")
                    opts_text = f" (Allowed categories: {', '.join(opts)})" if opts else ""
                    column_instructions.append(f"- **{name}** ({col_type}): {desc}{opts_text}")

                column_instructions_text = "\n".join(column_instructions)

                coding_system_prompt = (
                    "You are an AI coding assistant helping a quantitative research researcher.\n"
                    "Analyze the provided document text and extract values for the specified output schema columns.\n\n"
                    "=== COLUMN DEFINITIONS AND RULES ===\n"
                    f"{column_instructions_text}\n\n"
                    f"=== SYSTEM PROMPT / CODEBOOK ===\n{campaign_prompt}\n\n"
                    "You MUST follow all specific rules, definitions, and logical constraints listed above to determine the values and reasoning. Return the extracted values as a JSON object matching the requested schema."
                )

                try:
                    parsed = await llm.parse_structured(
                        [
                            LLMMessage(role="system", content=coding_system_prompt),
                            LLMMessage(role="user", content=f"Document content to code:\n\n{doc_text}"),
                        ],
                        schema=CodedOutputModel,
                        log_context={"service": "campaign_coding", "campaign_id": str(dashboard_id)},
                    )
                    if parsed is None:
                        raise ValueError("LLM returned empty parsed result")
                    coded_values = parsed.model_dump()

                except Exception as api_err:
                    logger.error("LLM call failed for doc %s: %s", doc_id, api_err)
                    if "parse" in str(api_err) or "validation" in str(api_err) or "JSON" in str(api_err):
                        raise RuntimeError("COMPREHENSION_FAILURE: LLM response did not conform to the schema or failed parsing.") from api_err
                    else:
                        raise RuntimeError(f"API_FAILURE: OpenAI/OpenRouter connection failure: {str(api_err)}") from api_err

                # Save success status and values
                with self.db_conn_factory() as conn:
                    conn.execute(
                        "UPDATE dashboard_documents SET current_step = 6 WHERE dashboard_id = ? AND document_id = ?;",
                        (str(dashboard_id), str(doc_id))
                    )
                    conn.commit()

                import datetime
                for col in schema_fields:
                    col_name = col["name"]
                    val = coded_values.get(col_name)
                    reasoning = coded_values.get(f"{col_name}_reasoning")
                    coded_values[f"{col_name}_history"] = [
                        {
                            "version": 1,
                            "value": val,
                            "reasoning": reasoning,
                            "feedback_prompt": None,
                            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                            "source": "ai"
                        }
                    ]

                with self.db_conn_factory() as conn:
                    conn.execute(
                        """
                        UPDATE dashboard_documents
                        SET status = 'completed', coded_values = ?, current_step = 0, total_steps = 7, error_message = NULL, error_type = NULL
                        WHERE dashboard_id = ? AND document_id = ?;
                        """,
                        (json.dumps(coded_values), str(dashboard_id), str(doc_id))
                    )
                    conn.commit()
                logger.info("Successfully coded document %s in dashboard %s", doc_id, dashboard_id)

            except Exception as err:
                err_str = str(err)
                error_type = "EXTRACTION_FAILURE"
                if "API_FAILURE" in err_str:
                    error_type = "API_FAILURE"
                    error_msg = err_str.replace("API_FAILURE: ", "")
                elif "COMPREHENSION_FAILURE" in err_str:
                    error_type = "COMPREHENSION_FAILURE"
                    error_msg = err_str.replace("COMPREHENSION_FAILURE: ", "")
                else:
                    error_msg = f"Extraction error: {err_str}"
                    
                logger.error("Failed to code document %s: %s (Type: %s)", doc_id, error_msg, error_type)
                with self.db_conn_factory() as conn:
                    conn.execute(
                        """
                        UPDATE dashboard_documents
                        SET status = 'failed', current_step = 0, total_steps = 7, error_message = ?, error_type = ?
                        WHERE dashboard_id = ? AND document_id = ?;
                        """,
                        (error_msg, error_type, str(dashboard_id), str(doc_id))
                    )
                    conn.commit()

            # Sequential delay (rate limiting safety)
            with self.db_conn_factory() as conn:
                conn.execute(
                    "UPDATE dashboard_documents SET current_step = 7 WHERE dashboard_id = ? AND document_id = ?;",
                    (str(dashboard_id), str(doc_id))
                )
                conn.commit()
            delay = 3
            logger.info("Sleeping for %d seconds before processing next document...", delay)
            await asyncio.sleep(delay)
            with self.db_conn_factory() as conn:
                conn.execute(
                    "UPDATE dashboard_documents SET current_step = 0 WHERE dashboard_id = ? AND document_id = ?;",
                    (str(dashboard_id), str(doc_id))
                )
                conn.commit()


# Process-wide singleton instance for dependency injection & route integration
coding_service = CodingService()


# Backward-compatible functional delegates
def sanitize_column_name(name: str) -> str:
    return coding_service.sanitize_column_name(name)


def get_document_text(doc_id: str) -> str:
    return coding_service.get_document_text(doc_id)


async def generate_schema_and_description(prompt_text: str, user_columns: Optional[List[str]] = None) -> Dict[str, Any]:
    return await coding_service.generate_schema_and_description(prompt_text, user_columns)


def enqueue_sequential_coding(dashboard_id: str, document_ids: List[str], user_id: str) -> None:
    coding_service.enqueue_sequential_coding(dashboard_id, document_ids, user_id)


def run_sequential_coding_sync(dashboard_id: str, document_ids: List[str], user_id: str) -> None:
    coding_service.run_sequential_coding_sync(dashboard_id, document_ids, user_id)


async def process_sequential_coding_queue(dashboard_id: str, document_ids: List[str], user_id: str) -> None:
    await coding_service.process_sequential_coding_queue(dashboard_id, document_ids, user_id)
