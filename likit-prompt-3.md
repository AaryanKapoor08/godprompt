# Likit Workflow — Prompt 3 of 3: Slash Commands + Finalize v2

> **This is prompt 3 of 3.** It generates all slash commands and finalizes the setup.
> Prompts 1 and 2 have already been run — all `claude/` files and `CLAUDE.md` exist.

---

## CONTEXT

Read the files that Prompts 1 and 2 generated:
- `CLAUDE.md` — project name, phase count
- `claude/Progress.md` — current phase, total phases

Use the actual project name and phase count in the commands below.

---

## GENERATE SLASH COMMANDS

Create the `.claude/commands/` directory if it doesn't exist. Generate all 6 files below **exactly as written** — these are not templates, they are the final files.

---

### File 1: `.claude/commands/phase-check.md`

```
Quick status check — where are we and what's the next action?

Read claude/Progress.md and claude/BuildFlow.md. Report: current phase, what's complete, what's next, exact first command to run.
```

---

### File 2: `.claude/commands/phase-done.md`

```
Complete the current phase by doing ALL of the following automatically:

1. Read `claude/Progress.md` to determine the current phase number and name.
2. Read `claude/github.md` to see the existing commit history format.
3. Mark ALL checkpoints for the current phase as `[x]` in `claude/Progress.md`.
4. Change the phase status from `[not started]` or `[in progress]` to `[complete]`.
5. Add a Notes line summarizing what was built.
6. Increment `**Current Phase:**` to the next number.
7. Get the latest commit hash with `git log --oneline -1`.
8. Add a new section in `claude/github.md` for this phase (matching the existing format) with the commit hash, message, and branch.
9. Add a "What was done" summary listing the key changes.
10. Stage `claude/Progress.md` and `claude/github.md`.
11. Commit with message: `docs: complete Phase N tracking` (use the actual phase number).
12. Run `git log --oneline -3` to confirm.

Do NOT create the feature commit — only the docs/tracker update. The feature commit should already exist.
```

---

### File 3: `.claude/commands/phase-explain.md` 

```
Read claude/Progress.md, claude/BuildFlow.md, claude/Claude_guide.md, and claude/ProjectSummary.md.

Identify the current phase from Progress.md. Then produce a deep explanation of that phase structured exactly as follows:

---

## Phase [N] — [Name] — What You're Actually Building

**In one sentence:** [what this phase produces and why the project can't move forward without it]

---

### Why This Phase Exists

Explain the professional context. What would break, be impossible, or be painful if you skipped this phase and went straight to the next one? What does this phase unlock?

---

### Concepts You Must Understand Before Writing a Line

List every concept, term, or mental model needed before starting. For each:
- Name the concept
- Explain it in 2-3 sentences in plain language
- Give one concrete analogy if it helps
- Say what goes wrong when people misunderstand it

---

### The Shape of What You'll Build

Show the canonical skeleton/boilerplate pattern this phase produces. GENERIC ILLUSTRATION — not the implementation. Maximum 15 lines. Use comments to explain what each part is.

---

### What Professional Developers Do Differently At This Phase

Name 3-4 specific habits that separate professional work from student work at this exact phase. Specific to what this phase produces.

---

### Checkpoint Breakdown

Go through every unchecked item in the current phase checkpoint. For each:
- Restate in plain English
- Explain what it proves when it passes
- Give one concrete way to verify it

---

### Common Traps at This Phase

List the 3 most common mistakes at this specific phase. For each:
- Name the mistake
- Say why it happens
- Say what it looks like when you've made it
- Ask one question that would reveal it

---

### Before You Write Anything — Answer These First

Pose 3-5 questions to answer before touching the keyboard. If you can't answer these, you're not ready to start.
```

---

### File 4: `.claude/commands/progress-log.md`

