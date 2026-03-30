# PromptGod — Progress Tracker

Update this file as you complete each phase.

**Current Phase: 15.7 (15.6 complete, awaiting Chrome Web Store approval)**

---

## Phase Checklist

### PHASE 1 — Project Scaffold [complete]

- [x] `pnpm build` succeeds with zero errors
- [x] Extension loads in Chrome with no errors in the extensions page
- [x] Clicking the extension icon shows the popup
- [x] Console shows content script log on ChatGPT/Claude/Gemini pages
- [x] `.gitignore` excludes node_modules, dist, .env
- [x] Commit: `chore(extension): scaffold project with Vite and Manifest V3`
- Notes: Verified working on ChatGPT and Claude. CRXJS needed named import `{ crx }` not default import.

### PHASE 2 — ChatGPT Adapter (Read Only) [complete]

- [x] `adapter.matches()` returns true on `chatgpt.com`
- [x] `adapter.getPromptText()` returns the exact text typed in the input field
- [x] `adapter.getSendButton()` finds the send button element
- [x] `adapter.getConversationContext()` returns correct `isNewConversation` and `conversationLength`
- [x] Structured log appears in console with platform, prompt length, and context
- [x] Commit: `feat(chatgpt): implement read-only platform adapter with conversation context`
- Notes: All 4 adapter methods verified manually in Chrome DevTools on chatgpt.com. Text lives in `<p>` inside `div#prompt-textarea` — `textContent.trim()` works. Send button is last `<button>` in the composer form. Conversation length uses `[data-testid^="conversation-turn-"]`.

### PHASE 3 — Trigger Button + Error Toast [complete]

- [x] Button appears adjacent to ChatGPT send button
- [x] Button re-appears after navigating to a new chat
- [x] Clicking the button logs the current prompt text
- [x] Ctrl+Shift+E triggers the same handler
- [x] Button shows loading spinner when clicked
- [x] Double-clicking does not fire the handler twice
- [x] Typing "hi" and clicking enhance shows "Prompt too short to enhance" toast
- [x] `shouldSkipEnhancement()` unit test passes
- [x] Toast component renders and auto-dismisses
- [ ] Commit: `feat(content): inject trigger button with toast and smart skip`
- Notes: All 9 unit tests pass. All checkpoints verified manually in Chrome on chatgpt.com. MutationObserver handles SPA re-renders.

### PHASE 4 — Service Worker Messaging (Ports) [complete]

- [x] Click trigger button → service worker logs the received prompt
- [x] Service worker sends 3 mock tokens at intervals → content script logs each one
- [x] Service worker sends DONE → content script logs completion, port disconnects
- [x] Error path works: service worker sends ERROR → content script logs error, port disconnects
- [x] Works after navigating to a new chat (service worker wakes up on connect)
- [x] Multiple rapid clicks don't open multiple ports
- [x] Commit: `feat(service-worker): implement port-based message passing for streaming`
- Notes: Port-based streaming verified in Chrome. Service worker sends 3 mock tokens at 200ms intervals. Content script logs each token and completion. Error path sends ERROR message and disconnects port. onDisconnect handler catches unexpected disconnections.

### PHASE 5 — LLM Integration (BYOK) + Minimal Popup [complete]

- [x] Minimal popup shows API key input, saves to `chrome.storage.local`
- [x] `buildUserMessage()` unit test passes
- [x] Anthropic SSE parser unit test passes (mock SSE data)
- [x] `validateApiKey()` unit test passes
- [x] Clicking trigger button with a real API key → tokens stream back via port
- [x] Meta-prompt template interpolates platform and context correctly
- [x] No API key is committed to git
- [x] Commit: `feat(service-worker): integrate Anthropic streaming API with minimal popup`
- Notes: Added OpenRouter support (sk-or- keys) alongside Anthropic and OpenAI. Tested with OpenRouter free model (nvidia/nemotron). 36 unit tests passing. Meta-prompt distilled from techniques guide with domain-specific gap checklists, anti-pattern rules, and technique priority order. OpenAI SSE parser also added (used by OpenRouter).

### PHASE 6 — Streaming DOM Replacement [complete]

