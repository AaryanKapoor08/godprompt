# PromptGod Universal Selected-Text Enhancer Plan

Draft status: final planning draft for discussion before implementation.

## Decision

Build Option 1 first:

1. User highlights text anywhere in Chrome.
2. User right-clicks.
3. User clicks `Run Text Branch`.
4. PromptGod rewrites the selected text itself into cleaner, stronger text.
5. PromptGod shows a polished on-page result popup with `Copy` and `Dismiss`.

Do not replace text inside page editors in v1.

Keep Option 2 as a later optional phase:

- If the selected text is inside a `textarea`, `input`, or normal `contenteditable`, replace it in place.
- If replacement is risky, fall back to the same result popup.

## What This Feature Is

This is not an explain/summarize feature.

It is the Text branch:

- selected text in any webpage goes in
- cleaner, stronger, immediately usable text comes out
- if the selection is a rough AI prompt, the result is a better prompt
- if the selection is an email/message fragment, the result is polished message text
- the result must never use placeholders or clarifying questions
- the user copies it and pastes it wherever they want

Example:

Selected text:

```text
fix my resume
```

PromptGod result:

```text
Review and improve my resume for clarity, impact, and relevance to the role I am applying for. Focus on stronger bullet points, measurable outcomes, concise wording, and ATS-friendly phrasing. Keep the tone professional and do not invent experience.
```

Example:

Selected text:

```text
hello there, i wanted to status check

thanks alot, checked
```

PromptGod result:

```text
Hi there,

I wanted to check in on the current status and see if there are any updates.

Thanks.
```

## Critique Of The Earlier Plan

The earlier draft was directionally right but had gaps:

- It mixed Option 1 and Option 2 too much. That creates unnecessary risk because direct page editing is the fragile part.
- It made editable replacement part of the main smoke matrix, even though we now want overlay-only first.
- It did not specify enough UI quality requirements for the result popup.
- It did not clearly separate the Text branch from the existing LLM branch.
- It did not explicitly say that selected text must not be logged.
- It did not make the privacy/store disclosure work a release blocker.
- It left too much room to touch existing adapters, which is not needed for v1.

This revised plan fixes those gaps by shipping the lowest-risk useful slice first.

## Product Scope

### V1 In Scope

- Right-click context menu item: `Run Text Branch`.
- Appears only when text is selected.
- Works on arbitrary webpages after explicit user action.
- Sends selected text through existing BYOK provider/model pipeline.
- Uses a separate Text branch rewrite mode.
- Shows an on-page PromptGod result popup.
- User can copy the enhanced text.
- User can dismiss the popup.
- Friendly loading and error states.
- No direct mutation of page text.
- No floating button above selected text.
- No explain/summarize mode.

### V1 Out Of Scope

- Replacing selected text in page editors.
- Gmail/Outlook-specific adapters.
- Google Docs/canvas editor replacement.
- Shadow DOM replacement.
- Desktop app.
- Firefox.
- API/SDK.
- `clipboardWrite` permission.
- `<all_urls>` host permission.

### Optional Later Phase: In-Place Replacement

Do later, after v1 is stable:

- Detect whether selection is inside editable text.
- Replace selected text in normal `textarea`, `input`, and `contenteditable`.
- Fall back to the v1 popup when replacement fails or cannot be verified.
- Add undo for replacement.
- Test Gmail, Outlook, GitHub, Notion, OpenAI Playground, Google AI Studio, and other editors.

## Non-Breakage Guardrails

The current product must not break.

Hard rules:

- Do not change existing platform adapter behavior for ChatGPT, Claude, Gemini, or Perplexity.
- Do not change the existing trigger button behavior.
- Do not change Perplexity's Lexical bridge.
- Do not change current undo behavior.
- Do not change existing `enhance` port semantics.
- New context-menu flow must use a separate port name: `context-enhance`.
- New page handler must be injected only after context-menu click.
- Do not add an always-on content script for all websites.
- Do not add broad persistent host permissions.
- Do not log selected text.
- Do not send any LLM request for too-short or too-long selections.
- Highlighted-text output must not ask clarifying questions.
- Highlighted-text output must not contain placeholders.

