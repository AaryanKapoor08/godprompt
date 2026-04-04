# PromptGod — Commit History

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

## Phase 9 — OpenAI BYOK Support [deferred — post-launch]

Code exists from Phase 5/8 but deferred to post-launch. OpenAI BYOK is optional; Anthropic + OpenRouter cover the core use case.

---

## Phase 10 — Backend Server

| Hash | Message | Branch |
|------|---------|--------|
| `be12b6d` | `feat(backend): implement Hono server with validation, rate limiting, and headers` | `feat/phase-10/backend-server` |

**What was done:**
- Hono server with `@hono/node-server`, `pnpm dev` starts on port 3000
- `GET /health` returns `{ status: 'ok' }`
- `POST /api/enhance` proxies to Anthropic API, returns SSE stream (`{ type: "token", text }`)
- Request validation middleware: Content-Type, prompt (required, non-empty, max 10000 chars), platform (chatgpt/claude/gemini)
- IP-based in-memory rate limiter: 10/hour default, `X-RateLimit-Remaining` + `X-RateLimit-Reset` headers on all responses, `Retry-After` on 429
- CORS middleware via `hono/cors` with `ALLOWED_ORIGINS` env var, exposes rate limit headers
- `.env.example`, `Dockerfile`, `tsconfig.json`
- 24 tests passing: 6 rate-limit, 10 validation, 8 integration (mocked Anthropic)

---

## Phase 11 — Free Tier Integration

| Hash | Message | Branch |
|------|---------|--------|
| `dd601dc` | `feat(extension): integrate free tier with synced rate limit tracking` | `feat/phase-11/free-tier-integration` |

