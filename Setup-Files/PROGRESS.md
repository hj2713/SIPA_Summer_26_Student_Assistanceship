# Progress

Track your progress through the masterclass. Update this file as you complete modules - Claude Code reads this to understand where you are in the project.

## Convention
- `[ ]` = Not started
- `[-]` = In progress
- `[x]` = Completed

## Modules

### Module 1: App Shell + Observability

**Status:** Completed 100% — All phases verified and fully functional, including SSE streaming completions using OpenRouter and LangSmith trace logging.

| Phase | Description | Status |
|-------|-------------|--------|
| A | Repository & tooling (`.gitignore`) | `[x]` |
| B | Supabase migrations (SQL files) | `[x]` Applied to Supabase project |
| C | Backend scaffold (FastAPI, config, deps, health) | `[x]` |
| D | Backend domain (schemas, services, routes) | `[x]` |
| E | OpenAI Responses API + LangSmith + SSE | `[x]` |
| F | Frontend scaffold (Vite + React + Tailwind + shadcn/ui) | `[x]` |
| G | Auth UI (login, signup, protected routes) | `[x]` |
| H | Chat UI (thread sidebar, messages, SSE streaming) | `[x]` |
| I | Observability & hardening | `[x]` Structured logging done; LangSmith integration verified and fully functional |

**Test results:**
- Backend: `pytest` — 12/12 passed ✅
- Frontend: `npm run build` — 0 errors ✅

### Definition of Done

- [x] New user can sign up, log in, and reach `/chat`
- [x] Threads persist across sessions (create, rename, delete)
- [x] Messages stream token-by-token via SSE
- [x] Multi-turn conversations chain correctly (context-aware replies)
- [x] All LLM calls traced in LangSmith with user/thread metadata
- [x] RLS verified: enabled and policies verified on Supabase project
- [x] `pytest` and `npm run build` both pass
- [x] `README.md` has complete local setup instructions
- [x] `PROGRESS.md` updated

---

### Module 2: Self-Hosted RAG Pipeline

**Status:** Completed 100% — Full self-hosted RAG pipeline implemented, including file upload/ingestion UI, background paragraph chunker, OpenAI embeddings generation, pgvector storage index, match_chunks RPC, stateless chat completion tool execution loop, and Realtime progress badge updates.

| Phase | Description | Status |
|-------|-------------|--------|
| A | Supabase setup (`vector` extension, `documents`/`chunks` tables, storage bucket, RLS) | `[x]` |
| B | Backend Ingestion Service (extraction, chunking, OpenAI embeddings, background worker) | `[x]` |
| C | Backend RAG Retrieval & Tool Calling (tool calling stream loop, system instructions) | `[x]` |
| D | Frontend Ingestion UI (file upload dropzone, status list, Realtime subscription) | `[x]` |
| E | Frontend transparency (collapsible inline tool call status and chunk citation list) | `[x]` |

**Test results:**
- Backend: `pytest` — 22/22 passed ✅
- Frontend: `npm run build` — 0 errors ✅

### Definition of Done (Module 2)

- [x] Vector extension, `documents` and `document_chunks` tables created on Supabase
- [x] Cosine distance similarity search function `match_chunks` created
- [x] Private `documents` storage bucket with isolation RLS policies set up
- [x] Ingestion text extraction handles `.txt`, `.md`, and `.html`
- [x] Recursive Character Splitter chunker handles large paragraphs and sentence splitting
- [x] File upload accepts files and processes embeddings asynchronously in background
- [x] Realtime changes channel updates document statuses dynamically in UI
- [x] Chat streaming SSE loop intercepts `retrieve_documents` tool call
- [x] Assistant streams back answer using document contexts with citation indicators
- [x] All 22 backend test cases and frontend React production builds pass successfully

---

### Module 3: Record Manager (Incremental Ingestion)

**Status:** Completed 100% — Incremental ingestion pipeline fully implemented, including SHA-256 content hashing, duplicate upload detection and bypassing, file update checks, and in-place document chunks replacement.

| Phase | Description | Status |
|-------|-------------|--------|
| A | Database migrations (`content_hash` column and `(user_id, filename)` unique constraint) | `[x]` |
| B | Backend support (hashing helpers, `get_document_by_name`, `delete_document_chunks`, schema updates) | `[x]` |
| C | Upload router implementation (No-op duplicate skip, In-place document modification overwrite) | `[x]` |
| D | Verification tests (content hashing unit tests, skip duplicate checks, modified re-indexing) | `[x]` |