Verification before final sign-off:

- Current `npm test` passes.
- Current `npm run build` passes.
- Existing four-platform smoke test remains valid.

## Permission Strategy

Add:

- `contextMenus`: create the selected-text menu item.
- `scripting`: inject the one-shot result-popup handler.
- `activeTab`: temporary access to the clicked tab after explicit user gesture.

Avoid:

- `<all_urls>`.
- `clipboardRead`.
- `clipboardWrite`.

Reasoning:

- The user explicitly invokes the feature through Chrome's context menu.
- `activeTab` is temporary and narrower than persistent all-site access.
- The result popup has a user-clicked `Copy` button, so v1 should not need `clipboardWrite`.
- Privacy policy and Chrome Web Store dashboard disclosures must be updated before release because selected webpage text can be sent to the user's configured LLM provider.

## Architecture

### Service Worker

Responsibilities:

- Register context menu item:
  - id: `promptgod-context-enhance`
  - title: `Run Text Branch`
  - contexts: `selection`
- Register on install/startup defensively.
  - registration must be idempotent because service workers can restart
  - duplicate-menu errors should not break extension startup
- On click:
  - read `info.selectionText`
  - reject selections under the smart-skip threshold
  - reject selections above max length
  - inject the context popup handler into the clicked tab/frame
  - pass a request id and selected text to the handler
- Handle new `context-enhance` port:
  - read existing settings
  - build Text branch rewrite prompt
  - call the selected provider/model
  - collect the full output
  - strip `[DIFF:]`
  - send `RESULT`
  - send friendly `ERROR` on failure

Do not reuse the current streaming DOM insertion loop.

Implementation caution:

- The existing `handleEnhance()` path streams tokens into platform composers. Avoid deep refactors there.
- For v1, prefer a separate `handleContextEnhance()` that shares only safe pure helpers: settings lookup, prompt building, provider calls/parsers, error formatting.
- If provider-call code needs extraction, keep it behavior-preserving and cover it with tests before wiring the context menu path.

### Generic Prompt Mode

Add a separate selected-text rewrite builder in its own module.

Rules:

- Rewrite the selected text itself.
- If the selection is a rough AI prompt, output a better prompt.
- If the selection is an email/message fragment, output polished message text.
- Do not answer the selected text.
- Do not explain it.
- Do not summarize it.
- Preserve intent.
- Add only improvements that can be safely inferred from the selected text.
- Output must be sendable as-is.
- Never ask clarifying questions.
- Never use placeholders.
- Never echo the original selected text in a separate source block.
- If context is weak, produce the best conservative rewrite from only the selected text.

### Injected Popup Handler

Create:

- `extension/src/content/context-menu-handler.ts`

Responsibilities:

- Render a PromptGod popup on the page.
- Show loading state immediately.
- Connect to `context-enhance`.
- Render enhanced prompt on success.
- Render friendly error on failure.
- Provide `Copy` and `Dismiss`.
- Avoid duplicate popups by replacing any existing `.promptgod-context-overlay`.
- Never mutate selected page text in v1.

### Handler Build Wiring

Must verify:

- The handler is emitted into `dist`.
- `chrome.scripting.executeScript({ files: [...] })` points at the emitted file correctly.
- The handler can run on normal webpages without relying on `extension/src/content/styles.css`.
- The handler does not crash on restricted pages like `chrome://` and Chrome Web Store pages.

Restricted-page constraint:

- Chrome will block script injection on some pages.
- Do not add `notifications` permission just to report this edge case.
- V1 definition of graceful failure on restricted pages: no extension crash, no stuck service-worker request, and no broad permission expansion.

Important implementation detail:

