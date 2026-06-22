"""Unit and integration tests for document move (/move) endpoint and service."""
import os
import shutil
import pytest
from app.core.database import get_db_conn
from app.schemas.document import DocumentRow, DocumentStatus
from app.tests.conftest import TEST_USER_ID, make_jwt

def test_move_document_success(client, auth_headers):
    doc_id = "11111111-1111-1111-1111-111111111111"
    chunk_id = "22222222-2222-2222-2222-222222222222"
    # Seed workspace, user, document and chunk in SQLite
    with get_db_conn() as conn:
        conn.execute("INSERT OR IGNORE INTO workspaces (id, name) VALUES ('QA', 'QA');")
        conn.execute(
            "INSERT OR REPLACE INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (?, ?, ?, 1, 1, 1);",
            (TEST_USER_ID, "test@test.com", "mock_hash")
        )
        conn.execute(
            """
            INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (doc_id, TEST_USER_ID, "QA", "old_folder/my_file.txt", f"00000000-0000-0000-0000-000000000001/{doc_id}/old_folder/my_file.txt", 123, "text/plain", "completed")
        )
        conn.execute(
            """
            INSERT INTO document_chunks (id, document_id, user_id, workspace_id, content)
            VALUES (?, ?, ?, ?, ?);
            """,
            (chunk_id, doc_id, TEST_USER_ID, "QA", "some chunk text content")
        )
        conn.commit()

    # Create dummy file in storage to test filesystem movement
    old_full_path = os.path.join("data/storage", f"00000000-0000-0000-0000-000000000001/{doc_id}/old_folder/my_file.txt")
    os.makedirs(os.path.dirname(old_full_path), exist_ok=True)
    with open(old_full_path, "w") as f:
        f.write("mock content")

    # 2. Call the endpoint
    response = client.patch(
        f"/api/documents/{doc_id}/move",
        json={"new_filename": "new_folder/sub/my_file.txt"},
        headers=auth_headers
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filename"] == "new_folder/sub/my_file.txt"
    assert body["file_path"] == f"00000000-0000-0000-0000-000000000001/{doc_id}/new_folder/sub/my_file.txt"

    # 3. Verify SQLite DB state
    with get_db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT filename, file_path FROM documents WHERE id = ?;", (doc_id,))
        row = cursor.fetchone()
        assert row["filename"] == "new_folder/sub/my_file.txt"
        assert row["file_path"] == f"00000000-0000-0000-0000-000000000001/{doc_id}/new_folder/sub/my_file.txt"

        # Verify chunk references are intact (ON DELETE CASCADE was NOT triggered because we didn't delete, and ID remains same)
        cursor.execute("SELECT count(*) FROM document_chunks WHERE document_id = ?;", (doc_id,))
        assert cursor.fetchone()[0] == 1

    # 4. Verify disk state
    new_full_path = os.path.join("data/storage", f"00000000-0000-0000-0000-000000000001/{doc_id}/new_folder/sub/my_file.txt")
    assert os.path.exists(new_full_path)
    assert not os.path.exists(old_full_path)

    # Clean up test directories
    shutil.rmtree("data/storage/00000000-0000-0000-0000-000000000001", ignore_errors=True)


def test_move_document_duplicate_error(client, auth_headers):
    doc_id_1 = "33333333-3333-3333-3333-333333333333"
    doc_id_2 = "44444444-4444-4444-4444-444444444444"
    # Seed workspace, user, and documents in SQLite
    with get_db_conn() as conn:
        conn.execute("INSERT OR IGNORE INTO workspaces (id, name) VALUES ('QA', 'QA');")
        conn.execute(
            "INSERT OR REPLACE INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (?, ?, ?, 1, 1, 1);",
            (TEST_USER_ID, "test@test.com", "mock_hash")
        )
        conn.execute(
            "INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
            (doc_id_1, TEST_USER_ID, "QA", "folder/file_1.txt", "path_1", 10, "text/plain", "completed")
        )
        conn.execute(
            "INSERT INTO documents (id, user_id, workspace_id, filename, file_path, file_size, content_type, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
            (doc_id_2, TEST_USER_ID, "QA", "folder/file_2.txt", "path_2", 10, "text/plain", "completed")
        )
        conn.commit()

    # Move doc_id_1 to folder/file_2.txt (should fail due to duplicate filename in TEST workspace)
    response = client.patch(
        f"/api/documents/{doc_id_1}/move",
        json={"new_filename": "folder/file_2.txt"},
        headers=auth_headers
    )

    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


def test_move_document_permission_denied(client):
    doc_id = "55555555-5555-5555-5555-555555555555"
    # Seed workspace and user with can_add=0 in SQLite
    with get_db_conn() as conn:
        conn.execute("INSERT OR IGNORE INTO workspaces (id, name) VALUES ('QA', 'QA');")
        conn.execute(
            "INSERT OR REPLACE INTO users (id, email, password_hash, is_admin, can_add, can_delete) VALUES (?, ?, ?, 0, 0, 0);",
            (TEST_USER_ID, "test@test.com", "mock_hash")
        )
        conn.commit()

    headers = {"Authorization": f"Bearer {make_jwt()}"}

    response = client.patch(
        f"/api/documents/{doc_id}/move",
        json={"new_filename": "some/path.txt"},
        headers=headers
    )

    assert response.status_code == 403
    assert "Permission denied" in response.json()["detail"]
