# Likit Workflow — Prompt 1 of 3: Discovery + Foundation v2

> **This is prompt 1 of 3.** It gathers project info and generates `CLAUDE.md` + `claude/Claude_guide.md`.
> After this completes, the user will paste Prompt 2.

---

## STEP 1 — MODE SELECTION

Ask the user:

> **How would you like to set up this project?**
>
> 1. **Questionnaire** — I'll ask you questions about your project, then generate the workflow files
> 2. **Inline** — You describe the project in your next message and I generate from that
> 3. **Existing project** — I'll analyze your codebase and create the workflow to continue development
>
> Pick 1, 2, or 3.

---

## STEP 2 — GATHER PROJECT INFO

### Mode 1 — Questionnaire

Ask these questions one at a time. Wait for each answer before asking the next:

1. **What are you building?** (one sentence)
2. **What's the tech stack?** (language, framework, build tool, database, hosting — or "pick for me")
3. **Who uses it?** (target user)
4. **What's the core feature?** (the one thing the app must do)
5. **What are the secondary features?** (list them)
6. **What platforms/environments?** (where does it run/deploy)
7. **Any external APIs or services?**
8. **What's your experience level with this stack?**
9. **Any constraints or hard rules?** (e.g., "no database", "must work offline", "under 500ms")
10. **How many build phases feel right?** (default: ~15, range: 8-20 — or "you decide")

### Mode 2 — Inline

The user describes the project in their message. Extract answers to the 10 questions above from their description. If anything critical is missing (stack, core feature, platforms), ask **only** the missing questions. Do NOT re-ask things you can infer.

### Mode 3 — Existing Project

1. Read the project's existing files:
   - `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, or equivalent — detect stack
   - `README.md` if it exists
   - Entry points (`src/index.ts`, `src/main.rs`, `app.py`, `cmd/main.go`, etc.)
   - Config files (`.env.example`, `docker-compose.yml`, CI config)
   - Run `git log --oneline -20` to understand recent work
   - Explore the directory structure to understand architecture
2. Ask the user only two things:
   - "What's the next milestone you're working toward?"
   - "Anything I should know that isn't in the code?" (constraints, decisions, blockers)
3. Infer answers to all 10 questions from the codebase + user's answers.

---

## STEP 3 — GENERATE FILES

Once you have all the project info, generate these two files. **Replace every `[GENERATE ...]` instruction with real, project-specific content. No placeholders may survive.**

Create the `claude/` directory if it doesn't exist.

---

### File 1: `CLAUDE.md` (project root)

Write this file:

```markdown
# [PROJECT_NAME] — Gated Build Workflow

Read before every task:

- `claude/Claude_guide.md` — 13 habits, response rules, red lines
- `claude/ProjectSummary.md` — architecture, data models, API reference
- `claude/BuildFlow.md` — phases with tasks and checkpoints
- `claude/Progress.md` — current phase and completion state

Operate in **Senior Coder Mode** as defined in `claude/Claude_guide.md` at all times.

Commands: `/progress-log` | `/progress-save` | `/phase-check` | `/phase-done` | `/phase-explain` | `/step-explain`

---

## GATE SYSTEM

Every phase (P1-P[N]) has a corresponding gate (G1-G[N]). G[X] = P[X]. Nothing proceeds until its gate passes.

- Each gate has **pass conditions** — every condition must be true
- Claude **verifies** conditions before declaring a gate passed
- Gates are sequential: G1 → G2 → ... → G[N]
- Blocked gate = stop, tell user what's unmet, work on ONLY that

---

## GATE PASS PROTOCOL

**Before declaring any phase complete:**

1. Read `claude/Progress.md` — ALL checkboxes for the phase must be `[x]`
2. Verify commit: `git log --oneline -1` — format must be `type(scope): desc`
3. If phase has tests: all tests must pass
4. If phase has config/secrets: no hardcoded values, env guard verified
5. Results demonstrated — never accept claims without proof

**If all met:** Update Progress.md status → `[complete]`, advance Current Phase, announce next phase.
**If any unmet:** List what's missing. Do NOT advance.

### Skip prevention

If the user says "skip to", "move ahead", "come back later", or "do [future phase] first":

> "Gate G[X] is blocking. Unmet: [list]. We cannot proceed until these pass. Which item do you want to tackle first?"

---

## GATE STATE TRACKING

`Progress.md` is source of truth. Status derived from:
- Phase status tag: `[not started]` | `[in progress]` | `[complete]`
- Checkbox state: `[ ]` vs `[x]`

Claude marks a box `[x]` only after verifying the condition. "Done" → verify, then check.
```

Replace `[PROJECT_NAME]` and `[N]` with real values.

---

### File 2: `claude/Claude_guide.md`

Write this file. **Every `[GENERATE ...]` block must be replaced with real project-specific content.**

```markdown
# Claude Guide — [PROJECT_NAME]

---

## The Developer

[GENERATE from questionnaire Q8: describe the developer's experience level, what they're building, and what skills they'll gain by project end. Frame it as a growth arc — where they start vs where they'll be.]

---

## Response Structure

Three rules:

1. **Code directly, explain briefly.** Write implementation code when the task is clear. Explain decisions only when the reasoning isn't obvious from the code. No hand-holding, no step-by-step walkthroughs unless explicitly asked.

2. **Enforce habits inline.** Name variables correctly, format commits, add structured logs, show error patterns. If the code violates a habit, fix it immediately — don't just flag it.

3. **End with next action + verification.** Smallest running increment. What to run. Expected result. Exact commit message.

---

## The 13 Habits

### H1 — Walking Skeleton First
Get something running end-to-end before building depth. A button that does one thing through every layer beats a perfect architecture with zero working code.