- A file injected with `chrome.scripting.executeScript({ files })` does not naturally receive arguments.
- Use one of these patterns:
  - preferred: inject a small function with `args` that stores `{ requestId, selectedText }` on `globalThis`, then inject the handler file
  - or: store request data in `chrome.storage.session` keyed by request id, and have the handler read it
  - avoid: logging or encoding selected text into URLs, DOM attributes, or generated script strings

Build risk to resolve early:

- Vite/CRX must include `context-menu-handler.ts` as an emitted runtime asset even though it is not an always-on content script.
- If CRXJS does not emit it automatically, add an explicit build input or use a self-contained `func` injection for the v1 overlay.

## Popup UI Requirements

The new on-page popup must match the current PromptGod extension UI.

Use the same visual language from the existing popup:

- System font stack.
- 8px max border radius.
- Indigo primary action:
  - light primary: `#6366f1`
  - hover: `#4f46e5`
  - dark primary: `#818cf8`
- Light mode:
  - background `#ffffff`
  - subtle background `#f8fafc`
  - text `#0f172a`
  - muted text `#64748b`
  - border `#e2e8f0`
- Dark mode:
  - background `#0c0a09`
  - subtle background `#1c1917`
  - text `#fafaf9`
  - muted text `#a8a29e`
  - border `#292524`

Popup structure:

- Small PromptGod header row:
  - icon or compact text mark
  - `PromptGod`
  - status text: `Text branch result`
- Main result area:
  - selectable enhanced text
  - max height with smooth internal scroll
  - preserve line breaks
- Footer actions:
  - primary `Copy`
  - secondary `Dismiss`
- Optional small copied state:
  - button changes to `Copied`
  - subtle success color for 1.5 seconds

Motion:

- Fade and slide in over 160-220ms.
- No big bounce.
- No flashy animation.
- Loading spinner should match existing trigger spinner behavior.
- Copy success should be calm and immediate.

Placement:

- Desktop: fixed overlay panel near the center or slightly above center.
- Max width around 620px.
- Width: `min(620px, calc(100vw - 32px))`.
- Max height around 70vh.
- Mobile/narrow viewport: 16px margins.
- High z-index above page UI.
- Backdrop should be subtle, not heavy:
  - light: transparent/soft backdrop
  - dark: mild `rgba(0,0,0,0.45)`

Taste constraints:

- No giant modal unless needed.
- No marketing copy.
- No gradients or decorative blobs.
- No nested cards.
- No purple-blue gradient theme.
- Buttons stay 6-8px radius.
- Text must wrap cleanly.
- Popup must not exceed viewport.
- User must always be able to dismiss with button and `Escape`.

Icon constraint:

- The existing packaged icon is currently web-accessible only on the four supported AI sites.
- For arbitrary webpages, avoid adding broad web-accessible resources just for the popup icon.
- Preferred v1: use a small inline text mark or inline data URL/SVG inside the injected handler.
- Do not expand icon `web_accessible_resources` to all websites unless there is a clear reason.

Suggested user-facing copy:

- Loading: `Running text branch...`
- Success header: `Text branch result`
- Copy button: `Copy`
- Copied state: `Copied`
- Dismiss: `Dismiss`
- Too short: `Select a little more text to enhance.`
- Too long: `Selection is too long. Try a shorter passage.`
- No key: `Set your API key in PromptGod settings.`
- Generic failure: `Could not enhance this selection. Try again.`

## Implementation Phases

### Phase 0: Baseline And Isolation

Tasks:

- Record current `git status`.
- Do not touch existing uncommitted files unless explicitly needed.
- Run:
  - `cd extension`
  - `npm test`
  - `npm run build`
- Note existing CRX MAIN-world warning as expected.

Exit criteria:

- Baseline is known before feature work.

### Phase 1: Context Menu Registration

Files likely touched:

- `extension/manifest.json`
- `extension/src/service-worker.ts`
- `extension/test/unit/`

Tasks:

