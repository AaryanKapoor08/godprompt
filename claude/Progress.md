# PromptPilot — Progress Tracker

Update this file as you complete each phase.

**Current Phase: 4**

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

### PHASE 5 — LLM Integration (BYOK) + Minimal Popup [not started]

- [ ] Minimal popup shows API key input, saves to `chrome.storage.local`
- [ ] `buildUserMessage()` unit test passes
- [ ] Anthropic SSE parser unit test passes (mock SSE data)
- [ ] `validateApiKey()` unit test passes
- [ ] Clicking trigger button with a real Anthropic key → tokens stream back via port
- [ ] Meta-prompt template interpolates platform and context correctly
- [ ] No API key is committed to git
- [ ] Commit: `feat(service-worker): integrate Anthropic streaming API with minimal popup`
- Notes: USE `PromptPilot_Techniques_to_Codebase_Guide.md` (project root) when building the meta-prompt. It maps prompting techniques to code: domain-specific gap checklists, anti-pattern rules, technique priority order. The doc is the knowledge base — distill it into ~500-800 token system prompt in `src/lib/meta-prompt.ts`.

### PHASE 6 — Streaming DOM Replacement [not started]

- [ ] Clicking trigger button → input field text is replaced with enhanced prompt token-by-token
- [ ] ChatGPT's send button is active/enabled after enhancement completes
- [ ] Streaming looks smooth — no flicker, no duplicate text
- [ ] Works with short prompts (1 sentence) and longer prompts (paragraph)
- [ ] If input element disappears mid-stream, error toast appears (not a crash)
- [ ] Commit: `feat(chatgpt): implement streaming DOM text replacement with execCommand fallback`
- Notes:

### PHASE 7 — Undo System [not started]

- [ ] After enhancement, undo button appears near the input field
- [ ] Clicking undo restores the exact original prompt
- [ ] ChatGPT send button remains active after undo
- [ ] Undo button disappears after 10 seconds
- [ ] Undo button disappears if user edits the text manually
- [ ] Undo button disappears if user sends the message
- [ ] If streaming is interrupted, partial text remains and undo button still appears
- [ ] Commit: `feat(undo): implement undo button with auto-dismiss and interrupt handling`
- Notes:

### PHASE 8 — Full Popup Settings [not started]

- [ ] Popup opens with mode toggle defaulting to "Free tier"
- [ ] Switching to BYOK shows API key input and model dropdown
- [ ] Entering an Anthropic key shows Claude models; entering an OpenAI key shows GPT models
- [ ] API key validates format on input (visual feedback)
- [ ] Settings persist after closing and reopening popup
- [ ] Service worker reads stored settings and routes accordingly
- [ ] Commit: `feat(popup): implement full settings page with provider detection`
- Notes:

### PHASE 9 — OpenAI BYOK Support [not started]

- [ ] `parseOpenAIStream()` unit test passes (mock SSE data)
- [ ] Entering an OpenAI key in popup + clicking enhance → tokens stream and replace input text
- [ ] Streaming DOM replacement works identically to Anthropic path
- [ ] Undo works after OpenAI enhancement
- [ ] Switching between Anthropic and OpenAI keys works without restart
- [ ] Commit: `feat(llm-client): add OpenAI streaming support for BYOK mode`
- Notes:

### PHASE 10 — Backend Server [not started]

- [ ] `pnpm dev` starts server on port 3000
- [ ] `GET /health` returns `{ status: 'ok' }`
- [ ] `POST /api/enhance` with valid prompt returns SSE stream of enhanced text
- [ ] `POST /api/enhance` with invalid platform returns 400
- [ ] `POST /api/enhance` with 15,000 char prompt returns 400
- [ ] 11th request from same IP within an hour returns 429 with `X-RateLimit-Remaining: 0`
- [ ] All successful responses include `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers
- [ ] Rate limiter unit test passes
- [ ] Request validation unit test passes
- [ ] Integration test passes
- [ ] `.env` is in `.gitignore`, `.env.example` exists
- [ ] CORS rejects requests from non-allowed origins (when not using `*`)
- [ ] Commit: `feat(backend): implement Hono server with validation, rate limiting, and headers`
- Notes:

### PHASE 11 — Free Tier Integration [not started]

- [ ] With no API key set, enhancement routes through backend and works end-to-end
- [ ] After 10 enhancements, 11th shows rate limit toast with upgrade message
- [ ] Usage counter in popup accurately reflects server-side remaining count
- [ ] Usage counter resets when server's reset time passes
- [ ] Switching to BYOK mode bypasses backend entirely
- [ ] Offline state shows "No connection" toast without making a request
- [ ] Error toast appears for API failures and auto-dismisses
- [ ] Commit: `feat(extension): integrate free tier with synced rate limit tracking`
- Notes:

### PHASE 12 — Claude.ai Adapter [not started]

- [ ] Trigger button appears correctly on Claude.ai
- [ ] `getPromptText()` reads text accurately
- [ ] `getConversationContext()` returns correct values
- [ ] Streaming replacement works — text appears token-by-token
- [ ] Claude's send button is active after enhancement
- [ ] Undo restores original prompt
- [ ] Button re-appears after navigating to a new conversation
- [ ] Error toast appears if input element not found
- [ ] Commit: `feat(claude-adapter): implement full platform adapter for Claude.ai`
- Notes:

### PHASE 13 — Gemini Adapter + Polish [not started]

- [ ] Trigger button appears correctly on Gemini
- [ ] Full enhancement flow works on Gemini (streaming + undo)
- [ ] `getConversationContext()` works on all three platforms
- [ ] All three platforms pass the manual testing checklist
- [ ] Error states display correctly on all platforms
- [ ] Streaming interruption keeps partial text + shows undo on all platforms
- [ ] Production build loads and works on all three platforms
- [ ] No console errors on any platform during normal use
- [ ] Meta-prompt is in sync between extension and server
- [ ] Commit: `feat(gemini): implement adapter and polish all platforms`
- Notes:
