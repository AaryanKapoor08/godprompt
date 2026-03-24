# PromptPilot — Build Flow

A phase is done when the checkpoint passes, not when the code is written.

---

## Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Chrome browser (for extension loading)
- Git
- A text editor with TypeScript support

**Do NOT install until needed:**
- Docker — not until Phase 10
- Hono / Supertest — not until Phase 10
- Playwright — not in v1 scope

---

## Global Rules (All Phases)

- **Branching:** `feat/<phase>/<description>` — never commit to main directly
- **Commits:** `<type>(<scope>): <description>` — imperative, present tense, <72 chars
- **Secrets:** `.env` never in git. Env guard on every required var: `if (!key) throw new Error('[Config] VAR is required')`
- **Errors:** Every `catch` uses `{ cause: error }`. No silent swallowing.
- **Testing:** Every phase checkpoint requires its seam tests verified.
- **One platform first:** Build everything on ChatGPT first. Claude.ai and Gemini adapters come in Phases 12-13.
- **Ports, not sendMessage:** All content script ↔ service worker streaming communication uses `chrome.runtime.connect` (ports). `sendMessage` is request/response only — it cannot push multiple TOKEN messages.

---

## PHASE 1 — Project Scaffold

**Goal:** Extension loads in Chrome with no errors.

**Tasks:**
- `pnpm init` in `extension/` directory
- Install dev dependencies: `typescript`, `vite`, `@crxjs/vite-plugin`, `@types/chrome`
- Create `tsconfig.json` with strict mode
- Create `vite.config.ts` with CRXJS plugin
- Create `manifest.json` — MV3, permissions: `storage`, `activeTab`, host permissions for all three platforms
- Create placeholder files: `src/service-worker.ts` (empty export), `src/content/index.ts` (console.log), `src/content/styles.css` (empty)
- Create placeholder `src/popup/popup.html` with minimal markup
- Create `.gitignore` — node_modules, dist, .env, *.crx
- Create placeholder icon PNGs (16, 48, 128) in `assets/`
- `pnpm build` produces a `dist/` folder
- Load unpacked extension in `chrome://extensions`

**Checkpoint:**
- [ ] `pnpm build` succeeds with zero errors
- [ ] Extension loads in Chrome with no errors in the extensions page
- [ ] Clicking the extension icon shows the popup
- [ ] Console shows content script log on ChatGPT/Claude/Gemini pages
- [ ] `.gitignore` excludes node_modules, dist, .env
- [ ] Commit: `chore(extension): scaffold project with Vite and Manifest V3`

---

## PHASE 2 — ChatGPT Adapter (Read Only)

**Goal:** Content script detects ChatGPT, finds the input element, reads prompt text, and gathers conversation context.

**Tasks:**
- Define `PlatformAdapter` interface in `src/content/adapters/types.ts`:
  - `matches(): boolean`
  - `getInputElement(): HTMLElement | null`
  - `getPromptText(): string`
  - `setPromptText(text: string): void` (stub for now)
  - `getSendButton(): HTMLElement | null`
  - `getPlatform(): 'chatgpt' | 'claude' | 'gemini'`
  - `getConversationContext(): { isNewConversation: boolean, conversationLength: number }`
- Implement `ChatGPTAdapter` — all methods except `setPromptText` (stub)
- `getConversationContext()` counts visible message elements in the DOM to determine conversation length
- Content script entry (`index.ts`) detects platform, instantiates correct adapter
- Add structured logging: `console.info({ platform, promptLength, context }, '[PromptPilot] Prompt read')`
- Test manually: type a prompt in ChatGPT, run adapter method from console, verify text and context are captured

**Checkpoint:**
- [ ] `adapter.matches()` returns true on `chatgpt.com`
- [ ] `adapter.getPromptText()` returns the exact text typed in the input field
- [ ] `adapter.getSendButton()` finds the send button element
- [ ] `adapter.getConversationContext()` returns correct `isNewConversation` and `conversationLength`
- [ ] Structured log appears in console with platform, prompt length, and context
- [ ] Commit: `feat(chatgpt): implement read-only platform adapter with conversation context`

---

## PHASE 3 — Trigger Button + Error Toast

**Goal:** Enhancement button appears next to ChatGPT's send button. Error toast component exists for use in later phases.

**Tasks:**
- Create `src/content/ui/trigger-button.ts` — injects a small button near the send button
- Style the button minimally in `styles.css` — small icon, tooltip "Enhance prompt"
- Button click handler calls `adapter.getPromptText()` and logs the result
- Add `MutationObserver` in content script to re-inject button if ChatGPT re-renders the input area
- Button has loading state (spinner) and disabled state (prevents double-click)
- Add keyboard shortcut listener: Ctrl+Shift+E triggers same handler
- Create `src/content/ui/toast.ts` — reusable toast component (info, error, warning variants)
- Toast auto-dismisses after configurable duration, positioned near input field
- Create `src/lib/smart-skip.ts` — `shouldSkipEnhancement(prompt: string): boolean` returns true if `prompt.trim().split(/\s+/).length < 3`
- Button click checks smart skip first — if too short, show info toast "Prompt too short to enhance" and abort
- Write unit test for `shouldSkipEnhancement()`

