# PromptGod — Codex Progress

Last updated: 2026-04-13

This is the compact handoff for the current workspace. The local `main` branch and `origin/main` are aligned, and the current working code has been pushed to GitHub.

Current status: no active unresolved issues are pending.

---

## Current Baseline

Branch:
- `main`

Remote state:
- `origin/main...main`: `0 0`
- latest pushed commit: `9d774e4` — `feat(context): add highlighted text enhancer`

Latest pushed commits:
- `1ad9e82` — `fix(content): harden editable text fallback`
- `9d774e4` — `feat(context): add highlighted text enhancer`
- `1cd26a8` — `fix(perplexity): write composer through lexical bridge`
- `7117723` — `fix(ui): keep undo visible on hosted composers`

Verification after the latest changes:

```powershell
cd extension
npm run build
npm test
```

Latest result:
- `npm run build`: passed
- `npm test`: 143/143 tests passed

Note:
- Vite/CRX prints a warning that `src/content/perplexity-main.ts` is a `MAIN` world content script and does not support HMR. This is expected and not a failure.
- Git prints a local permission warning for `C:\Users\Jaska/.config/git/ignore`. This did not affect status, commits, or pushes.

---

## Session Summary

### 1. Highlighted-text enhancer implemented

Status: implemented and pushed.

Files added/updated:
- `extension/manifest.json`
- `extension/src/service-worker.ts`
- `extension/src/content/context-menu-handler.ts`
- `extension/src/lib/context-enhance-prompt.ts`
- `extension/src/lib/types.ts`
- `extension/test/unit/context-enhance-prompt.test.ts`
- `extension/test/unit/context-menu.test.ts`

Commit:
- `9d774e4` — `feat(context): add highlighted text enhancer`

Current highlighted-text behavior:
- user selects text on a normal webpage and right-clicks `Enhance with PromptGod`
- the handler is injected only after the explicit context-menu click
- selected text is sent through the existing BYOK provider/model settings
- the result appears in an on-page popup with `Copy`, `Dismiss`, and `Escape` close
- no page text is mutated in v1
- no `<all_urls>` host permission was added
- highlighted-text prompt logic lives separately in `context-enhance-prompt.ts`
- normal composer prompt behavior remains separate and unchanged

Highlighted-text output rules:
- rewrite the selected text itself
- if the selection is an email/message fragment, return polished message text
- if the selection is a rough AI prompt, return a polished prompt
- never ask clarifying questions
- never output placeholders
- never echo `Original text:` / source blocks

Verification:
- `npm run build`: passed
- `npm test`: 143/143 tests passed

---

### 2. Contenteditable fallback hardened

Status: fixed and pushed.

Files updated:
- `extension/src/content/dom-utils.ts`
- `extension/test/unit/dom-utils.test.ts`

Commit:
- `1ad9e82` — `fix(content): harden editable text fallback`

Current behavior:
- contenteditable clearing falls back to DOM mutation when `execCommand('delete')` is unavailable or fails
- synthetic input-event insertion falls back to DOM selection insertion when editors ignore the event
- tests cover ignored synthetic input events and failed delete/insert commands

---

### 3. Prompt rewrite guardrails remain stable

Previously updated:
- `extension/src/lib/llm-client.ts`
- `extension/test/unit/build-user-message.test.ts`
- `extension/src/lib/meta-prompt.ts`
- `extension/test/unit/meta-prompt.test.ts`

Current behavior:
- the enhancer treats the user prompt as source text to rewrite, not instructions to execute
- staged workflows remain staged prompts instead of being converted into final answers
- prompts that reference files, slides, PDFs, code, or documents stay framed around those inputs
- study/exam-prep prompts stay natural and sendable
- Gemini Flash output cleanup still removes leaked wrapper/XML-like tags
- Gemma compact-path behavior remains preserved

No current action needed here.

---

### 4. Perplexity insertion issue resolved

Status: fixed and pushed.

Files updated:
- `extension/manifest.json`
- `extension/src/content/adapters/perplexity.ts`
- `extension/src/content/perplexity-main.ts`
- `extension/src/content/ui/trigger-button.ts`

Commit:
- `1cd26a8` — `fix(perplexity): write composer through lexical bridge`

Root cause:
- Perplexity uses a Lexical-style editor.
- Earlier fixes mutated visible `contenteditable` DOM and judged success from immediate `textContent`.
- Lexical keeps the real prompt in editor state, so Perplexity could reconcile the DOM back to stale/original text.
- Normal extension content scripts run in an isolated world, so they cannot reliably access the page-side Lexical editor instance.