- Add minimal permissions.
- Register `Run Text Branch`.
- Ensure menu appears only for selected text.
- Add selection length guards.
- Add restricted-page safe failure.
- Decide and implement request handoff between service worker and injected handler.
- Add tests where feasible.

Exit criteria:

- Build passes.
- Existing tests pass.
- No existing content-script match patterns changed.

### Phase 2: Text Branch Rewrite Pipeline

Files likely touched:

- `extension/src/service-worker.ts`
- `extension/src/lib/context-enhance-prompt.ts`
- `extension/src/lib/types.ts`
- `extension/test/unit/context-enhance-prompt.test.ts`

Tasks:

- Add isolated Text branch prompt builder.
- Add `context-enhance` port.
- Reuse provider/model/settings.
- Collect complete result.
- Strip `[DIFF:]`.
- Strip provider source-echo blocks.
- Reject/repair placeholder and clarifying-question outputs.
- Return friendly errors.
- Add tests proving Text branch mode rewrites text directly without questions or placeholders.

Exit criteria:

- Existing platform prompts unchanged.
- Existing trigger flow tests unchanged.

### Phase 3: Polished Result Popup

Files likely touched:

- `extension/src/content/context-menu-handler.ts`
- maybe a small scoped style helper/module
- build wiring if needed

Tasks:

- Inject handler on context-menu click.
- Confirm the handler bundle is emitted and injectable from `dist`.
- Render loading popup.
- Render success popup with enhanced prompt.
- Add copy/dismiss.
- Add `Escape` close.
- Add copied state.
- Keep all styles scoped under `promptgod-context-*`.

Exit criteria:

- Static webpage selected text produces a polished popup.
- Copy button works without `clipboardWrite`.
- Popup does not visually clash with existing PromptGod UI.

### Phase 4: Hardening And Release Safety

Tasks:

- No selected text in console logs.
- No raw provider JSON in UI.
- Offline and blocked-request errors are friendly.
- One active context enhancement per page/frame.
- Request ids are cleaned up after success, error, timeout, or disconnect.
- Context-menu flow has a bounded timeout so the popup cannot spin forever.
- Privacy policy update checklist.
- Chrome Web Store dashboard disclosure checklist.
- Manual restricted-page behavior.

Exit criteria:

- No broad permissions.
- No current product regression.
- Release notes clearly describe Text branch behavior.

### Optional Phase 5: In-Place Replacement

Do not start until v1 is stable.

Tasks:

- Replace selection in standard `textarea`.
- Replace selection in text-like `input`.
- Replace selection in basic `contenteditable`.
- Verify replacement before reporting success.
- Fall back to v1 popup on uncertainty.
- Add undo.
- Run editor smoke matrix.

## Test Plan

Automated:

- Existing unit tests remain green.
- Existing build remains green.
- Meta-prompt generic mode tests.
- Selection guard tests.
- Error translation tests for context path.
- Handler request handoff tests where feasible.
- Timeout/settlement test for context path.
- Copy/popup state tests where feasible without browser automation.

Manual existing-product smoke:

- ChatGPT trigger enhance, stream, undo.
- Claude trigger enhance, stream, undo.
- Gemini trigger enhance, stream, undo.
- Perplexity trigger enhance, final insert, undo.

Manual new-feature smoke:

- Static webpage text -> popup result.
- Documentation/blog text -> popup result.
- GitHub text selection -> popup result.
- Text selected inside textarea -> popup result only in v1.
- No API key -> friendly popup error.
- Too-short selection -> no LLM call.
- Too-long selection -> no LLM call.
- `Escape` closes popup.
- `Copy` works and shows `Copied`.
- Restricted page does not crash extension.

## Final Choices

Current choices:

- V1 behavior: overlay/popup only.
- Optional later behavior: in-place replacement.
- Menu label: `Run Text Branch`.
- Recommended max length: 10,000 characters.
- No explain mode.
- No `clipboardWrite` permission in v1.