- [x] Clicking trigger button → input field text is replaced with enhanced prompt token-by-token
- [x] ChatGPT's send button is active/enabled after enhancement completes
- [x] Streaming looks smooth — no flicker, no duplicate text
- [x] Works with short prompts (1 sentence) and longer prompts (paragraph)
- [x] If input element disappears mid-stream, error toast appears (not a crash)
- [x] Commit: `feat(chatgpt): implement streaming DOM text replacement with execCommand fallback`
- Notes: Uses execCommand('insertText') as primary strategy with InputEvent+DataTransfer fallback. Token accumulation in trigger-button.ts calls setPromptText() on each TOKEN message. Added guard for stale chrome.runtime after extension reload.

### PHASE 7 — Undo System [complete]

- [x] After enhancement, undo button appears near the input field
- [x] Clicking undo restores the exact original prompt
- [x] ChatGPT send button remains active after undo
- [x] Undo button disappears after 10 seconds
- [x] Undo button disappears if user edits the text manually
- [x] Undo button disappears if user sends the message
- [x] If streaming is interrupted, partial text remains and undo button still appears
- [x] Commit: `feat(undo): implement undo button with auto-dismiss and interrupt handling`
- Notes: Undo button positioned below composer with fade-in animation. Dismisses on keydown (user edit), send button click, empty input detection (MutationObserver), or 10s timeout. Original prompt cached before first TOKEN.

### PHASE 8 — Full Popup Settings [complete]

- [x] Popup shows API key input and model dropdown (BYOK-only, no free tier)
- [x] Entering an Anthropic key shows Claude models; entering an OpenAI key shows GPT models
- [x] API key validates format on input (visual feedback)
- [x] Settings persist after closing and reopening popup
- [x] Service worker reads stored settings and routes accordingly
- [x] Commit: `feat(popup): implement full settings page with provider detection`
- Notes: Provider auto-detection from key prefix, model dropdown with provider-specific options (Anthropic/OpenAI/OpenRouter). Service worker reads model from storage, routes to correct provider. Added callOpenAIAPI() for direct OpenAI support.

### PHASE 9 — OpenAI BYOK Support [deferred — post-launch]

- [x] `parseOpenAIStream()` unit test passes (mock SSE data)
- [ ] Entering an OpenAI key in popup + clicking enhance → tokens stream and replace input text
- [ ] Streaming DOM replacement works identically to Anthropic path
- [ ] Undo works after OpenAI enhancement
- [ ] Switching between Anthropic and OpenAI keys works without restart
- [ ] Commit: `feat(llm-client): add OpenAI streaming support for BYOK mode`
- Notes: Code exists but untested with a real OpenAI key. Deferred to post-launch — not blocking. OpenAI BYOK is optional; Anthropic + OpenRouter cover the core use case.

### PHASE 10 — Backend Server [complete — unused in current architecture]

