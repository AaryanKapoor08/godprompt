# PromptGod — Codex Progress

Last updated: 2026-04-11

This file is the compact Codex handoff for the current workspace. It is focused on prompt-enhancer fixes and the current Perplexity insertion issue so the next session can resume from the right baseline quickly.

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

### 5. Improved non-Perplexity prompt output and stream injection

Updated:
- `extension/src/content/ui/trigger-button.ts`
- `extension/src/lib/meta-prompt.ts`
- `extension/test/unit/meta-prompt.test.ts`

What changed:
- kept completed stream rendering smooth by draining buffered text after `DONE` / `SETTLEMENT`
- avoided a final full replacement when the editor already contains the normalized enhanced text
- added a study/PDF/slides/exam-prep prompt rule so rewrites stay as natural sendable prompts instead of assistant-style "Here's the plan" responses
- added regression coverage for the `34_BST_merged.pdf` + lecture slides study-prompt pattern

Confirmed good user-facing output:
- input about `34_BST_merged.pdf`, lecture slides, exam prep, beginner level, divide into parts, then start Part 1
- output became a clean natural prompt:
  - "Use 34_BST_merged.pdf and the accompanying lecture slides as the source material. Teach me the full content for my exam from the basics..."

Commits pushed:
- `bed04f0` — `fix(content): smooth completed stream injection`
- `77f1abd` — `fix(meta-prompt): keep study material rewrites natural`

---

### 6. Ongoing issue: Perplexity editor insertion remains unstable

Status: unresolved / flagged for future work.

Observed behavior:
- Perplexity sometimes preserves the original prompt after enhancement
- later attempts caused repeated insertion of the same enhanced prompt
- latest screenshot shows PromptGod reports enhancement complete in the console, but Perplexity's visible editor still contains the original prompt
- Perplexity DevTools also shows page-level Cloudflare/CORS failures loading Perplexity scripts, which may mean the Perplexity runtime/editor is not fully hydrated in that tab

Files touched during attempted Perplexity fixes:
- `extension/src/content/adapters/perplexity.ts`
- `extension/src/content/ui/trigger-button.ts`

Perplexity-related commits pushed:
- `29a5660` — `fix(perplexity): replace prompt without preserving stale text`
- `d77d3c7` — `fix(perplexity): force contenteditable replacement`
- `f64e40b` — `fix(perplexity): avoid duplicate insert events`
- `133c8d0` — `fix(perplexity): prefer native editor replacement`
- `953e8ab` — `fix(perplexity): fall back to preview and copy`

Current recommendation:
- treat Perplexity as an ongoing issue, not a solved platform
- do not keep layering blind replacement strategies
- next debugging should instrument the selected editor node and replacement path:
  - selector used
  - element tag/attributes
  - whether it is `textarea`, plain `contenteditable`, or Lexical
  - before/after text length
  - whether manual select/delete/paste works on the same tab
- keep all non-Perplexity paths untouched while debugging this
- if Perplexity page runtime is broken by its own Cloudflare/CORS issue, prefer preview/copy fallback over direct insertion

---

## Files Changed Today

- `codex/Progress.md`
- `extension/src/content/ui/trigger-button.ts`
- `extension/src/content/adapters/perplexity.ts`
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
- study/PDF/slides/exam-prep prompts now stay as natural sendable prompts instead of assistant-style numbered plans
- Gemma compact-path behavior is preserved
- Gemini 2.5 Flash output is normalized back toward plain text when it leaks wrapper tags or XML-like structure
- non-Perplexity stream completion drains buffered text instead of instantly pasting over the editor

### Current Safe Baseline

- if a future fix is needed, start from the current Flash path
- avoid touching the Gemma compact prompt unless Gemma regresses
- avoid restoring markup-heavy platform hints
- avoid touching ChatGPT/Claude/Gemini injection while investigating Perplexity

### Ongoing / Not Safe To Call Fixed

- Perplexity direct insertion is not reliable yet
- latest user report: enhancement completes, but the visible Perplexity editor still contains the original prompt
- keep Perplexity flagged until a live manual test proves replacement works on a fresh Perplexity tab with the unpacked extension reloaded

---

## Verification Status

Verified:

```powershell
cd extension
npm test
npm run build
```

Latest result:
- `npm test`: 121/121 tests passed
- `npm run build`: passed

Branch status:
- local branch: `main`
- latest pushed commit at time of this update: `953e8ab`

---

## Recommended Next Step

For non-Perplexity:
1. run one normal prompt on ChatGPT
2. run one staged file-analysis / assignment-prep prompt
3. run the `34_BST_merged.pdf` study-prompt case
4. run one Gemma prompt to confirm Gemma stayed stable

For Perplexity:
1. reload the unpacked extension
2. open a fresh Perplexity tab
3. confirm manual select/delete/paste works in the composer
4. inspect and log the selected editor node before trying another code change
5. if the page still shows Perplexity's own Cloudflare/CORS script failures, treat direct insertion as blocked and rely on preview/copy fallback

---

## Resume Commands

From repo root:

```powershell
cd extension
npm test
npm run build
```

For git state:

```powershell
git status --short
git rev-list --left-right --count origin/main...main
git log --oneline -10
```
