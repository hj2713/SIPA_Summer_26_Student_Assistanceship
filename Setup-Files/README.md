# Cloud Code Agentic RAG Masterclass

Build an agentic RAG application from scratch by collaborating with Claude Code. Follow along with our video series using the docs in this repo.

[![Claude Code RAG Masterclass](./video-thumbnail.png)](https://www.youtube.com/watch?v=xgPWCuqLoek)

[Watch the full video on YouTube](https://www.youtube.com/watch?v=xgPWCuqLoek)

## What This Is

A hands-on course where you collaborate with Claude Code to build a full-featured RAG system. You're not the one writing code—Claude is. Your job is to guide it, understand what you're building, and course-correct when needed.

**You don't need to know how to code.** You do need to be technically minded and willing to learn about APIs, databases, and system architecture.

## What You'll Build

- **Chat interface** with threaded conversations, streaming, tool calls, and subagent reasoning
- **Document ingestion** with drag-and-drop upload and processing status
- **Full RAG pipeline**: chunking, embedding, hybrid search, reranking
- **Agentic patterns**: text-to-SQL, web search, subagents with isolated context

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React, TypeScript, Tailwind, shadcn/ui, Vite |
| Backend | Python, FastAPI |
| Database | Supabase (Postgres + pgvector + Auth + Storage) |
| Doc Processing | Docling |
| AI Models | Local (LM Studio) or Cloud (OpenAI, OpenRouter) |
| Observability | LangSmith |

## The 8 Modules

1. **App Shell** — Auth, chat UI, managed RAG with OpenAI Responses API
2. **BYO Retrieval + Memory** — Ingestion, pgvector, switch to generic completions API
3. **Record Manager** — Content hashing, deduplication
4. **Metadata Extraction** — LLM-extracted metadata, filtered retrieval
5. **Multi-Format Support** — PDF, DOCX, HTML, Markdown via Docling
6. **Hybrid Search & Reranking** — Keyword + vector search, RRF, reranking
7. **Additional Tools** — Text-to-SQL, web search fallback
8. **Subagents** — Isolated context, document analysis delegation

## Getting Started

1. Clone this repo
2. Install [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
3. Open in your IDE (Cursor, VS Code, etc.)
4. Run `claude` in the terminal
5. Use the `/onboard` command to get started

---

## Local Development (Module 1)

### Prerequisites
- Python 3.11+, Node.js 20+
- A [Supabase](https://supabase.com) project, [OpenAI](https://platform.openai.com) key, [LangSmith](https://smith.langchain.com) account

### 1. Supabase Setup
1. Create a new Supabase project.
2. In the SQL Editor, run **in order**:
   - `supabase/migrations/0001_init_threads.sql`
   - `supabase/migrations/0002_init_messages.sql`
   - `supabase/migrations/0003_rls_policies.sql`
3. Verify: `select * from pg_policies where schemaname='public'` → 8 rows.
4. Under **Authentication → Providers → Email**, disable email confirmations for dev.

### 2. Backend
```bash
cd backend
cp .env.example .env        # fill in all values
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
- API: `http://localhost:8000`
- Docs: `http://localhost:8000/docs`
- Tests: `pytest app/tests/ -v`

### 3. Frontend
```bash
cd frontend
cp .env.example .env.local  # fill in Supabase URL + anon key
npm install
npm run dev                  # http://localhost:5173
npm run build                # production build check
```

### Key Environment Variables

**Backend (`backend/.env`):**
```env
SUPABASE_URL=          # Project URL
SUPABASE_ANON_KEY=     # Anon/public key
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=   # API settings → JWT Secret
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=
```

**Frontend (`frontend/.env.local`):**
```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=http://localhost:8000
```

### Architecture

```
Browser (React + Vite) → FastAPI (Python) → OpenAI Responses API
       ↓                        ↓                    ↓
  Supabase Auth          Supabase Postgres        LangSmith
                         (threads + messages)      (tracing)
```

## Docs

- [PRD.md](./PRD.md) — What to build (the 8 modules in detail)
- [CLAUDE.md](./CLAUDE.md) — Context for Claude Code
- [PROGRESS.md](./PROGRESS.md) — Track your build progress

## Join the Community

If you want to connect with hundreds of builders creating production-grade AI and RAG systems, join us in [The AI Automators community](https://www.theaiautomators.com/). Share your progress, get help when you're stuck, and see what others are building.
