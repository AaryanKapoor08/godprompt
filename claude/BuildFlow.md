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