**Checkpoint:**
- [ ] Button appears adjacent to ChatGPT send button
- [ ] Button re-appears after navigating to a new chat
- [ ] Clicking the button logs the current prompt text
- [ ] Ctrl+Shift+E triggers the same handler
- [ ] Button shows loading spinner when clicked (resets after 2s for now)
- [ ] Double-clicking does not fire the handler twice
- [ ] Typing "hi" and clicking enhance shows "Prompt too short to enhance" toast
- [ ] `shouldSkipEnhancement()` unit test passes
- [ ] Toast component renders and auto-dismisses
- [ ] Commit: `feat(content): inject trigger button with toast and smart skip`

---

## PHASE 4 — Service Worker Messaging (Ports)

**Goal:** Content script and service worker communicate reliably via ports, supporting multi-message streaming.

**Tasks:**
- Define message types in `src/lib/types.ts`: `ENHANCE`, `TOKEN`, `DONE`, `ERROR`
- Content script opens a port on button click: `chrome.runtime.connect({ name: 'enhance' })`
- Content script sends `{ type: 'ENHANCE', rawPrompt, platform, context }` via `port.postMessage()`
- Service worker listens for connections: `chrome.runtime.onConnect.addListener()`
- Service worker receives ENHANCE, logs it, sends back 3 mock TOKEN messages at 200ms intervals, then sends DONE
- Content script listens via `port.onMessage.addListener()`, logs each TOKEN and DONE
- Port disconnects on DONE or ERROR
- Handle service worker lifecycle: `onConnect` listener must be registered at top level (not inside async)
- Add error handling: if service worker errors, it sends ERROR through the port before disconnecting

**Checkpoint:**
- [ ] Click trigger button → service worker logs the received prompt
- [ ] Service worker sends 3 mock tokens at intervals → content script logs each one
- [ ] Service worker sends DONE → content script logs completion, port disconnects
- [ ] Error path works: service worker sends ERROR → content script logs error, port disconnects
- [ ] Works after navigating to a new chat (service worker wakes up on connect)
- [ ] Multiple rapid clicks don't open multiple ports (disabled state prevents this)
- [ ] Commit: `feat(service-worker): implement port-based message passing for streaming`

---

## PHASE 5 — LLM Integration (BYOK) + Minimal Popup

**Goal:** Service worker calls Anthropic API with user's key and streams a real response. Minimal popup lets user enter their API key.

**Why minimal popup here:** Phases 5-7 all need a real API key to test. Rather than hardcoding a key in source (risk of committing it), build a minimal popup with just an API key text field. The full popup with mode toggle, model selection, and usage counter comes in Phase 8.

**Tasks:**
- Create minimal `popup.html` / `popup.ts` — just an API key text input that saves to `chrome.storage.local`
- Create `src/lib/llm-client.ts` — `fetch` call to Anthropic API with streaming enabled
- Create `src/lib/meta-prompt.ts` — export the meta-prompt template as a constant
- Create `buildUserMessage()` function — assembles user message from prompt + platform + context
- Service worker reads API key from `chrome.storage.local` on each ENHANCE message (never cache it)
- Service worker uses `llm-client` to make real API call, parse SSE stream
- Parse Anthropic SSE stream: extract `content_block_delta` events, forward `delta.text` as TOKEN messages through the port
- Use `anthropic-dangerous-direct-browser-access: true` header
- Write unit tests for `buildUserMessage()` and Anthropic SSE parsing logic
- Write unit test for `validateApiKey()` (checks `sk-ant-` prefix for Anthropic)

**Checkpoint:**
- [ ] Minimal popup shows API key input, saves to `chrome.storage.local`
- [ ] `buildUserMessage()` unit test passes
- [ ] Anthropic SSE parser unit test passes (mock SSE data)
- [ ] `validateApiKey()` unit test passes
- [ ] Clicking trigger button with a real Anthropic key → tokens stream back to content script console via port
- [ ] Meta-prompt template interpolates platform and context correctly
- [ ] No API key is committed to git
- [ ] Commit: `feat(service-worker): integrate Anthropic streaming API with minimal popup`

---

## PHASE 6 — Streaming DOM Replacement

**Goal:** Enhanced prompt appears token-by-token in ChatGPT's input field.

**Tasks:**
- Implement `ChatGPTAdapter.setPromptText()`:
  - Clear existing content from input element
  - Insert new text using `document.execCommand('insertText', false, text)`
  - If `execCommand` fails (returns false), fall back to: create `InputEvent` with `inputType: 'insertText'`, attach text via `DataTransfer`, dispatch on element
  - Dispatch `input` event with `bubbles: true` to notify the platform
- Create `src/content/dom-utils.ts` for shared synthetic event helpers and the execCommand fallback
- Content script accumulates tokens and calls `setPromptText()` with the growing string on each TOKEN message
- Clear input field on first token received
- Verify ChatGPT's send button becomes active/enabled after text injection
- Show error toast if input element cannot be found during streaming

**Checkpoint:**
- [ ] Clicking trigger button → input field text is replaced with enhanced prompt token-by-token
- [ ] ChatGPT's send button is active/enabled after enhancement completes
- [ ] Streaming looks smooth — no flicker, no duplicate text
- [ ] Works with short prompts (1 sentence) and longer prompts (paragraph)
- [ ] If input element disappears mid-stream, error toast appears (not a crash)
- [ ] Commit: `feat(chatgpt): implement streaming DOM text replacement with execCommand fallback`

---

## PHASE 7 — Undo System

**Goal:** User can restore their original prompt with one click.

