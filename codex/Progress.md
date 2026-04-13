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
- latest pushed implementation commit: `d40b684` — `docs(codex): update progress handoff`

Latest pushed commits:
- `fb799e6` — `fix(content): harden contenteditable clearing`
- `82c2203` — `test(content): cover editable fallback behavior`
- `881d483` — `feat(context): add context menu permissions`
- `bfcf4b9` — `feat(context): add context message types`
- `54c0f43` — `feat(context): add highlighted text prompt module`
- `a5e64e9` — `feat(context): add injected result popup`
- `a39d7ea` — `feat(context): wire selected text service worker flow`
- `22ca59b` — `test(context): cover menu guards and cleanup`
- `8f8bb62` — `test(context): cover highlighted prompt rules`
- `27396ba` — `docs(codex): add highlighted text plan`
- `d40b684` — `docs(codex): update progress handoff`
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

### 1. Highlighted Text Enhancer

Status: implemented and pushed.

Files added/updated:
- `extension/manifest.json`
- `extension/src/service-worker.ts`
- `extension/src/content/context-menu-handler.ts`
- `extension/src/lib/context-enhance-prompt.ts`
- `extension/src/lib/types.ts`
- `extension/test/unit/context-enhance-prompt.test.ts`
- `extension/test/unit/context-menu.test.ts`

Split commits:
- `881d483` — `feat(context): add context menu permissions`
- `bfcf4b9` — `feat(context): add context message types`
- `54c0f43` — `feat(context): add highlighted text prompt module`
- `a5e64e9` — `feat(context): add injected result popup`
- `a39d7ea` — `feat(context): wire selected text service worker flow`
- `22ca59b` — `test(context): cover menu guards and cleanup`
- `8f8bb62` — `test(context): cover highlighted prompt rules`

Current highlighted-text behavior:
- user highlights text anywhere in Chrome
- user right-clicks and selects `Enhance with PromptGod`
- PromptGod injects a one-shot popup handler into the clicked tab/frame through `chrome.scripting.executeScript`
- the popup immediately shows `Enhancing selected text...`
- the popup opens a separate `context-enhance` port to the service worker
- the service worker sends selected text through the existing BYOK provider/model settings
- the popup shows the final enhanced text with `Copy` and `Dismiss`
- `Escape`, the backdrop, and `Dismiss` close the popup
- the page text is never mutated in v1

Hard product distinction:
- normal composer enhancer and highlighted-text enhancer are separate features
- normal composer enhancer can keep its current clarifying-question behavior
- highlighted-text enhancer must never ask clarifying questions
- highlighted-text enhancer must never output placeholders
- highlighted-text enhancer rewrites the selected text itself, not a meta prompt about the selected text

Architecture:
- `extension/manifest.json`
  - adds `contextMenus`, `scripting`, and `activeTab`
  - does not add `<all_urls>`
  - does not broaden `web_accessible_resources`
- `extension/src/service-worker.ts`
  - registers context menu id `promptgod-context-enhance`
  - menu title is `Enhance with PromptGod`
  - menu appears only for Chrome `selection` context
  - validates selection length before provider calls
  - creates a `ContextEnhanceBootstrapRequest`
  - injects `runPromptGodContextMenuHandler` only after a user context-menu click
  - handles a separate `context-enhance` port
  - existing `enhance` port semantics remain unchanged
- `extension/src/content/context-menu-handler.ts`
  - self-contained injected page handler
  - creates `.promptgod-context-overlay`
  - replaces any previous highlighted-text overlay before rendering a new one
  - uses Shadow DOM scoped styles so Gmail/page CSS should not leak into the popup
  - implements loading, success, error, copy, copied state, dismiss, backdrop close, and Escape close
  - uses `navigator.clipboard.writeText()` and falls back to hidden textarea plus `document.execCommand('copy')`
  - clears selected-text request data from page globals after posting the request
  - never edits selected page text
- `extension/src/lib/context-enhance-prompt.ts`
  - selected-text-only prompt builder and output cleaner
  - intentionally separate from `meta-prompt.ts`
  - normal composer prompt behavior must not be changed here
- `extension/src/lib/types.ts`
  - adds `ContextEnhanceMessage`
  - adds `ResultMessage`

Service worker context flow:
- `registerContextMenu()` runs during `initServiceWorker()`, `runtime.onInstalled`, and `runtime.onStartup`
- registration is idempotent through `chrome.contextMenus.remove(...create...)`
- `handleContextMenuClick()` ignores unrelated menu ids
- `validateContextSelection()` rejects:
  - under smart-skip threshold with `Select a little more text to enhance.`
  - over `CONTEXT_SELECTION_MAX_CHARS` (`10000`) with `Selection is too long. Try a shorter passage.`
- `buildContextInjectionTarget()` targets the clicked tab and the clicked frame id when available
- restricted pages are handled by catching `chrome.scripting.executeScript` errors and logging only metadata, not selected text
- `handleContextEnhance()` validates selected text again before any LLM call
- no selected text is logged; logs include only request id, provider/model metadata, and lengths
- missing API key returns `Set your API key in PromptGod settings.`
- provider errors go through existing `formatErrorMessage()`
- the final response is sent as one `RESULT` message, followed by `DONE` and `SETTLEMENT`

