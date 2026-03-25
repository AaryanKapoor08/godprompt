# Likit Workflow — Prompt 2 of 3: Architecture + Build Plan v2

> **This is prompt 2 of 3.** It generates `ProjectSummary.md`, `BuildFlow.md`, `Progress.md`, and `github.md`.
> Prompt 1 has already been run — `CLAUDE.md` and `claude/Claude_guide.md` exist.
> After this completes, the user will paste Prompt 3.

---

## CONTEXT

Read the files that Prompt 1 generated:
- `CLAUDE.md` — to know the project name and phase count
- `claude/Claude_guide.md` — to know the tech stack, TDD targets, scopes, and phase awareness table

Use this information to ensure consistency across all files.

---

## GENERATE THESE FILES

**Replace every `[GENERATE ...]` instruction with real, project-specific content. No placeholders may survive.**

---

### File 1: `claude/ProjectSummary.md`

Write this file:

```markdown
# [PROJECT_NAME] — Project Summary

**[GENERATE one-line pitch — what it does and why it matters. Max 20 words.]**

---

## System Overview

[GENERATE an ASCII architecture diagram. Show major components as boxes, data flow as arrows, external services as separate boxes. Label every arrow with the protocol or method (HTTP, WebSocket, gRPC, function call, etc.). This should be the diagram someone new to the project reads first.

Example style:
```
┌─────────────┐     HTTP      ┌──────────────┐
│   Frontend   │─────────────▶│   API Server  │
│   (React)    │◀─────────────│   (Express)   │
└─────────────┘   WebSocket   └──────┬───────┘
                                      │ SQL
                                      ▼
                              ┌──────────────┐
                              │  PostgreSQL   │
                              └──────────────┘
```
Adapt to this project's actual architecture.]

---

## Core Features

[GENERATE bullet list of ALL features — core feature first, then secondary features. Each bullet: one line, starts with a verb. Example:
- Enhance prompts using an LLM meta-prompt and stream results back into the input field
- Undo enhancement with one click, restoring the original prompt
- Detect platform automatically and adapt DOM interactions]

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
[GENERATE one row per technology. Cover: language, framework, build tool, database (if any), hosting/deployment, testing framework, package manager, key libraries. The "Notes" column should say why this was chosen or any caveats.]

---

## Architecture Decisions

[GENERATE 5-10 architecture decisions numbered D1, D2, etc. Each decision must include:
- **What:** What was chosen
- **Over:** What the alternative was
- **Why:** The trade-off reasoning (1-2 sentences)

Focus on decisions that aren't obvious. Skip trivial ones like "we use git for version control." Good decisions to document: database choice, auth strategy, API style (REST vs GraphQL), state management approach, deployment strategy, monorepo vs polyrepo, testing strategy.]

---

## Data Models

[GENERATE data models in the project's language. Use TypeScript interfaces, Rust structs, Python dataclasses, Go structs — whatever matches the stack.

For each model:
- Comment explaining each field's purpose
- Default value if applicable
- Constraints (max length, valid values, etc.)

Include ALL models the project will need across all phases. Group related models together.]

---

## Core Service Logic

[GENERATE the main pipeline/flow as numbered steps. This is the critical path from user action to result.

For each step:
1. What happens
2. What data flows in/out
3. What happens on failure

Example:
1. **User clicks enhance** — content script reads prompt text via adapter
2. **Smart skip check** — if prompt < 3 words, show "too short" toast, abort
3. **Open port** — content script connects to service worker via chrome.runtime.connect
...

Cover the complete happy path AND the main error paths.]

---

## File Structure

[GENERATE the complete planned file structure as a tree. Use this format:

```
project-name/
├── src/
│   ├── index.ts              # Entry point — starts the server
│   ├── routes/
│   │   └── enhance.ts        # POST /api/enhance handler
│   └── lib/
│       └── validator.ts       # Input validation pure functions
├── test/
│   └── validator.test.ts      # Unit tests for validator
├── package.json
└── tsconfig.json
```

Include comments explaining what each key file/directory does. Show the FINAL structure (all phases), not just Phase 1.]

---

## Environment Variables

[GENERATE a table of all environment variables. If the project has no env vars (e.g., a pure frontend), write "No environment variables — all configuration is handled by [mechanism]."

| Variable | Required | Description | Example |
|---|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgres://user:pass@localhost:5432/mydb` |

Include variables needed across ALL phases, even later ones.]

---

## API Reference

[GENERATE API documentation if the project has an API (REST routes, GraphQL schema, CLI commands, WebSocket events, etc.). If no API, write "No external API — [describe how the system is used instead]."

For each endpoint/command:
- Method + path (or command syntax)
- Request format (with example)
- Response format (with example)
- Validation rules
- Error responses (status code, when it happens, response body)

Be specific enough that someone could implement a client from this doc alone.]
```

---

### File 2: `claude/BuildFlow.md`

Write this file:

```markdown
# [PROJECT_NAME] — Build Flow

A phase is done when the checkpoint passes, not when the code is written.

---

## Prerequisites

[GENERATE list of tools needed before Phase 1. Only what's needed immediately:
- Language runtime + version
- Package manager
- Database (if Phase 1 needs it)
- Git
- Editor with language support]