**Tasks:**
- Cache original prompt in content script state before enhancement begins (before first TOKEN)
- Create `src/content/ui/undo-button.ts` — floating button that appears after enhancement completes (on DONE)
- Undo click calls `adapter.setPromptText()` with cached original text
- Auto-disappear after 10 seconds (`setTimeout`)
- Disappear when user sends the message (observe send button click or DOM change)
- Disappear when user starts manually editing the enhanced prompt (input event listener)
- If streaming is interrupted (ERROR or port disconnect), keep whatever text was written and still show undo button

**Checkpoint:**
- [ ] After enhancement, undo button appears near the input field
- [ ] Clicking undo restores the exact original prompt
- [ ] ChatGPT send button remains active after undo
- [ ] Undo button disappears after 10 seconds
- [ ] Undo button disappears if user edits the text manually
- [ ] Undo button disappears if user sends the message
- [ ] If streaming is interrupted, partial text remains and undo button still appears
- [ ] Commit: `feat(undo): implement undo button with auto-dismiss and interrupt handling`

---

## PHASE 8 — Full Popup Settings

**Goal:** Complete settings page with mode toggle, model selection, and usage counter.

**Tasks:**
- Expand `popup.html` — add mode toggle (Free tier / BYOK), model dropdown, usage counter display
- Mode toggle: "Free tier (10/hour)" vs "Use my API key (unlimited)"
- API key input: only visible in BYOK mode
- Auto-detect provider from key format: `sk-ant-` → Anthropic, `sk-` → OpenAI. Save `provider` to storage.
- Model dropdown: only visible in BYOK mode, options change based on detected provider:
  - Anthropic: Claude Haiku (default), Claude Sonnet
  - OpenAI: GPT-4o-mini (default), GPT-4o
- Usage counter: "7 of 10 enhancements used this hour" — read from `chrome.storage.local` (synced from server in Phase 11)
- Service worker reads settings from `chrome.storage.local` on each ENHANCE message to decide routing
- Style in `popup.css` — clean, matches Chrome extension conventions

**Checkpoint:**
- [ ] Popup opens with mode toggle defaulting to "Free tier"
- [ ] Switching to BYOK shows API key input and model dropdown
- [ ] Entering an Anthropic key shows Claude models; entering an OpenAI key shows GPT models
- [ ] API key validates format on input (visual feedback)
- [ ] Settings persist after closing and reopening popup
- [ ] Service worker reads stored settings and routes accordingly
- [ ] Commit: `feat(popup): implement full settings page with provider detection`

---

## PHASE 9 — OpenAI BYOK Support

**Goal:** BYOK mode works with OpenAI API keys (GPT-4o, GPT-4o-mini).

**Tasks:**
- Add OpenAI streaming client to `src/lib/llm-client.ts`:
  - Endpoint: `https://api.openai.com/v1/chat/completions`
  - Auth header: `Authorization: Bearer <key>`
  - Body: `{ model, messages: [{ role: 'system', content: META_PROMPT }, { role: 'user', content: userMessage }], stream: true }`
- Create `parseOpenAIStream()` — parse OpenAI SSE format: `data:` lines with JSON `{ choices: [{ delta: { content } }] }`, stop on `data: [DONE]`
- Service worker selects parser based on `provider` setting from `chrome.storage.local`
- Write unit test for `parseOpenAIStream()` (mock SSE data)
- Test end-to-end: enter OpenAI key in popup, select GPT-4o-mini, enhance a prompt, verify streaming works

**Checkpoint:**
- [ ] `parseOpenAIStream()` unit test passes (mock SSE data)
- [ ] Entering an OpenAI key in popup + clicking enhance → tokens stream back and replace input text
- [ ] Streaming DOM replacement works identically to Anthropic path
- [ ] Undo works after OpenAI enhancement
- [ ] Switching between Anthropic and OpenAI keys works without restart
- [ ] Commit: `feat(llm-client): add OpenAI streaming support for BYOK mode`

---

## PHASE 10 — Backend Server

**Goal:** Hono server proxies LLM calls for free-tier users with rate limiting, input validation, and rate limit headers.

**Tasks:**
- Initialize `server/` directory: `pnpm init`, install `hono`, `@hono/node-server`, `typescript`, `tsx`
- Create `src/index.ts` — Hono server with health endpoint
- Create `src/middleware/cors.ts` — CORS middleware accepting `ALLOWED_ORIGINS` env var (comma-separated). Use `*` in development, extension ID in production.
- Create `src/middleware/validate.ts` — request validation:
  - `platform` must be one of `['chatgpt', 'claude', 'gemini']`
  - `prompt` required, non-empty, max 10,000 characters