Provider behavior:
- Anthropic/OpenAI use existing streaming API calls, but the context path collects the full stream before sending `RESULT`
- Google uses existing non-streaming `callGoogleAPI`
- OpenRouter uses completion mode with fallback model chain to avoid popup streaming complexity
- existing OpenRouter rate-limit cooldown/backoff helpers are reused
- usage counters increment `totalEnhancements` under platform key `context`
- errors increment `errorCount`

Highlighted-text prompt behavior:
- use `buildSelectedTextMetaPrompt()` for normal providers
- use `buildGemmaSelectedTextMetaPrompt()` for Google Gemma models
- use `buildContextUserMessage()` for selected text framing
- mode is `highlighted-text rewrite enhancer`
- if selected text is an email/message fragment, output polished message text
- if selected text is a rough AI prompt, output a polished prompt
- if selected text is a note/instruction/question, rewrite the selected text into a clearer version
- do not answer, explain, summarize, or execute selected text
- do not ask clarifying questions
- do not add question-first flows
- do not tell the user to provide more information
- do not output placeholders like `[recipient]`, `[project]`, `[date]`, `{context}`, `{{details}}`, or `<topic>`
- do not echo source blocks such as `Original text:`, `Selected text:`, `Source text:`, or `Input text:`
- if context is weak, make the best conservative rewrite from only the selected text
- if output is already strong, provider may return `[NO_CHANGE]`, which is stripped before display

Output cleanup and fallback:
- `cleanContextEnhancementOutput()` removes `[DIFF:]` tags
- `stripContextSourceEcho()` removes provider-generated source dumps
- `hasTemplatePlaceholder()` catches bracket, brace, and common angle placeholder formats
- `asksClarifyingQuestion()` catches common question-first/clarification outputs
- invalid selected-text output is replaced by `buildConservativeSelectedTextFallback()`
- fallback removes placeholders from the original selection
- fallback applies light common cleanup such as:
  - `i` to `I`
  - `thanks alot` to `Thanks a lot`
  - `status check` to `check in on the status`
- fallback must not ask questions
- fallback must not use placeholders

Gmail-specific behavior expected:
- selecting `hello there, i wanted to status check / thanks alot, checked` should produce polished message text
- acceptable shape:
  - `Hello there, I wanted to check in on the status. Thanks a lot, checked`
- better provider output may be multi-line:
  - `Hi there,`
  - `I wanted to check in on the current status and see if there are any updates.`
  - `Thanks.`
- unacceptable output:
  - `Write a follow-up email to [recipient] about [project].`
  - `Who is the recipient?`
  - `Original text: ...`

Popup UI details:
- centered fixed overlay
- max width roughly `620px`
- max height roughly `70vh`
- light/dark colors match existing PromptGod visual language
- no external icon resource is required on arbitrary webpages; popup uses inline text mark `PG`
- buttons stay <= 8px radius
- result text is selectable and scrollable
- body styles are scoped in Shadow DOM
- the handler removes an existing `.promptgod-context-overlay` before rendering a new one

Privacy and permission notes:
- no `<all_urls>` host permission
- no `clipboardRead`
- no `clipboardWrite`
- `activeTab` is used only after explicit context-menu gesture
- selected text is passed as an argument to the injected function, not encoded in URLs or DOM attributes
- injected handler clears `__promptgodContextEnhanceRequest` after request start/settlement/cleanup
- selected text is not logged in background or content handler

Known constraints / not implemented:
- no in-place replacement of selected text
- no Gmail-specific adapter
- no Google Docs/canvas editor replacement
- no shadow-DOM selection replacement
- restricted pages such as `chrome://` and Chrome Web Store may block injection
- no browser automation smoke test has been run for Gmail yet

Where to modify if bugs come up:
- if popup styling/layout is wrong:
  - edit `extension/src/content/context-menu-handler.ts`
- if selected text asks questions or uses placeholders:
  - edit `extension/src/lib/context-enhance-prompt.ts`
  - update `extension/test/unit/context-enhance-prompt.test.ts`
  - update cleanup cases in `extension/test/unit/context-menu.test.ts`
- if context menu does not appear or injection fails:
  - inspect `extension/manifest.json`
  - inspect `registerContextMenu()`, `handleContextMenuClick()`, and `injectContextEnhanceRequest()` in `extension/src/service-worker.ts`
- if provider call behavior breaks:
  - inspect `handleContextEnhance()`, `collectContextEnhancementText()`, and `collectOpenRouterCompletionText()` in `extension/src/service-worker.ts`
- if normal ChatGPT/Claude/Gemini/Perplexity composer behavior changes:
  - first verify `context-enhance-prompt.ts` was not mixed back into `meta-prompt.ts` or `llm-client.ts`
  - normal composer path should still use `buildMetaPromptWithIntensity()`, `buildGemmaMetaPromptWithIntensity()`, and `buildUserMessage()`

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