What changed:
- added `extension/src/content/perplexity-main.ts` as a Perplexity-only `MAIN` world content script
- registered the main-world bridge only for `perplexity.ai` / `www.perplexity.ai`
- the Perplexity adapter now dispatches a bridge event to set the Lexical editor state directly
- native DOM insertion remains only as a fallback
- removed the Perplexity preview/copy fallback popup path that previously showed unwanted UI

Current Perplexity behavior:
- direct prompt replacement works through the Lexical bridge
- no preview overlay appears
- no manual copy/paste fallback is used as the normal path
- Perplexity undo button appears and works

Old broken Perplexity commits still exist in git history, but they are superseded by `1cd26a8` on current `main`.

---

### 5. Undo button visibility fixed

Status: fixed and pushed.

File updated:
- `extension/src/content/ui/undo-button.ts`

Commit:
- `7117723` — `fix(ui): keep undo visible on hosted composers`

Root cause:
- Perplexity and Gemini can clip children appended inside their composer/editor DOM.
- The undo button was being appended into those hosted composer wrappers with absolute positioning, so it could exist but be visually hidden.

What changed:
- Perplexity and Gemini now use viewport-fixed undo placement instead of nesting the undo button inside clipped editor DOM
- Gemini placement was adjusted to match the ChatGPT-style below-composer alignment
- Perplexity’s working undo placement was preserved
- ChatGPT and Claude undo placement behavior remains unchanged
- undo keydown listener cleanup now removes the listener from the actual input element, not only ChatGPT’s selector

Current undo behavior:
- ChatGPT: existing placement behavior
- Claude: existing placement behavior
- Gemini: visible below/right of composer like ChatGPT
- Perplexity: visible and working with the fixed placement

No current action needed here.

---

## Current Working Behavior

Working:
- ChatGPT prompt enhancement
- Claude prompt enhancement
- Gemini prompt enhancement
- Perplexity prompt enhancement
- highlighted text enhancement via right-click context menu
- Perplexity direct insertion through the Lexical bridge
- undo button visibility on Perplexity and Gemini
- no Perplexity preview/copy popup fallback
- rewrite-only guardrail against answering the prompt
- staged workflow preservation
- file/PDF/slides/exam-prep prompt preservation
- Gemini Flash wrapper-tag cleanup
- smooth non-Perplexity stream completion
- highlighted-text rewrites do not ask clarifying questions or use placeholders

No active issues:
- no current Perplexity issue pending
- no current undo placement issue pending
- no currently known blocking regression pending

---

## Files Changed In Latest Work

Perplexity insertion:
- `extension/manifest.json`
- `extension/src/content/adapters/perplexity.ts`
- `extension/src/content/perplexity-main.ts`
- `extension/src/content/ui/trigger-button.ts`

Undo visibility:
- `extension/src/content/ui/undo-button.ts`

Progress handoff:
- `codex/Progress.md`

Highlighted-text enhancement:
- `extension/manifest.json`
- `extension/src/service-worker.ts`
- `extension/src/content/context-menu-handler.ts`
- `extension/src/lib/context-enhance-prompt.ts`
- `extension/src/lib/types.ts`
- `extension/test/unit/context-enhance-prompt.test.ts`
- `extension/test/unit/context-menu.test.ts`

Contenteditable fallback:
- `extension/src/content/dom-utils.ts`
- `extension/test/unit/dom-utils.test.ts`

---

## Recommended Manual Smoke Check

After reloading the unpacked extension:

1. Perplexity:
   - open a fresh Perplexity tab
   - type a prompt
   - run PromptGod
   - confirm the visible composer is replaced with the enhanced prompt
   - confirm no preview/copy popup appears
   - confirm undo appears and restores the original prompt

2. Gemini:
   - type a prompt
   - run PromptGod
   - confirm the enhanced prompt appears
   - confirm undo appears below/right of the composer in the ChatGPT-style placement
   - confirm undo restores the original prompt

3. Quick regression:
   - run one normal ChatGPT prompt
   - run one normal Claude prompt
   - run the `34_BST_merged.pdf` + lecture slides study prompt if those files are available in the target chat

---

## Resume Commands

From repo root:

```powershell
cd extension
npm run build
npm test
```

For git state:

```powershell
git status --short
git fetch origin main
git rev-list --left-right --count origin/main...main
git log --oneline -10
```
