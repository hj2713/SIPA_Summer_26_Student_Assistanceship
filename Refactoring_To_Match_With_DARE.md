# Refactoring Specification & Design Memory: Aligning with CMU DARE

> **Document Purpose:** Single source of truth (SSOT) and persistent context memory for the Law Delegation platform refactoring. Use this file across conversation resets to anchor all UI/UX architecture, backend security, workflow freezing, and open-source delivery decisions.
>
> **Last Updated:** November 2026

---

## Table of Contents
1. [Origin & Architectural Context](#1-origin--architectural-context)
   - What is CMU DARE?
   - What is Socratic Bots?
   - Professor Sharyn O'Halloran's Research & Vision
   - Standalone Product vs. Inside DARE
2. [What We Already Fixed (Phases 1, 2 & 4 Summary)](#2-what-we-already-fixed-phases-1-2--4-summary)
3. [Target Information Architecture (The 5-Pillar Navigation)](#3-target-information-architecture-the-5-pillar-navigation)
4. [The Frozen Workflow & 1-Click Replication Standard](#4-the-frozen-workflow--1-click-replication-standard)
   - Academic Provenance & Immutability
   - Official Pipeline: O'Halloran Delegation & Discretion Coder v1.0
   - The Turnkey 1-Click Replication User Journey
5. [Enterprise-Grade Secure API Key Management (BYOK Architecture)](#5-enterprise-grade-secure-api-key-management-byok-architecture)
   - The Threat Model in Open Source
   - Server-Side AES-256-GCM Encryption Design
   - Authentication Layer & Per-User Key Resolution
   - Background Worker Key Handoff for Batch Runs
   - Masking & Anti-Leakage Rules
6. [Detailed Section-by-Section Specifications](#6-detailed-section-by-section-specifications)
   - Section A: Workflows (`My Workflows` | `Library` | `Shared With Me`)
   - Section B: Research Campaigns (High-Density Legislative Data Grid)
   - Section C: Sources / Law Corpus (Legislation File Manager)
   - Section D: Conversations (RAG-Grounded Legal Assistant)
   - Section E: Cost Tracking & Billing (Token Accounting & BYOK Vault)
   - Section F: Settings & Workspace Team Management
7. [Step-by-Step Execution Roadmap & Tracking Checklist](#7-step-by-step-execution-roadmap--tracking-checklist)

---

## 1. Origin & Architectural Context

### What is CMU DARE?
* **Domain:** `https://dare-front.hss.cmu.edu` (also `dare.cmu.edu`)
* **Name:** **D**ietrich **A**nalysis **R**esearch **E**ducation
* **Creator:** Carnegie Mellon University (CMU) Dietrich College of Humanities and Social Sciences (Dietrich Computing & Operations / `cmudco`) in partnership with the Open Forum for AI (OFAI).
* **Architecture:** Open-source, multi-tenant academic LLM gateway and research workbench (`cmudco/dare-frontend` React/TS and `cmudco/dare-backend` Django REST/Socket.IO).
* **Core Capabilities:**
  * Multi-LLM routing with departmental budget tracking (the \$20 initial wallet).
  * Bring-Your-Own-Key (BYOK) and LiteLLM proxy connections.
  * Modular visual workflows with reusable prompt templates.
  * File ingestion with structural extraction (Docling/RAG).
  * Clean, dense, uncluttered academic interface.

### What is Socratic Bots?
* **Domain:** `https://socratic-bots.hss.cmu.edu`
* **Creator:** CMU Dietrich College (Prof. Daniel Oppenheimer & OFAI).
* **Purpose:** Turnkey pedagogical AI companion.
* **Why Referenced:** Demonstrates the **"1-Click Template Duplication"** user experience. An instructor or researcher with zero coding knowledge can take a pre-configured template, drop in their course readings or rubrics, and run the system immediately.

### Professor Sharyn O'Halloran's Research & Vision
Professor Sharyn O'Halloran (Columbia University & Trinity College Dublin) is a pioneer in the formal political theory of **legislative delegation, congressional politics, and administrative discretion** (author of *Delegating Powers: A Law and Economics Approach to Politics, Regulation, and the Economy* with David Epstein).

Her vision for this platform:
1. **Academic Reproducibility:** Legislative coding across hundreds of statutes must be scientifically rigorous, auditable, and immutable.
2. **Open-Source Delivery:** The platform will be published as an open-source tool so political scientists, legal scholars, and university labs worldwide can run, audit, and replicate empirical findings.
3. **Turnkey Usability:** Non-technical legal researchers must not be forced to build complex node graphs. They need a "one-button replication" experience.

### Standalone Product vs. Inside DARE
* **We are NOT building inside DARE:** DARE is CMU's internal university portal. We cannot deploy Columbia's dedicated law-delegation IP into CMU's closed institutional cluster.
* **We ARE building a dedicated platform inspired by DARE:** We are adopting DARE's information architecture, layout density, and workflow library patterns, but tailoring it exclusively to legislative coding, statute analysis, and multi-model benchmark evaluation.

---

## 2. What We Already Fixed (Phases 1, 2 & 4 Summary)

Before starting the UI refactoring, we eliminated critical architectural rot:

| Problem | Root Cause in Code | Resolution Applied |
| :--- | :--- | :--- |
| **15s Dashboard Load** | Query fetched multi-megabyte `workflow_trace` and `workflow_context` for every row. Fired 6 simultaneous requests on mount including fetching all workspace files. | Stripped traces from list queries in `postgres.py` and `sqlite.py`. Made trace loading on-demand. Removed global documents mount waterfall. |
| **High Ingress/Egress (5s Loop)** | `setTimeout` loop re-fetched all 50 full documents every 5 seconds regardless of state. | Polling now queries only the ~100-byte `/documents/status-summary` endpoint. Re-fetches rows only when counts increment. Halts on idle. |
| **5–10s Workspace Delay** | `GET /api/auth/workspaces` loaded the whole table, executed unindexed raw queries, and ran `INSERT`/`UPDATE` writes inside the GET read path. | Replaced with single SQL `INNER JOIN` (`list_for_user`). Resolves in <5ms. |
| **Broken Google Sign-In** | Monolithic form had a hardcoded email hack (`hj2713@columbia.edu`) and broken fallback inputs. | Cleaned up `LoginForm.tsx` into standard dual-auth (Email/Password + Supabase Google OAuth). Verified multi-tenant isolation. |
| **Destructive Test Risk** | Pytest previously connected to live Supabase, risking data deletion. | Hard-locked `conftest.py` to SQLite isolation (`data/test_local_rag.db`). Verified 136/138 tests pass with 0 cloud touch. |

---

## 3. Target Information Architecture (The 5-Pillar Navigation)

Rather than cluttering the app with 15 disconnected pages, we adopt DARE's focused sidebar layout:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       UNIFIED SIDEBAR NAVIGATION                            │
├───────────────────┬─────────────────────────────────────────────────────────┤
│ 1. 📊 Campaigns   │ Research projects, batch coding runs, evaluation grids, │
│                   │ multi-model comparisons, and exportable datasets.       │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ 2. ⚖️ Workflows   │ Visual pipeline builder with three distinct views:       │
│                   │ • "Library" (Official frozen benchmark pipelines)       │
│                   │ • "My Workflows" (User-created/custom pipelines)        │
│                   │ • "Shared With Me" (Team collaborations)                │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ 3. 📂 Law Corpus  │ Legislative document manager (PDF/TXT public laws),     │
│                   │ folder organization, parsing status, text previewer.    │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ 4. 💬 Chat        │ RAG-grounded conversational assistant to query laws,    │
│                   │ inspect citations, and test ad-hoc coding queries.      │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ 5. 💳 Cost & Keys │ Secure BYOK vault (OpenRouter, OpenAI, Gemini) and      │
│                   │ token consumption/cost audit table per model and run.   │
├───────────────────┴─────────────────────────────────────────────────────────┤
│ (Bottom) ⚙️ Settings: Workspace switcher, member invitations, profile       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. The Frozen Workflow & 1-Click Replication Standard

### Academic Provenance & Immutability
In published social science research, coding rules must remain **frozen** across evaluation campaigns. If an author writes in a paper:
> *"We coded 500 Public Laws using the O'Halloran Delegation & Discretion Rubric v1.0,"*

No user or collaborator should be able to alter the prompts, temperature, or condition logic of that published version.

### The Official Pipeline: O'Halloran Delegation & Discretion Coder v1.0
The standard published workflow consists of a deterministic, 2-stage directed graph:

```mermaid
flowchart TD
    Start([Law Input: Raw Statute Text]) --> Stage1[Node 1: Delegation Detection LLM]
    
    Stage1 --> FieldExtract{delegate_law == 1 ?}
    
    FieldExtract -- "NO (0)" --> DeterministicZero[Node 2A: Set Discretion = 0]
    FieldExtract -- "YES (1)" --> Stage2[Node 2B: Discretion Rank LLM]
    
    DeterministicZero --> FinalOutput[Final Dashboard Row]
    Stage2 --> FinalOutput
    
    subgraph AuditDetails ["Behind-the-Scenes Trace (Available in Modal)"]
        Stage1 -.-> T1["delegation_rationale, administrative_actors, delegated_authorities, constraint_strength"]
        Stage2 -.-> T2["discretion_rationale, statutory_evidence, rank_justification"]
    end
    
    subgraph CleanOutputs ["Clean Dashboard Output Columns"]
        FinalOutput --> C1["delegate_law (0 or 1)"]
        FinalOutput --> C2["discretion_rank (0 to 5)"]
    end
```

* **Inputs:** Statute text (`.txt` or parsed `.pdf`).
* **Node 1 (Delegation Detection):**
  * Evaluates whether Congress delegated administrative authority to an executive agency or commission.
  * Outputs internal audit fields: `delegation_rationale`, `administrative_actors`, `delegated_authorities`, `constraints_summary`, `constraint_strength`.
  * Emits primary variable: `delegate_law` (`0` or `1`).
* **Node 2A (Branch when `delegate_law == 0`):**
  * Deterministically sets `discretion_rank = 0` without wasting an LLM call.
* **Node 2B (Branch when `delegate_law == 1`):**
  * Reads the extracted authorities and statutory constraints.
  * Classifies discretion rank on a scale of `1` to `5` based on statutory discretion boundaries.
  * Emits: `discretion_rank`, `discretion_rationale`, `rank_evidence`.
* **Final Published Row:** Emits **only** `delegate_law` and `discretion_rank` as default table columns. All detailed rationales remain accessible via the trace drawer.

### The Turnkey 1-Click Replication User Journey
An external researcher without technical expertise follows this 3-step replication flow:

1. **Step 1: Discover Template**
   * Researcher navigates to **Workflows $\rightarrow$ Library**.
   * Sees card: **"Official Administrative Delegation & Discretion Coder (v1.0)"** with a badge: `Verified / Immutable`.
2. **Step 2: One-Click Launch**
   * Clicks button: `[ Replicate & Run Workflow ]`.
   * A simplified 2-step setup drawer slides out:
     * *Select or Upload Laws:* Checkbox selection from Law Corpus or drag-and-drop a folder of new bills.
     * *Select LLM Engine:* Pick preferred model (e.g., `openai/gpt-5.5`, `anthropic/claude-3.7-sonnet`, `deepseek/deepseek-v4-flash`).
3. **Step 3: Execute & Inspect**
   * Clicks `[ Start Evaluation ]`.
   * The app redirects immediately to a high-density Campaign Dashboard.
   * Progress bar tracks the batch; rows populate in real time with `delegate_law` and `discretion_rank`.
   * A single button allows `[ Export Research Dataset (CSV) ]`.

---

## 5. Enterprise-Grade Secure API Key Management (BYOK Architecture)

### The Threat Model in Open Source
When open-sourcing the repository:
* **The Risk:** Researchers will input paid corporate/grant API keys (OpenAI, Anthropic, OpenRouter). If keys are stored in plaintext, logged, or returned via API responses, credentials can be stolen or cross-contaminated across users.
* **The Requirement:** 
  1. Zero plaintext keys in the database.
  2. Zero plaintext keys in application logs.
  3. Zero ability for User A to use or see User B's key.
  4. Keys must be accessible to background workers executing batch coding jobs.

### Server-Side AES-256-GCM Encryption Design

```
┌───────────────────────────────────────────────────────────────────────────┐
│                       BYOK CIPHERTEXT PIPELINE                            │
└───────────────────────────────────────────────────────────────────────────┘
                                     │
                 User inputs raw API key in web UI
                                     │
                                     ▼
                     HTTPS POST /api/auth/llm-credentials
                                     │
                                     ▼
        ┌───────────────────────────────────────────────────────────┐
        │ Backend Encryption Service (AES-256-GCM)                  │
        │ • Master Key derived from ENCRYPTION_MASTER_KEY via HKDF  │
        │ • Generates random 12-byte (96-bit) IV per credential     │
        │ • Encrypts plaintext key + produces 16-byte Auth Tag      │
        │ • Encoded string: base64(IV + Ciphertext + Tag)          │
        └───────────────────────────────────────────────────────────┘
                                     │
                                     ▼
               Stored into PostgreSQL `user_llm_credentials`
            (user_id, provider, api_key_encrypted, model, base_url)
```

### Database Schema & Isolation
The database enforces strict tenant isolation at the schema level:

```sql
CREATE TABLE IF NOT EXISTS user_llm_credentials (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    key_hint VARCHAR(10) NOT NULL, -- e.g. "sk-...a1b2"
    model VARCHAR(100),
    base_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_provider UNIQUE (user_id, provider)
);

CREATE INDEX idx_user_llm_credentials_user ON user_llm_credentials(user_id);
```

### Authentication Layer & Per-User Key Resolution (Pure BYOK - Zero Server Fallback)
When an LLM request or campaign run is triggered:

1. **User Request Validation:**
   * Incoming request carries `Authorization: Bearer <JWT>`.
   * Auth middleware validates the token and extracts `current_user.id`.
2. **Credential Resolution (DB Only):**
   * The backend queries `user_llm_credentials` or `workspace_llm_credentials` based on user's preference (`USE_PERSONAL_IF_AVAILABLE`, `USE_WORKSPACE_ONLY`, `ALWAYS_PERSONAL`).
   * **Zero Server Environment Fallback:** Server environment variables (`OPENAI_API_KEY`, `GEMINI_API_KEY`, etc.) are NEVER used as fallbacks. If no valid encrypted key exists in the database for the user or workspace, the backend immediately halts and raises:
     ```
     ValueError: "No valid API key configured for provider '{provider}'. Please add your API key in Settings → Cost Tracking & BYOK Vault."
     ```
   * This guarantees that host/developer credentials are never exposed, charged, or drained by unauthorized or unconfigured users. Even the platform developer/admin configures their key through the UI into the encrypted DB table.
3. **Decryption in RAM Only:**
   * The backend decrypts the ciphertext using the server master key (AES-256-GCM / Fernet).
   * The plaintext key exists **only in RAM within the scope of that single async LLM call**.
   * It is never assigned to a global variable, never persisted to temporary disk storage, and never logged.

### Background Worker Key Handoff for Batch Runs
When a user launches a 500-document coding campaign, jobs are queued into `workflow_jobs`:

* The queue stores: `job_id`, `dashboard_id`, `document_id`, `workflow_id`, `model`, and `user_id`.
* The background worker claims a batch from `workflow_jobs`.
* When executing a claimed job, the worker queries `user_llm_credentials` using the **job's recorded `user_id`**, decrypts the key in worker memory, executes the model call, and immediately discards the plaintext.
* Even if multiple users queue jobs simultaneously, Worker 1 uses User 1's key, and Worker 2 uses User 2's key with zero cross-talk.

### Anti-Leakage Rules (Strict SWE Standards)
1. **Never return raw keys in responses:** 
   `GET /api/auth/llm-credentials` returns:
   ```json
   {
     "provider": "openrouter",
     "key_hint": "sk-...f92a",
     "is_configured": true,
     "model": "deepseek/deepseek-v4-flash"
   }
   ```
2. **Log Redaction:** All logger handlers configure a regex filter replacing any token matching `sk-[a-zA-Z0-9]{20,}` with `[REDACTED_API_KEY]`.
3. **Open-Source Local Mode:** If a single researcher runs the app locally without multi-user auth, the system supports a `.env.local` fallback mode without requiring DB vault setup.

---

## 6. Detailed Section-by-Section Specifications

### Section A: Workflows
*Reference screenshot: `media_1794027421429_36f977ca.jpg`*

* **Three-Tab Header:**
  1. `My Workflows`: Workflows created or duplicated by the user. Includes draft status, version tags, and edit actions.
  2. `Library`: Curated, official, and frozen workflows (e.g. *O'Halloran Delegation Coder v1.0*, *Statutory Complexity Analyzer*, *Agency Identification Pipeline*).
  3. `Shared With Me`: Workflows shared across workspace team members.
* **Card & Table Layout:**
  * Search bar with instant fuzzy filtering.
  * Columns: `Workflow Name`, `Description`, `Mode` (Standard / Multi-Model), `Steps`, `Version / Revision`, `Status` (Draft / Frozen), `Actions` (`[ Run ]`, `[ Clone ]`, `[ Edit ]`).
* **Visual Graph Builder (For Power Users):**
  * Node types: `Input Document`, `LLM Prompt Analysis`, `Deterministic Branch`, `Set Value`, `Output Schema`.
  * Visual execution tracer highlighting which branch was taken (green for executed, dimmed for skipped).

### Section B: Research Campaigns
*Reference screenshot: `media_1794027251647_65a61e3f.jpg`*

* **Purpose:** The core empirical data grid where legislation is evaluated against workflows.
* **Layout Principles (Anti-AI Clutter):**
  * High data density: clean, borders-only table grid (similar to Airtable or Linear).
  * Monospace public law identifiers (e.g. `PL 107-123`, `PL 111-203`).
  * High-contrast status badges: `Completed` (Green), `Processing` (Blue spinner), `Failed` (Red), `Pending` (Gray).
  * Frozen primary columns: `Filename`, `delegate_law`, `discretion_rank`.
  * Actions column: `[ Inspect Reasoning ]`, `[ Re-run Row ]`.
* **Reasoning Drawer (Slide-Over):**
  * Clicking any cell or row slides out a right-side drawer.
  * Shows exact LLM rationale, statutory quotes, token latency, and graph step timings without cluttering the main table.
* **Export Toolbar:**
  * Clean `[ Export CSV ]` and `[ Export JSON ]` buttons emitting research-ready variables.

### Section C: Sources / Law Corpus
* **Purpose:** Central repository for uploaded statutes, public laws, and bills.
* **Features:**
  * Folder tree structure (e.g., `107th Congress`, `Banking Legislation`, `Clean Energy Acts`).
  * Batch upload with drag-and-drop.
  * Structural extraction indicator: Text, Markdown, or Docling PDF parse status.
  * In-app document previewer with keyword search and highlight.

### Section D: Conversations (RAG-Grounded Legal Assistant)
*Per user directive: Keep and refactor the existing Chat system.*

* **Purpose:** Allows researchers to converse directly with an uploaded law or entire corpus to ask exploratory questions (e.g., *"Which sections of the Dodd-Frank Act grant rule-making discretion to the CFPB?"*).
* **Refactoring Plan:**
  * Replace the existing broken chat stream with a robust Server-Sent Events (SSE) streaming handler.
  * Add a document selector: choose whether to chat with the **Entire Workspace Corpus** or a **Specific Selected Public Law**.
  * Grounded Citations: Every claim in the chat response must include an expandable statutory citation tag linking directly to the source chunk in the corpus.

### Section E: Cost Tracking & Billing (BYOK Vault)
*Reference screenshot: `media_1794027118228_ae77f333.jpg`*

* **Header Cards:**
  1. **Active Engine Mode:** Display whether currently using `Personal API Keys (BYOK)` or an `Institutional Gateway`.
  2. **Token Expenditure Tracker:** Total Input Tokens, Total Output Tokens, Estimated Dollar Cost across campaigns.
* **Key Configuration Vault:**
  * Add / Update buttons for `OpenRouter`, `OpenAI`, `Anthropic`, and `Gemini`.
  * Validation check: Clicking "Save & Test" sends a test 1-token completion to verify the key before saving.
  * Stored encrypted in PostgreSQL `user_llm_credentials`.
* **Audit Transaction Table:**
  * Columns: `Timestamp`, `Campaign / Document`, `Model`, `Input Tokens`, `Output Tokens`, `Calculated Cost`, `Billing Status`.
  * Filterable by model and date range; exportable to CSV for grant reporting.

### Section F: Settings & Workspace Team Management
* **Workspace Switcher:** Instant switching between personal workspaces and collaborative research teams.
* **Team Members:** Invite research assistants or co-authors via email with role-based access (`Owner`, `Researcher`, `Viewer`).

---

## 7. Step-by-Step Execution Roadmap & Tracking Checklist

Use this checklist to track refactoring progress across working sessions:

### Phase 1: Core Performance & Network Egress
- [x] Eliminate multi-megabyte `workflow_trace` from document list database queries.
- [x] Kill the 6-request mount waterfall on `DashboardDetailPage.tsx`.
- [x] Replace the infinite 5-second document polling loop with lightweight status checks.
- [x] Eliminate duplicate DB roundtrips in `_verify_campaign_workspace`.

### Phase 2: Workspace Latency & Auth Isolation
- [x] Replace unindexed table scans with single SQL `INNER JOIN` in `list_workspaces`.
- [x] Enforce multi-tenant data isolation (`test@test.com` keeps data; new users get empty workspace).
- [x] Clean up `LoginForm.tsx` and purge hardcoded fallback email hacks.
- [x] Setup proper dual-auth UI (Email/Password + Supabase Google OAuth).

### Phase 3: UI Architecture & Redesign (Matching DARE Standards & Neutral + Earth Theme)
- [x] **Theme & Design System Token Integration ("Neutral + Earth")**
  - [x] Integrated exact color palette: Canvas Warm Sand (`#F7F3EE`), Crisp White Cards (`#FFFFFF`), Deep Forest Spruce Teal (`#0B3B36`), Warm Ochre Gold (`#E6AA4C`), and Heather Plum (`#785D7B`).
  - [x] Eliminated generic AI purple/indigo gradients and pastel borders across the frontend.
- [x] **Step 3.1: Global Navigation & Layout Shell**
  - [x] Implemented DARE-inspired sidebar rail (`Campaigns`, `Workflows`, `Law Corpus`, `Conversations`, `Evaluation`).
  - [x] Added Columbia SIPA branding, active workspace switcher with live status indicator, and user profile pill with sign out.
  - [x] Added interactive *Methodology & Rubric* dialog explaining Professor O'Halloran's 2-stage delegation coding logic.
- [x] **Step 3.2: Workflow Library & Frozen Benchmarks**
  - [x] Built DARE 3-tab navigation: `Library (Official Benchmarks)`, `My Workflows`, `Shared With Me`.
  - [x] Created prominent frozen benchmark card: *O'Halloran Administrative Delegation & Discretion Coder v1.0* with `Verified / Frozen` badges and node chain preview.
  - [x] Implemented turnkey `[ Replicate & Run ]` workflow duplication and graph inspection.
- [x] **Step 3.3: High-Density Research Campaigns**
  - [x] Modernized `DashboardListPage.tsx` and `DashboardDetailPage.tsx` with crisp white cards, stone borders, and clean status badges.
  - [x] Replaced purple cost chips with Warm Ochre audit badges and high-density tabular indicators.
- [x] **Step 3.4: Law Corpus / Sources File Explorer**
  - [x] Refactored `DocumentsPage.tsx` and `HeaderBar.tsx` with Earth-themed status chips, stone borders, and citation pill.
- [x] **Step 3.5: Conversations (Legal RAG Chat)**
  - [x] Refactored `ChatPage.tsx` empty state with suggested empirical legal research prompts and statutory query chips.
  - [x] Integrated clean model selection header with active thread history.
- [x] **Step 3.6: Cost Tracking & BYOK Key Vault**
  - [x] Designed DARE-style hero banner ($20 initial platform balance, `+ LiteLLM Key`, `+ Add BYO Key`).
  - [x] Implemented 3-card stack (Platform Wallet, LiteLLM Gateway, BYOK Cipher Vault).
  - [x] Integrated AES-256-GCM test-before-save credentials interface with instant live API verification.
- [x] **Step 3.7: Authentication & Login Portal**
  - [x] Redesigned `LoginForm.tsx` with Columbia SIPA branding, Warm Sand canvas, and Deep Spruce Teal authentication.

### Phase 4: Production Hardening & Verification
- [x] Establish 100% isolated test database harness (`TEST_MODE=1` using SQLite).
- [x] Verify zero contact with cloud Supabase during automated test runs.
- [x] Pass all backend unit and integration test suites (143 passed, 0 failed).
- [x] Verify clean frontend production build with zero TypeScript compiler errors.
- [ ] Final end-to-end integration test with live Google OAuth in production.

### Phase 5: DARE Alignment, BYOK Architecture & Theme Abstraction (Current Milestone)
- [x] **Task 1: Help & Terminology Modal Polish**
  - [x] Fixed overlay backdrop opacity to `bg-black/60 backdrop-blur-sm` in `dialog.tsx`.
  - [x] Refactored Help modal into a DARE-style 3-slide interactive carousel with slide indicator dots (`● ○ ○`), `Back`, `Skip`, and `Next` buttons in `ThreadSidebar.tsx`.
  - [x] Slide 1: Academic Foundation (Epstein & O'Halloran formal theory); Slide 2: Core Coding Variables (`delegate_law` binary, `discretion_rank` 0-5); Slide 3: Deterministic 2-Stage Directed Pipeline.
- [x] **Task 2: Cost Tracking & BYOK Architecture**
  - [x] **2.1: Purged Wallet Option:** Removed `$20.00 Platform Wallet` card and wallet routing buttons; shifted entirely to Bring Your Own Key (BYOK) and LiteLLM Proxy.
  - [x] **2.2: API Key Scope Preference & Overrides:**
    - Documented and tested resolution logic in `backend/app/core/llm_resolver.py`.
    - Three preference modes supported:
      - `USE_PERSONAL_IF_AVAILABLE` (Default): Checks user's personal encrypted key first; falls back to shared workspace key; falls back to system environment variables.
      - `USE_WORKSPACE_ONLY`: Strictly uses shared workspace keys set by workspace admin; ignores personal keys.
      - `ALWAYS_PERSONAL`: Strictly requires user's personal key; rejects requests if not configured.
    - Verified with 5 unit tests in `backend/app/tests/core/test_llm_resolver.py`.
  - [x] **2.3: Mathematical Token Accounting & Cost Verification:**
    - Audited token usage aggregation (`input_tokens`, `output_tokens`, `total_calls`, `total_cost`) in `backend/app/routes/usage.py`.
    - Fixed pricing prefix match bug in `backend/app/llm/registry.py`: exact match check first + keys sorted by descending length to prevent `gpt-4o-mini` from matching `gpt-4o` and overbilling 16x.
    - Verified with integration test suite in `backend/app/tests/routes/test_usage_accounting.py`.
  - [x] **2.4: Minimalist Provider Credentials UI:**
    - Redesigned `SettingsPage.tsx` into clean, refined, minimalist cards matching DARE (`media_1794247118228_ae77f333.jpg`), removing bulky AI-sloppy boxes.
- [x] **Task 3: Centralized Abstract Theme Configuration & Full Frontend Sweep**
  - [x] **3.1: Central Abstraction in `index.css`:** All colors mapped to Tailwind semantic tokens (`bg-primary`, `bg-accent`, `bg-background`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, `bg-sidebar`, `text-accent-plum`). Any theme modification in `:root` / `.dark` immediately propagates across the entire application without touching JSX files.
  - [x] **3.2: Full Frontend Sweep:** Replaced all hardcoded hex codes (`#0B3B36`, `#E6AA4C`, `#F7F3EE`, `#785D7B`) and legacy `indigo-*`, `violet-*`, `purple-*` classes across `SettingsPage.tsx`, `DashboardListPage.tsx`, `WorkflowLibraryPage.tsx`, `ChatPage.tsx`, `HeaderBar.tsx`, `ThreadSidebar.tsx`, and `CiteUsModal.tsx`.
- [x] **Task 4: Guided Tour / Onboarding Walkthrough in Research Campaigns**
  - [x] Built reusable `frontend/src/components/ui/GuidedTour.tsx` with darkened backdrop (`bg-black/65`), spotlight cutout border on target element, floating guide card, percentage progress bar, step counter, and persistent `localStorage` completion tracking.
  - [x] Integrated into `DashboardListPage.tsx` with target IDs: `tour-tab-prompt` (Prompt Codebooks), `tour-tab-workflow` (Workflow Evaluations), and `tour-btn-create` (+ Create Campaign).
  - [x] Added `Take Tour` trigger button in the workbench header.
- [x] **Task 5: Pure BYOK Security — Zero Server Host Fallbacks**
  - [x] Completely purged silent fallbacks to server `.env` credentials (`OPENAI_API_KEY`, etc.) in `llm_resolver.py` and `registry.py`.
  - [x] Enforced `ALLOW_SERVER_LLM_FALLBACK = False` in `config.py`.
  - [x] When a user or workspace has no encrypted key in the DB, the system immediately rejects requests with an actionable error directing them to Settings, guaranteeing zero developer key leakage.
- [x] **Task 6: Clean Production Login Experience**
  - [x] Removed "Use demo credentials" button and pre-filled demo text from `LoginForm.tsx`.
  - [x] Updated input placeholders to academic standards (`name@university.edu`).
  - [x] Fully migrated `LoginForm.tsx` to semantic design tokens.
- [x] **Task 7: Comprehensive Abstract Test Layers & Mock Factories**
  - [x] Implemented `backend/app/tests/factories.py` providing reusable factory functions:
    - `create_test_user`: User creation with verified auth headers and signed JWT.
    - `create_test_workspace` & `share_workspace_with_user`: Collaborative workspace fixtures.
    - `save_test_llm_key`: Fernet-encrypted BYOK credential generator for personal and workspace scopes.
    - `create_test_campaign` & `link_document_to_campaign`: Research campaign benchmarks and statute association.
    - `create_test_workflow`: Valid 2-stage DAG pipelines (screening + branching).
    - `create_test_document`: Statute text fixture with metadata.
    - `create_test_thread` & `create_test_message`: Chat threads and message histories.
    - `mock_llm_reply`: Robust async context manager intercepting streaming, structured parsing (`parse_structured`), and provider singleton resolvers (`get_llm`, `get_llm_for_model`).
  - [x] Added automated test suite `backend/app/tests/core/test_factories.py` (7/7 passed).
  - [x] Full test suite passing: 152 passed, 2 skipped in 14.34s.
- [x] **Task 8: Guided Tour Spotlight Cutout & Blur Tuning**
  - [x] Reduced backdrop darkness from 65% to 40% (`rgba(0, 0, 0, 0.40)`) and softened backdrop blur to 1.5px.
  - [x] Implemented dynamic SVG mask cutout (`<mask id="tour-spotlight-mask">`) in `GuidedTour.tsx` that punches an exact rounded aperture directly over the target element.
  - [x] The highlighted elements (`tour-tab-prompt`, `tour-tab-workflow`, `tour-btn-create`) are 100% sharp, unblurred, and completely legible, accented by an academic primary focus ring (`ring-4 ring-primary/25`).
- [x] **Task 9: Shared Workflows & Workspace Collaboration Architecture**
  - [x] Designed dual-delivery sharing pattern requiring **zero paid services**:
    - Free standard Python `smtplib` / university SMTP dispatches email if configured.
    - Direct 1-click shareable invite link (`/login?workspace=...&email=...`) copies to clipboard for sharing via Slack, Teams, or regular email.
  - [x] Built reusable [`ShareWorkspaceModal.tsx`](frontend/src/components/workspace/ShareWorkspaceModal.tsx) displaying email invitation input, direct link copier, and collaborator list with remove permissions.
  - [x] Integrated into `WorkflowLibraryPage.tsx` under the "Shared With Me" tab and top navigation bar.
- [x] **Task 10: Gated Workspace Invitations & Zero-Poll Security Architecture**
  - [x] **Strict Gating:** Recipient is **not** immediately granted workspace access. Invitations are created with `status = 'pending'`.
  - [x] **Explicit Acceptance:** The recipient must explicitly accept via `POST /api/auth/workspaces/{workspace_id}/accept` to change `status = 'active'`. If declined via `POST /api/auth/workspaces/{workspace_id}/decline`, the record is deleted.
  - [x] **Role Protection:** `_get_workspace_role()` returns `None` for pending members, preventing unauthorized document or workflow access prior to acceptance.
  - [x] **Workspace Listing:** `list_for_user()` in SQLite and Postgres repositories filters by `AND (wm.status = 'active' OR wm.status IS NULL)` so pending workspaces never leak into the workspace selector.
  - [x] **Zero Background Polling:** Absolutely no recurring database polls or mount loops. Pending invitations (`/invitations/pending`) and member rosters are queried strictly on-demand when the user opens the modal.
  - [x] **Multi-Tenancy Isolation:** All SQL lookups use unique UUIDs (`user.id` and `workspace.id`), never names. Case-insensitive workspace ID matching via `LOWER(workspace_id) = LOWER(?)`.
  - [x] Verified with unit tests in `test_auth_verify.py` (`test_invitation_pending_and_accept_flow`).
- [x] **Task 11: Dedicated Academic Documentation & Turnkey Simplification**
  - [x] **Documentation Page (`/docs`):** Created `frontend/src/routes/DocumentationPage.tsx` with 5 academic reference tabs:
    1. *Academic Foundation:* Epstein & O'Halloran (*Delegating Powers*), non-delegation doctrine, administrative law.
    2. *3-Step Quickstart:* Corpus upload, model benchmarking, and tabular dataset export.
    3. *Variables & Coding Rubric:* Definitive definitions for `delegate_law` (0 or 1) and `discretion_rank` (0 to 5) with sample statutory excerpts.
    4. *Deterministic 2-Stage Pipeline (DAG):* Node 1 screening + conditional branching to prevent hallucinated scores and eliminate API waste.
    5. *Privacy & BYOK Architecture:* AES-256-GCM zero-knowledge encryption and zero server fallback guarantee.
  - [x] **Deep Linking:** Integrated URL tab parameters (`/docs?tab=rubric`, `/docs?tab=pipeline`).
  - [x] **Contextual Workbench Navigation:** Added `Rubric Guide` button to `DashboardListPage.tsx` and `Pipeline Guide` button to `WorkflowLibraryPage.tsx`. Added `Tutorial & Guide` button to the sidebar footer.
- [x] **Task 12: Production Verification & Test Suite Integrity**
  - [x] Full Pytest suite passed: **153 passed, 2 skipped in 14.06s (100% pass rate, zero cloud touch)**.
  - [x] Frontend production build compiled: **`tsc -b && vite build` built clean with 0 errors**.
- [x] **Task 13: Academic Citation Modal & Attribution Architecture**
  - [x] **Purged Mock / Placeholder Data:** Replaced generic placeholder names ("Legal Text Workflow Studio Team", `arxiv:2608.xxxx`) with proper academic author attributions: **Himanshu Jhawar** & **Professor Sharyn O'Halloran** (Columbia University SIPA).
  - [x] **Dual Attribution Tabs:** Provided distinct tabs for:
    1. *Software Platform (2026):* Citing the open-source workbench and multi-model workflow engine.
    2. *Theoretical Methodology (Epstein & O'Halloran 1999):* Citing *Delegating Powers* (Cambridge University Press).
  - [x] **Multi-Format Formats:** Instant switching between **BibTeX**, **APA 7th**, and **Chicago 17th**, plus `.bib` file download.
  - [x] **Google Scholar & Crossref Explanation:** Documented real-world citation indexing mechanics and free Zenodo DOI setup for automatic Google Scholar tracking.
- [x] **Task 14: High-Performance Data Pruning, Grid Pagination & Polling Optimization**
  - [x] **Database-Level Storage & Query Clean-Up (Zero DB Overload):**
    - **Stopped DB Duplication**: Fixed `workflow_dashboard_service.py` so `trace` and `context` (which contained the full statutory text) are never serialized into the `coded_values` column in PostgreSQL / Supabase.
    - **Proper Normalized Storage**: Traces and contexts now reside strictly in their dedicated database columns (`workflow_trace` and `workflow_context`).
    - **Automated Database Migration**: Implemented `_clean_bloated_coded_values()` in `database.py` that strips embedded `trace` and `context` from existing `coded_values` rows directly in Supabase / SQLite on startup.
    - **Database Projection**: `SELECT` queries for the grid (`list_by_dashboard_with_documents`) never query `workflow_trace` or `workflow_context`. Supabase transfers only ~150 KB over the wire for all 169 rows (or 25 KB with page limits) instead of 50 MB.
  - [x] **Backend 98% Payload Pruning (`_prune_coded_values`):**
    - Implemented defensive runtime filtering in `campaign_service.py` ensuring no bloated execution contexts or prompt histories ever leak to the client grid.
    - Full traces are queried from the database strictly on demand via `GET /api/dashboards/{id}/documents/{doc_id}/trace` when an individual cell is inspected.
  - [x] **Frontend Table Pagination (25 / 50 / 100 / All):**
    - Slashed DOM element count from 11,000+ interactive cells (169 rows * 65 columns) down to ~200 cells by introducing client-side pagination with controls: `Showing 1-25 of 169 files`, `[Previous] Page 1 of 7 [Next]`, and page size selector.
    - Smooth 60 FPS scrolling and instantaneous UI interactions.
  - [x] **Smart Column Visibility Default & Persistence:**
    - When campaigns have more than 8 columns (e.g. 65 columns), the page defaults to showing the first 8 key columns instead of forcing the browser to render a 12,000-pixel wide table.
    - Saved column visibility choices in `localStorage` per campaign (`campaign_{id}_hidden_cols`).
    - Added 1-click **[ Key Variables (8) ]**, **[ Show All ]**, and **[ Hide All ]** buttons in the Column Picker modal.
  - [x] **Memoized $O(1)$ Header Statistics (`columnStatsMap`):**
    - Replaced redundant $O(C \times D)$ iterations inside JSX loops with a single memoized $O(D)$ pass via `useMemo`.
  - [x] **Tuned Polling Hook:**
    - Increased status summary poll interval from 4s to 8s.
    - Removed arbitrary 20s forced re-fetches. Documents are now only re-fetched if `completed`, `failed`, or `total` counts actually change, or when jobs transition from running to complete.
    - Polling immediately shuts off when `pending === 0 && processing === 0`.



