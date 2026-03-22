# PromptPilot — Commit History

Track of all commits pushed to GitHub, organized by phase.

---

## Phase 1 — Project Scaffold

| Hash | Message | Branch |
|------|---------|--------|
| `9112562` | `chore(extension): scaffold project with Vite and Manifest V3` | `main` |

**What was done:**
- Vite + Manifest V3 extension scaffold
- CRXJS plugin configured (named import `{ crx }` required)
- Content script loads on ChatGPT, Claude, Gemini
- Popup renders
- `.gitignore` covers node_modules, dist, .env

---

## Phase 2 — ChatGPT Adapter (Read Only)

| Hash | Message | Branch |
|------|---------|--------|
| `f0177f1` | `feat(chatgpt): implement read-only platform adapter with conversation context` | `feat/phase-2/chatgpt-adapter` |

**What was done:**
- `ChatGPTAdapter` implementing `PlatformAdapter` interface
- `matches()` — checks `chatgpt.com` / `chat.openai.com`
- `getPromptText()` — reads from `div#prompt-textarea` via `textContent.trim()`
- `getSendButton()` — last `<button>` inside the composer `<form>`
- `getConversationContext()` — counts `[data-testid^="conversation-turn-"]` elements
- Content script refactored to adapter pattern with 5-retry hydration wait
- All 4 methods verified manually in Chrome DevTools on chatgpt.com

---

## Phase 3 — Trigger Button + Error Toast

| Hash | Message | Branch |
|------|---------|--------|
| `c396f7f` | `feat(content): inject trigger button with toast and smart skip` | `feat/phase-3/trigger-button-toast` |

**What was done:**
- Trigger button injected next to ChatGPT send button (purple sparkle icon)
- Loading spinner + disabled state on click (2s temp reset)
- Double-click guard via `isEnhancing` flag
- `Ctrl+Shift+E` keyboard shortcut
- `MutationObserver` re-injects button after SPA navigation
- Toast component with info/error/warning variants, auto-dismiss
- `shouldSkipEnhancement()` — skips prompts < 3 words
- 9 unit tests passing (vitest)
- Added `PromptPilot_Techniques_to_Codebase_Guide.md` for Phase 5 meta-prompt work

---

## Phase 4 — Service Worker Messaging (Ports)

| Hash | Message | Branch |
|------|---------|--------|
| `cd90c0b` | `feat(service-worker): implement port-based message passing for streaming` | `feat/phase-4/service-worker-ports` |

**What was done:**
- Defined message types in `src/lib/types.ts`: `ENHANCE`, `TOKEN`, `DONE`, `ERROR`
- Service worker listens via `chrome.runtime.onConnect` (top-level registration for wake-up)
- Content script opens port on button click, sends `ENHANCE` message
- Service worker sends 3 mock tokens at 200ms intervals, then `DONE`
- Content script logs each token and handles `DONE`/`ERROR`/disconnect
- Error path sends `ERROR` message + toast, then disconnects
- `onDisconnect` handler catches unexpected disconnections

---

## Phase 5 — LLM Integration (BYOK) + Minimal Popup

| Hash | Message | Branch |
|------|---------|--------|
| `fa6f877` | `feat(service-worker): integrate Anthropic streaming API with minimal popup` | `feat/phase-5/llm-integration` |

**What was done:**
- Minimal popup with API key input (saves to `chrome.storage.local`)
- Meta-prompt (~600 tokens) distilled from techniques guide with domain checklists and anti-pattern rules
- `buildMetaPrompt()` — interpolates platform and conversation context
- `buildUserMessage()` — passes raw prompt to LLM
- `validateApiKey()` — detects Anthropic (`sk-ant-`), OpenRouter (`sk-or-`), OpenAI (`sk-`)
- `callAnthropicAPI()` — Anthropic Messages API with streaming
- `callOpenRouterAPI()` — OpenAI-compatible streaming via OpenRouter
- `parseAnthropicStream()` — extracts `content_block_delta` text chunks
- `parseOpenAIStream()` — extracts `choices[0].delta.content` chunks
- Service worker routes to correct provider based on stored key
- 36 unit tests passing (smart-skip, validate-api-key, build-user-message, meta-prompt, parse-sse-stream, parse-openai-stream)
- Verified end-to-end with OpenRouter free model on chatgpt.com

