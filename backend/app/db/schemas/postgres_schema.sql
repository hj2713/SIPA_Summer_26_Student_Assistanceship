-- PostgreSQL Schema Definition for Law Delegation Platform
-- Compatible with Supabase (port 6543 / 5432) and pgBouncer Transaction Pooling

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Core Tables
CREATE TABLE IF NOT EXISTS workspaces (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    can_add INTEGER NOT NULL DEFAULT 0,
    can_delete INTEGER NOT NULL DEFAULT 0,
    llm_provider VARCHAR(50),
    llm_api_key_encrypted TEXT,
    llm_model VARCHAR(100),
    llm_base_url TEXT,
    llm_key_preference VARCHAR(50) DEFAULT 'USE_PERSONAL_IF_AVAILABLE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_llm_credentials (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    api_key_encrypted TEXT,
    model VARCHAR(100),
    base_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_provider UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
    id VARCHAR(255) PRIMARY KEY,
    workspace_id VARCHAR(255) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member')),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_workspace_user_email UNIQUE (workspace_id, user_email)
);

CREATE TABLE IF NOT EXISTS coding_workflows (
    id VARCHAR(255) PRIMARY KEY,
    workspace_id VARCHAR(255) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived')),
    draft_definition TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    latest_version INTEGER NOT NULL DEFAULT 0,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coding_workflow_templates (
    id VARCHAR(255) PRIMARY KEY,
    workspace_id VARCHAR(255) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    slug VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category VARCHAR(255) NOT NULL DEFAULT 'General',
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
    definition_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, slug)
);

CREATE TABLE IF NOT EXISTS coding_workflow_versions (
    id VARCHAR(255) PRIMARY KEY,
    workflow_id VARCHAR(255) NOT NULL REFERENCES coding_workflows(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    definition_json TEXT NOT NULL,
    definition_hash VARCHAR(255) NOT NULL,
    changelog TEXT NOT NULL DEFAULT '',
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workflow_id, version)
);

CREATE TABLE IF NOT EXISTS dashboards (
    id VARCHAR(255) PRIMARY KEY,
    workspace_id VARCHAR(255) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    prompt TEXT NOT NULL,
    schema TEXT NOT NULL DEFAULT '[]',
    model VARCHAR(255),
    dashboard_type VARCHAR(50) NOT NULL DEFAULT 'campaign',
    workflow_id VARCHAR(255) REFERENCES coding_workflows(id) ON DELETE SET NULL,
    workflow_source VARCHAR(50),
    workflow_version INTEGER,
    workflow_revision INTEGER,
    workflow_definition_json TEXT,
    token_limit INTEGER DEFAULT 2500000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS threads (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'New conversation',
    provider VARCHAR(50) NOT NULL DEFAULT 'openai',
    provider_thread_id VARCHAR(255),
    model VARCHAR(255),
    dashboard_id VARCHAR(255) REFERENCES dashboards(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(255) PRIMARY KEY,
    thread_id VARCHAR(255) NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    provider_response_id VARCHAR(255),
    tokens_input INTEGER,
    tokens_output INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id VARCHAR(255) REFERENCES workspaces(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    content_type VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    content_hash VARCHAR(255),
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (workspace_id, filename)
);

CREATE TABLE IF NOT EXISTS document_chunks (
    id VARCHAR(255) PRIMARY KEY,
    document_id VARCHAR(255) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id VARCHAR(255) REFERENCES workspaces(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dashboard_documents (
    dashboard_id VARCHAR(255) NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    document_id VARCHAR(255) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    coded_values TEXT NOT NULL DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    error_type VARCHAR(50) CHECK(error_type IN ('API_FAILURE', 'COMPREHENSION_FAILURE', 'EXTRACTION_FAILURE')),
    current_step INTEGER DEFAULT 0,
    total_steps INTEGER DEFAULT 7,
    workflow_trace TEXT,
    workflow_context TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (dashboard_id, document_id)
);

CREATE TABLE IF NOT EXISTS workflow_jobs (
    id VARCHAR(255) PRIMARY KEY,
    dedupe_key TEXT NOT NULL UNIQUE,
    dashboard_id VARCHAR(255) NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    document_id VARCHAR(255) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workflow_id VARCHAR(255) NOT NULL REFERENCES coding_workflows(id) ON DELETE CASCADE,
    workspace_id VARCHAR(255) REFERENCES workspaces(id) ON DELETE CASCADE,
    source VARCHAR(50) NOT NULL DEFAULT 'draft',
    version INTEGER,
    retry_model TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'processing', 'completed', 'failed', 'canceled')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    payload_json TEXT NOT NULL DEFAULT '{}',
    queued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    heartbeat_at TIMESTAMP WITH TIME ZONE,
    locked_by TEXT,
    locked_until TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS workspace_llm_credentials (
    id VARCHAR(255) PRIMARY KEY,
    workspace_id VARCHAR(255) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    api_key_encrypted TEXT,
    model VARCHAR(100),
    base_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_workspace_provider UNIQUE (workspace_id, provider)
);

CREATE TABLE IF NOT EXISTS llm_usage_logs (
    id VARCHAR(255) PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
    workspace_id VARCHAR(255) REFERENCES workspaces(id) ON DELETE SET NULL,
    provider VARCHAR(255) NOT NULL,
    model VARCHAR(255) NOT NULL,
    service VARCHAR(255) NOT NULL,
    campaign_id VARCHAR(255) REFERENCES dashboards(id) ON DELETE SET NULL,
    thread_id VARCHAR(255) REFERENCES threads(id) ON DELETE SET NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    calculated_cost DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    key_level_used VARCHAR(50) DEFAULT 'system'
);

-- 3. Defensive Schema Migrations (Safe for existing databases)
ALTER TABLE users ADD COLUMN IF NOT EXISTS llm_key_preference VARCHAR(50) DEFAULT 'USE_PERSONAL_IF_AVAILABLE';
ALTER TABLE llm_usage_logs ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);
ALTER TABLE llm_usage_logs ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(255);
ALTER TABLE llm_usage_logs ADD COLUMN IF NOT EXISTS key_level_used VARCHAR(50) DEFAULT 'system';
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS model VARCHAR(255);
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS dashboard_type VARCHAR(50) NOT NULL DEFAULT 'campaign';
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS workflow_id VARCHAR(255) REFERENCES coding_workflows(id) ON DELETE SET NULL;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS workflow_source VARCHAR(50);
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS workflow_version INTEGER;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS workflow_revision INTEGER;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS workflow_definition_json TEXT;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS token_limit INTEGER DEFAULT 2500000;
ALTER TABLE dashboard_documents ADD COLUMN IF NOT EXISTS workflow_trace TEXT;
ALTER TABLE dashboard_documents ADD COLUMN IF NOT EXISTS workflow_context TEXT;
ALTER TABLE workspace_memberships ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'member';
ALTER TABLE workspace_memberships ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);

-- 4. Performance Indexes
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