- Create `src/middleware/rate-limit.ts` — IP-based in-memory rate limiter
  - Add `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers to every response
  - Return `Retry-After` header on 429 responses
- Create `src/routes/enhance.ts` — `POST /api/enhance` handler
- Create `src/llm/anthropic.ts` — Anthropic API client with streaming
- Create `src/meta-prompt.ts` — copy from extension (add `scripts/sync-meta-prompt.ts` build script)
- Env guard: `ANTHROPIC_API_KEY` required at startup
- SSE response format: `data: {"type": "token", "text": "..."}` per line
- Create `.env.example` with all required variables
- Create `Dockerfile` for deployment
- Write unit tests: rate limiter, request validation
- Write integration test: `POST /api/enhance` with valid/invalid inputs and rate limit behavior

**Checkpoint:**
- [ ] `pnpm dev` starts server on port 3000
- [ ] `GET /health` returns `{ status: 'ok' }`
- [ ] `POST /api/enhance` with valid prompt returns SSE stream of enhanced text
- [ ] `POST /api/enhance` with invalid platform returns 400
- [ ] `POST /api/enhance` with 15,000 char prompt returns 400
- [ ] 11th request from same IP within an hour returns 429 with `X-RateLimit-Remaining: 0` header
- [ ] All successful responses include `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers
- [ ] Rate limiter unit test passes
- [ ] Request validation unit test passes
- [ ] Integration test passes
- [ ] `.env` is in `.gitignore`, `.env.example` exists
- [ ] CORS rejects requests from non-allowed origins (when not using `*`)
- [ ] Commit: `feat(backend): implement Hono server with validation, rate limiting, and headers`

---

## PHASE 11 — Free Tier Integration

**Goal:** Extension routes through backend when no BYOK key is set. Usage counter syncs from server headers.

**Tasks:**
- Add backend URL to `src/config.ts`
- Service worker checks `chrome.storage.local` for mode on each ENHANCE message
- If mode is 'free' → call backend `POST /api/enhance`
- Parse backend SSE response (simplified format: `{"type": "token/done", "text": "..."}`)
- Read `X-RateLimit-Remaining` and `X-RateLimit-Reset` from response headers
- Update `chrome.storage.local` with remaining count and reset time from server headers
- On DONE message, include `rateLimitRemaining` and `rateLimitReset` in the port message so content script can react
- Handle 429 response: show error toast "Free tier limit reached. Add your API key in settings for unlimited use."
- Popup usage counter reads from `chrome.storage.local` (which is now synced from server headers, not client-side guesswork)
- Handle network offline: check `navigator.onLine` before making request, show "No connection" toast

**Checkpoint:**
- [ ] With no API key set, enhancement routes through backend and works end-to-end
- [ ] After 10 enhancements, 11th shows rate limit toast with upgrade message
- [ ] Usage counter in popup accurately reflects server-side remaining count
- [ ] Usage counter resets when server's reset time passes
- [ ] Switching to BYOK mode bypasses backend entirely
- [ ] Offline state shows "No connection" toast without making a request
- [ ] Error toast appears for API failures and auto-dismisses
- [ ] Commit: `feat(extension): integrate free tier with synced rate limit tracking`

---

## PHASE 12 — Claude.ai Adapter

**Goal:** Full enhancement flow works on Claude.ai.

**Tasks:**
- Implement `ClaudeAdapter` — all `PlatformAdapter` methods for Claude.ai's DOM
- Claude uses a `contenteditable` div — find correct selectors using data attributes and aria labels
- Implement `getConversationContext()` for Claude's conversation structure
- Test `setPromptText()` with execCommand + fallback — ensure Claude registers the change
- Trigger button injection positioned correctly for Claude's layout
- MutationObserver handles Claude's re-renders
- Test full flow: type prompt → click enhance → streaming replacement → undo
- Ensure keyboard shortcut works on Claude.ai
- Test all error states: DOM not found, streaming interrupted, offline

**Checkpoint:**
- [ ] Trigger button appears correctly on Claude.ai
- [ ] `getPromptText()` reads text accurately
- [ ] `getConversationContext()` returns correct values
- [ ] Streaming replacement works — text appears token-by-token
- [ ] Claude's send button is active after enhancement
- [ ] Undo restores original prompt
- [ ] Button re-appears after navigating to a new conversation
- [ ] Error toast appears if input element not found
- [ ] Commit: `feat(claude-adapter): implement full platform adapter for Claude.ai`

---

## PHASE 13 — Gemini Adapter + Polish

**Goal:** All three platforms work. Error handling is solid. Production build is clean.

**Tasks:**
- Implement `GeminiAdapter` — all `PlatformAdapter` methods for Gemini's DOM
- Gemini has a different rich text input — test execCommand + fallback approach
- Implement `getConversationContext()` for Gemini's conversation structure
- Test full flow on Gemini
- Review and harden error handling across all adapters: DOM element not found, streaming interrupted, platform updated
- Verify error toast works on all platforms for all error states
- If streaming is interrupted, keep text written so far and show undo button
- Run `pnpm build` for production — verify output is clean
- Test production build loaded as unpacked extension on all three platforms
- Review all TODO/FIXME comments and resolve
- Verify `scripts/sync-meta-prompt.ts` keeps extension and server meta-prompt in sync
- Final manual testing against the full checklist from the project spec

**Checkpoint:**
- [ ] Trigger button appears correctly on Gemini
- [ ] Full enhancement flow works on Gemini (streaming + undo)
- [ ] `getConversationContext()` works on all three platforms
- [ ] All three platforms pass the manual testing checklist
- [ ] Error states display correctly on all platforms (no connection, API failure, DOM not found, prompt too short, rate limit)
- [ ] Streaming interruption keeps partial text + shows undo on all platforms
- [ ] Production build loads and works on all three platforms
- [ ] No console errors on any platform during normal use
- [ ] Meta-prompt is in sync between extension and server
- [ ] Commit: `feat(gemini): implement adapter and polish all platforms`

---

## PHASE 14 — Perplexity Adapter