**Do NOT install until needed:**
[GENERATE tools that come later: Docker, deployment CLIs, E2E frameworks, monitoring tools — with which phase they're needed.]

---

## Global Rules (All Phases)

- **Branching:** `feat/<phase>/<description>` — never commit to main directly for features
- **Commits:** `<type>(<scope>): <description>` — imperative, present tense, <72 chars
- **Secrets:** Never in git. Env guard on every required var.
- **Errors:** Every error path handled. No silent swallowing.
- **Testing:** Every phase checkpoint requires its tests verified.
[GENERATE 2-4 additional global rules specific to this project. Examples: "All API responses must include proper status codes", "Never query the database from route handlers directly — always go through service layer", "All user input must be sanitized before use".]

---

[GENERATE ALL PHASES. Each phase MUST follow this exact structure:]

## PHASE [N] — [Name]

**Goal:** [One sentence — what this phase produces. Must be a concrete, observable outcome.]

**Tasks:**
[GENERATE 5-10 concrete implementation tasks. Each task must be:
- Specific enough to act on without ambiguity
- Small enough to complete in one sitting
- Ordered logically (dependencies first)
Example tasks:
- Create `src/routes/auth.ts` with POST `/login` and `/register` handlers
- Install and configure `bcrypt` for password hashing
- Add input validation: email format, password min 8 chars]

**Checkpoint:**
[GENERATE 5-10 independently verifiable pass conditions as checkboxes. Each must be:
- Observable (command output, visible behavior, test result)
- Independently verifiable (doesn't require subjective judgment)
- The LAST checkpoint is always a conventional commit with a specific message

Example checkpoints:
- [ ] `pnpm build` succeeds with zero errors
- [ ] `POST /login` with valid credentials returns 200 + JWT token
- [ ] `POST /login` with wrong password returns 401
- [ ] Auth middleware rejects requests without valid token (returns 403)
- [ ] Unit test for `hashPassword()` passes
- [ ] Commit: `feat(auth): implement login and registration with JWT`]

---

[PHASE DESIGN RULES — follow these when deciding phase count and content:

**Phase structure pattern:**
- Phase 1: ALWAYS project scaffold — builds, runs, loads with no errors
- Phases 2-4: Core vertical slice — one feature working end-to-end through all layers
- Phases 5-8: Depth — secondary features, settings, error handling, tests
- Phases 9-12: Breadth — additional integrations, platforms, data sources
- Final 2-3 phases: Polish, deployment, launch

**Phase count:**
- Small project (CLI tool, library, simple API): 8-10 phases
- Medium project (web app, extension, mobile app): 12-15 phases
- Large project (full-stack with multiple integrations): 15-20 phases
- Use the count the user specified, or pick based on scope

**Hard rules:**
- Every phase builds on the previous — no phase needs work from a future phase
- Every phase produces a working, committable increment
- No phase should take more than 2-3 focused sessions to complete
- Phases can be marked `[deferred]` or `[removed]` later if scope changes
- For existing projects (Mode 3): mark completed phases as `[complete]` with notes on what exists]

---

## Common Problems

| Problem | Likely Cause | Fix |
|---|---|---|
[GENERATE 10-15 problems specific to this project's stack. Each row: symptom the developer sees, likely root cause, concrete fix.

Examples for a Node/Express project:
| `Cannot find module` error | Missing dependency or wrong import path | Run `pnpm install`, check import uses correct relative path |
| Port already in use | Previous server instance still running | Kill process: `lsof -i :3000` then `kill <PID>` |
| CORS error in browser | Backend missing CORS middleware | Add `app.use(cors({ origin: 'http://localhost:5173' }))` |

Cover: build errors, runtime errors, test failures, deployment issues, common misconfigurations.]
```

---

### File 3: `claude/Progress.md`

Write this file. **Copy every checkpoint from BuildFlow.md exactly.**

```markdown
# [PROJECT_NAME] — Progress Tracker

Update this file as you complete each phase.

**Current Phase: [1 for new projects, or the first incomplete phase for existing projects]**

---

## Phase Checklist

[FOR EACH PHASE IN BuildFlow.md, generate:]

### PHASE [N] — [Name] [not started]

[Copy EVERY checkbox from that phase's Checkpoint section in BuildFlow.md]
- [ ] [condition 1]
- [ ] [condition 2]
- [ ] Commit: `type(scope): description`
- Notes:

[For existing projects (Mode 3): mark completed phases as [complete] with all boxes checked, and add Notes explaining what was already built.]
```

---

### File 4: `claude/github.md`

Write this file:

```markdown
# [PROJECT_NAME] — Commit History

Track of all commits pushed to GitHub, organized by phase.

---

[For new projects: leave empty — gets filled by /phase-done as phases complete.]
[For existing projects (Mode 3): populate with existing git history organized by inferred phases.]
```

---

## AFTER GENERATING ALL FILES

Tell the user:

> **Prompt 2 complete.** Generated:
> - `claude/ProjectSummary.md` — architecture, models, API reference
> - `claude/BuildFlow.md` — [N] phases with tasks and checkpoints
> - `claude/Progress.md` — phase tracker (current phase: [X])
> - `claude/github.md` — commit history tracker
>
> **Paste Prompt 3** to generate the slash commands and finalize the setup.

Do NOT generate slash commands. Do NOT start building. Wait for Prompt 3.