---

## Phase 6 — Streaming DOM Replacement

| Hash | Message | Branch |
|------|---------|--------|
| `60fd8fa` | `feat(chatgpt): implement streaming DOM text replacement with execCommand fallback` | `feat/phase-6/streaming-dom-replacement` |

**What was done:**
- Created `dom-utils.ts` — `clearContentEditable()`, `insertText()`, `replaceText()`
- Primary strategy: `execCommand('insertText')` — deprecated but reliably triggers ProseMirror state updates
- Fallback: `InputEvent` with `DataTransfer` for when execCommand is removed
- Implemented `ChatGPTAdapter.setPromptText()` using `replaceText()`
- Token accumulation in trigger-button.ts — calls `setPromptText(accumulatedText)` on each TOKEN
- Error guard: if input element disappears mid-stream, shows toast instead of crashing
- Guard for stale `chrome.runtime` after extension reload (shows "refresh page" warning)
- Tested with short (1 sentence) and paragraph-length prompts on chatgpt.com

---

## Phase 7 — Undo System

| Hash | Message | Branch |
|------|---------|--------|
| `4bf4be1` | `feat(undo): implement undo button with auto-dismiss and interrupt handling` | `feat/phase-6/streaming-dom-replacement` |

**What was done:**
- Created `undo-button.ts` — floating undo button with fade-in animation
- Click restores original prompt via `adapter.setPromptText()`
- Auto-dismiss after 10 seconds via `setTimeout`
- Dismiss on user keydown in input (manual editing)
- Dismiss on send button click or empty input detected (MutationObserver)
- `trigger-button.ts` caches `originalPrompt` before DOM modification
- Undo shown on DONE, on ERROR with partial text, and on unexpected disconnect
- `removeUndoButton()` cleans up all timers, listeners, and observers

---

## Phase 8 — Full Popup Settings

| Hash | Message | Branch |
|------|---------|--------|
| `baf8da9` | `feat(popup): implement full settings page with provider detection` | `feat/phase-8/full-popup-settings` |
| `a7430f3` | `fix(popup): correct OpenRouter Haiku model ID` | `feat/phase-8/full-popup-settings` |

**What was done:**
- Full popup with mode toggle (Free tier / BYOK), defaults to Free tier
- BYOK section: API key input with green/red validation borders, model dropdown
- Provider auto-detection from key prefix: `sk-ant-` → Anthropic, `sk-or-` → OpenRouter, `sk-` → OpenAI
- Model dropdown shows provider-specific models (Haiku/Sonnet, GPT-4o/mini, Nemotron/Haiku/GPT-4o-mini)
- Usage bar with normal/warning/full color states (synced from server in Phase 11)
- External `popup.css` for cleaner separation
- Service worker reads `mode` and `model` from storage on each request
- Added `callOpenAIAPI()` for direct OpenAI API streaming
- Service worker logs model in use for debugging
- Fixed OpenRouter Haiku model ID (`anthropic/claude-3.5-haiku`)

---

## Upcoming

| Phase | Planned commit message |
|-------|----------------------|
| 9 | `feat(llm-client): add OpenAI streaming support for BYOK mode` |
| 10 | `feat(backend): implement Hono server with validation, rate limiting, and headers` |
| 11 | `feat(extension): integrate free tier with synced rate limit tracking` |
| 12 | `feat(claude-adapter): implement full platform adapter for Claude.ai` |
| 13 | `feat(gemini): implement adapter and polish all platforms` |
