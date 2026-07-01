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
    assert project_template["definition"]["metadata"]["seed_version"] == 4
    assert project_template["definition"]["metadata"]["builder"]["kind"] == "discretion_workflow"
    assert project_template["definition"]["metadata"]["builder"]["mode"] == "cascade"
    law_delegation_node = next(node for node in project_template["definition"]["nodes"] if node["id"] == "law_delegation")
    assert [output["key"] for output in law_delegation_node["config"]["outputs"]] == [
        "delegate_law",
        "delegation_rationale",
        "administrative_actors",
        "delegated_authorities",
        "constraints_summary",
        "constraint_strength",
        "delegation_breadth",
        "delegation_centrality",
    ]
    assert any(node["id"] == "discretion_inventory" for node in project_template["definition"]["nodes"])
    assert any(node["id"] == "discretion_decision" for node in project_template["definition"]["nodes"])

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
    assert definition["metadata"]["builder_summary"]["final_outputs"] == [
        {"key": "delegate_law", "label": "Delegate Law", "source": "law_delegation.delegate_law"},
        {"key": "discretion_rank", "label": "Discretion Rank", "source": "discretion_rank"},
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
                delegation_rationale="No new authority.",
                administrative_actors=[],
                delegated_authorities=[],
                constraints_summary="No delegated authority, so constraints are not applicable.",
                constraint_strength="none",
                delegation_breadth="none",
                delegation_centrality="none",
            )

    monkeypatch.setattr("app.workflows.executor.get_llm_for_model", lambda _model=None: FakeLlm())
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
    by_id = {item["node_id"]: item for item in body["trace"]}
    assert "delegation_rationale" in by_id["law_delegation"]["outputs"]
    assert "delegation_rationale" not in body["outputs"]


def test_workflow_test_returns_json_provider_error(client, auth_headers, monkeypatch):
    class FailingLlm:
        async def parse_structured(self, messages, schema, log_context=None):
            raise ValueError("simulated provider failure")

    monkeypatch.setattr("app.workflows.executor.get_llm_for_model", lambda _model=None: FailingLlm())
    workflow = client.post(
        "/api/workflows?workspace_id=QA",
        headers=auth_headers,
        json={"name": "Provider failure test", "template": "law_delegation_discretion_rank"},
    ).json()

    response = client.post(
        f"/api/workflows/{workflow['id']}/test?workspace_id=QA",
        headers=auth_headers,
        json={"source_text": "The law directs an agency to issue rules."},
    )

    assert response.status_code == 502
    assert "simulated provider failure" in response.json()["detail"]


def test_workflow_results_dashboard_persists_text_run_and_trace(client, auth_headers, monkeypatch):
    class FakeLlm:
        async def parse_structured(self, messages, schema, log_context=None):
            if log_context["workflow_node_id"] == "law_delegation":
                return schema(
                    delegate_law=False,
                    delegation_rationale="No new authority.",
                    administrative_actors=[],
                    delegated_authorities=[],
                    constraints_summary="No delegated authority.",
                    constraint_strength="none",
                    delegation_breadth="none",
                    delegation_centrality="none",
                )
            return schema(
                discretion_rank=1,
                discretion_rationale="Unused fallback.",
            )

    monkeypatch.setattr("app.workflows.executor.get_llm_for_model", lambda _model=None: FakeLlm())
    workflow = client.post(
        "/api/workflows?workspace_id=QA",
        headers=auth_headers,
        json={"name": "Workflow dashboard test", "template": "law_delegation_discretion_rank"},
    ).json()

    dashboard_response = client.post(
        f"/api/workflows/{workflow['id']}/results-dashboard?workspace_id=QA",
        headers=auth_headers,
        json={"source": "draft"},
    )
    assert dashboard_response.status_code == 200
    dashboard = dashboard_response.json()
    assert dashboard["dashboard_type"] == "workflow"
    assert [field["name"] for field in dashboard["schema"]] == ["delegate_law", "discretion_rank"]
    assert dashboard["schema"][0]["workflow_source"] == "law_delegation.delegate_law"
    assert dashboard["schema"][1]["workflow_source"] == "discretion_rank"

    run_response = client.post(
        f"/api/workflows/{workflow['id']}/results-dashboard/run-text?workspace_id=QA",
        headers=auth_headers,
        json={"source": "draft", "name": "test law", "source_text": "No new agency authority."},
    )
    assert run_response.status_code == 200
    row = run_response.json()["row"]
    assert row["coded_values"]["delegate_law"] is False
    assert row["coded_values"]["discretion_rank"] == 0
    assert row["coded_values"]["delegate_law_reasoning"] == "No new authority."
    assert "delegate_law_history" in row["coded_values"]
    assert row["workflow_trace"]

    duplicate_response = client.post(
        f"/api/workflows/{workflow['id']}/results-dashboard/run-text?workspace_id=QA",
        headers=auth_headers,
        json={"source": "draft", "name": "test law", "source_text": "No new agency authority."},
    )
    assert duplicate_response.status_code == 409

    page_response = client.get(
        f"/api/dashboards/{dashboard['id']}/documents/page?page=1&page_size=50",
        headers=auth_headers,
    )
    assert page_response.status_code == 200
    # workflow_trace should be excluded in pagination
    assert page_response.json()["items"][0].get("workflow_trace") is None

    # Retrieve workflow_trace lazily from the dynamic trace endpoint
    trace_response = client.get(
        f"/api/dashboards/{dashboard['id']}/documents/{row['document_id']}/trace",
        headers=auth_headers,
    )
    assert trace_response.status_code == 200
    assert trace_response.json()["workflow_trace"]


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