**Goal:** Full enhancement flow works on Perplexity.ai.

**Tasks:**
- Add `'perplexity'` to the `Platform` type in `types.ts`
- Implement `PerplexityAdapter` — all `PlatformAdapter` methods
- Perplexity may use a `<textarea>` — handle both textarea (native setter) and contenteditable
- `getSendButton()` — find submit button by aria-label or type
- `getConversationContext()` — count answer/result blocks
- Add `perplexity.ai` to manifest `host_permissions` and `content_scripts.matches`
- Register `PerplexityAdapter` in `content/index.ts`
- Add button placement in `trigger-button.ts` for perplexity platform
- Update server `validate.ts` to accept `'perplexity'` as a valid platform
- Test full flow: button appears, enhancement streams, undo works

**Checkpoint:**
- [ ] Trigger button appears correctly on Perplexity
- [ ] `getPromptText()` reads text accurately
- [ ] `getConversationContext()` returns correct values
- [ ] Streaming replacement works — text appears token-by-token
- [ ] Send button active after enhancement
- [ ] Undo restores original prompt
- [ ] Button re-appears after navigating to a new search
- [ ] Error toast appears if input element not found
- [ ] Commit: `feat(perplexity): implement platform adapter for Perplexity.ai`

---

## PHASE 15 — Perplexity Verification + Backend Deployment + Chrome Web Store

**Goal:** Verify Perplexity works end-to-end, deploy backend, publish extension.

---

### Checklist

**Manual verification (Chrome)**
- [ ] Test Perplexity adapter end-to-end (button appears, streaming works, undo works)

**Backend deployment (Railway)**
- [ ] Create Railway account, deploy `server/` from GitHub
- [ ] Set env vars (`ANTHROPIC_API_KEY`, `RATE_LIMIT_PER_HOUR=10`, `MAX_PROMPT_LENGTH=10000`, `ALLOWED_ORIGINS=*`, `NODE_ENV=production`, `PORT=3000`)
- [ ] Update `extension/src/config.ts` with production Railway URL
- [ ] Rebuild extension (`pnpm build`), test free tier through deployed backend
- [ ] Commit: `feat(config): point backend URL to production server`

**Extension prep**
- [ ] Replace placeholder icons (`assets/icon-16.png`, `icon-48.png`, `icon-128.png`) with real branded icons
- [ ] Prepare at least one 1280×800 screenshot of the button in action

**Privacy policy**
- [ ] Draft policy text (covers: API keys stored locally only, prompts sent to Anthropic/OpenAI or proxy, no accounts, no tracking)
- [ ] Host it at a public URL (GitHub Pages, GitHub gist, or Google Sites)

**Chrome Web Store**
- [ ] Pay one-time $5 developer registration fee at chrome.google.com/webstore/devconsole
- [ ] Run `pnpm build` — confirm clean output
- [ ] Zip the `dist/` folder: `cd dist && zip -r ../promptpilot.zip .`
- [ ] Upload zip, fill store listing (name, description, category, screenshots, privacy policy URL)
- [ ] Submit for review (usually 1-3 business days)

**After approval**
- [ ] Note permanent extension ID from Web Store dashboard
- [ ] Update `ALLOWED_ORIGINS` in Railway to `chrome-extension://<your-extension-id>`
- [ ] Test published extension end-to-end

---

## PHASE 16 — Context Menu: Foundation + Injection [optional]

**Goal:** Right-click on selected text on any webpage shows "Enhance with PromptGod" and injects a handler script that captures the selection and opens a communication port.

**Tasks:**
- Add `contextMenus` and `scripting` permissions to `manifest.json`
- Add `'generic'` to the `Platform` type union in `src/content/adapters/types.ts`
- Update `buildMetaPrompt()` in `src/lib/meta-prompt.ts` to handle `'generic'` platform — use neutral context ("User is on a webpage", no platform-specific DOM or send-button guidance)
- Register context menu item in service worker inside `chrome.runtime.onInstalled` listener:
  - `chrome.contextMenus.create({ id: 'enhance-selection', title: 'Enhance with PromptGod', contexts: ['selection'] })`
- Add `chrome.contextMenus.onClicked` listener in service worker
- Create `src/content/context-menu-handler.ts` as a self-contained script — this is a separate Vite entry point, NOT part of the main content script bundle:
  - Immediately captures `window.getSelection().getRangeAt(0)` and clones it (range becomes invalid if selection moves)
  - Captures `document.activeElement`, and if it's a textarea/input, saves `selectionStart` and `selectionEnd`
  - Injects its own toast styles inline (creates a `<style>` element) — cannot rely on `styles.css` being loaded on arbitrary pages
  - Shows loading toast: "Enhancing your prompt..."
  - Opens port to service worker: `chrome.runtime.connect({ name: 'context-enhance' })`
  - Sends the selected text as an ENHANCE message through the port
- Service worker adds a second `onConnect` branch for `port.name === 'context-enhance'` alongside existing `'enhance'` handler
- On click with no API key → service worker sends ERROR through port → handler shows "Set your API key in PromptGod settings" toast
- On click with selection under 3 words → handler runs `shouldSkipEnhancement()` logic locally before opening port → shows "Prompt too short to enhance" toast, no LLM call
- Ensure context menu + handler work on pages where the main content script is NOT loaded (any arbitrary URL)
- Ensure context menu works on pages where the main content script IS loaded (the 4 supported platforms) without conflict — both trigger button and context menu coexist