```
Detailed progress report — full project status with blockers and overall completion.

Read claude/Progress.md, claude/BuildFlow.md, and claude/Claude_guide.md.

Report:
1. **Current Phase** — number + name
2. **Completed** — each done phase, one line
3. **Current Status** — checked vs unchecked items
4. **Blockers** — anything stuck
5. **Next Steps** — exact 1-3 actions with commands
6. **Overall** — X/[TOTAL] phases (%)

Be specific. Use actual checkpoint items.
```

---

### File 5: `.claude/commands/progress-save.md`

```
Save session progress to claude/Progress.md.

1. Read claude/Progress.md + claude/BuildFlow.md
2. Update Progress.md:
   - Check completed items (`- [ ]` → `- [x]`)
   - Update Current Phase if phase completed
   - Update Last Updated to today
   - Update Session Notes
   - Change phase status: `[not started]` → `[in progress]` or `[complete]`
3. Show diff
4. Confirm: "Progress saved: Phase X — [what was done]"
```

---

### File 6: `.claude/commands/step-explain.md`

```
Read claude/Progress.md, claude/BuildFlow.md, claude/Claude_guide.md, and claude/ProjectSummary.md.

Determine the current step as follows:
- Find the current phase in Progress.md
- Find the first unchecked checkbox [ ] in that phase — that is the current step
- If the user passed a number argument (e.g. "/step-explain 3"), explain step 3 of the current phase instead
- If the user passed a name (e.g. "/step-explain env guard"), find the closest matching step

Produce a deep explanation of that single step structured exactly as follows:

---

## Step: [checkpoint item text] — Phase [N]

**What this step is in one sentence:** [what you are building and what it proves]

---

### Why This Step Is Here

Explain why this step sits in this exact position. What breaks if you do it out of order?

---

### The Core Concept

Name the underlying engineering concept. Explain:
- What is it?
- Why does it exist?
- What problem does it solve?
- Done well vs done poorly?

Use one concrete real-world analogy.

---

### Syntax Template

Show the canonical pattern. GENERIC ILLUSTRATION — not the implementation. Maximum 10 lines. Comments explain purpose.

---

### The Proof

Exactly what "done" looks like:
- What command to run
- What output to expect
- What behaviour to demonstrate
- What a broken implementation produces instead

---

### Questions To Ask Yourself Before Starting

3-4 questions to answer before writing this step.

---

### The Single Most Common Mistake

One mistake people make most on this step:
- What it looks like in code
- Why it seems reasonable
- What it breaks downstream
- One question to reveal it

---

### Habit Check

Which of the 13 habits are tested by this step? What does each look like in practice here?
```

---

## FINALIZE SETUP

After generating all 6 command files:

1. **Git init** (if not already a repo):
   ```
   git init
   ```

2. **Create `.gitignore`** if it doesn't exist — generate one appropriate for the project's stack (Node, Python, Rust, Go, etc.). Include: dependency dirs, build output, env files, editor configs, OS files.

3. **Stage and commit everything:**
   ```
   git add CLAUDE.md claude/ .claude/commands/ .gitignore
   git commit -m "chore: initialize gated build workflow"
   ```

4. **Report to the user:**

> **Setup complete.** Your workflow is ready.
>
> **Files created:**
> - `CLAUDE.md` — entry point with gate system
> - `claude/Claude_guide.md` — 13 habits, coder mode, red lines
> - `claude/ProjectSummary.md` — architecture, models, API reference
> - `claude/BuildFlow.md` — [N] phases with tasks and checkpoints
> - `claude/Progress.md` — phase tracker (starting at Phase [X])
> - `claude/github.md` — commit history tracker
> - `.claude/commands/` — 6 slash commands
>
> **Slash commands available:**
> - `/phase-check` — quick status: where are we, what's next
> - `/phase-done` — mark current phase complete, update tracking
> - `/phase-explain` — deep dive into the current phase
> - `/step-explain` — deep dive into the current step
> - `/progress-log` — full progress report with blockers
> - `/progress-save` — save session progress to Progress.md
>
> **Current Phase: [X] — [Name]**
> First task: [describe the first task from BuildFlow.md Phase X]
>
> Ready to build. Say `/phase-check` anytime to see where you are.
