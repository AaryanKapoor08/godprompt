# PromptGod — Codex Progress

Last updated: 2026-04-10

This file is the compact Codex handoff for the current workspace. It is focused on today's prompt-enhancer fixes so the next session can resume from the right baseline quickly.

---

## Session Summary

### 1. Repaired the core rewrite boundary

Updated:
- `extension/src/lib/llm-client.ts`
- `extension/test/unit/build-user-message.test.ts`

What changed:
- restored the stronger user-message wrapper so the model treats the provided prompt as source text to rewrite, not instructions to execute
- explicitly told the model not to answer the prompt or perform its steps
- preserved the delimiter-based wrapping used by the enhancement flow

Why this matters:
- this was the original fix for the "answering instead of enhancing" failure mode
- it remains the main guardrail for all providers

---

### 2. Restored workflow-preservation rules for staged prompts

Updated:
- `extension/src/lib/meta-prompt.ts`
- `extension/test/unit/meta-prompt.test.ts`

What changed:
- re-added a rewrite boundary section to the main meta prompt
- told the model to preserve staged workflows instead of collapsing them into immediate answers
- added rules for prompts that mention provided files, slides, code, or documents
- restored the assignment-prep example and the matching bad counterexample

Why this matters:
- prompts like "analyze these files now, solve the assignment later" should stay as prompts
- the enhancer should not pretend it already saw the source material

---

### 3. Kept Gemma stable and focused fixes on Gemini 2.5 Flash

Updated:
- `extension/src/lib/meta-prompt.ts`
- `extension/src/lib/llm-client.ts`
- `extension/test/unit/google-api.test.ts`
- `extension/test/unit/meta-prompt.test.ts`

What changed:
- left the compact Gemma path intact
- changed the main platform guidance to prefer clear plain text instead of numbered or XML-style formatting hints
- added explicit rules against inventing XML, HTML-like tags, or unnecessary heavy structure
- added a Flash-side cleanup pass for generic wrappers such as:
  - `<user_query>`
  - `<instruction>`
  - `<list>`
  - `<item>`
- flattened those wrappers into normal plain text before the prompt is injected into the chat box

Why this matters:
- Gemma was already behaving correctly and should not be disturbed
- the over-formatting issue was happening on the `gemini-2.5-flash` path

---

### 4. Added regression coverage for today's failure modes

Updated:
- `extension/test/unit/build-user-message.test.ts`
- `extension/test/unit/google-api.test.ts`
- `extension/test/unit/meta-prompt.test.ts`

Coverage added:
- user-message wrapper keeps rewrite-only framing
- main meta prompt preserves staged workflows
- plain-text platform guidance is used instead of markup-heavy hints
- Gemini Flash wrapper-tag leakage is sanitized
- Gemini Flash instruction/list/item markup is flattened into plain text

---

## Files Changed Today

- `codex/Progress.md`
- `extension/src/lib/llm-client.ts`
- `extension/src/lib/meta-prompt.ts`
- `extension/test/unit/build-user-message.test.ts`
- `extension/test/unit/google-api.test.ts`
- `extension/test/unit/meta-prompt.test.ts`

---

## Current Behavior

### Working

- enhancer is guarded against answering the user prompt instead of rewriting it
- staged prompts are preserved as staged prompts
- prompts that reference files/slides/materials stay framed around those inputs
- Gemma compact-path behavior is preserved
- Gemini 2.5 Flash output is normalized back toward plain text when it leaks wrapper tags or XML-like structure

### Current Safe Baseline

- if a future fix is needed, start from the current Flash path
- avoid touching the Gemma compact prompt unless Gemma regresses
- avoid restoring markup-heavy platform hints

---

## Verification Status

Verified today:

```powershell
cd extension
pnpm test
pnpm build
```

Latest result:
- `pnpm test`: 120/120 tests passed
- `pnpm build`: passed

Branch status before creating today's commits:
- local branch: `main`
- `git rev-list --left-right --count origin/main...main` returned `0 0`

---

## Recommended Next Step

Run a live manual check in the extension UI with:
1. one normal conversational prompt on `gemini-2.5-flash`
2. one staged file-analysis / assignment-prep prompt on `gemini-2.5-flash`
3. one Gemma prompt to confirm Gemma stayed stable

If Flash still over-structures prompts, adjust only the main meta prompt or the Flash sanitizer. Do not change the Gemma compact path unless Gemma itself regresses.

---

## Resume Commands

From repo root:

```powershell
cd extension
pnpm test
pnpm build
```

For git state:

```powershell
git status --short
git rev-list --left-right --count origin/main...main
git log --oneline -5
```
