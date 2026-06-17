# Product Features

This document details all implemented features in the **Agentic RAG Masterclass & Policy Analysis Dashboard** project.

---

## 1. Research Campaigns & Dashboards
*   **Campaign Creation**: Define a policy research project by entering a campaign name, description, and system prompt (codebook rules).
*   **Schema Generation**: The system automatically parses the system prompt/codebook using the LLM to extract variable columns (their names, types, descriptions, and options).
*   **Flexible Predefined Columns**: Users can specify columns before campaign creation to bypass or complement LLM extraction:
    *   **Manual Entry**: Define specific column names, select data types (String, Number, Boolean), and write rules.
    *   **CSV Header Import**: Upload a CSV file client-side; the header row is parsed to extract column names and populate the column list.
*   **Column Description Guardrails**:
    *   Descriptions are required for the LLM to understand how to score documents.
    *   If a description is missing, a yellow warning icon (`⚠️ Missing Description`) is displayed in the Campaign Creator, the Manage Columns modal, and the main grid column headers.
    *   Tooltips in the grid headers warn: *"No description provided. The LLM may not code this column accurately."*
*   **Retry Schema Extraction**: If the initial LLM schema generation fails, a warning banner is shown with a **"Retry Schema Extraction"** button to trigger a prompt re-evaluation. Once columns are defined, the button is hidden.

---

## 2. Dynamic Policy Analysis Data Grid
*   **Structured View**: Displays coded variables alongside filenames and coding statuses.
*   **Drag-and-Drop Reordering**: Rearrange columns by dragging headers to customize the spreadsheet layout.
*   **Column Tooltips**: Hover over column headers to inspect their data types and LLM criteria/descriptions.
*   **Inspect & Correct Cell**: Double-click any grid cell to view the extracted value, read the LLM's quotes/textual reasoning, manually override the value, and write custom reasoning.
*   **History Tracking**: Every cell keeps a versioned history log showing changes made by the AI, user overrides, or re-evaluations, along with timestamps and authors.
*   **AI Re-evaluation**: Re-submit individual cell values to the LLM with specific feedback (e.g. *"Actually, the law states X. Please re-check."*) to trigger targeted recalculation.
*   **Manage Columns Modal**: Add new variables, delete old ones, or modify allowed categorical options and criteria descriptions.

---

## 3. Document Ingestion & Duplicate Management
*   **Multi-Format Parsing**: Swapped basic text extraction for **Docling**, allowing parsing of PDF, DOCX, HTML, Markdown, and TXT files.
*   **Incremental Ingestion**: Documents use SHA-256 content hashing to avoid redundant indexing if a file's content has not changed.
*   **Duplicate Detection & Recompute Dialog**:
    *   Before uploading files, the frontend checks if they are already in the dashboard.
    *   If duplicates exist, a checklist modal asks the user whether they want to **Recompute** (run through LLM coding again) or **Skip** (reuse existing database records) for each file in a single step.
*   **Uploader Error Transparency**: Upload failures (like rate limits or file size exceptions) display the server's detailed error message directly in the UI toast, with an extended 8-second visibility window.

---

## 4. Chat Interface & Agents
*   **SSE streaming**: Responses are streamed token-by-token.
*   **Threaded Memory**: Conversations are grouped into distinct threads that persist across browser sessions.
*   **RAG Transparency**: Real-time collapsibles display active tool calls and matching text chunk citations with similarity scores.
*   **Chat Attachments**: Users can attach text documents (`.txt` files) directly to their chat message, injecting file content directly into the conversation context.
*   **Multi-Agent Sub-Delegation**: Spawns isolated sub-agents with dedicated contexts for complex task workflows, showing reasoning traces from both the main agent and sub-agents in the UI.

---

## 5. Search & Retrieval Pipeline
*   **Hybrid Search**: Combines pgvector dense vector search with sparse keyword search (tsvector) using Reciprocal Rank Fusion (RRF).
*   **Cross-Encoder Reranking**: Re-orders retrieved candidates using a HuggingFace MS-MARCO model.
*   **Text-to-SQL Routing**: Dynamically executes SQL queries against the local DB when the user asks structured questions (e.g., *"How many documents have discretion rank > 3?"*).
*   **Web Search Fallback**: Automatically calls DuckDuckGo search if the RAG database lacks the answers.
