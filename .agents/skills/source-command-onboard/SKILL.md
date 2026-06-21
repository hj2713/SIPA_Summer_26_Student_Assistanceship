---
name: "source-command-onboard"
description: "Onboard Codex into the codebase"
---

# source-command-onboard

Use this skill when the user asks to run the migrated source command `onboard`.

## Command Template

# Context

## Process

1. **Scan structure**
   - Run `git ls-files` to see all tracked files

2. **Read key files**
   - AGENTS.md, PRD.md, and any other architecture docs
   - Entry points and config files
   - Core schemas/models

3. **Check state**
   - Run `git status` and `git log -10 --oneline`

## Output

Provide a brief summary:
- What this project does
- Tech stack
- How it's organised
- Current branch and recent activity