**What was done:**
- Service worker `handleFreeTier()` routes free-mode requests through backend `POST /api/enhance`
- Parses backend SSE format (`{"type":"token","text":"..."}`) and forwards as TOKEN messages
- Syncs `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers to `chrome.storage.local`
- 429 response shows "Free tier limit reached" toast with upgrade message
- Offline detection via `navigator.onLine` — shows "No connection" toast before fetch
- Network error handling for unreachable backend
- Popup listens to `chrome.storage.local.onChanged` for live usage counter updates
- Usage counter auto-resets when `usageResetTime` expires
- BYOK mode bypasses backend entirely — direct API call to provider
- DONE message includes `rateLimitRemaining`/`rateLimitReset` for content script awareness

---

## Phase 12 — Claude.ai Adapter

| Hash | Message | Branch |
|------|---------|--------|
| `2aee079` | `feat(claude-adapter): implement full platform adapter for Claude.ai` | `feat/phase-12/claude-adapter` |
| `1aa1fef` | `fix(claude-adapter): correct button placement and reduce injection delay` | `feat/phase-12/claude-adapter` |
| `05e135e` | `fix(claude-adapter): position trigger button in composer top-right` | `feat/phase-12/claude-adapter` |
| `1da030c` | `fix(claude-adapter): place trigger button left of model selector` | `feat/phase-12/claude-adapter` |
| `3f4de82` | `fix(claude-adapter): insert button inline in model selector row` | `feat/phase-12/claude-adapter` |
| `f44e020` | `fix(claude-adapter): walk DOM tree to find correct flex row for button` | `feat/phase-12/claude-adapter` |

**What was done:**
- `ClaudeAdapter` implementing full `PlatformAdapter` interface
- `getInputElement()` — finds contenteditable ProseMirror div with 4 fallback selectors
- `getPromptText()` — reads via `textContent.trim()`
- `setPromptText()` — uses shared `replaceText()` (execCommand + InputEvent fallback)
- `getSendButton()` — `aria-label="Send Message"` with fallback to last button in fieldset
- `getConversationContext()` — counts message elements in conversation container
- Registered in content script `index.ts` alongside `ChatGPTAdapter`
- Injection delay reduced from 2s to 500ms with 10 retries at 500ms each
- Button inserted inline left of model selector ("Sonnet 4.6") by walking DOM to correct flex row
- Verified working in Chrome on claude.ai

---

## Phase 13 — Gemini Adapter + Polish

| Hash | Message | Branch |
|------|---------|--------|
| `1fcd840` | `feat(gemini): implement adapter and polish all platforms` | `feat/phase-13/gemini-adapter` |
| `7be569f` | `fix(gemini): broaden input and send button selectors for resilience` | `feat/phase-13/gemini-adapter` |
| `618afea` | `fix(gemini): use absolute positioning to escape clipped send button container` | `feat/phase-13/gemini-adapter` |
| `0b81050` | `fix(gemini): place trigger button inline left of Fast model selector` | `feat/phase-13/gemini-adapter` |

**What was done:**
- `GeminiAdapter` implementing full `PlatformAdapter` interface
- `getInputElement()` — finds Quill editor (`div.ql-editor`) inside `rich-textarea` with fallbacks
- `getSendButton()` — `aria-label="Send message"` with mat-icon and proximity fallbacks
- `getConversationContext()` — counts `model-response` and `user-query` custom elements
- Button inserted inline left of "Fast" model selector by walking DOM to correct flex row
- Injection delay 500ms with 10 retries (shared with Claude fix)
- Meta-prompt verified in sync between extension and server
- 60 tests passing (36 extension + 24 server), production build clean
- Verified working in Chrome on gemini.google.com

---

## Phases 14-15

Perplexity adapter and Chrome Web Store launch — see `claude/Progress.md` for details.

---

## Phases 16-18 — Context Menu (optional, not started)

Right-click "Enhance with PromptGod" on any webpage — see `claude/BuildFlow.md` for full plan.

---

## Consolidation Snapshot (2026-03-30)

This checkpoint bundles runtime reliability hardening (Phase 15.9 scope) and sendable-rewrite guardrails (Phase 15.10 scope).

Primary consolidation commit:
- `0ec008c` — `fix(extension): harden streaming reliability and prompt rewriting`

**Primary code updates:**
- Streaming reliability hardening in `extension/src/content/ui/trigger-button.ts` and `extension/src/service-worker.ts` (START handshake, timeout safeguards, safer runtime handling).
- Parser/reliability updates in `extension/src/lib/llm-client.ts` (OpenAI-compatible SSE robustness + OpenRouter non-stream fallback path).
- Message contract update in `extension/src/lib/types.ts` (`START` message support).
- Prompt policy updates in `extension/src/lib/meta-prompt.ts` (no placeholders, sendable-as-is, critical-only clarifying questions).
- Popup UX tune in `extension/src/popup/popup.html`, `extension/src/popup/popup.ts`, and `extension/src/popup/popup.css` (model hint row).

**Test updates:**
- `extension/test/unit/meta-prompt.test.ts`
- `extension/test/unit/parse-openai-stream.test.ts`
- `extension/test/unit/openrouter-nonstream.test.ts` (new)

**Docs updated in this checkpoint:**
- `claude/BuildFlow.md`
- `claude/Progress.md`
- `claude/github.md`

**Verification (re-run after checkpoint restore):**
- `pnpm test` in `extension/` → 7 files, 48 tests passed
- `pnpm build` in `extension/` → success (known Vite emit warning for icon overwrite)

**Local-only files intentionally excluded from commit scope:**
- `.claude/settings.local.json`
- `.vscode/settings.json`

---

## Follow-up Split Doc Commits (2026-03-30)

- `c562650` — `docs(buildflow): mark phases 15.9 and 15.10 checkpoints complete`
- `5cc717b` — `docs(progress): set current phase to 16 and sync 15.10 notes`

---

## Phase 15.11–15.14 — Streaming Reliability + Injection Hardening (2026-04-03)

| Hash | Message | Branch |
|------|---------|--------|
| `2ba1013` | `chore(config): update claude local settings` | `main` |
| `4b90b50` | `chore(vscode): add workspace auto approve settings` | `main` |
| `8859c8e` | `docs(buildflow): update phase instructions` | `main` |
| `3d201bc` | `docs(progress): record phase 15 progress` | `main` |
| `df2550f` | `fix(streaming): refine progressive input injection` | `main` |
| `934f445` | `fix(undo): support on-undo callback hook` | `main` |
| `f9702be` | `fix(streaming): harden openai-compatible sse parsing` | `main` |
| `2177fc8` | `feat(meta-prompt): enforce critical-context rewrites` | `main` |
| `72a6dd2` | `fix(service-worker): keep openrouter stream-only flow` | `main` |
| `ccdef46` | `test(meta-prompt): cover critical-context behavior` | `main` |
| `d84a052` | `test(streaming): add line-delimited sse coverage` | `main` |
| `1efcd60` | `chore(vscode): update terminal auto-approve entries` | `main` |
| `430df77` | `docs(progress): add phase 15.13 handoff snapshot` | `main` |
| `091b1b3` | `fix(llm-client): increase openrouter timeout to 60s` | `main` |
| `600a16d` | `feat(dom-utils): add appendText helper for cursor-at-end insert` | `main` |
| `a52b8b5` | `feat(streaming): rework progressive render to word-boundary loop` | `main` |
| `9c194af` | `docs(progress): add phase 15.14 injection spacing integrity hardening` | `main` |

**What was done:**
- Meta-prompt enforces critical-context rewrites — questions only for missing context that changes the answer
- OpenAI-compatible SSE parser hardened against line-delimited and chunked responses
- OpenRouter locked to stream-only path (non-stream fallback removed)
- Undo button supports on-undo callback hook for post-restore side effects
- Progressive injection refined: character-slice rAF scheduler replaced with word-boundary render loop
- Field not cleared until first token arrives — original prompt stays visible during API wait
- Final exact sync via `setPromptText` on stream complete; ERROR/disconnect flush partial result
- `appendText` helper added to `dom-utils.ts` for cursor-at-end append without clearing
- OpenRouter request timeout increased from 25s to 60s (matches Anthropic/OpenAI)
- 55 tests passing, production build clean

---

## Phase 15.15 — Deployment: Chrome Web Store Compliance & Resubmission (2026-04-04)

| Hash | Message | Branch |
|------|---------|--------|
| `1c8ffb7` | `fix(deployment): remove unused activeTab permission and add compliance phase` | `main` |

**What was done:**
- Removed unused `activeTab` permission from `extension/manifest.json` (Chrome Web Store rejection: Purple Potassium)
- Removed `activeTab` from `extension/dist/manifest.json`
- Full codebase compliance audit: all permissions justified, no RCE, no tracking, no hardcoded secrets
- Privacy policy overhauled:
  - Added "Website Content" disclosure (prompt text read from page DOM)
  - Labeled API keys as "Authentication Information" per Chrome terminology
  - Added explicit Permissions section (section 6) justifying each permission
  - Expanded Limited Use compliance section with 5 specific bullet points
  - Added HTTPS encryption-in-transit disclosure
  - Removed contradictory "No prompt content" claim
- Privacy policy deployed to GitHub Pages
- Developer Dashboard updated: Authentication Information, Website Content, and all Limited Use certifications checked
- Added Phase 15.15 tracking to Progress.md and BuildFlow.md