**Checkpoint:**
- [ ] `contextMenus` and `scripting` permissions added to `manifest.json`
- [ ] `'generic'` added to `Platform` type in `adapters/types.ts`
- [ ] `buildMetaPrompt()` handles `'generic'` platform without errors
- [ ] Right-click on selected text shows "Enhance with PromptGod" on any webpage
- [ ] Right-click with no text selected does NOT show the menu item
- [ ] Clicking menu item injects handler script and shows "Enhancing your prompt..." toast
- [ ] Handler captures selection range and active element before user moves cursor
- [ ] Handler opens `context-enhance` port to service worker
- [ ] Selection under 3 words shows "Prompt too short to enhance" toast — no LLM call
- [ ] No API key shows "Set your API key in PromptGod settings" toast
- [ ] Works on a page that is NOT one of the 4 supported platforms (e.g., Wikipedia)
- [ ] Works on ChatGPT alongside the existing trigger button without conflicts
- [ ] Commit: `feat(context-menu): register menu item and inject handler on any page`

---

## PHASE 17 — Context Menu: Enhancement + Text Replacement [optional]

**Goal:** Full enhancement pipeline works via context menu — selected text gets replaced in editable fields or copied to clipboard on any webpage.

**Tasks:**
- Service worker handles `context-enhance` port messages:
  - Reads API key, provider, model from `chrome.storage.local` (same as existing handler)
  - Detects platform from tab URL: if hostname matches a known platform, use that; otherwise use `'generic'`
  - Makes LLM call using existing `callAnthropicAPI`/`callOpenRouterAPI`/`callOpenAIAPI`
  - Collects the full response by concatenating all tokens (do NOT stream token-by-token into DOM — arbitrary pages have unpredictable editors, wait for complete text)
  - Sends `{ type: 'RESULT', text: enhancedText }` through port on completion
  - Sends `{ type: 'ERROR', message }` through port on failure
  - Disconnects port after sending
- Add `ContextMenuResult` and `ContextMenuError` to message types in `src/lib/types.ts`
- Handler receives RESULT message and determines replacement strategy based on saved active element:
  - **Textarea or input:** Use `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set` (or `HTMLInputElement.prototype`) to set value via the native setter — this bypasses React/framework controlled component guards. Replace only the selected portion using saved `selectionStart`/`selectionEnd`: `value = before + enhancedText + after`. Dispatch `new Event('input', { bubbles: true })` to notify frameworks.
  - **Contenteditable:** Restore the saved range via `window.getSelection().removeAllRanges()` then `addRange(savedRange)`. Delete range contents via `savedRange.deleteContents()`. Insert enhanced text via `document.execCommand('insertText', false, enhancedText)`. If execCommand returns false, fall back to creating a text node and inserting it at the range position, then dispatch InputEvent.
  - **Non-editable or replacement fails:** Call `navigator.clipboard.writeText(enhancedText)`. Show toast: "Enhanced prompt copied to clipboard".
- Success toast: "Prompt enhanced" for inline replacement, "Enhanced prompt copied to clipboard" for clipboard path
- Error toast: "Enhancement failed — try again" for LLM errors
- Offline check: handler checks `navigator.onLine` before sending ENHANCE message — if offline, show "No connection" toast immediately
- Handler cleans up: removes toast after duration, disconnects port if still open

**Checkpoint:**
- [ ] Service worker handles `context-enhance` port and makes LLM call
- [ ] Service worker sends complete enhanced text (not streaming) through port
- [ ] Handler replaces selected text in a `<textarea>` on a random website
- [ ] Handler replaces selected text in a `contenteditable` div on a random website
- [ ] Handler copies enhanced text to clipboard when selecting non-editable text (e.g., a paragraph on Wikipedia)
- [ ] Toast shows "Prompt enhanced" after inline replacement
- [ ] Toast shows "Enhanced prompt copied to clipboard" after clipboard path
- [ ] Toast shows "Enhancement failed — try again" on LLM error
- [ ] Toast shows "No connection" when offline
- [ ] Platform auto-detection: context menu on chatgpt.com passes `'chatgpt'` to meta-prompt, context menu on github.com passes `'generic'`
- [ ] Tested on OpenAI Playground — textarea replacement works
- [ ] Tested on Google AI Studio — replacement or clipboard works
- [ ] Commit: `feat(context-menu): implement enhancement pipeline with text replacement and clipboard fallback`

---

## PHASE 18 — Context Menu: Undo + Edge Cases + Cross-site QA [optional]

**Goal:** Undo works for context menu enhancements, edge cases are handled gracefully, and the feature is verified across a wide range of sites.

**Tasks:**
- **Undo system:**
  - Handler stores original selected text (from initial selection capture) before any replacement
  - After successful replacement: show toast "Prompt enhanced — Undo" with a clickable undo action (a styled `<span>` or `<button>` inside the toast element, cursor: pointer, underlined)
  - After clipboard copy: show toast "Enhanced prompt copied — Undo" with clickable undo that copies original text back to clipboard
  - Clicking undo in editable field: restores original text using the same replacement strategy (textarea native setter or contenteditable execCommand)
  - Clicking undo in clipboard path: `navigator.clipboard.writeText(originalText)`, show "Original prompt restored to clipboard"
  - Undo auto-dismisses after 10 seconds (same as existing undo button behavior)
  - After undo is clicked or dismissed, clean up all references
