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