**Test results:**
- Backend: `pytest` (including `test_record_manager.py`) — 27/27 passed ✅

---

### Module 4: Metadata Extraction

**Status:** Completed 100% — AI metadata extraction and filtering fully implemented, including JSONB metadata column with GIN index on `documents`, structured completion parse metadata extraction, `match_chunks` RPC filtering support, dynamic `category` and `tag` search tool params, and documents dashboard metadata display.

| Phase | Description | Status |
|-------|-------------|--------|
| A | Database migrations (`metadata` JSONB column, GIN index, and `match_chunks` RPC filter parameter) | `[x]` |
| B | Background LLM Structured Metadata Extraction (`client.beta.chat.completions.parse` mapping text to `DocumentMetadata` model) | `[x]` |
| C | Retrieval filtering (incorporating `category` and `tags` filters in similarity queries) | `[x]` |
| D | Frontend dashboard updates (render category badges, tags, and summary accordions under `/documents`) | `[x]` |
| E | Search Tool filters display (streamed SSE indicators in Chat UI showing active filter badges) | `[x]` |

**Test results:**
- Backend: `pytest` (including `test_metadata.py`) — 27/27 passed ✅
- Frontend: `npm run build` — 0 errors ✅

---

### Bug Fixes (Post Module 4)

**Status:** All three reported bugs identified, fixed, and **verified working** ✅

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| **New file upload error:** `'NoneType' object has no attribute 'data'` | `maybe_single().execute()` returns `None` (not an object) when no matching row exists in supabase-py ≥ 2.x | Added `None` guard in `get_document_by_name()`: check `response is None` before accessing `.data` |
| **Duplicate file upload error:** `Failed to update document metadata for <id>` | `documents` table was missing an **UPDATE** RLS policy — user-scoped JWT client was blocked from updating its own rows | Added `docs_update_own` UPDATE RLS policy via migration `0008_add_document_update_rls.sql` |
| **RAG inconsistency** (sometimes searched, sometimes not) | Two root causes: (1) stale documents had `content_hash = NULL` and 0 chunks (uploaded before embedding code was working), (2) `tool_choice="auto"` let LLM skip the search tool | (1) Cleaned stale documents from DB; (2) Changed `tool_choice` to forced function call; (3) Strengthened system prompt to forbid answering from training knowledge |

**Additional improvements:**
- `update_document_metadata()` and `update_document_status()` now fall back to a re-fetch if response data is empty (defensive against future RLS changes)
- Added `get_document_by_id_no_user()` helper for service-role client post-update lookups
- Removed `"updated_at": "now()"` from update payloads (DB-side trigger handles it)
- System prompt strengthened with explicit rules to always call `retrieve_documents` before answering

**Test results after fixes:**
- Backend: `pytest` — 27/27 passed ✅
- All three bugs verified working by user ✅

---

### Module 5: Multi-Format Support

**Status:** Completed 100% — Multi-format document parsing fully implemented. Swapped the hand-rolled text extractor with `docling`, supporting PDF, DOCX, HTML, Markdown, and plain text. Upgraded the file upload route to support up to 20 MB, updated the React dropzone UI accordingly, and added automated unit test coverage.

| Phase | Description | Status |
|-------|-------------|--------|
| A | Add docling dependency to `requirements.txt` | `[x]` |
| B | Replace `extract_text` with docling in `ingestion_service.py` | `[x]` |
| C | Update upload route in `documents.py` (raise limit to 20 MB, pass `filename` to background task) | `[x]` |
| D | Update frontend dropzone in `DocumentsPage.tsx` (accept PDF/DOCX MIME types, update helper text) | `[x]` |
| E | Write automated tests in `test_multiformat.py` | `[x]` |

**Test results:**
- Backend: `pytest` (including `test_multiformat.py`) — 36/36 passed ✅
- Frontend: `npm run build` — 0 errors ✅

---

### Module 6: Hybrid Search & Reranking

**Status:** Completed 100% — Hybrid (dense vector + sparse keyword) search and cross-encoder reranking fully implemented. Added tsvector column/GIN index to chunks, created the `match_chunks_hybrid` RPC implementing Reciprocal Rank Fusion (RRF), overhauled the retrieval pipeline with optional cross-encoder reranking via HuggingFace's MS-MARCO model, updated context formatting with RRF/rerank scores, and added automated tests.

