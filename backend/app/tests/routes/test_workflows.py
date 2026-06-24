def test_workflow_crud_validate_and_publish(client, auth_headers):
    created = client.post(
        "/api/workflows?workspace_id=QA",
        headers=auth_headers,
        json={
            "name": "Delegation workflow",
            "description": "Reusable staged coding method",
            "template": "delegation_discretion",
        },
    )
    assert created.status_code == 201
    workflow = created.json()
    assert workflow["latest_version"] == 0
    assert workflow["definition"]["nodes"]

    listed = client.get("/api/workflows?workspace_id=QA", headers=auth_headers)
    assert listed.status_code == 200
    assert any(item["id"] == workflow["id"] for item in listed.json())

    validated = client.post(
        f"/api/workflows/{workflow['id']}/validate?workspace_id=QA",
        headers=auth_headers,
    )
    assert validated.status_code == 200
    assert validated.json()["valid"] is True

    updated_definition = workflow["definition"]
    updated_definition["nodes"][1]["name"] = "Updated delegation analysis"
    updated = client.patch(
        f"/api/workflows/{workflow['id']}?workspace_id=QA",
        headers=auth_headers,
        json={
            "name": workflow["name"],
            "description": workflow["description"],
            "definition": updated_definition,
            "revision": workflow["revision"],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["revision"] == workflow["revision"] + 1

    published = client.post(
        f"/api/workflows/{workflow['id']}/publish?workspace_id=QA",
        headers=auth_headers,
        json={"changelog": "Initial research workflow"},
    )
    assert published.status_code == 201
    assert published.json()["version"] == 1

    versions = client.get(
        f"/api/workflows/{workflow['id']}/versions?workspace_id=QA",
        headers=auth_headers,
    )
    assert versions.status_code == 200
    assert versions.json()[0]["definition_hash"]


def test_create_project_law_delegation_rank_template(client, auth_headers):
    templates = client.get("/api/workflow-templates?workspace_id=QA", headers=auth_headers)
    assert templates.status_code == 200
    project_template = next(item for item in templates.json() if item["slug"] == "law_delegation_discretion_rank")

    created = client.post(
        "/api/workflows?workspace_id=QA",
        headers=auth_headers,
        json={
            "name": "Law Delegation + Discretion Rank",
            "description": "Project-specific workflow",
            "template_id": project_template["id"],
        },
    )

    assert created.status_code == 201
    definition = created.json()["definition"]
    assert definition["outputs"] == [
        {"key": "delegate_law", "source": "law_delegation.delegate_law", "group": "Final"},
        {"key": "discretion_rank", "source": "discretion_rank", "group": "Final"},
    ]

    validated = client.post(
        f"/api/workflows/{created.json()['id']}/validate?workspace_id=QA",
        headers=auth_headers,
    )
    assert validated.status_code == 200
    assert validated.json()["valid"] is True


def test_workflow_template_crud_duplicate_import_export(client, auth_headers):
    templates = client.get("/api/workflow-templates?workspace_id=QA", headers=auth_headers).json()
    blank = next(item for item in templates if item["slug"] == "blank")

    duplicated = client.post(
        f"/api/workflow-templates/{blank['id']}/duplicate?workspace_id=QA",
        headers=auth_headers,
    )
    assert duplicated.status_code == 201
    duplicate = duplicated.json()
    assert duplicate["name"] == "Blank Workflow Copy"

    exported = client.get(
        f"/api/workflow-templates/{duplicate['id']}/export?workspace_id=QA",
        headers=auth_headers,
    )
    assert exported.status_code == 200
    assert exported.json()["definition"]["nodes"]

    imported = client.post(
        "/api/workflow-templates/import?workspace_id=QA",
        headers=auth_headers,
        json={
            "name": "Imported Blank",
            "description": "Imported from JSON",
            "category": "Imported",
            "definition": exported.json()["definition"],
        },
    )
    assert imported.status_code == 201
    imported_template = imported.json()
    assert imported_template["slug"] == "imported_blank"

    updated_definition = imported_template["definition"]
    updated_definition["nodes"][0]["name"] = "Imported document input"
    updated = client.patch(
        f"/api/workflow-templates/{imported_template['id']}?workspace_id=QA",
        headers=auth_headers,
        json={
            "name": "Imported Blank Updated",
            "description": "Edited in DB",
            "category": "Imported",
            "definition": updated_definition,
            "revision": imported_template["revision"],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["revision"] == imported_template["revision"] + 1

    deleted = client.delete(
        f"/api/workflow-templates/{duplicate['id']}?workspace_id=QA",
        headers=auth_headers,
    )
    assert deleted.status_code == 204


def test_template_update_does_not_mutate_existing_workflow_draft(client, auth_headers):
    templates = client.get("/api/workflow-templates?workspace_id=QA", headers=auth_headers).json()
    blank = next(item for item in templates if item["slug"] == "blank")
    workflow = client.post(
        "/api/workflows?workspace_id=QA",
        headers=auth_headers,
        json={"name": "Copied from blank", "template_id": blank["id"]},
    ).json()

    changed_definition = blank["definition"]
    changed_definition["nodes"][0]["name"] = "Changed template input"
    updated = client.patch(
        f"/api/workflow-templates/{blank['id']}?workspace_id=QA",
        headers=auth_headers,
        json={
            "name": blank["name"],
            "description": blank["description"],
            "category": blank["category"],
            "definition": changed_definition,
            "revision": blank["revision"],
        },
    )
    assert updated.status_code == 200

    reloaded_workflow = client.get(
        f"/api/workflows/{workflow['id']}?workspace_id=QA",
        headers=auth_headers,
    )
    assert reloaded_workflow.status_code == 200
    assert reloaded_workflow.json()["definition"]["nodes"][0]["name"] == "Document input"


def test_workflow_file_test_runs_without_persisting_document(client, auth_headers, monkeypatch):
    class FakeLlm:
        async def parse_structured(self, messages, schema, log_context=None):
            return schema(
                delegate_law=False,
                law_delegation_details={"rationale": "No new authority."},
            )

    monkeypatch.setattr("app.workflows.executor.get_llm", lambda: FakeLlm())
    workflow = client.post(
        "/api/workflows?workspace_id=QA",
        headers=auth_headers,
        json={"name": "File test", "template": "law_delegation_discretion_rank"},
    ).json()

    response = client.post(
        f"/api/workflows/{workflow['id']}/test-file?workspace_id=QA",
        headers=auth_headers,
        files={"file": ("law.txt", b"The law mentions an agency but grants no new authority.", "text/plain")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["outputs"] == {"delegate_law": False, "discretion_rank": 0}
    assert "law_delegation_details" in body["trace"][1]["outputs"]


def test_workflow_update_rejects_stale_revision(client, auth_headers):
    workflow = client.post(
        "/api/workflows?workspace_id=QA",
        headers=auth_headers,
        json={"name": "Revision test", "template": "blank"},
    ).json()
    payload = {
        "name": "Changed once",
        "definition": workflow["definition"],
        "revision": workflow["revision"],
    }
    assert client.patch(f"/api/workflows/{workflow['id']}?workspace_id=QA", headers=auth_headers, json=payload).status_code == 200
    assert client.patch(f"/api/workflows/{workflow['id']}?workspace_id=QA", headers=auth_headers, json=payload).status_code == 409