- **Double-trigger prevention:**
  - Handler sets a global flag when enhancement is in progress
  - Service worker tracks active context-menu enhancements per tab — if a tab already has one in progress, inject a script that shows "Already enhancing..." toast instead of starting a new pipeline
- **iframe handling:**
  - Service worker passes `frameId` from `info.frameId` to `chrome.scripting.executeScript({ target: { tabId, frameId } })` so the handler is injected into the correct frame
  - If `frameId` is 0 (main frame), inject normally
  - If `frameId` is non-zero (iframe), inject into that specific frame
- **Long text guard:**
  - Handler checks selection length before sending ENHANCE — if over 10,000 characters, show "Selection too long (max 10,000 characters)" toast and abort
- **Shadow DOM fallback:**
  - If `window.getSelection().getRangeAt(0)` throws or returns null (selection inside shadow DOM), handler falls back to reading selection text from the ENHANCE message payload (originally from `info.selectionText`) + clipboard path
- **Canvas editor fallback (Google Docs, Figma, etc.):**
  - If selection range is null or empty but `info.selectionText` was non-empty, handler uses clipboard path with the text from the service worker
  - Toast: "Enhanced prompt copied to clipboard" (user can paste manually)
- **Page navigation during enhancement:**
  - Handler registers `port.onDisconnect` — if port disconnects unexpectedly (navigation, tab close), clean up toast and timers silently, no error shown
- **Privacy policy update:**
  - Add disclosure for `contextMenus` and `scripting` permissions: "When you right-click and choose 'Enhance with PromptGod', the extension reads the text you selected on that page. This requires temporary access to the active tab. Selected text is sent to your configured LLM provider for enhancement. No text is stored or collected."
- **Cross-site testing matrix:**
  - OpenAI Playground (textarea replacement)
  - Google AI Studio (textarea/contenteditable replacement)
  - Anthropic Console Workbench (contenteditable replacement)
  - Notion page (contenteditable replacement)
  - Poe.com chat input (textarea/contenteditable)
  - HuggingChat input (textarea)
  - Standard HTML `<textarea>` on any form
  - Static text on Wikipedia (clipboard path)
  - Text inside an iframe (iframe handling)
  - ChatGPT (coexistence with trigger button)
  - Claude.ai (coexistence with trigger button)

**Checkpoint:**
- [ ] After inline replacement: toast shows "Prompt enhanced — Undo" with clickable undo action
- [ ] After clipboard copy: toast shows "Enhanced prompt copied — Undo" with clickable undo action
- [ ] Clicking undo in editable field restores original selected text
- [ ] Clicking undo in clipboard path copies original text to clipboard
- [ ] Undo toast auto-dismisses after 10 seconds
- [ ] Rapidly clicking context menu twice does NOT trigger two enhancements — shows "Already enhancing..." on second click
- [ ] Context menu works when selection is inside an iframe
- [ ] Selection over 10,000 characters shows "Selection too long" toast and aborts
- [ ] Selection inside shadow DOM falls back to clipboard path gracefully
- [ ] Google Docs or canvas-based editor falls back to clipboard path gracefully
- [ ] Page navigation during enhancement does not cause errors or orphaned UI
- [ ] Privacy policy updated with context menu permission disclosure
- [ ] OpenAI Playground — textarea replacement works
- [ ] Google AI Studio — replacement or clipboard works
- [ ] Anthropic Console — replacement or clipboard works
- [ ] Notion — contenteditable replacement works
- [ ] Poe.com — replacement works
- [ ] Standard HTML textarea — replacement works
- [ ] Wikipedia static text — clipboard path works
- [ ] iframe content — replacement or clipboard works
- [ ] ChatGPT — trigger button and context menu coexist without conflict
- [ ] Claude.ai — trigger button and context menu coexist without conflict
- [ ] Commit: `feat(context-menu): add undo, edge case handling, and cross-site verification`

---

## PHASE 19 — Future Expansion [optional — pick any]

These are independent expansion paths. Pick one or both. Order doesn't matter.

### Option A — System-wide Clipboard Enhancer

**Goal:** Desktop app that enhances any copied text via a global hotkey, working across all applications.

**Tasks:**
- Tauri app (Rust + webview, ~5MB) or Electron app sitting in system tray
- Global hotkey (e.g. Ctrl+Shift+E) works even when app isn't focused
- On trigger: read clipboard → LLM call with meta-prompt → write enhanced text back to clipboard
- Small notification: "Prompt enhanced. Paste it."
- Settings window: API key, model selection (same BYOK setup)
- Build for Windows + Mac + Linux

**Checkpoint:**
- [ ] App installs and runs in system tray
- [ ] Global hotkey triggers clipboard enhancement from any application
- [ ] Enhanced text written back to clipboard
- [ ] Notification shown on completion
- [ ] Settings persist across restarts
- [ ] Builds for Windows + Mac + Linux
- [ ] Commit: `feat(desktop): system-wide clipboard prompt enhancer`

### Option B — Public API + npm SDK

**Goal:** Expose prompt enhancement as a service for other developers to integrate.

**Tasks:**
- REST API: `POST /enhance` accepts prompt + context, returns enhanced prompt (streaming)
- npm package: `@promptgod/sdk` — `enhance({ prompt, apiKey, stream })` function
- Auth: API keys for developers, rate limiting per key
- Docs: API reference, quickstart guide, example integrations
- Hosted on Fly.io / Railway with usage dashboard