### H2 — Build Vertically, Not Horizontally
One complete feature through every layer before the next. Don't build all routes before proving one works end-to-end.

### H3 — Conventional Commits
`<type>(<scope>): <description>`. Imperative, present tense, <72 chars.

**Types:** feat, fix, chore, test, refactor, docs, ci, perf

**Scopes:** [GENERATE 8-15 project-specific scopes based on architecture. Examples: api, auth, db, ui, config, build, ci, streaming, etc. These should map to the project's actual modules/components.]

### H4 — Test First on Core Logic
Pure functions with clear I/O: write test before implementation. Red → Green → Refactor.

**Priority TDD targets:**
[GENERATE 5-8 pure functions from this specific project that should be TDD'd. Be concrete: name the function, describe its I/O. Examples: `validateEmail(input) → boolean`, `parseCSV(raw) → Row[]`, `calculateDiscount(cart, coupon) → number`.]

### H5 — Clean Code: Names, Functions, Errors
Names describe what a thing is. Functions do one thing. Errors always use proper error patterns for the language:

[GENERATE 2-3 error pattern examples using the project's actual language and domain. Examples for TypeScript: `throw new Error('[Auth] Token expired', { cause: error })`. For Go: `fmt.Errorf("[auth] token expired: %w", err)`. For Python: `raise AuthError("Token expired") from e`.]

### H6 — YAGNI / KISS / DRY
Build what the current phase needs. No "we might need this later" abstractions. One working feature is better than a clever framework with zero working features.

### H7 — Refactor in a Separate Commit
Never mix refactor and feature in the same commit. If you notice something needs reshaping mid-feature, finish the feature, commit, then refactor and commit separately.

### H8 — DevOps Incrementally
- `.gitignore` + branching: day one
- Build config: Phase 1-2
[GENERATE remaining DevOps milestones with approximate phase numbers. Examples: "Docker: Phase 8", "CI (GitHub Actions): Phase 12", "Production deployment: Phase 14". Adapt to what this project actually needs.]

### H9 — Structured Logging
[GENERATE logging guidance for this project's language/runtime. Name the recommended library (Pino for Node, slog for Go, logging/structlog for Python, tracing for Rust). Show the format. State when to use structured logging vs console.log.]

### H10 — Document the Why
Comments explain decisions, not code. Examples of good comments:
[GENERATE 3 comments that would actually appear in this project. They should explain surprising decisions, not obvious code. Example: `// Using WebSocket instead of SSE because we need bidirectional communication for real-time collaboration`.]

### H11 — Debug With Method
Reproduce reliably → state hypothesis → test one variable → read full error top to bottom → rubber duck at 30 min. [GENERATE the primary debugging tool for this project — e.g., "Chrome DevTools for extension debugging", "delve for Go", "pdb/ipdb for Python".]

### H12 — Small Working Progress Daily
Every session produces something that runs. Never end a session with broken code on the working branch.

### H13 — Test at Every Seam (Most Important)
Three categories — never interchangeable:

- **Unit ([GENERATE test framework]):** pure functions — [list TDD targets from H4]
- **Integration ([GENERATE test framework]):** [describe what integration tests look like for this project — e.g., "HTTP routes through real middleware stack", "database queries against test DB"]
- **E2E ([GENERATE tool or "manual for v1"]):** [describe E2E strategy — e.g., "Playwright for browser flows", "manual testing checklist for v1"]

---

## Specific Situations

### "How do I start Phase X?"
Read `claude/BuildFlow.md` for that phase. Identify the smallest slice that produces a running result. Build that slice first.

### Code review
Check against habits H3, H5, H6, H7, H13 in order. Flag the first violation. Fix one habit at a time.

### Error shared
Read the full error. State what it means. Fix it. If the fix requires understanding the user's intent, ask one clarifying question.

### Skipping tests
Block the phase. No phase passes without its tests verified.

### Working ahead
Stop. Ask: "Is the current phase fully working and committed?" If not, redirect.

### YAGNI violation
Ask: "Which phase needs this?" If it's not in the current phase, remove it.

[GENERATE 2-4 additional situations specific to this project's tech stack. Examples for a web app: "Database migration needed mid-feature", "API contract changed". For a CLI tool: "Flag parsing edge case". For mobile: "Platform-specific behavior difference".]

---

## Red Lines — Never Do These

- Never write vague commit messages like "update code" or "fix stuff"
- Never hardcode secrets — always environment variables with guards
- Never let a phase pass without its tests verified
- Never skip error handling — every error path must be handled
[GENERATE 8-12 additional red lines specific to this project. These should cover: architecture violations (e.g., "never call the API from the frontend directly"), security concerns (e.g., "never store tokens in localStorage"), common mistakes for this stack (e.g., "never use `any` type in TypeScript"), and domain-specific rules.]

---

## Phase Awareness

| Phase | Working | NOT Allowed Yet |
|---|---|---|
[GENERATE one row per phase. "Working" = what's in scope for that phase. "NOT Allowed Yet" = what's explicitly out of scope. This prevents scope creep. Example row: `| 1 — Scaffold | Build config, project structure, dev server | No features, no API calls, no database |`]
```

---

## STEP 4 — CONFIRM AND HAND OFF

After generating both files, tell the user:

> **Prompt 1 complete.** Generated:
> - `CLAUDE.md` — gate system with [N] phases
> - `claude/Claude_guide.md` — 13 habits, red lines, phase awareness
>
> **Paste Prompt 2** to generate `ProjectSummary.md` and `BuildFlow.md`.

Do NOT generate any other files. Do NOT start building the project. Wait for Prompt 2.
