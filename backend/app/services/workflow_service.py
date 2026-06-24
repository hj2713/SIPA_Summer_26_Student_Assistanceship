import hashlib
import json
import re
import uuid
from typing import List

from fastapi import HTTPException, status

from app.repositories import get_db_session
from app.schemas.workflow import (
    WorkflowCreate,
    WorkflowDefinition,
    WorkflowPublish,
    WorkflowRow,
    WorkflowTemplateCreate,
    WorkflowTemplateImport,
    WorkflowTemplateRow,
    WorkflowTemplateUpdate,
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

    def _slugify(self, name: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
        return slug or "workflow_template"

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

    def _to_template_row(self, row) -> WorkflowTemplateRow:
        return WorkflowTemplateRow(
            id=row["id"],
            workspace_id=row["workspace_id"],
            slug=row["slug"],
            name=row["name"],
            description=row["description"],
            category=row["category"],
            status=row["status"],
            definition=self._parse_definition(row["definition_json"]),
            revision=row["revision"],
            created_by=row["created_by"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _get_owned(self, session, workflow_id: str, workspace_id: str):
        row = session.workflows.get_by_id(workflow_id)
        if not row or row["workspace_id"] != workspace_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coding workflow not found.")
        return row

    def _get_owned_template(self, session, template_id: str, workspace_id: str):
        row = session.workflow_templates.get_by_id(template_id)
        if not row or row["workspace_id"] != workspace_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow template not found.")
        return row

    def _unique_slug(self, session, workspace_id: str, base_slug: str) -> str:
        slug = base_slug
        suffix = 2
        while session.workflow_templates.get_by_slug(workspace_id, slug):
            slug = f"{base_slug}_{suffix}"
            suffix += 1
        return slug

    def ensure_seed_templates(self, workspace_id: str) -> None:
        seeds = [
            {
                "slug": "blank",
                "name": "Blank Workflow",
                "description": "Start with document input and dashboard output.",
                "category": "System",
                "definition": WORKFLOW_TEMPLATES["blank"](),
            },
            {
                "slug": "law_delegation_discretion_rank",
                "name": "Law Delegation + Discretion Rank",
                "description": "Project workflow with two final outputs and nested Law Delegation audit details.",
                "category": "Project",
                "definition": WORKFLOW_TEMPLATES["law_delegation_discretion_rank"](),
            },
        ]
        with self.db_session_factory() as session:
            for seed in seeds:
                if session.workflow_templates.get_by_slug(workspace_id, seed["slug"]):
                    continue
                session.workflow_templates.create(
                    str(uuid.uuid4()),
                    workspace_id,
                    seed["slug"],
                    seed["name"],
                    seed["description"],
                    seed["category"],
                    json.dumps(seed["definition"]),
                    "system",
                )

    def _resolve_template_definition(self, session, payload: WorkflowCreate, workspace_id: str) -> WorkflowDefinition:
        self.ensure_seed_templates(workspace_id)
        if payload.template_id:
            row = self._get_owned_template(session, payload.template_id, workspace_id)
            return self._parse_definition(row["definition_json"])
        slug = payload.template or "blank"
        row = session.workflow_templates.get_by_slug(workspace_id, slug)
        if row:
            return self._parse_definition(row["definition_json"])
        if slug in WORKFLOW_TEMPLATES:
            return WorkflowDefinition.model_validate(WORKFLOW_TEMPLATES[slug]())
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow template not found.")

    def create(self, payload: WorkflowCreate, workspace_id: str, user_id: str) -> WorkflowRow:
        workflow_id = str(uuid.uuid4())
        with self.db_session_factory() as session:
            definition = self._resolve_template_definition(session, payload, workspace_id)
            row = session.workflows.create(
                workflow_id,
                workspace_id,
                payload.name.strip(),
                payload.description.strip(),
                json.dumps(definition.model_dump()),
                user_id,
            )
        return self._to_row(row)

    def list_templates(self, workspace_id: str) -> List[WorkflowTemplateRow]:
        self.ensure_seed_templates(workspace_id)
        with self.db_session_factory() as session:
            return [self._to_template_row(row) for row in session.workflow_templates.list_by_workspace(workspace_id)]

    def get_template(self, template_id: str, workspace_id: str) -> WorkflowTemplateRow:
        self.ensure_seed_templates(workspace_id)
        with self.db_session_factory() as session:
            return self._to_template_row(self._get_owned_template(session, template_id, workspace_id))

    def create_template(self, payload: WorkflowTemplateCreate | WorkflowTemplateImport, workspace_id: str, user_id: str) -> WorkflowTemplateRow:
        issues = validate_workflow_definition(payload.definition.model_dump())
        errors = [issue for issue in issues if issue.severity == "error"]
        if errors:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"message": "Template definition is invalid.", "issues": [issue.to_dict() for issue in errors]})
        with self.db_session_factory() as session:
            slug = self._unique_slug(session, workspace_id, self._slugify(payload.name))
            row = session.workflow_templates.create(
                str(uuid.uuid4()),
                workspace_id,
                slug,
                payload.name.strip(),
                payload.description.strip(),
                payload.category.strip() or "General",
                json.dumps(payload.definition.model_dump()),
                user_id,
            )
        return self._to_template_row(row)

    def update_template(self, template_id: str, payload: WorkflowTemplateUpdate, workspace_id: str) -> WorkflowTemplateRow:
        with self.db_session_factory() as session:
            row = self._get_owned_template(session, template_id, workspace_id)
            if row["revision"] != payload.revision:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This template changed in another session. Reload before saving again.")
            updates = {"revision": row["revision"] + 1}
            if payload.name is not None:
                updates["name"] = payload.name.strip()
            if payload.description is not None:
                updates["description"] = payload.description.strip()
            if payload.category is not None:
                updates["category"] = payload.category.strip() or "General"
            if payload.status is not None:
                updates["status"] = payload.status
            if payload.definition is not None:
                issues = validate_workflow_definition(payload.definition.model_dump())
                errors = [issue for issue in issues if issue.severity == "error"]
                if errors:
                    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"message": "Template definition is invalid.", "issues": [issue.to_dict() for issue in errors]})
                updates["definition_json"] = json.dumps(payload.definition.model_dump())
            updated = session.workflow_templates.update(template_id, updates)
        return self._to_template_row(updated)

    def delete_template(self, template_id: str, workspace_id: str) -> None:
        with self.db_session_factory() as session:
            self._get_owned_template(session, template_id, workspace_id)
            session.workflow_templates.delete(template_id)

    def duplicate_template(self, template_id: str, workspace_id: str, user_id: str) -> WorkflowTemplateRow:
        with self.db_session_factory() as session:
            source = self._get_owned_template(session, template_id, workspace_id)
            slug = self._unique_slug(session, workspace_id, self._slugify(f"{source['name']} copy"))
            row = session.workflow_templates.create(
                str(uuid.uuid4()),
                workspace_id,
                slug,
                f"{source['name']} Copy",
                source["description"],
                source["category"],
                source["definition_json"],
                user_id,
            )
        return self._to_template_row(row)

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
