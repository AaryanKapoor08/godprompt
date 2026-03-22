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
| `pending` | `feat(service-worker): implement port-based message passing for streaming` | `feat/phase-4/service-worker-ports` |

**What was done:**
- Defined message types in `src/lib/types.ts`: `ENHANCE`, `TOKEN`, `DONE`, `ERROR`
- Service worker listens via `chrome.runtime.onConnect` (top-level registration for wake-up)
- Content script opens port on button click, sends `ENHANCE` message
- Service worker sends 3 mock tokens at 200ms intervals, then `DONE`
- Content script logs each token and handles `DONE`/`ERROR`/disconnect
- Error path sends `ERROR` message + toast, then disconnects
- `onDisconnect` handler catches unexpected disconnections

---

## Upcoming

| Phase | Planned commit message |
|-------|----------------------|
| 5 | `feat(service-worker): integrate Anthropic streaming API with minimal popup` |
| 6 | `feat(chatgpt): implement streaming DOM text replacement with execCommand fallback` |
| 7 | `feat(undo): implement undo button with auto-dismiss and interrupt handling` |
| 8 | `feat(popup): implement full settings page with provider detection` |
| 9 | `feat(llm-client): add OpenAI streaming support for BYOK mode` |
| 10 | `feat(backend): implement Hono server with validation, rate limiting, and headers` |
| 11 | `feat(extension): integrate free tier with synced rate limit tracking` |
| 12 | `feat(claude-adapter): implement full platform adapter for Claude.ai` |
| 13 | `feat(gemini): implement adapter and polish all platforms` |
