import hashlib
import json
import uuid
from typing import List

from fastapi import HTTPException, status

from app.repositories import get_db_session
from app.schemas.workflow import (
    WorkflowCreate,
    WorkflowDefinition,
    WorkflowPublish,
    WorkflowRow,
    WorkflowUpdate,
    WorkflowValidationResult,
    WorkflowVersionRow,
)
from app.workflows.templates import WORKFLOW_TEMPLATES
from app.workflows.validator import validate_workflow_definition


class WorkflowService:
    def __init__(self, db_session_factory=get_db_session):
        self.db_session_factory = db_session_factory

    def _parse_definition(self, raw) -> WorkflowDefinition:
        data = json.loads(raw) if isinstance(raw, str) else (raw or {})
        return WorkflowDefinition.model_validate(data)

    def _to_row(self, row) -> WorkflowRow:
        return WorkflowRow(
            id=row["id"],
            workspace_id=row["workspace_id"],
            name=row["name"],
            description=row["description"],
            status=row["status"],
            definition=self._parse_definition(row["draft_definition"]),
            revision=row["revision"],
            latest_version=row["latest_version"],
            created_by=row["created_by"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _to_version_row(self, row) -> WorkflowVersionRow:
        return WorkflowVersionRow(
            id=row["id"],
            workflow_id=row["workflow_id"],
            version=row["version"],
            definition=self._parse_definition(row["definition_json"]),
            definition_hash=row["definition_hash"],
            changelog=row["changelog"],
            created_by=row["created_by"],
            created_at=row["created_at"],
        )

    def _get_owned(self, session, workflow_id: str, workspace_id: str):
        row = session.workflows.get_by_id(workflow_id)
        if not row or row["workspace_id"] != workspace_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coding workflow not found.")
        return row

    def create(self, payload: WorkflowCreate, workspace_id: str, user_id: str) -> WorkflowRow:
        definition = WORKFLOW_TEMPLATES[payload.template]()
        workflow_id = str(uuid.uuid4())
        with self.db_session_factory() as session:
            row = session.workflows.create(
                workflow_id,
                workspace_id,
                payload.name.strip(),
                payload.description.strip(),
                json.dumps(definition),
                user_id,
            )
        return self._to_row(row)

    def list(self, workspace_id: str) -> List[WorkflowRow]:
        with self.db_session_factory() as session:
            return [self._to_row(row) for row in session.workflows.list_by_workspace(workspace_id)]

    def get(self, workflow_id: str, workspace_id: str) -> WorkflowRow:
        with self.db_session_factory() as session:
            return self._to_row(self._get_owned(session, workflow_id, workspace_id))

    def update(self, workflow_id: str, payload: WorkflowUpdate, workspace_id: str) -> WorkflowRow:
        with self.db_session_factory() as session:
            row = self._get_owned(session, workflow_id, workspace_id)
            if row["revision"] != payload.revision:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This workflow changed in another session. Reload before saving again.",
                )
            updates = {"revision": row["revision"] + 1, "status": "draft"}
            if payload.name is not None:
                updates["name"] = payload.name.strip()
            if payload.description is not None:
                updates["description"] = payload.description.strip()
            if payload.definition is not None:
                updates["draft_definition"] = json.dumps(payload.definition.model_dump())
            updated = session.workflows.update(workflow_id, updates)
        return self._to_row(updated)

    def delete(self, workflow_id: str, workspace_id: str) -> None:
        with self.db_session_factory() as session:
            self._get_owned(session, workflow_id, workspace_id)
            session.workflows.delete(workflow_id)

    def validate(self, workflow_id: str, workspace_id: str) -> WorkflowValidationResult:
        workflow = self.get(workflow_id, workspace_id)
        issues = validate_workflow_definition(workflow.definition.model_dump())
        errors = sum(issue.severity == "error" for issue in issues)
        warnings = sum(issue.severity == "warning" for issue in issues)
        return WorkflowValidationResult(
            valid=errors == 0,
            errors=errors,
            warnings=warnings,
            issues=[issue.to_dict() for issue in issues],
        )

    def publish(self, workflow_id: str, payload: WorkflowPublish, workspace_id: str, user_id: str) -> WorkflowVersionRow:
        validation = self.validate(workflow_id, workspace_id)
        if not validation.valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"message": "Fix workflow validation errors before publishing.", "issues": [issue.model_dump() for issue in validation.issues]},
            )
        with self.db_session_factory() as session:
            row = self._get_owned(session, workflow_id, workspace_id)
            definition_json = json.dumps(json.loads(row["draft_definition"]), sort_keys=True, separators=(",", ":"))
            definition_hash = hashlib.sha256(definition_json.encode("utf-8")).hexdigest()
            version = int(row["latest_version"]) + 1
            version_row = session.workflow_versions.create(
                str(uuid.uuid4()),
                workflow_id,
                version,
                definition_json,
                definition_hash,
                payload.changelog.strip(),
                user_id,
            )
            session.workflows.update(workflow_id, {"status": "published", "latest_version": version})
        return self._to_version_row(version_row)

    def list_versions(self, workflow_id: str, workspace_id: str) -> List[WorkflowVersionRow]:
        with self.db_session_factory() as session:
            self._get_owned(session, workflow_id, workspace_id)
            return [self._to_version_row(row) for row in session.workflow_versions.list_by_workflow(workflow_id)]

    def get_version(self, workflow_id: str, version: int, workspace_id: str) -> WorkflowVersionRow:
        with self.db_session_factory() as session:
            self._get_owned(session, workflow_id, workspace_id)
            row = session.workflow_versions.get(workflow_id, version)
            if not row:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow version not found.")
            return self._to_version_row(row)


workflow_service = WorkflowService()