- [x] `pnpm dev` starts server on port 3000
- [x] `GET /health` returns `{ status: 'ok' }`
- [x] `POST /api/enhance` with valid prompt returns SSE stream of enhanced text
- [x] `POST /api/enhance` with invalid platform returns 400
- [x] `POST /api/enhance` with 15,000 char prompt returns 400
- [x] 11th request from same IP within an hour returns 429 with `X-RateLimit-Remaining: 0`
- [x] All successful responses include `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers
- [x] Rate limiter unit test passes
- [x] Request validation unit test passes
- [x] Integration test passes
- [x] `.env` is in `.gitignore`, `.env.example` exists
- [x] CORS rejects requests from non-allowed origins (when not using `*`)
- [x] Commit: `feat(backend): implement Hono server with validation, rate limiting, and headers`
- Notes: Backend server built but NOT used in final architecture. Free tier was removed — extension is BYOK-only. Server code remains in `server/` but is not deployed.

### PHASE 11 — Free Tier Integration [removed — BYOK-only architecture]

- Notes: Free tier was removed from the extension. All free-tier code (handleFreeTier, mode toggle, usage counter, backend URL config) has been stripped from the extension. Users bring their own API key (OpenRouter recommended). No backend server is needed or deployed.

### PHASE 12 — Claude.ai Adapter [complete]

- [x] Trigger button appears correctly on Claude.ai
- [x] `getPromptText()` reads text accurately
- [x] `getConversationContext()` returns correct values
- [x] Streaming replacement works — text appears token-by-token
- [x] Claude's send button is active after enhancement
- [x] Undo restores original prompt
- [x] Button re-appears after navigating to a new conversation
- [x] Error toast appears if input element not found
- [x] Commit: `feat(claude-adapter): implement full platform adapter for Claude.ai`
- Notes: ClaudeAdapter implements PlatformAdapter interface. Input element found via contenteditable ProseMirror div with multiple fallback selectors. Send button found by aria-label "Send Message" with fallback to last button in fieldset. getConversationContext() counts message elements. Uses same replaceText() from dom-utils as ChatGPT. Registered in content script index.ts.

### PHASE 13 — Gemini Adapter + Polish [complete]

- [x] Trigger button appears correctly on Gemini
- [x] Full enhancement flow works on Gemini (streaming + undo)
- [x] `getConversationContext()` works on all three platforms
- [x] All three platforms pass the manual testing checklist
- [x] Error states display correctly on all platforms
- [x] Streaming interruption keeps partial text + shows undo on all platforms
- [x] Production build loads and works on all three platforms
- [x] No console errors on any platform during normal use
- [x] Meta-prompt is in sync between extension and server
- [x] Commit: `feat(gemini): implement adapter and polish all platforms`
- Notes: GeminiAdapter implements PlatformAdapter. Input via .ql-editor (Quill editor) with fallbacks. Send button via aria-label "Send message". Conversation context counts model-response/user-query elements. 36 extension tests passing. Production build clean.

### PHASE 14 — Perplexity Adapter [complete]

- [x] Trigger button appears correctly on Perplexity
- [x] `getPromptText()` reads text accurately
- [x] `getConversationContext()` returns correct values
- [x] Streaming replacement works — text appears token-by-token
- [x] Send button active after enhancement
- [x] Undo restores original prompt
- [x] Button re-appears after navigating to a new search
- [x] Error toast appears if input element not found
- [x] Commit: `feat(perplexity): implement platform adapter for Perplexity.ai`
- Notes: All checkpoints verified manually in Chrome on perplexity.ai.

### PHASE 15 — Chrome Web Store Launch [submitted — awaiting review]

- [x] Perplexity trigger button appears and is correctly placed
- [x] Full enhancement flow works on Perplexity (streaming + undo)
- [x] Free tier removed — extension is BYOK-only (no backend needed)
- [x] Popup updated: no mode toggle, API key input shown by default, OpenRouter link and helper text added
- [x] Placeholder icons replaced with real branded icons (人 logo)
- [x] Trigger button uses brand icon instead of sparkle SVG
- [x] Popup header uses brand icon (loaded via chrome.runtime.getURL)
- [x] Extension renamed from PromptPilot to PromptGod (manifest, popup, all logs, meta-prompt, OpenRouter headers)
- [x] Privacy policy drafted (privacy_policy.pdf) — covers local storage, third-party APIs, no data collection
- [x] 36 unit tests passing, production build clean
- [x] ChatGPT trigger button placement needs verification (currently inserting before send button — may need adjustment for current ChatGPT DOM)
- [x] Privacy policy hosted at a public URL (https://aaryankapoor08.github.io/promptGod-privacypolicy/)
- [x] `dist/` zipped and uploaded to Chrome Web Store
- [x] Extension submitted for review
- [ ] After approval: published extension tested end-to-end
- Notes: Architecture changed to BYOK-only. No backend deployment needed. Users get their own key from OpenRouter (free models available) or use Anthropic/OpenAI keys directly. Privacy policy written by developer, covers GDPR/CCPA/PIPEDA.

### PHASE 15.5 — Source Code Sync From ZIP [complete]

- [x] Read compiled JS from promptgod.zip dist/assets/
- [x] Identified all differences: PromptPilot→PromptGod rename, sparkle SVG→brand icon, free tier removal, ChatGPT button placement, popup BYOK-only, OpenRouter headers, web_accessible_resources
- [x] Updated all TypeScript source files to match zip build
- [x] Deleted unused config.ts (BACKEND_URL, RATE_LIMIT_PER_HOUR)
- [x] `pnpm build` succeeds — llm-client, service-worker, and popup CSS hashes match zip exactly
- [x] 36 unit tests passing
- [x] Zero remaining "PromptPilot" references in extension/src/
- [x] 12 separate logical commits pushed to GitHub
- [x] Updated ProjectSummary.md to reflect BYOK-only architecture
- Notes: The content script and popup JS get different Vite hashes each build (expected), but the actual code logic matches the zip. The llm-client, service-worker, and popup CSS output are byte-for-byte identical.

### PHASE 15.6 — Post-Sync Bugfixes [complete]

- [x] Icon files replaced with branded 人 icons resized from `generated-image.png` at 16x16, 48x48, 128x128
- [x] Toolbar icon, trigger button icon, and popup header all show correct branded icon
- [x] ChatGPT trigger button positioned via absolute positioning inside form — stays fixed at bottom regardless of text length
- [x] `pnpm build` succeeds, 36 unit tests passing
- [x] Commit: `fix(extension): replace placeholder icons and fix ChatGPT button placement`
- Notes: Icons cropped from generated-image.png (black 人 on white rounded square) with contrast boost. ChatGPT button uses `position: absolute; bottom: 8px; right: 76px` inside the form to avoid dependency on ChatGPT's internal DOM nesting.

### PHASE 15.7 — Meta-Prompt: Stop Answering, Start Rewriting [not started]

- [ ] `buildUserMessage()` wraps raw prompt with `"""` delimiters, "Rewrite the following prompt" instruction, AND platform/context info
- [ ] Platform and context included in user message (reinforces system prompt for weaker models)
- [ ] System prompt ends with CRITICAL CONSTRAINT block ("You are a REWRITER, not a RESPONDER")
- [ ] `buildUserMessage()` unit test updated to assert new wrapped format with platform/context
- [ ] All unit tests passing
- [ ] Manual test: "how to learn Java" → returns rewritten question, NOT a Java guide
- [ ] Manual test: "explain quantum computing" → returns better question, NOT an explanation
- [ ] Manual test: "write me a poem about rain" → returns more specific prompt, NOT a poem
- [ ] Manual test: "what's the best database for my app" → returns sharpened question, NOT a comparison
- [ ] GATE: all 4 manual tests pass before moving to Phase 15.8
- [ ] Commit: `fix(meta-prompt): wrap user message with delimiters to prevent LLM from answering`
- Notes:

### PHASE 15.8 — Meta-Prompt: Consistent Rewrite Quality [not started]

- [ ] Gap prioritization rule added: "pick 1-2 most impactful gaps, not all"
- [ ] Purpose test rule added: "if I remove this addition, does the AI give a worse answer?"
- [ ] 4 before/after good examples added covering: coding, research, writing, learning
- [ ] 1 BAD rewrite example added showing filler anti-pattern ("thorough", "comprehensive", "expert")
- [ ] Example annotations kept short — pattern instruction above, not essays per example
- [ ] Meta-prompt sections reordered: role → context → process → checklist → prioritization → techniques → rules → examples → critical constraint
- [ ] Manual test: "help me with my website" → adds specifics, zero filler phrases
- [ ] Manual test: "how to learn Java" → adds skill level + goal + structure, no "explain thoroughly"
- [ ] Manual test: "compare AWS and Google Cloud" → adds use case + criteria + format, no "cover all aspects"
- [ ] Manual test: "write a blog post about AI" → adds audience + angle + length, no "make it engaging"
- [ ] Each test prompt run 3 times to verify consistency
- [ ] All unit tests passing, production build clean
- [ ] Commit: `feat(meta-prompt): add examples, gap prioritization, and purpose test for consistent quality`
- Notes:

### PHASE 16 — Context Menu: Foundation + Injection [optional — not started]

- [ ] `contextMenus` and `scripting` permissions added to `manifest.json`
- [ ] `'generic'` added to `Platform` type in `adapters/types.ts`
- [ ] `buildMetaPrompt()` handles `'generic'` platform (neutral context, no platform-specific guidance)
- [ ] Context menu item "Enhance with PromptGod" registered in service worker via `chrome.contextMenus.create()` inside `chrome.runtime.onInstalled`
- [ ] Context menu item appears ONLY when text is selected (`contexts: ['selection']`)
- [ ] Context menu item does NOT appear when no text is selected
- [ ] On click: service worker reads `info.selectionText` and stores it for the enhancement pipeline
- [ ] `src/content/context-menu-handler.ts` created as a self-contained script (separate Vite entry point, NOT auto-injected)
- [ ] Handler script is injected on demand via `chrome.scripting.executeScript({ target: { tabId, frameId }, files: [...] })` — `activeTab` + context menu click provides temporary permission
- [ ] Handler immediately captures `window.getSelection().getRangeAt(0)` and `document.activeElement` (with `selectionStart`/`selectionEnd` for textareas) before user moves cursor
- [ ] Handler injects its own CSS (toast styles) via `chrome.scripting.insertCSS()` or inline styles — cannot rely on the main `styles.css` being loaded on arbitrary pages
- [ ] Handler shows loading toast: "Enhancing your prompt..."
- [ ] Handler opens port to service worker: `chrome.runtime.connect({ name: 'context-enhance' })`
- [ ] Service worker listens for `context-enhance` port connections alongside existing `enhance` port connections
- [ ] Smart skip: selection under 3 words → handler shows "Prompt too short to enhance" toast, no LLM call
- [ ] No API key: service worker sends ERROR through port → handler shows "Set your API key in PromptGod settings" toast
- [ ] Works on a page that is NOT one of the 4 supported platforms (e.g., Wikipedia, GitHub, any random site)
- [ ] Works on one of the 4 supported platforms alongside the existing trigger button without conflicts
- [ ] Commit: `feat(context-menu): register menu item and inject handler on any page`
- Notes:

### PHASE 17 — Context Menu: Enhancement + Text Replacement [optional — not started]

- [ ] Service worker handles `context-enhance` port: reads API key, makes LLM call using existing `callAnthropicAPI`/`callOpenRouterAPI`/`callOpenAIAPI`, collects full response (concatenate all tokens, do NOT stream into DOM — wait for complete text)
- [ ] Service worker sends `{ type: 'RESULT', text: enhancedText }` through port on completion, then disconnects
- [ ] Service worker sends `{ type: 'ERROR', message }` through port on failure, then disconnects
- [ ] Handler detects if saved selection is inside an editable field:
  - `<textarea>` or `<input>`: check `activeElement.tagName`
  - `contenteditable`: check `activeElement.isContentEditable` or walk up from selection anchor node
  - Otherwise: non-editable (clipboard path)
- [ ] **Textarea/input replacement:** use saved `selectionStart`/`selectionEnd`, replace selected portion via native value setter (`Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set`), dispatch `input` event with `{ bubbles: true }` — this ensures React/framework state updates
- [ ] **Contenteditable replacement:** restore saved range via `Selection.addRange()`, delete range contents via `range.deleteContents()`, insert enhanced text via `document.execCommand('insertText')` with InputEvent fallback (reuse logic from `dom-utils.ts` but inline in handler since it's a separate bundle)
- [ ] **Clipboard fallback:** if element is non-editable OR replacement fails → `navigator.clipboard.writeText(enhancedText)` → show toast "Enhanced prompt copied to clipboard"
- [ ] **Success toast:** "Prompt enhanced" for inline replacement, "Enhanced prompt copied to clipboard" for clipboard path
- [ ] Error toast for LLM failures: "Enhancement failed — try again"
- [ ] Error toast for network failures: check `navigator.onLine` before LLM call, show "No connection" if offline
- [ ] Platform detection for meta-prompt: if hostname matches one of 4 known platforms, pass that platform to `buildMetaPrompt()`; otherwise pass `'generic'`
- [ ] Tested on `<textarea>` on a random website — text replaced in place
- [ ] Tested on contenteditable on a random website — text replaced in place
- [ ] Tested on non-editable text (e.g., a paragraph on Wikipedia) — enhanced text copied to clipboard
- [ ] Tested on OpenAI Playground (`<textarea>`) — text replaced in place
- [ ] Tested on Google AI Studio — text replaced or copied to clipboard
- [ ] Commit: `feat(context-menu): implement enhancement pipeline with text replacement and clipboard fallback`
- Notes:

### PHASE 18 — Context Menu: Undo + Edge Cases + Cross-site QA [optional — not started]

- [ ] Original text stored in handler before replacement (saved from selection capture)
- [ ] After successful replacement: toast shows "Prompt enhanced — Undo" with clickable undo action (styled link/button inside the toast)
- [ ] After clipboard copy: toast shows "Enhanced prompt copied — Undo" with undo action that copies original text back to clipboard
- [ ] Clicking undo in editable field: restores original text using same replacement strategy (textarea setter or contenteditable execCommand)
- [ ] Clicking undo in clipboard path: copies original text to clipboard, shows "Original prompt restored to clipboard"
- [ ] Undo auto-dismisses after 10 seconds (same behavior as existing undo button)
- [ ] **Double-trigger prevention:** handler sets a flag `isEnhancing = true` on port open, ignores subsequent context menu clicks while active — service worker checks this before injecting a new handler
- [ ] **iframe handling:** service worker passes `frameId` from `info.frameId` to `chrome.scripting.executeScript({ target: { tabId, frameId } })` so the handler is injected into the correct frame where the selection lives
- [ ] **Long text guard:** if selection > 10,000 characters, show warning toast "Selection too long (max 10,000 characters)" and abort — prevents accidental expensive API calls
- [ ] **Page navigation during enhancement:** handler catches port disconnect (`port.onDisconnect`) gracefully — no errors, toast already dismissed by navigation
- [ ] **Shadow DOM:** if selection is inside a shadow DOM, `executeScript` may not reach it — handler detects this case (selection range is null) and falls back to using `info.selectionText` from the service worker + clipboard path
- [ ] **Google Docs / Canvas editors:** `getSelection()` returns empty or virtual selection on canvas-based editors — handler detects empty range, falls back to `info.selectionText` from service worker + clipboard path
- [ ] **Coexistence test:** on ChatGPT, both trigger button AND context menu work independently without interfering with each other — different code paths, same service worker LLM pipeline
- [ ] **Privacy policy update:** add context menu permissions disclosure — "The extension can read selected text on any webpage when you explicitly right-click and choose Enhance"
- [ ] **Cross-site testing matrix — all pass:**
  - OpenAI Playground (textarea)
  - Google AI Studio (textarea/contenteditable)
  - Anthropic Console Workbench (contenteditable)
  - Notion page (contenteditable)
  - Poe.com chat input
  - HuggingChat input
  - Standard HTML `<textarea>` on any form
  - Static text on Wikipedia (clipboard path)
  - ChatGPT (coexistence with trigger button)
  - Claude.ai (coexistence with trigger button)
- [ ] Commit: `feat(context-menu): add undo, edge case handling, and cross-site verification`
- Notes:

### PHASE 19 — Future Expansion [optional — pick any]

These are independent expansion paths. Pick one or both. Order doesn't matter.

**Option A — System-wide Clipboard Enhancer (medium effort, 1-2 weeks)**
- [ ] Tauri app (Rust + webview, ~5MB) or Electron app sitting in system tray
- [ ] Global hotkey (e.g. Ctrl+Shift+E) works even when app isn't focused
- [ ] On trigger: read clipboard → LLM call with meta-prompt → write enhanced text back to clipboard
- [ ] Small notification: "Prompt enhanced. Paste it."
- [ ] Settings window: API key, model selection (same BYOK setup)
- [ ] Works everywhere: any app, any website, any terminal — no adapters needed
- [ ] Builds for Windows + Mac + Linux
- [ ] Commit: `feat(desktop): system-wide clipboard prompt enhancer`

**Option B — Public API + npm SDK (high effort, weeks + ongoing)**
- [ ] REST API: `POST /enhance` accepts prompt + context, returns enhanced prompt (streaming)
- [ ] npm package: `@promptgod/sdk` — `enhance({ prompt, apiKey, stream })` function
- [ ] Auth: API keys for developers, rate limiting per key
- [ ] Docs: API reference, quickstart guide, example integrations
- [ ] Hosted on Fly.io / Railway with usage dashboard
- [ ] Revenue: free tier (100/day) + paid tier ($10-20/mo)
- [ ] Commit: `feat(api): public prompt enhancement API and SDK`
- Notes:
