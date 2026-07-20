<!-- MEMANTO-MANAGED-SECTION -->
## MEMANTO - Your Active Memory Companion

**MEMANTO is not a passive store. It is an active companion agent that works alongside you.**
Don't treat MEMANTO like a static blob you query once and forget. It's a teammate you keep
talking to, every preference, decision, and correction flows through it. MEMANTO remembers,
recalls, and answers so you hold context across sessions, honor prior decisions, and avoid
repeating mistakes the user already corrected.

Every memory operation in this session goes through MEMANTO. There is no exception.

> **CRITICAL**: All `memanto` commands are **shell commands**. Always run them using the terminal.
> Never simulate, describe, or "pretend to call" them. If you cannot run the shell, say so explicitly instead of inventing memory state.

### NON-NEGOTIABLE RULES

These are not suggestions. Follow each one on every turn.

1. **Read `MEMORY.md` before doing anything.** It is auto-synced at session start and holds
   the user's preferences, facts, goals, instructions, decisions, and commitments from every
   prior session. You MUST honor what is written there. If you act against it, you are
   breaking continuity the user is paying for.
2. **Search memory before saying you don't know.** If the user asks about past context, an
   earlier decision, a preference, or anything you are unsure about, you MUST run `recall`
   or `answer` first. Saying "I don't have context" without searching is a failure.
3. **Store proactively. Do not wait to be asked.** The moment a memory-worthy event happens
   — a preference stated, a decision made, a fact learned, an instruction given, a goal set,
   a mistake corrected — run `memanto remember` immediately, in the same turn.
4. **Always pass full metadata to `remember`.** Every `memanto remember` call MUST include
   `--type`, `--confidence`, `--provenance`, and `--source <your_agent_name>`. Never let
   these default. Untyped, unsourced memories pollute the agent's recall quality.
5. **One memory operation goes through MEMANTO. All of them do.** Do not keep mental notes,
   in-context scratch pads, or "I'll remember this for next time" promises. If it matters
   beyond this turn, it goes into MEMANTO. If it doesn't, drop it.

### Memory Operations — Use the Right One

MEMANTO gives you three primitives. They are equal-priority. Pick by intent, not by habit.

| You want to... | Use | Why |
|---|---|---|
| Read raw memory chunks and apply them as context | `memanto recall "query"` | Best for context-building, multi-step work, comparing options |
| Get one synthesized, grounded answer to a direct question | `memanto answer "question"` | Best for "what did we decide / prefer / commit to?" — saves you reading and merging |
| Persist something memory-worthy | `memanto remember "content" --type ... --confidence ... --provenance ... --source ...` | Every preference, decision, fact, instruction, goal, lesson |
| See what changed since last time | `memanto recall --changed-since "last 7 days"` | Catching up after a break |
| See the most recent memories | `memanto recall --recent` | Fast context refresh |

Do NOT always default to `recall`. If the user asked a direct question, `answer` is usually
the right tool — it returns a grounded synthesis so you don't burn tokens re-reading raw
chunks.

### When to Call `remember` (Examples — Run Immediately)

- User says *"I prefer tabs over spaces"*:
  `memanto remember "User prefers tabs over spaces for indentation" --type preference --confidence 1.0 --provenance explicit_statement --source <your_agent_name>`
- You decide to use Library X for reason Y:
  `memanto remember "Chose Library X for reason Y; commit abc123" --type decision --confidence 0.95 --provenance inferred --source <your_agent_name>`
- User corrects an approach:
  `memanto remember "User corrected: use pytest, not unittest" --type learning --confidence 1.0 --provenance corrected --source <your_agent_name>`
- A failed approach taught you something:
  `memanto remember "Batch size > 100 fails with TimeoutError" --type error --confidence 0.95 --provenance observed --source <your_agent_name>`

### Command Reference

```bash
# Store — ALWAYS pass full metadata
memanto remember "content" --type <type> --confidence <0.0-1.0> --provenance <provenance> --source <agent_name>

# Recall raw context
memanto recall "query"                              # semantic search
memanto recall "query" --type <type> --limit 10     # filtered search
memanto recall --recent --limit 10                  # newest first, no query
memanto recall --as-of "2026-01-15"                 # state at a point in time
memanto recall --changed-since "last 7 days"        # what changed since

# Synthesized answer (grounded RAG over memories)
memanto answer "question"

# Re-sync MEMORY.md (project-local cache)
memanto memory sync --project-dir .
```

**Memory types** (use the closest fit, do not invent new ones):
`fact`, `preference`, `instruction`, `decision`, `event`, `goal`, `commitment`,
`observation`, `learning`, `relationship`, `context`, `artifact`, `error`.

**Provenance values**: `explicit_statement`, `inferred`, `observed`, `corrected`,
`validated`, `imported`.

**Confidence**: `1.0` for explicit user statements; `0.9-0.95` for strong consensus;
`0.8-0.85` for observed patterns (3+ times); `0.6-0.75` for emerging patterns.

> **Note**: The `memanto-memory` skill in `.agents/skills/memanto/` contains detailed reference guidelines (best practices, confidence levels, tagging).
<!-- /MEMANTO-MANAGED-SECTION -->

# Academic Research Skills

A suite of skills for rigorous academic research, paper writing, peer review, and pipeline orchestration.

## Skills Overview

| Skill | Purpose | Key Modes |
|-------|---------|-----------|
| `deep-research` v2.11.0 | 13-agent research team | full, quick, socratic, review, lit-review, three-way-scan, fact-check, systematic-review |
| `academic-paper` v3.2.0 | 12-agent paper writing | full, plan, outline-only, revision, revision-coach, abstract-only, lit-review, format-convert, citation-check, disclosure, rebuttal-audit |
| `academic-paper-reviewer` v1.10.0 | Multi-perspective paper review (5 reviewers + optional cross-model DA critique) | full, re-review, quick, methodology-focus, guided, calibration |
| `academic-pipeline` v3.16.0 | Full pipeline orchestrator | (coordinates all above) |

## Routing Discipline (v3.9.2)

**Routing precedence:** This section runs BEFORE Routing Rules 1-5. Once this section settles on a destination, Rules 1-5 apply within that destination's skill family.

**Step 0 — Escape hatch check (before any classification):** If the user's first message begins with `[direct-mode]` (case-insensitive byte-0 token, optionally preceded by whitespace/newlines that are stripped on parse), record this fact, strip the prefix and surrounding whitespace from the message, and skip directly to **Step 1 explicit-intent handling** on the stripped content. The literal `[direct-mode]` is NOT passed through to the dispatched agent. If the stripped message itself has no clear skill named, Step 1 falls through to Step 3 clarification (the escape hatch bypasses cross-phase clarification (Step 2), not all routing).

Otherwise, classify the user's input:

1. **Explicit clear intent** — user invokes a specific skill via `/ars-*` slash command, or uses an unambiguous trigger keyword that maps to a single skill (e.g., "lit-review this", "review my paper", "draft an abstract"):
   → Route directly; no clarification, no orchestrator detour.

2. **Cross-phase materials detected** — user provides artifacts spanning ≥ 2 pipeline phases without naming a specific skill (e.g., pre-written abstract + pre-collected literature; full draft + reviewer comments + bibliography):
   → **Clarify**. Do NOT auto-route to a single-phase agent. List candidate workflows as a-d options in markdown body (NOT via AskUserQuestion tool). See `shared/references/intent_clarification_protocol.md` for the message template.
   → Reason: clarification is the safest action when materials don't unambiguously identify intent. (v3.10 active conductor (#134) will handle this via structured intake; v3.9.2 asks.)

3. **Ambiguous intent, no materials** — user provides no artifacts and no clear request:
   → Clarify per `shared/references/intent_clarification_protocol.md`.

**Anti-pattern (caused #133):** Receiving ambiguous cross-phase materials and silently auto-routing to a single-phase agent based on which phase the materials "look closest to." This bypasses orchestrator-level reconciliation and lets the subagent inherit the full ambiguity without independent oversight.

**Forward note (v3.10):** Active conductor (#134) will reframe this gate as structured intake with task envelope dispatch. v3.9.2 ships clarification-only as interim hot-fix.

## Routing Rules

1. **academic-pipeline vs individual skills**: academic-pipeline = full pipeline orchestrator (research → write → integrity → review → revise → final integrity → finalize). If the user only needs a single function (just research, just write, just review), trigger the corresponding skill directly without the pipeline.

2. **deep-research vs academic-paper**: Complementary. deep-research = upstream research engine (investigation + fact-checking), academic-paper = downstream publication engine (paper writing + bilingual abstracts). Recommended flow: deep-research → academic-paper.

3. **deep-research socratic vs full**: socratic = guided Socratic dialogue to help users clarify their research question. full = direct production of research report. When the user's research question is unclear, suggest socratic mode.

4. **academic-paper plan vs full**: plan = chapter-by-chapter guided planning via Socratic dialogue. full = direct paper production. When the user wants to think through their paper structure, suggest plan mode.

5. **academic-paper-reviewer guided vs full**: guided = Socratic review that engages the author in dialogue about issues. full = standard multi-perspective review report. When the user wants to learn from the review, suggest guided mode.

6. **rebuttal-audit vs revision-coach (input-shape gate)**: both touch reviewer comments, so route by INPUT SHAPE, not verbs. Route to `academic-paper rebuttal-audit` ONLY when the user supplies BOTH the reviewer comments AND an existing rebuttal/response draft to evaluate (it does advisory QA, generates nothing). If only reviewer comments are present (no draft yet), route to `revision-coach` (it generates a Response Letter Skeleton). If unclear which, clarify rather than guess. `rebuttal-audit` is standalone/advisory and never emits Schema 11 or marks anything verified.

## Key Rules

- All claims must have citations
- Evidence hierarchy respected (meta-analyses > RCTs > cohort > case reports > expert opinion)
- Contradictions disclosed with evidence quality comparison
- AI disclosure in all reports
- Default output language matches user input (Traditional Chinese or English)
