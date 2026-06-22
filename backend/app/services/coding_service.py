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
from app.core.request_context import set_current_user_id
from app.llm import LLMMessage, get_llm, get_llm_for_model
from app.services.document_service import document_service as default_document_service, DocumentService

logger = logging.getLogger(__name__)

MAX_CODING_INPUT_CHARS = 80000
TRUNCATION_NOTICE = "\n\n... [TRUNCATED FOR CONTEXT LIMITS] ..."


class SchemaField(BaseModel):
    name: str = Field(..., description="Clean snake_case name of the variable. E.g. 'discretion_score', 'has_penalty'")
    type: str = Field(..., description="The data type. One of 'string', 'number', 'boolean'")
    description: str = Field(..., description="Explanation of what this variable represents according to the prompt rules")
    options: Optional[List[str]] = Field(default=None, description="Optional list of allowed values/categories for this field")
    prompt: Optional[str] = Field(default=None, description="Optional column-specific coding prompt or rubric")
    depends_on: Optional[List[str]] = Field(default=None, description="Optional prior columns this variable depends on")


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
5. If the variable should be coded using a specific section of the prompt, include that section as the variable's prompt.
6. If the variable logically depends on earlier variables, list those prior variable names in depends_on.

Also, write a concise 1-2 sentence description summarizing the overall goal of this research campaign.
"""


class CodingService:
    """Class encapsulating campaigns' structured coding operations."""

    def __init__(
        self,
        db_conn_factory=None,
        doc_service: DocumentService = None,
        db_session_factory=None,
    ) -> None:
        self._db_conn_factory = db_conn_factory
        self._db_session_factory = db_session_factory
        self._doc_service = doc_service or default_document_service
        self.coding_executor = ThreadPoolExecutor(max_workers=1)

    @property
    def db_conn_factory(self) -> Any:
        if self._db_conn_factory is None:
            return get_db_conn
        return self._db_conn_factory

    @property
    def db_session_factory(self) -> Any:
        if self._db_session_factory is not None:
            return self._db_session_factory
        
        is_customized = False
        if self._db_conn_factory is not None:
            is_customized = True
        else:
            from unittest.mock import Mock
            if isinstance(get_db_conn, Mock):
                is_customized = True
            else:
                try:
                    from app.core.database import get_db_conn as original_get_db_conn
                    if get_db_conn is not original_get_db_conn:
                        is_customized = True
                except Exception:
                    pass

        if is_customized:
            from contextlib import contextmanager
            @contextmanager
            def adapted_session():
                conn_ctx = self.db_conn_factory
                if callable(conn_ctx):
                    conn = conn_ctx()
                else:
                    conn = conn_ctx
                
                # Check if it has enter/exit context methods
                if hasattr(conn, "__enter__"):
                    with conn as connection:
                        from app.repositories.sqlite import SQLiteUnitOfWork
                        uow = SQLiteUnitOfWork(conn=connection)
                        try:
                            yield uow
                            uow.commit()
                        except Exception:
                            uow.rollback()
                            raise
                else:
                    from app.repositories.sqlite import SQLiteUnitOfWork
                    uow = SQLiteUnitOfWork(conn=conn)
                    try:
                        yield uow
                        uow.commit()
                    except Exception:
                        uow.rollback()
                        raise
            return adapted_session

        from app.repositories import get_db_session
        return get_db_session

    def sanitize_column_name(self, name: str) -> str:
        """Sanitize variable names to be safe snake_case database/json keys."""
        s = re.sub(r'[^a-zA-Z0-9_]', '', name.replace(' ', '_').replace('-', '_'))
        if s and s[0].isdigit():
            s = "_" + s
        return s.lower() or "unnamed_column"

    def get_document_text(self, doc_id: str) -> str:
        """Retrieve full text of a document from its stored chunks in database."""
        with self.db_session_factory() as session:
            chunks = session.chunks.get_chunks_by_document(doc_id)
            if not chunks:
                return ""
            
            chunks_with_index = []
            for chunk in chunks:
                content = chunk.get("content", "")
                meta = chunk.get("metadata", {})
                if isinstance(meta, str):
                    try:
                        meta = json.loads(meta)
                    except Exception:
                        meta = {}
                idx = meta.get("chunk_index", 0) if isinstance(meta, dict) else 0
                chunks_with_index.append((idx, content))
            
            chunks_with_index.sort(key=lambda x: x[0])
            return "\n\n".join(c[1] for c in chunks_with_index)

    def prepare_document_text_for_coding(self, doc_text: str) -> str:
        """Apply production-safe context handling before an LLM coding call."""
        if len(doc_text) <= MAX_CODING_INPUT_CHARS:
            return doc_text
        return doc_text[:MAX_CODING_INPUT_CHARS] + TRUNCATION_NOTICE

    def _normalize_depends_on(self, value: Any) -> list[str]:
        """Normalize dependency metadata to a clean list of column names."""
        if value is None:
            return []
        if isinstance(value, str):
            raw_items = value.split(",")
        elif isinstance(value, list):
            raw_items = value
        else:
            return []

        deps: list[str] = []
        for item in raw_items:
            dep = self.sanitize_column_name(str(item).strip())
            if dep and dep not in deps:
                deps.append(dep)
        return deps

    def _normalize_schema_field(self, col: dict[str, Any]) -> dict[str, Any]:
        """Preserve supported schema metadata while normalizing names/types/dependencies."""
        clean_name = self.sanitize_column_name(str(col.get("name", "")))
        col_type = col.get("type") or "string"
        if col_type not in ["string", "number", "boolean"]:
            col_type = "string"

        normalized = dict(col)
        normalized["name"] = clean_name
        normalized["type"] = col_type
        normalized["description"] = col.get("description") or f"Column: {clean_name}"
        normalized["options"] = col.get("options") or None
        normalized["prompt"] = (col.get("prompt") or "").strip()
        normalized["depends_on"] = self._normalize_depends_on(col.get("depends_on") or col.get("dependencies"))
        return normalized

    def _schema_uses_staged_coding(self, schema_fields: list[dict[str, Any]]) -> bool:
        """Staged coding is needed when any column has a specific prompt or dependency."""
        for col in schema_fields:
            if (col.get("prompt") or "").strip() or self._normalize_depends_on(col.get("depends_on")):
                return True
        return False

    def _ordered_schema_fields_for_staged_coding(self, schema_fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Order columns so dependency columns are coded before columns that rely on them."""
        by_name = {col.get("name"): col for col in schema_fields if col.get("name")}
        ordered: list[dict[str, Any]] = []
        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(col: dict[str, Any]) -> None:
            name = col.get("name")
            if not name or name in visited:
                return
            if name in visiting:
                logger.warning("Cycle detected in schema column dependencies at %s; preserving remaining order.", name)
                return
            visiting.add(name)
            for dep in self._normalize_depends_on(col.get("depends_on")):
                dep_col = by_name.get(dep)
                if dep_col is not None:
                    visit(dep_col)
            visiting.remove(name)
            visited.add(name)
            ordered.append(col)

        for col in schema_fields:
            visit(col)

        return ordered

    def _field_type_for_column(self, col: dict[str, Any]) -> Any:
        col_type = col.get("type", "string")
        if col_type == "number":
            return float
        if col_type == "boolean":
            return bool
        return str

    def _column_description(self, col: dict[str, Any]) -> str:
        desc = col.get("description", "")
        opts = col.get("options")
        if opts:
            desc += f" Must be one of: {', '.join(opts)}"
        return desc

    def _dependency_context_text(
        self,
        col: dict[str, Any],
        coded_values: dict[str, Any],
        schema_fields: list[dict[str, Any]],
    ) -> str:
        deps = self._normalize_depends_on(col.get("depends_on"))
        if not deps:
            current_name = col.get("name")
            deps = [
                c.get("name")
                for c in schema_fields
                if c.get("name") != current_name and c.get("name") in coded_values
            ]

        lines = []
        for dep in deps:
            if dep not in coded_values and f"{dep}_reasoning" not in coded_values:
                lines.append(f"- {dep}: not coded yet")
                continue
            lines.append(
                f"- {dep}: {coded_values.get(dep)!r}\n"
                f"  reasoning: {coded_values.get(f'{dep}_reasoning', 'Not provided')}"
            )
        return "\n".join(lines) if lines else "No prior column values are available."

    def _build_staged_column_prompt(
        self,
        campaign_prompt: str,
        col: dict[str, Any],
        coded_values: dict[str, Any],
        schema_fields: list[dict[str, Any]],
    ) -> str:
        column_prompt = (col.get("prompt") or "").strip()
        dependency_context = self._dependency_context_text(col, coded_values, schema_fields)
        return (
            "You are an AI coding assistant helping a legal-institutional research project.\n"
            "Code exactly one output column for the provided law text.\n\n"
            f"=== CAMPAIGN CODEBOOK ===\n{campaign_prompt}\n\n"
            "=== CURRENT COLUMN ===\n"
            f"Name: {col['name']}\n"
            f"Type: {col['type']}\n"
            f"Description: {self._column_description(col)}\n\n"
            f"=== COLUMN-SPECIFIC PROMPT / RUBRIC ===\n{column_prompt or col.get('description', '')}\n\n"
            f"=== PRIOR COLUMN VALUES AND REASONING ===\n{dependency_context}\n\n"
            "If this column depends on prior values, apply those prior values as binding context unless the document text clearly shows the earlier value is impossible. "
            "Return only the requested structured JSON fields."
        )

    def _build_single_column_model(self, col: dict[str, Any]) -> type[BaseModel]:
        name = col["name"]
        fields: dict[str, Any] = {
            name: (self._field_type_for_column(col), Field(..., description=self._column_description(col)))
        }
        if col["type"] in ["boolean", "number"] or col.get("options"):
            fields[f"{name}_reasoning"] = (
                str,
                Field(..., description=f"Reasoning and textual evidence supporting the value assigned to '{name}'.")
            )
        return create_model(f"{name.title().replace('_', '')}CodingModel", **fields)

    async def _code_document_staged(
        self,
        *,
        llm: Any,
        campaign_prompt: str,
        schema_fields: list[dict[str, Any]],
        doc_text: str,
        dashboard_id: str,
    ) -> dict[str, Any]:
        """Code schema columns in order, feeding prior values into dependent columns."""
        coded_values: dict[str, Any] = {}
        ordered_schema_fields = self._ordered_schema_fields_for_staged_coding(schema_fields)
        for col in ordered_schema_fields:
            model = self._build_single_column_model(col)
            parsed = await llm.parse_structured(
                [
                    LLMMessage(
                        role="system",
                        content=self._build_staged_column_prompt(campaign_prompt, col, coded_values, schema_fields),
                    ),
                    LLMMessage(role="user", content=f"Document content to code:\n\n{doc_text}"),
                ],
                schema=model,
                log_context={"service": "campaign_coding", "campaign_id": str(dashboard_id)},
            )
            if parsed is None:
                raise ValueError(f"LLM returned empty parsed result for column {col['name']}")
            coded_values.update(parsed.model_dump())
        return coded_values

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
                        col_prompt = col_data.get("prompt")
                        col_depends_on = self._normalize_depends_on(col_data.get("depends_on") or col_data.get("dependencies"))
                    else:
                        clean_name = self.sanitize_column_name(str(col))
                        col_type = "string"
                        col_desc = f"User-defined column: {col}"
                        col_opts = None
                        col_prompt = None
                        col_depends_on = []

                    if clean_name and clean_name not in seen_names:
                        schema_fields.append({
                            "name": clean_name,
                            "type": col_type if col_type in ["string", "number", "boolean"] else "string",
                            "description": col_desc,
                            "options": col_opts,
                            "prompt": col_prompt,
                            "depends_on": col_depends_on
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
                        "options": field.options,
                        "prompt": field.prompt,
                        "depends_on": self._normalize_depends_on(field.depends_on)
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
                        col_prompt = col_data.get("prompt")
                        col_depends_on = self._normalize_depends_on(col_data.get("depends_on") or col_data.get("dependencies"))
                    else:
                        clean_name = self.sanitize_column_name(str(col))
                        col_type = "string"
                        col_desc = f"User-defined column: {col}"
                        col_opts = None
                        col_prompt = None
                        col_depends_on = []

                    if clean_name:
                        fallback_schema.append({
                            "name": clean_name,
                            "type": col_type if col_type in ["string", "number", "boolean"] else "string",
                            "description": col_desc,
                            "options": col_opts,
                            "prompt": col_prompt,
                            "depends_on": col_depends_on
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

    def schedule_coroutine(self, coro) -> None:
        """Schedule an arbitrary async coroutine on the coding background event loop."""
        self._ensure_loop_running()
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        future.add_done_callback(
            lambda f: logger.error("Scheduled coroutine raised: %s", f.exception(), exc_info=f.exception())
            if f.exception() else None
        )

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
        set_current_user_id(user_id)
        logger.info("Starting sequential coding for dashboard %s", dashboard_id)
        
        with self.db_session_factory() as session:
            campaign_row = session.dashboards.get_by_id(dashboard_id)
            if not campaign_row:
                logger.error("Dashboard %s not found. Aborting coding execution.", dashboard_id)
                return
            campaign_prompt = campaign_row["prompt"]
            schema_json = campaign_row["schema"]
            model_name = campaign_row.get("model")
            try:
                schema_fields = json.loads(schema_json) if isinstance(schema_json, str) else (schema_json or [])
                schema_fields = [self._normalize_schema_field(col) for col in schema_fields]
            except Exception:
                logger.error("Failed to parse schema for dashboard %s", dashboard_id)
                return

        for doc_id in document_ids:
            with self.db_session_factory() as session:
                session.dashboard_documents.update_status(
                    dashboard_id=dashboard_id,
                    document_id=doc_id,
                    status="processing"
                )
                session.dashboard_documents.update_progress(
                    dashboard_id=dashboard_id,
                    document_id=doc_id,
                    current_step=1,
                    total_steps=7
                )
                
            logger.info("Coding document %s in dashboard %s", doc_id, dashboard_id)
            
            try:
                # Retrieve document text
                with self.db_session_factory() as session:
                    session.dashboard_documents.update_progress(
                        dashboard_id=dashboard_id,
                        document_id=doc_id,
                        current_step=2,
                        total_steps=7
                    )
                doc_text = self.get_document_text(doc_id)
                if not doc_text or not doc_text.strip():
                    doc_record = self._doc_service.get_document(None, doc_id)
                    if doc_record and doc_record.status == "processing":
                        logger.info("Document %s is still processing globally, waiting 5 seconds...", doc_id)
                        await asyncio.sleep(5.0)
                        doc_text = self.get_document_text(doc_id)
                    
                    if not doc_text or not doc_text.strip():
                        raise ValueError("Document has no text content extracted yet. Ensure it completed global ingestion.")

                with self.db_session_factory() as session:
                    session.dashboard_documents.update_progress(
                        dashboard_id=dashboard_id,
                        document_id=doc_id,
                        current_step=3,
                        total_steps=7
                    )
                doc_text = self.prepare_document_text_for_coding(doc_text)

                # Prepare dynamic Pydantic schema model
                with self.db_session_factory() as session:
                    session.dashboard_documents.update_progress(
                        dashboard_id=dashboard_id,
                        document_id=doc_id,
                        current_step=4,
                        total_steps=7
                    )
                # Structured LLM call
                with self.db_session_factory() as session:
                    session.dashboard_documents.update_progress(
                        dashboard_id=dashboard_id,
                        document_id=doc_id,
                        current_step=5,
                        total_steps=7
                )
                llm = get_llm_for_model(model_name)

                try:
                    if self._schema_uses_staged_coding(schema_fields):
                        coded_values = await self._code_document_staged(
                            llm=llm,
                            campaign_prompt=campaign_prompt,
                            schema_fields=schema_fields,
                            doc_text=doc_text,
                            dashboard_id=dashboard_id,
                        )
                    else:
                        fields = {}
                        for col in schema_fields:
                            name = col["name"]
                            
                            # Avoid Optional/nullable fields as they generate 'anyOf' schemas which are rejected by Gemini's structured output mode.
                            fields[name] = (
                                self._field_type_for_column(col),
                                Field(..., description=self._column_description(col))
                            )
                            
                            # Only generate reasoning companion field for structured variables (boolean, number, or categorical string fields) to keep schema size within LLM limits.
                            if col["type"] in ["boolean", "number"] or col.get("options"):
                                reasoning_desc = f"Exact reasoning, textual evidence, or quotes from the document supporting the value assigned to the '{name}' variable. If not mentioned in the text, use 'Not mentioned'."
                                fields[f"{name}_reasoning"] = (str, Field(..., description=reasoning_desc))
                            
                        CodedOutputModel = create_model("CodedOutputModel", **fields)

                        # Generate a textual representation of the columns and their rules for the prompt
                        column_instructions = []
                        for col in schema_fields:
                            name = col["name"]
                            col_type = col["type"]
                            opts = col.get("options")
                            opts_text = f" (Allowed categories: {', '.join(opts)})" if opts else ""
                            column_instructions.append(f"- **{name}** ({col_type}): {col.get('description', '')}{opts_text}")

                        column_instructions_text = "\n".join(column_instructions)

                        coding_system_prompt = (
                            "You are an AI coding assistant helping a quantitative research researcher.\n"
                            "Analyze the provided document text and extract values for the specified output schema columns.\n\n"
                            "=== COLUMN DEFINITIONS AND RULES ===\n"
                            f"{column_instructions_text}\n\n"
                            f"=== SYSTEM PROMPT / CODEBOOK ===\n{campaign_prompt}\n\n"
                            "You MUST follow all specific rules, definitions, and logical constraints listed above to determine the values and reasoning. Return the extracted values as a JSON object matching the requested schema."
                        )

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
                with self.db_session_factory() as session:
                    session.dashboard_documents.update_progress(
                        dashboard_id=dashboard_id,
                        document_id=doc_id,
                        current_step=6,
                        total_steps=7
                    )

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
                            "timestamp": datetime.datetime.now(datetime.UTC).isoformat() + "Z",
                            "source": "ai"
                        }
                    ]

                with self.db_session_factory() as session:
                    session.dashboard_documents.update_coded_values(
                        dashboard_id=dashboard_id,
                        document_id=doc_id,
                        coded_values=json.dumps(coded_values),
                        status="completed"
                    )
                    session.dashboard_documents.update_progress(
                        dashboard_id=dashboard_id,
                        document_id=doc_id,
                        current_step=0,
                        total_steps=7
                    )
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
                with self.db_session_factory() as session:
                    session.dashboard_documents.update_status(
                        dashboard_id=dashboard_id,
                        document_id=doc_id,
                        status="failed",
                        error_message=error_msg,
                        error_type=error_type
                    )
                    session.dashboard_documents.update_progress(
                        dashboard_id=dashboard_id,
                        document_id=doc_id,
                        current_step=0,
                        total_steps=7
                    )

            # Sequential delay (rate limiting safety)
            with self.db_session_factory() as session:
                session.dashboard_documents.update_progress(
                    dashboard_id=dashboard_id,
                    document_id=doc_id,
                    current_step=7,
                    total_steps=7
                )
            delay = 3
            logger.info("Sleeping for %d seconds before processing next document...", delay)
            await asyncio.sleep(delay)
            with self.db_session_factory() as session:
                session.dashboard_documents.update_progress(
                    dashboard_id=dashboard_id,
                    document_id=doc_id,
                    current_step=0,
                    total_steps=7
                )


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
