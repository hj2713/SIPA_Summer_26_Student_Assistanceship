-- SQLite Schema Definition for Law Delegation Platform
-- Used for fast, zero-dependency local testing and test suite isolation

CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    can_add INTEGER NOT NULL DEFAULT 0,
    can_delete INTEGER NOT NULL DEFAULT 0,
    llm_provider TEXT,
    llm_api_key_encrypted TEXT,
    llm_model TEXT,
    llm_base_url TEXT,
    llm_key_preference TEXT DEFAULT 'USE_PERSONAL_IF_AVAILABLE',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS user_llm_credentials (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    api_key_encrypted TEXT,
    model TEXT,
    base_url TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(user_id, provider)
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member')),
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(workspace_id, user_email)
);

CREATE TABLE IF NOT EXISTS coding_workflows (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived')),
    draft_definition TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    latest_version INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS coding_workflow_templates (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'General',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
    definition_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(workspace_id, slug)
);

CREATE TABLE IF NOT EXISTS coding_workflow_versions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES coding_workflows(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    definition_json TEXT NOT NULL,
    definition_hash TEXT NOT NULL,
    changelog TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(workflow_id, version)
);

CREATE TABLE IF NOT EXISTS dashboards (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    prompt TEXT NOT NULL,
    schema TEXT NOT NULL DEFAULT '[]',
    model TEXT,
    dashboard_type TEXT NOT NULL DEFAULT 'campaign',
    workflow_id TEXT REFERENCES coding_workflows(id) ON DELETE SET NULL,
    workflow_source TEXT,
    workflow_version INTEGER,
    workflow_revision INTEGER,
    workflow_definition_json TEXT,
    token_limit INTEGER DEFAULT 2500000,
    created_by TEXT DEFAULT 'test@test.com',
    campaign_flow TEXT DEFAULT 'RAG Structured Extraction Flow',
    is_frozen INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New conversation',
    provider TEXT NOT NULL DEFAULT 'openai',
    provider_thread_id TEXT,
    model TEXT,
    dashboard_id TEXT REFERENCES dashboards(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    provider_response_id TEXT,
    tokens_input INTEGER,
    tokens_output INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    content_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    content_hash TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (workspace_id, filename)
);

CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS dashboard_documents (
    dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    coded_values TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    error_type TEXT CHECK(error_type IN ('API_FAILURE', 'COMPREHENSION_FAILURE', 'EXTRACTION_FAILURE')),
    current_step INTEGER DEFAULT 0,
    total_steps INTEGER DEFAULT 7,
    workflow_trace TEXT,
    workflow_context TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (dashboard_id, document_id)
);

CREATE TABLE IF NOT EXISTS workflow_jobs (
    id TEXT PRIMARY KEY,
    dedupe_key TEXT NOT NULL UNIQUE,
    dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workflow_id TEXT NOT NULL REFERENCES coding_workflows(id) ON DELETE CASCADE,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'draft',
    version INTEGER,
    retry_model TEXT,
    status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'processing', 'completed', 'failed', 'canceled')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    payload_json TEXT NOT NULL DEFAULT '{}',
    queued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    started_at TEXT,
    completed_at TEXT,
    heartbeat_at TEXT,
    locked_by TEXT,
    locked_until TEXT,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS workspace_llm_credentials (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    api_key_encrypted TEXT,
    model TEXT,
    base_url TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(workspace_id, provider)
);

CREATE TABLE IF NOT EXISTS llm_usage_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    service TEXT NOT NULL,
    campaign_id TEXT REFERENCES dashboards(id) ON DELETE SET NULL,
    thread_id TEXT REFERENCES threads(id) ON DELETE SET NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    calculated_cost REAL NOT NULL DEFAULT 0.0,
    key_level_used TEXT DEFAULT 'system'
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_threads_user_updated ON threads (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON messages (thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON document_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents (user_id);
CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents (workspace_id);
CREATE INDEX IF NOT EXISTS idx_chunks_workspace ON document_chunks (workspace_id);
CREATE INDEX IF NOT EXISTS idx_dashboards_workspace ON dashboards (workspace_id);
CREATE INDEX IF NOT EXISTS idx_dash_docs_dashboard ON dashboard_documents (dashboard_id);
CREATE INDEX IF NOT EXISTS idx_dash_docs_document ON dashboard_documents (document_id);
CREATE INDEX IF NOT EXISTS idx_workflow_jobs_status ON workflow_jobs (status, queued_at);
CREATE INDEX IF NOT EXISTS idx_workflow_jobs_dashboard ON workflow_jobs (dashboard_id);
CREATE INDEX IF NOT EXISTS idx_workflows_workspace ON coding_workflows (workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_workspace ON coding_workflow_templates (workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow ON coding_workflow_versions (workflow_id, version DESC);
