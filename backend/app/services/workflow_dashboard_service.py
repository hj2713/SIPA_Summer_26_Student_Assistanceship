import asyncio
import logging
import json
import uuid
from pathlib import Path
from typing import Any, Optional
from fastapi import HTTPException, UploadFile

from app.core.request_context import set_current_user_id
from app.repositories import get_db_session
from app.schemas.dashboard import DashboardRow, DashboardDocumentRow, WorkflowSource
from app.schemas.document import DocumentStatus
from app.services.campaign_service import campaign_service
from app.services.document_service import document_service
from app.services.ingestion_service import extract_text, chunk_text
from app.workflows.executor import workflow_executor, WorkflowExecutionError
from app.workflows.schema_fields import extract_dashboard_schema_fields

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {"pdf", "txt", "docx", "html", "htm"}
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50MB


class WorkflowDashboardService:
    """Orchestrates document executions on published workflows."""

    def __init__(self, db_session_factory=get_db_session):
        self.db_session_factory = db_session_factory

    def get_or_create_dashboard(
        self,
        workflow_id: str,
        workspace_id: str,
        user_id: str,
        source: WorkflowSource = "draft",
        version: int | None = None,
    ) -> DashboardRow:
        """Resolve a dashboard corresponding to a workflow's published version or draft."""
        with self.db_session_factory() as session:
            if source == "published":
                if version is None:
                    raise HTTPException(status_code=400, detail="Version is required for published workflows.")
                row = session.dashboards.get_for_workflow(workflow_id, "published", version)
            else:
                row = session.dashboards.get_for_workflow(workflow_id, "draft")

            if row:
                return campaign_service._dashboard_row(row)

            # Not found: create dashboard
            workflow = session.workflows.get_by_id(workflow_id)
            if not workflow:
                raise HTTPException(status_code=404, detail="Workflow not found.")

            if source == "published":
                wf_version = session.workflow_versions.get(workflow_id, version)
                if not wf_version:
                    raise HTTPException(status_code=404, detail=f"Workflow version {version} not found.")
                definition = wf_version["definition_json"]
                wf_revision = wf_version["version"]
                name = f"{workflow['name']} (v{version})"
            else:
                definition = workflow["draft_definition"]
                wf_revision = workflow["revision"]
                name = f"{workflow['name']} (Draft)"

            # Map workflow definition schema to dashboard fields
            try:
                def_dict = json.loads(definition) if isinstance(definition, str) else (definition or {})
            except Exception:
                def_dict = {}

            schema_fields = extract_dashboard_schema_fields(def_dict)

            # Create the dashboard row
            dash_payload = {
                "id": None,
                "workspace_id": workspace_id,
                "name": name,
                "description": workflow["description"] or f"Dashboard running workflow {workflow['name']}",
                "prompt": "Workflow execution",
                "schema": json.dumps(schema_fields),
                "model": workflow.get("model") or "gemini-3.1-flash-lite",
                "dashboard_type": "workflow",
                "workflow_id": workflow_id,
                "workflow_source": source,
                "workflow_version": version if source == "published" else None,
                "workflow_revision": wf_revision,
                "workflow_definition_json": json.dumps(def_dict),
            }
            new_row = session.dashboards.create(dash_payload)
            return campaign_service._dashboard_row(new_row)

    def _create_text_document(
        self,
        filename: str,
        text: str,
        user_id: str,
        workspace_id: str,
        replace_existing: bool = False,
    ) -> str:
        """Create doc and ingest text."""
        with self.db_session_factory() as session:
            existing = session.documents.get_by_filename(workspace_id, filename)
            if replace_existing:
                if existing:
                    # Clear existing document chunks
                    session.chunks.delete_chunks_by_document(existing["id"])
                    chunks = chunk_text(text)
                    session.chunks.create_chunks([
                        {
                            "id": str(uuid.uuid4()),
                            "document_id": existing["id"],
                            "user_id": user_id,
                            "workspace_id": workspace_id,
                            "content": chunk_content,
                            "embedding": None,
                            "metadata": json.dumps({"chunk_index": index}),
                        }
                        for index, chunk_content in enumerate(chunks)
                    ])
                    session.documents.update(existing["id"], {
                        "status": DocumentStatus.completed.value,
                        "error_message": None,
                    })
                    return existing["id"]
            elif existing:
                return existing["id"]

            doc_id = document_service.create_document(
                client=None,
                workspace_id=workspace_id,
                user_id=user_id,
                filename=filename,
                file_path="",
                file_size=len(text),
                content_type="text/plain",
            )
            chunks = chunk_text(text)
            session.chunks.create_chunks([
                {
                    "id": str(uuid.uuid4()),
                    "document_id": str(doc_id.id),
                    "user_id": user_id,
                    "workspace_id": workspace_id,
                    "content": chunk_content,
                    "embedding": None,
                    "metadata": json.dumps({"chunk_index": index}),
                }
                for index, chunk_content in enumerate(chunks)
            ])
            session.documents.update(str(doc_id.id), {
                "status": DocumentStatus.completed.value,
                "error_message": None,
            })
            return str(doc_id.id)

    def _document_text(self, document_id: str) -> str:
        """Gather all document chunks into a consolidated string."""
        with self.db_session_factory() as session:
            chunks = session.chunks.get_chunks_by_document(document_id)
            if chunks:
                chunks_with_idx = []
                for ch in chunks:
                    meta = ch.get("metadata") or {}
                    if isinstance(meta, str):
                        try:
                            meta = json.loads(meta)
                        except Exception:
                            meta = {}
                    idx = meta.get("chunk_index", 0) if isinstance(meta, dict) else 0
                    chunks_with_idx.append((idx, ch.get("content", "")))
                chunks_with_idx.sort(key=lambda x: x[0])
                return "\n\n".join(c[1] for c in chunks_with_idx)

            # Fallback to local raw text if chunks aren't written yet
            doc = session.documents.get(document_id)
            if doc and doc.get("status") == "completed":
                # Check file content
                logger.warning("No chunks found in DB for completed document_id=%s. Attempting raw text lookup.", document_id)
                # If you have a local filepath store, read from it here.
            else:
                logger.exception("Could not read workflow source text for document_id=%s", document_id)
        raise HTTPException(status_code=400, detail="Document text content could not be retrieved.")

    # -------------------------------------------------------------------------
    # Core per-model, per-document runner
    # -------------------------------------------------------------------------

    def _extract_reasoning(self, col_name: str, workflow_source: Optional[str], model_context: dict) -> Optional[str]:
        """Pull the reasoning/rationale string for a column from the workflow context."""
        if not workflow_source:
            return None
        parts = str(workflow_source).split(".")
        node_id = parts[0]
        field_name = parts[1] if len(parts) > 1 else node_id

        candidates = [
            f"{node_id}.{field_name}_reasoning",
            f"{node_id}.{field_name}_rationale",
            f"{node_id}.{field_name}_explanation",
            f"{node_id}.{col_name}_reasoning",
            f"{node_id}.{col_name}_rationale",
            f"{node_id}.{col_name}_explanation",
            f"{node_id}.reasoning",
            f"{node_id}.rationale",
            f"{node_id}.explanation",
            f"{field_name}_reasoning",
            f"{field_name}_rationale",
            f"{col_name}_reasoning",
            f"{col_name}_rationale",
        ]
        for c in candidates:
            if c in model_context and model_context[c]:
                return str(model_context[c])

        # Fallback: find any reasoning-like key under the same node
        node_prefix = f"{node_id}."
        reasoning_keys = [
            k for k in model_context
            if k.startswith(node_prefix)
            and any(kw in k[len(node_prefix):].lower() for kw in ("reason", "rationale", "explain"))
        ]
        if len(reasoning_keys) == 1:
            return str(model_context[reasoning_keys[0]])
        for k in reasoning_keys:
            suffix = k[len(node_prefix):].lower()
            if field_name.lower() in suffix or col_name.lower() in suffix:
                return str(model_context[k])
        if reasoning_keys:
            return str(model_context[reasoning_keys[0]])
        return None

    async def _run_model_for_document(
        self,
        dashboard_id: str,
        document_id: str,
        definition: dict[str, Any],
        model: str,
        source_text: str,
        schema_fields: list,
        token_limit: int,
    ) -> dict:
        """Run the workflow once for a single model and return the coded-values dict for that model.
        
        Returns a dict matching the coded_values[model] structure:
          { status, values, cost, input_tokens, output_tokens, trace, context, error_message, error_type }
        """
        import datetime

        # Token safety check
        with self.db_session_factory() as session:
            stats = session.usage_logs.get_usage_stats(timeframe="all", campaign_id=dashboard_id)
        token_sum = 0
        for item in (stats.get("breakdown") or []):
            if item.get("model") == model:
                token_sum = item.get("input_tokens", 0) + item.get("output_tokens", 0)

        if token_sum >= token_limit:
            logger.warning("Token safety limit %d exceeded for model %s (sum=%d)", token_limit, model, token_sum)
            return {
                "status": "suspended_limit",
                "values": {},
                "cost": 0.0,
                "input_tokens": 0,
                "output_tokens": 0,
                "error_message": f"Token limit of {token_limit} exceeded.",
                "error_type": "API_FAILURE",
            }

        try:
            usage_list: list = []
            ctx = {
                "service": "workflow_coding",
                "campaign_id": str(dashboard_id),
                "usage_accumulator": usage_list,
            }
            result = await workflow_executor.execute(
                definition,
                source_text,
                model_override=model,  # ALL nodes use this model
                log_context=ctx,
            )
            model_coded: dict = dict(result["outputs"])
            model_context: dict = result.get("context", {})

            # Enrich with reasoning and history for each schema column
            for col in schema_fields:
                col_name = col.get("name")
                if not col_name:
                    continue
                reasoning = self._extract_reasoning(col_name, col.get("workflow_source"), model_context)
                if reasoning is not None:
                    model_coded[f"{col_name}_reasoning"] = reasoning
                val = model_coded.get(col_name)
                model_coded[f"{col_name}_history"] = [
                    {
                        "version": 1,
                        "value": val,
                        "reasoning": reasoning,
                        "feedback_prompt": None,
                        "timestamp": datetime.datetime.now(datetime.UTC).isoformat() + "Z",
                        "source": "ai",
                    }
                ]

            input_tokens = sum(u.input_tokens for u in usage_list if u)
            output_tokens = sum(u.output_tokens for u in usage_list if u)
            from app.llm.registry import calculate_cost
            cost = calculate_cost(model, input_tokens, output_tokens)

            return {
                "status": "completed",
                "values": model_coded,
                "cost": cost,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "trace": result["trace"],
                "context": result["context"],
                "error_message": None,
                "error_type": None,
            }

        except Exception as exc:
            logger.error("Workflow failed for model %s on doc %s: %s", model, document_id, exc)
            trace_data = getattr(exc, "trace", [])
            context_data = getattr(exc, "context", {})
            return {
                "status": "failed",
                "values": {},
                "cost": 0.0,
                "input_tokens": 0,
                "output_tokens": 0,
                "error_message": str(exc),
                "error_type": "API_FAILURE",
                "trace": trace_data,
                "context": context_data,
            }

    # -------------------------------------------------------------------------
    # Parallel multi-model dispatcher
    # -------------------------------------------------------------------------

    async def run_model_comparison_parallel(
        self,
        dashboard_id: str,
        document_ids: list[str],
        models: list[str],
        definition: dict[str, Any],
        schema_fields: list,
        token_limit: int,
        user_id: Optional[str] = None,
        retry_model: Optional[str] = None,
        files_concurrency: int = 2,
    ) -> None:
        """Run all requested models in parallel and persist one merged document update.

        We intentionally merge results once per document after all model tasks
        finish. This avoids concurrent read-modify-write races on the shared
        `coded_values` JSON blob, which could otherwise drop one model's result.
        """
        semaphore = asyncio.Semaphore(files_concurrency)

        async def process_doc(doc_id: str) -> None:
            async with semaphore:
                if user_id:
                    set_current_user_id(user_id)
                all_coded: dict[str, Any] = {}
                models_to_run: list[str] = []
                try:
                    source_text = self._document_text(doc_id)

                    with self.db_session_factory() as session:
                        doc_dd = session.dashboard_documents.get(dashboard_id, doc_id)
                        existing_str = doc_dd.get("coded_values") if doc_dd else "{}"
                    try:
                        all_coded = json.loads(existing_str) if existing_str else {}
                    except Exception:
                        all_coded = {}

                    if retry_model:
                        models_to_run = [
                            model
                            for model in models
                            if model == retry_model
                        ]
                    else:
                        models_to_run = [
                            model
                            for model in models
                            if all_coded.get(model, {}).get("status") != "completed"
                        ]
                    if not models_to_run:
                        return

                    for model in models_to_run:
                        existing_model_run = all_coded.get(model) if isinstance(all_coded.get(model), dict) else {}
                        all_coded[model] = {
                            "values": existing_model_run.get("values") or {},
                            "status": "processing",
                            "cost": existing_model_run.get("cost"),
                            "input_tokens": existing_model_run.get("input_tokens"),
                            "output_tokens": existing_model_run.get("output_tokens"),
                            "trace": existing_model_run.get("trace"),
                            "context": existing_model_run.get("context"),
                            "error_message": None,
                            "error_type": None,
                        }

                    with self.db_session_factory() as session:
                        session.dashboard_documents.update_coded_values(
                            dashboard_id,
                            doc_id,
                            json.dumps(all_coded),
                            status="processing",
                        )

                    async def run_one_model(model: str) -> tuple[str, dict[str, Any]]:
                        model_result = await self._run_model_for_document(
                            dashboard_id,
                            doc_id,
                            definition,
                            model,
                            source_text,
                            schema_fields,
                            token_limit,
                        )
                        return model, model_result

                    tasks_by_model = {
                        model: asyncio.create_task(run_one_model(model))
                        for model in models_to_run
                    }
                    completed_results: list[tuple[str, dict[str, Any]]] = []
                    representative_trace: list[dict[str, Any]] = []
                    representative_context: dict[str, Any] = {}
                    representative_error: str | None = None
                    representative_error_type: str | None = None

                    for completed_task in asyncio.as_completed(tasks_by_model.values()):
                        model, model_result = await completed_task
                        completed_results.append((model, model_result))
                        all_coded[model] = {
                            "values": model_result["values"],
                            "status": model_result["status"],
                            "cost": model_result.get("cost"),
                            "input_tokens": model_result.get("input_tokens"),
                            "output_tokens": model_result.get("output_tokens"),
                            "trace": model_result.get("trace"),
                            "context": model_result.get("context"),
                            "error_message": model_result.get("error_message"),
                            "error_type": model_result.get("error_type"),
                        }

                        if not representative_trace and model_result.get("trace"):
                            representative_trace = model_result.get("trace") or []
                        if not representative_context and model_result.get("context"):
                            representative_context = model_result.get("context") or {}
                        if not representative_error and model_result.get("error_message"):
                            representative_error = model_result.get("error_message")
                            representative_error_type = model_result.get("error_type") or "API_FAILURE"

                        statuses = [
                            all_coded.get(model_name, {}).get("status", "pending")
                            for model_name in models
                        ]
                        if statuses and all(status == "completed" for status in statuses):
                            overall_status = "completed"
                        elif any(status in {"suspended_limit", "failed"} for status in statuses):
                            overall_status = "failed"
                        else:
                            overall_status = "processing"

                        with self.db_session_factory() as session:
                            session.dashboard_documents.update_workflow_result(
                                dashboard_id,
                                doc_id,
                                json.dumps(all_coded),
                                json.dumps(representative_trace),
                                json.dumps(representative_context),
                                status=overall_status,
                                error_message=representative_error if overall_status == "failed" else None,
                                error_type=(representative_error_type or "API_FAILURE") if overall_status == "failed" and representative_error else None,
                            )
                except Exception as exc:
                    logger.exception("Workflow model comparison failed before completion for doc %s", doc_id)
                    error_message = str(exc)
                    if not models_to_run:
                        models_to_run = list(models)
                    trace_data = getattr(exc, "trace", None)
                    context_data = getattr(exc, "context", None)
                    for model in models_to_run:
                        existing_model_run = all_coded.get(model) if isinstance(all_coded.get(model), dict) else {}
                        all_coded[model] = {
                            "values": existing_model_run.get("values") or {},
                            "status": "failed",
                            "cost": existing_model_run.get("cost", 0.0),
                            "input_tokens": existing_model_run.get("input_tokens", 0),
                            "output_tokens": existing_model_run.get("output_tokens", 0),
                            "trace": trace_data or existing_model_run.get("trace"),
                            "context": context_data or existing_model_run.get("context"),
                            "error_message": error_message,
                            "error_type": "API_FAILURE",
                        }
                    with self.db_session_factory() as session:
                        session.dashboard_documents.update_coded_values(
                            dashboard_id,
                            doc_id,
                            json.dumps(all_coded),
                            status="failed",
                        )
                        session.dashboard_documents.update_status(
                            dashboard_id=dashboard_id,
                            document_id=doc_id,
                            status="failed",
                            error_message=error_message,
                            error_type="API_FAILURE",
                        )

        await asyncio.gather(*[process_doc(doc_id) for doc_id in document_ids])

    # -------------------------------------------------------------------------
    # Legacy _execute_document — now delegates to helpers
    # -------------------------------------------------------------------------

    async def _execute_document(
        self,
        dashboard_id: str,
        document_id: str,
        definition: dict[str, Any],
        user_id: Optional[str] = None,
        retry_model: Optional[str] = None,
    ) -> DashboardDocumentRow:
        if user_id:
            set_current_user_id(user_id)
        with self.db_session_factory() as session:
            existing = session.dashboard_documents.get(dashboard_id, document_id)
            coded_vals_str = "{}"
            if existing:
                coded_vals_str = existing.get("coded_values") or "{}"
                try:
                    coded_vals = json.loads(coded_vals_str) if isinstance(coded_vals_str, str) else (coded_vals_str or {})
                except Exception:
                    coded_vals = {}
                if retry_model:
                    m_data = coded_vals.get(retry_model) or {}
                    m_data["status"] = "processing"
                    m_data["error_message"] = None
                    coded_vals[retry_model] = m_data
                else:
                    for model_key, model_run in list(coded_vals.items()):
                        if isinstance(model_run, dict) and model_run.get("status") in ["failed", "suspended_limit", "pending"]:
                            model_run["status"] = "processing"
                            model_run["error_message"] = None
                            coded_vals[model_key] = model_run
                coded_vals_str = json.dumps(coded_vals)
            session.dashboard_documents.create_or_update(dashboard_id, document_id, coded_vals_str, "processing", current_step=1, total_steps=3)
        try:
            source_text = self._document_text(document_id)
            with self.db_session_factory() as session:
                session.dashboard_documents.update_progress(dashboard_id, document_id, 2, 3)

            with self.db_session_factory() as session:
                dash_row = session.dashboards.get_by_id(dashboard_id)
                schema_json = dash_row.get("schema") if dash_row else "[]"
                schema_fields = json.loads(schema_json) if isinstance(schema_json, str) else (schema_json or [])
                model_name = dash_row.get("model") or "gemini-3.1-flash-lite"
                dashboard_type = dash_row.get("dashboard_type") or "campaign"
                token_limit = dash_row.get("token_limit") or 5000000

            is_multi_model = "," in model_name or dashboard_type == "model_comparison"

            if is_multi_model:
                models = [m.strip() for m in model_name.split(",") if m.strip()]
                # Delegate to parallel runner (single-document, all models)
                await self.run_model_comparison_parallel(
                    dashboard_id=dashboard_id,
                    document_ids=[document_id],
                    models=models,
                    definition=definition,
                    schema_fields=schema_fields,
                    token_limit=token_limit,
                    user_id=user_id,
                    retry_model=retry_model,
                    files_concurrency=2,
                )
            else:
                # Single-model standard workflow run
                import datetime
                result = await workflow_executor.execute(definition, source_text)
                coded_values = dict(result["outputs"])
                context = result.get("context", {})
                for col in schema_fields:
                    col_name = col.get("name")
                    if not col_name:
                        continue
                    reasoning = self._extract_reasoning(col_name, col.get("workflow_source"), context)
                    if reasoning is not None:
                        coded_values[f"{col_name}_reasoning"] = reasoning
                    val = coded_values.get(col_name)
                    coded_values[f"{col_name}_history"] = [
                        {
                            "version": 1, "value": val, "reasoning": reasoning,
                            "feedback_prompt": None,
                            "timestamp": datetime.datetime.now(datetime.UTC).isoformat() + "Z",
                            "source": "ai",
                        }
                    ]
                with self.db_session_factory() as session:
                    session.dashboard_documents.update_workflow_result(
                        dashboard_id, document_id,
                        json.dumps(coded_values), json.dumps(result["trace"]), json.dumps(result["context"]),
                        status="completed",
                    )

        except WorkflowExecutionError as exc:
            error_message = str(exc)
            with self.db_session_factory() as session:
                session.dashboard_documents.update_workflow_result(
                    dashboard_id, document_id, "{}", json.dumps([]), json.dumps({}),
                    status="failed", error_message=error_message, error_type="API_FAILURE",
                )
        except Exception as exc:
            logger.exception("Workflow execution failed dashboard=%s doc=%s", dashboard_id, document_id)
            error_message = str(exc)
            with self.db_session_factory() as session:
                session.dashboard_documents.update_workflow_result(
                    dashboard_id, document_id, "{}", json.dumps([]), json.dumps({}),
                    status="failed", error_message=error_message, error_type="API_FAILURE",
                )

        with self.db_session_factory() as session:
            row = session.dashboard_documents.get_workflow_result(dashboard_id, document_id)
        return campaign_service._dashboard_document_row(row)



    async def run_text(
        self,
        workflow_id: str,
        workspace_id: str,
        user_id: str,
        name: str,
        source_text: str,
        source: WorkflowSource = "draft",
        version: int | None = None,
        rerun: bool = False,
    ) -> tuple[DashboardRow, DashboardDocumentRow]:
        dashboard = self.get_or_create_dashboard(workflow_id, workspace_id, user_id, source, version)
        doc_id = self._create_text_document(name, source_text, user_id, workspace_id, replace_existing=rerun)
        with self.db_session_factory() as session:
            existing = session.dashboard_documents.get(dashboard.id, doc_id)
            if existing and not rerun:
                raise HTTPException(status_code=409, detail={"message": "This name already exists in the workflow dashboard.", "dashboard_id": dashboard.id, "document_id": doc_id})
            session.dashboard_documents.create_or_update(dashboard.id, doc_id, "{}", "pending", current_step=0, total_steps=3)
            dash_row = session.dashboards.get_by_id(dashboard.id)
            definition = json.loads(dash_row["workflow_definition_json"])

        row = await self._execute_document(dashboard.id, doc_id, definition, user_id=user_id)
        return dashboard, row

    async def run_uploaded_files(
        self,
        workflow_id: str,
        workspace_id: str,
        user_id: str,
        files: list[UploadFile],
        source: WorkflowSource = "draft",
        version: int | None = None,
        rerun_filenames: set[str] | None = None,
    ) -> tuple[DashboardRow, list[DashboardDocumentRow], list[str]]:
        dashboard = self.get_or_create_dashboard(workflow_id, workspace_id, user_id, source, version)
        rerun_filenames = rerun_filenames or set()
        rows: list[DashboardDocumentRow] = []
        skipped: list[str] = []
        with self.db_session_factory() as session:
            dash_row = session.dashboards.get_by_id(dashboard.id)
            definition = json.loads(dash_row["workflow_definition_json"])
        
        pending_doc_ids = []
        for file in files:
            filename = file.filename or "workflow-upload.txt"
            ext = Path(filename).suffix.lower().lstrip(".")
            if ext not in ALLOWED_EXTENSIONS:
                skipped.append(filename)
                continue
            content = await file.read()
            if not content or len(content) > MAX_FILE_SIZE_BYTES:
                skipped.append(filename)
                continue
            text = extract_text(content, file.content_type or "text/plain", filename=filename)
            doc_id = self._create_text_document(filename, text, user_id, workspace_id, replace_existing=filename in rerun_filenames)
            with self.db_session_factory() as session:
                existing = session.dashboard_documents.get(dashboard.id, doc_id)
                if existing and filename not in rerun_filenames:
                    skipped.append(filename)
                    continue
                session.dashboard_documents.create_or_update(dashboard.id, doc_id, "{}", "pending", current_step=0, total_steps=3)
                pending_doc_ids.append(doc_id)
                
                row = session.dashboard_documents.get_workflow_result(dashboard.id, doc_id)
                if row:
                    rows.append(campaign_service._dashboard_document_row(row))

        if pending_doc_ids:
            async def _exec_task():
                for doc_id in pending_doc_ids:
                    try:
                        await self._execute_document(dashboard.id, doc_id, definition, user_id=user_id)
                    except Exception:
                        logger.exception("Background execution failed for uploaded file document %s", doc_id)

            from app.services.coding_service import coding_service
            coding_service.schedule_coroutine(_exec_task())

        return dashboard, rows, skipped

    async def run_existing_documents(
        self,
        workflow_id: str,
        workspace_id: str,
        user_id: str,
        document_ids: list[str],
        source: WorkflowSource = "draft",
        version: int | None = None,
        rerun_document_ids: set[str] | None = None,
        retry_model: str | None = None,
    ) -> tuple[DashboardRow, list[DashboardDocumentRow], list[str]]:
        dashboard = self.get_or_create_dashboard(workflow_id, workspace_id, user_id, source, version)
        rerun_document_ids = rerun_document_ids or set()
        rows: list[DashboardDocumentRow] = []
        skipped: list[str] = []
        with self.db_session_factory() as session:
            dash_row = session.dashboards.get_by_id(dashboard.id)
            definition = json.loads(dash_row["workflow_definition_json"])
        
        pending_doc_ids = []
        for doc_id in document_ids:
            doc = document_service.get_document(None, doc_id)
            if not doc:
                skipped.append(doc_id)
                continue
            with self.db_session_factory() as session:
                existing = session.dashboard_documents.get(dashboard.id, doc_id)
                if existing and doc_id not in rerun_document_ids and not retry_model:
                    skipped.append(doc.filename)
                    continue
                
                coded_vals_str = "{}"
                if existing:
                    coded_vals_str = existing.get("coded_values") or "{}"
                    try:
                        coded_vals = json.loads(coded_vals_str) if isinstance(coded_vals_str, str) else (coded_vals_str or {})
                    except Exception:
                        coded_vals = {}
                    if retry_model:
                        m_data = coded_vals.get(retry_model) or {}
                        m_data["status"] = "pending"
                        m_data["error_message"] = None
                        coded_vals[retry_model] = m_data
                    else:
                        for model_key, model_run in list(coded_vals.items()):
                            if isinstance(model_run, dict) and model_run.get("status") in ["failed", "suspended_limit", "pending"]:
                                model_run["status"] = "pending"
                                model_run["error_message"] = None
                                coded_vals[model_key] = model_run
                    coded_vals_str = json.dumps(coded_vals)

                session.dashboard_documents.create_or_update(dashboard.id, doc_id, coded_vals_str, "pending", current_step=0, total_steps=3)
                pending_doc_ids.append(doc_id)
                
                row = session.dashboard_documents.get_workflow_result(dashboard.id, doc_id)
                if row:
                    rows.append(campaign_service._dashboard_document_row(row))

        if pending_doc_ids:
            async def _exec_task():
                for doc_id in pending_doc_ids:
                    try:
                        await self._execute_document(
                            dashboard.id,
                            doc_id,
                            definition,
                            user_id=user_id,
                            retry_model=retry_model,
                        )
                    except Exception:
                        logger.exception("Background execution failed for existing document %s", doc_id)

            from app.services.coding_service import coding_service
            coding_service.schedule_coroutine(_exec_task())

        return dashboard, rows, skipped

    async def run_existing_documents_for_dashboard(
        self,
        dashboard_id: str,
        workflow_id: str,
        workspace_id: str,
        user_id: str,
        document_ids: list[str],
        source: WorkflowSource = "draft",
        version: int | None = None,
        rerun_document_ids: set[str] | None = None,
        retry_model: str | None = None,
    ) -> tuple[DashboardRow, list[DashboardDocumentRow], list[str]]:
        """Run workflow documents while persisting results onto an existing dashboard row."""
        rerun_document_ids = rerun_document_ids or set()
        rows: list[DashboardDocumentRow] = []
        skipped: list[str] = []

        with self.db_session_factory() as session:
            dash_row = session.dashboards.get_by_id(dashboard_id)
            if not dash_row:
                raise HTTPException(status_code=404, detail="Dashboard not found.")

            definition_json = dash_row.get("workflow_definition_json")
            if not definition_json:
                workflow = session.workflows.get_by_id(workflow_id)
                if not workflow:
                    raise HTTPException(status_code=404, detail="Workflow not found.")
                definition_json = workflow["draft_definition"]
                session.dashboards.update(
                    dashboard_id,
                    {
                        "workflow_id": workflow_id,
                        "workflow_source": source,
                        "workflow_version": version if source == "published" else None,
                        "workflow_revision": workflow["revision"],
                        "workflow_definition_json": definition_json,
                    },
                )

            definition = json.loads(definition_json) if isinstance(definition_json, str) else (definition_json or {})

        pending_doc_ids = []
        for doc_id in document_ids:
            doc = document_service.get_document(None, doc_id)
            if not doc:
                skipped.append(doc_id)
                continue
            with self.db_session_factory() as session:
                existing = session.dashboard_documents.get(dashboard_id, doc_id)
                if existing and doc_id not in rerun_document_ids and not retry_model:
                    skipped.append(doc.filename)
                    continue
                
                coded_vals_str = "{}"
                if existing:
                    coded_vals_str = existing.get("coded_values") or "{}"
                    try:
                        coded_vals = json.loads(coded_vals_str) if isinstance(coded_vals_str, str) else (coded_vals_str or {})
                    except Exception:
                        coded_vals = {}
                    if retry_model:
                        m_data = coded_vals.get(retry_model) or {}
                        m_data["status"] = "pending"
                        m_data["error_message"] = None
                        coded_vals[retry_model] = m_data
                    else:
                        for model_key, model_run in list(coded_vals.items()):
                            if isinstance(model_run, dict) and model_run.get("status") in ["failed", "suspended_limit", "pending"]:
                                model_run["status"] = "pending"
                                model_run["error_message"] = None
                                coded_vals[model_key] = model_run
                    coded_vals_str = json.dumps(coded_vals)

                session.dashboard_documents.create_or_update(dashboard_id, doc_id, coded_vals_str, "pending", current_step=0, total_steps=3)
                pending_doc_ids.append(doc_id)

                row = session.dashboard_documents.get_workflow_result(dashboard_id, doc_id)
                if row:
                    rows.append(campaign_service._dashboard_document_row(row))

        if pending_doc_ids:
            async def _exec_task():
                for doc_id in pending_doc_ids:
                    try:
                        await self._execute_document(
                            dashboard_id,
                            doc_id,
                            definition,
                            user_id=user_id,
                            retry_model=retry_model,
                        )
                    except Exception:
                        logger.exception("Background execution failed for existing document %s on dashboard %s", doc_id, dashboard_id)

            from app.services.coding_service import coding_service
            coding_service.schedule_coroutine(_exec_task())

        dashboard = campaign_service.get_campaign(dashboard_id)
        return dashboard, rows, skipped

    def get_trace(self, dashboard_id: str, document_id: str) -> DashboardDocumentRow:
        with self.db_session_factory() as session:
            row = session.dashboard_documents.get_workflow_result(dashboard_id, document_id)
        if not row:
            raise HTTPException(status_code=404, detail="Workflow result not found.")
        return campaign_service._dashboard_document_row(row)


workflow_dashboard_service = WorkflowDashboardService()