| Phase | Description | Status |
|-------|-------------|--------|
| A | Database migration (`0009_hybrid_search.sql` - tsvector column, GIN index, `match_chunks_hybrid` RPC) | `[x]` |
| B | Config flags in `config.py` (candidate count, final count, reranking model/toggle) | `[x]` |
| C | Reranking service in `reranking_service.py` (cross-encoder with lazy loading and cache) | `[x]` |
| D | Retrieval service overhaul in `retrieval_service.py` (call hybrid RPC, optional rerank) | `[x]` |
| E | Context formatter update in `openai_service.py` (include scores) | `[x]` |
| F | Update `.env.example` with new settings | `[x]` |
| G | Write automated tests in `test_hybrid_search.py` | `[x]` |

**Test results:**
- Backend: `pytest` (including `test_hybrid_search.py`) — 36/36 passed ✅
- Frontend: `npm run build` — 0 errors ✅

---

### Module 7: Additional Tools

**Status:** Completed 100% — Text-to-SQL routing tools and DuckDuckGo web search fallback integration fully implemented and verified.

| Phase | Description | Status |
|-------|-------------|--------|
| A | Text-to-SQL structured data tool execution | `[x]` |
| B | DuckDuckGo web search fallback routing | `[x]` |
| C | Rerank and citation formatting for tool answers | `[x]` |

---

### Module 8: Sub-Agents

**Status:** Completed 100% — Context isolation and sub-agent delegation pipeline fully implemented. Verified multi-agent reasoning traces.

| Phase | Description | Status |
|-------|-------------|--------|
| A | Full-document analysis detection and routing | `[x]` |
| B | Spawn sub-agents with dedicated workspace context | `[x]` |
| C | Nested UI rendering showing main and subagent reasoning steps | `[x]` |

---

### Custom Module: Document Explorer Dashboard & Chat Attachments

**Status:** Completed 100% — Elegant directory tree, resizable sidebar previews, folder moving, dynamic prompt extraction, and chatbot `.txt` attachment uploads fully implemented.

| Feature | Description | Status |
|---------|-------------|--------|
| A | **Document Directory Tree**: Render files/folders recursively with sizes, categories, and tags. | `[x]` |
| B | **Resizable Preview Sidebar**: Drag-to-resize preview panel with fullscreen modal dialog. | `[x]` |
| C | **Document Move & RAG Integrity**: DB file rename & storage move while maintaining vector chunk UUIDs. | `[x]` |
| D | **Prompts & Constants Extraction**: Decoupled prompt text (`prompts.py`) and variables (`constants.py`). | `[x]` |
| E | **Chatbot Attachments**: Multi-format ready `.txt` file uploader injecting file contents into chat context. | `[x]` |

**Test results:**
- Backend: `pytest` (including `test_move_document.py` + all modules) — 42/42 passed ✅
- Frontend: `npx tsc --noEmit` — 0 errors ✅

---

### Custom Module: Campaign Schema & Ingestion Enhancements (Current Session)

**Status:** Completed 100% — CSV column header extraction, editable column descriptions, missing description warning icons, dynamic duplicate upload checklists, and schema extraction retries fully implemented.

| Feature | Description | Status |
|---------|-------------|--------|
| A | **CSV Column Extraction**: Client-side parsing of CSV headers to automatically pre-populate campaign columns during creation. | `[x]` |
| B | **Column Criteria/Descriptions**: Extended backend schema to support structured columns (`name`, `type`, `description`, `options`) and added editable description fields to campaign creators/management modals. | `[x]` |
| C | **Missing Description Warnings**: Render a yellow warning icon (`⚠️`) in creators, Manage Columns, and dynamic grid table headers when descriptions are blank, alerting researchers of possible LLM inaccuracies. | `[x]` |
| D | **Duplicate Upload Control**: Interactive warning modal before file uploads checking for duplicates in the dashboard, enabling users to selectively recompute or skip LLM analysis per file in one step. | `[x]` |
| E | **Detailed Upload Errors**: Improved frontend toast notifications to capture and render detailed server-side error descriptions (rate limits, context issues) for 8 seconds. | `[x]` |
| F | **Schema Extraction Retry**: Alert banner button that allows users to re-run LLM schema extraction from prompt rules if initial creation fails to generate columns. | `[x]` |

**Test results:**
- Backend: `pytest` (including new `test_create_campaign_with_structured_columns`) — 56/56 passed ✅
- Frontend: `npx tsc --noEmit` — 0 errors ✅