**Checkpoint:**
- [ ] API deployed and reachable
- [ ] `POST /enhance` returns enhanced prompt with valid auth
- [ ] Rate limiting works (free tier: 100/day, paid: unlimited)
- [ ] npm package published and installable
- [ ] SDK `enhance()` function works in Node.js and browser
- [ ] API docs hosted publicly
- [ ] Commit: `feat(api): public prompt enhancement API and SDK`

---

## Common Problems

| Problem | Likely Cause | Fix |
|---|---|---|
| Button doesn't appear | Wrong CSS selector for send button, or platform re-rendered | Check adapter's `getSendButton()` selector, verify MutationObserver is watching correct parent |
| `setPromptText()` doesn't trigger send button activation | Direct DOM mutation without synthetic events | Use `document.execCommand('insertText')` first; if it returns false, fall back to `InputEvent` with `DataTransfer` |
| `execCommand('insertText')` returns false | Deprecated API removed in future Chrome | Use the fallback: `new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true })` with `DataTransfer` |
| Service worker is inactive when button is clicked | MV3 service worker sleeps after 30s of inactivity | Ensure `chrome.runtime.onConnect` listener is registered at top level (not inside async) |
| Can't send multiple TOKEN messages back | Using `chrome.runtime.sendMessage` (request/response) | Switch to `chrome.runtime.connect` (ports) — see Phase 4 |
| SSE stream parsing misses tokens | Incomplete chunk handling — SSE data can split across `reader.read()` calls | Buffer partial lines, only process complete `data:` lines ending in `\n` |
| OpenAI stream ends but no DONE sent | OpenAI uses `data: [DONE]` as terminator, not a JSON object | Check for the literal string `[DONE]` before trying to JSON.parse |
| CORS error calling LLM API from service worker | Missing required headers or origin restrictions | Anthropic: use `anthropic-dangerous-direct-browser-access: true` header. OpenAI: works from service worker without special headers. |
| CORS error calling backend from extension | Backend not accepting extension origin | Set `ALLOWED_ORIGINS` env var to `chrome-extension://<your-extension-id>`. Use `*` for local dev only. |
| Rate limiter resets on server restart | In-memory Map clears on restart | Acceptable for v1 — document this as known behavior |
| Client usage counter shows wrong number | Counter is client-side guess, not synced from server | Read `X-RateLimit-Remaining` header from backend responses and update `chrome.storage.local` |
| Extension breaks after platform update | DOM selectors changed | Use resilient selectors (data attributes, aria labels), test weekly, update selectors as needed |
| API key stored in sync storage | Used `chrome.storage.sync` instead of `local` | Always use `chrome.storage.local` for sensitive data |
| Double enhancement on fast double-click | Missing disabled state on trigger button | Set `isEnhancing = true` immediately on click, re-enable on DONE or ERROR |
| Popup settings don't take effect | Service worker cached old settings | Re-read `chrome.storage.local` on each ENHANCE connection, don't cache settings in service worker memory |
| Free-tier abuse with huge prompts | No input validation on backend | Validate `prompt.length <= 10000` in backend middleware, return 400 for oversized prompts |
| Backend accepts garbage platform value | No platform validation | Validate `platform` against `['chatgpt', 'claude', 'gemini']`, return 400 otherwise |
| Meta-prompt differs between extension and server | Edited one file but not the other | Run `scripts/sync-meta-prompt.ts` at build time, or add it as a pre-build step in server's `package.json` |
| OpenAI key entered but Anthropic models shown | Provider not auto-detected from key format | Auto-detect provider from key prefix: `sk-ant-` → Anthropic, `sk-` without `ant` → OpenAI. Update model dropdown accordingly. |
| Context menu doesn't appear | `contextMenus` permission missing or `onInstalled` listener not firing | Add permission to manifest, verify `chrome.contextMenus.create()` is inside `chrome.runtime.onInstalled.addListener()` |
| `chrome.scripting.executeScript()` fails on a page | Missing `scripting` permission, or page is a `chrome://` or `chrome-extension://` URL | Add `scripting` permission. Chrome internal pages cannot be scripted — show toast via fallback. |
| Handler script can't find selection range | Selection cleared between right-click and script injection, or selection is in shadow DOM / canvas editor | Capture range immediately on injection. Fall back to `info.selectionText` from service worker + clipboard path. |
| Textarea replacement doesn't trigger React state update | Set `value` directly instead of using native setter from prototype | Use `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, newValue)` then dispatch `new Event('input', { bubbles: true })` |
| Context menu conflicts with trigger button on supported platforms | Both fire on the same text | They use independent code paths — trigger button uses `enhance` port, context menu uses `context-enhance` port. No conflict by design. |
| Enhanced text appears but undo doesn't work | Original text not saved before replacement, or saved reference lost | Save original text immediately after selection capture, before any DOM mutation. Store in handler's closure, not on a DOM element. |
| Context menu fires twice rapidly | No double-trigger guard | Track `isEnhancing` per tab in service worker. If already active, inject a "Already enhancing..." toast instead of a new handler. |
| Handler CSS clashes with page styles | Injected toast styles override page styles or vice versa | Use highly specific class names (`promptgod-ctx-toast`) and `!important` on critical properties. Scope all styles under a unique prefix. |
