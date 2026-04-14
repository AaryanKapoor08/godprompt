# PromptGod — Progress Tracker

Update this file as you complete each phase.

**Current Phase: No active unresolved issues — Phase 16.6 remains deferred; highlighted-text context menu v1 is implemented and pushed**

Last synced with Codex handoff: 2026-04-14



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
- [x] `pnpm build` succeeds, 38 unit tests passing
- [x] Commit: `fix(extension): replace placeholder icons and fix ChatGPT button placement`
- [x] Service worker wakes up reliably when enhance is clicked (MV3 lifecycle bug resolved with runtime hardening)
- Notes: Root cause was stale content script context after extension reload (`Extension context invalidated`), which made runtime messaging fail before port handling. Added content-script runtime guards and safe error handling around ping/connect/postMessage, plus a no-response timeout to prevent silent hangs. Manually verified both scenarios: (1) idle service worker path works after waiting 30-60s, and (2) stale-tab path now shows refresh warning instead of crashing.

### PHASE 15.7 — Meta-Prompt: Stop Answering, Start Rewriting [complete]

- [x] `buildUserMessage()` wraps raw prompt with `"""` delimiters, "Rewrite the following prompt" instruction, AND platform/context info
- [x] Platform and context included in user message (reinforces system prompt for weaker models)
- [x] System prompt ends with CRITICAL CONSTRAINT block ("You are a REWRITER, not a RESPONDER")
- [x] `buildUserMessage()` unit test updated to assert new wrapped format with platform/context
- [x] All unit tests passing (38 tests)
- [x] Manual test: "how to learn Java" → returns rewritten question, NOT a Java guide
- [x] Manual test: "explain quantum computing" → returns better question, NOT an explanation
- [x] Manual test: "write me a poem about rain" → returns more specific prompt, NOT a poem
- [x] Manual test: "what's the best database for my app" → returns sharpened question, NOT a comparison
- [x] GATE: all 4 manual tests pass before moving to Phase 15.8
- [x] Commit captured in consolidation checkpoint commit (2026-03-30)
- Notes: Manual validation passed. All four prompts were rewritten rather than answered directly. Additional model checks also rewrote correctly: Nemotron Nano produced a constrained rewrite (14-line free-verse request), and o4-mini produced a concise rewrite (4-stanza lyrical rain poem request).

### PHASE 15.8 — Meta-Prompt: Consistent Rewrite Quality [complete]

- [x] Gap prioritization rule added: "pick 1-2 most impactful gaps, not all"
- [x] Purpose test rule added: "if I remove this addition, does the AI give a worse answer?"
- [x] 4 before/after good examples added covering: coding, research, writing, learning
- [x] 1 BAD rewrite example added showing filler anti-pattern ("thorough", "comprehensive", "expert")
- [x] Example annotations kept short — pattern instruction above, not essays per example
- [x] Meta-prompt sections reordered: role → context → process → checklist → prioritization → techniques → rules → examples → critical constraint
- [x] Manual test: "help me with my website" → adds specifics, zero filler phrases
- [x] Manual test: "how to learn Java" → adds skill level + goal + structure, no "explain thoroughly"
- [x] Manual test: "compare AWS and Google Cloud" → adds use case + criteria + format, no "cover all aspects"
- [x] Manual test: "write a blog post about AI" → adds audience + angle + length, no "make it engaging"
- [x] Each test prompt run 3 times to verify consistency
- [x] All unit tests passing, production build clean
- [x] Commit captured in consolidation checkpoint commit (2026-03-30)
- Notes: Updated extension/src/lib/meta-prompt.ts with gap prioritization, purpose-test rule, and examples section (4 good + 1 bad). Added unit tests to assert presence and section ordering in test/unit/meta-prompt.test.ts. Validation now re-verified at 48/48 tests passing and `pnpm build` succeeding after checkpoint restore.

### PHASE 15.9 — Runtime Regression: LLM call stalls after ENHANCE start [complete]

- [x] Reproduced bug on short prompt (`how to learn java`) and long combined prompts
- [x] Verified content script and service worker handshake path works (`Enhance triggered` -> `Port connected` -> `Received ENHANCE request` -> `Calling LLM API (BYOK)`)
- [x] First token or explicit ERROR reliably returned for OpenRouter path
- [x] Spinner always resolves (DONE/ERROR) in real-world provider conditions
- [x] Commit captured in consolidation checkpoint commit (2026-03-30)
- Notes:
  - Stalled OpenRouter paths were hardened with START handshake, progress/ack timeouts, stream timeout handling, and non-stream fallback.
  - Parser resilience now covers no-space `data:` lines, CRLF separators, and streamed error payloads.
  - Changes made in this phase:
    - Added stale-extension runtime guards and safer port error handling in content script.
    - Added START handshake message (`START`) from service worker to content script.
    - Added no-response/progress timeout logic to avoid infinite spinner.
    - Added request abort timeouts in LLM client with provider-specific timeout windows.
    - Added OpenRouter fallback retry path on timeout-like failures.
    - Added explicit API host permissions for Anthropic/OpenAI/OpenRouter in manifest.
    - Added/updated stream parser and OpenRouter non-stream tests; test suite remained green.

### PHASE 15.10 — Sendable Rewrites, Critical Questions Only [complete]

- [x] Add explicit RULES ban on placeholders/templates in `extension/src/lib/meta-prompt.ts`
- [x] Add RULES requirement: rewritten prompt must be sendable as-is (no user edits)
- [x] Add RULES requirement: ask clarifying questions only when missing context is critical
- [x] Add RULES requirement: if context is sufficient, rewrite directly without questions
- [x] Add RULES requirement: max 3-4 concise clarifying questions when needed
- [x] Add Option A behavior instruction for critical-missing-context prompts (strip bloat, keep structure, ask AI to gather missing context first)
- [x] Add BAD example for placeholder templates:
  - Before: "I need a business strategy"
  - After: "... [industry] ... [budget] ... [goal] ..."
- [x] Add BAD example for over-questioning when context is already sufficient
- [x] Update `extension/test/unit/meta-prompt.test.ts` assertions for the new rules and examples
- [x] `pnpm test` passes
- [x] `pnpm build` passes
- [x] Manual verification (run each prompt 3 times):
  - "I need a business strategy" → no placeholders, sendable, asks questions only if critical
  - "help me with my app" → no placeholders, sendable, asks questions only if critical
  - detailed AWS vs GCP prompt → direct rewrite, no unnecessary questions
  - specific launch-email prompt → direct rewrite, no unnecessary questions
- [x] Commit captured in consolidation checkpoint commit (2026-03-30)
- Notes: Phase 15.10 rules and examples are in `extension/src/lib/meta-prompt.ts`, with matching assertions in `extension/test/unit/meta-prompt.test.ts`. Validation re-run after checkpoint restore: `pnpm test` => 48/48 passing, `pnpm build` => pass. BuildFlow checkpoint boxes were synced in commit `c562650`.

### PHASE 15.12 — Restore Streaming Injection [complete]

- [x] Identified regression source: OpenRouter non-stream fallback path in `service-worker.ts` could delay visible text until full response
- [x] Restored stream-first behavior: removed non-stream injection fallback from active enhancement path
- [x] Hardened OpenAI-compatible SSE parsing for line-delimited providers that omit blank separators
- [x] Restored undo responsiveness during active stream: undo now appears on first token and can stop streaming immediately
- [x] Undo still works after completion/interruption and restores the original prompt instantly
- [x] Added parser regression coverage for line-delimited `data:` frames without blank separators
- [x] `pnpm test` passes (49/49)
- [x] `pnpm build` passes
- [x] Commit: pending
- Notes: Streaming injection now begins as soon as provider tokens arrive, instead of waiting for a full non-stream fallback response. The service worker now surfaces stream timeout/no-token conditions as errors rather than degrading to delayed one-shot injection.

### PHASE 15.13 — Streaming + Rewrite Behavior Hardening [in progress]

- [x] Created and pushed working branch: `feat/phase-15-13-separate-commits` (no main-branch changes)
- [x] Progressive injection queue added in `extension/src/content/ui/trigger-button.ts` to avoid burst-only updates
- [x] Final DOM sync on `DONE` added to reduce transient spacing glitches before completion
- [x] OpenRouter stream-only path retained in `extension/src/service-worker.ts` (no non-stream composer fallback)
- [x] OpenAI-compatible SSE parser hardened in `extension/src/lib/llm-client.ts`
- [x] Undo callback path retained in `extension/src/content/ui/undo-button.ts`
- [x] Meta-prompt strengthened for critical-missing-context business/app prompts in `extension/src/lib/meta-prompt.ts`
- [x] Meta-prompt now explicitly forbids assistant-style direct question responses as final rewrite output
- [x] Unit tests updated for parser and meta-prompt behavior:
  - `extension/test/unit/parse-openai-stream.test.ts`
  - `extension/test/unit/meta-prompt.test.ts`
- [x] Validation: `pnpm test` (49/49 passing), `pnpm build` passing
- [ ] Manual verification pending (resume here):
  - Confirm live typing looks progressively rendered on ChatGPT (not one-shot burst)
  - Confirm no merged-word artifacts in final injected text (e.g., `AWSand`, `structuredlearning`)
  - Confirm "help me with my app" rewrite stays instruction-style (ask-AI-to-ask questions), not assistant-style direct reply
  - Re-test with a non-rate-limited model/key (OpenRouter 429 blocked repeat checks during this session)
- [ ] Commit: pending
- Notes: This phase is intentionally scoped to injection/render and rewrite-rule behavior only. Phase 15.6-15.10 reliability/quality foundations remain in place; remaining risk is manual UX verification under real provider output variance.

### PHASE 15.14 — Injection Spacing Integrity Hardening [in progress]

- [x] Objective: keep live progressive typing while guaranteeing final injected text preserves intended word boundaries
- [x] Scope lock (only):
  - `extension/src/content/ui/trigger-button.ts`
  - `extension/test/unit/` (new focused tests only if needed)
- [x] Non-goals (must NOT change):
  - No provider routing changes (`service-worker.ts`)
  - No parser contract changes (`llm-client.ts`) unless a failing test proves parser boundary loss
  - No popup/settings/meta-prompt behavior changes
  - No main-branch push

- [ ] Implementation plan (no gaps):
  - [x] Keep raw stream accumulation exact (never trim token text, never regex-split by words)
  - [x] Keep progressive rendering from a pending raw-text buffer (character slices only)
  - [x] Add boundary reconciler guard during injection:
    - If previous rendered char is `[A-Za-z0-9]`
    - And incoming first char is `[A-Za-z0-9]`
    - And there is no existing separator at boundary
    - Insert one single space before applying incoming slice
  - [x] Do NOT force spaces around punctuation/symbols
  - [x] Preserve contractions, decimals, URLs, and code punctuation as-is
  - [x] Keep final exact sync on `DONE` (single re-apply of fully accumulated text)
  - [x] Keep ERROR/disconnect behavior: flush pending text, keep partial result, keep undo available
  - [x] Keep undo semantics unchanged (during + after stream)

- [ ] Validation checklist:
  - [x] `pnpm test` passes
  - [x] `pnpm build` passes
  - [ ] Manual live-typing test prompts (no merged words):
    - "to start phase 15.12"
    - "Compare AWS and Google Cloud"
    - "Create a structured learning roadmap"
    - "help me with my app"
  - [ ] Verify no artifacts like `AWSand`, `tostart`, `structuredlearning`, `learningroadmap`
  - [ ] Verify no punctuation regressions (`e.g.`, `3.5`, `foo_bar`, URLs)
  - [ ] Verify no delay regression versus current progressive typing

- [ ] Rollback criteria:
  - [ ] If spacing fix introduces punctuation corruption or slower UX, revert only Phase 15.14 patch set
  - [ ] Keep Phase 15.6-15.13 reliability and rewrite-quality behavior intact

- [ ] Commit: pending
- Notes: Implemented in `extension/src/content/ui/trigger-button.ts` with token-boundary spacing reconciliation that preserves raw stream accumulation and keeps progressive character-slice rendering. Added focused tests in `extension/test/unit/trigger-boundary-spacing.test.ts` covering merged-word prevention and punctuation/URL/decimal safety. Validation: `pnpm test` => 55/55 passing, `pnpm build` => pass. Manual live-site verification remains pending.

### PHASE 15.15 — Deployment: Chrome Web Store Compliance & Resubmission [complete]

- [x] Removed unused `activeTab` permission from `extension/manifest.json` (violation: Purple Potassium)
- [x] Removed unused `activeTab` permission from `extension/dist/manifest.json`
- [x] Audited all remaining permissions — every permission justified by actual code usage
- [x] Audited codebase for remote code execution, tracking, hardcoded secrets — all clear
- [x] Updated privacy policy: added "Website Content" disclosure (prompt text read from page DOM)
- [x] Updated privacy policy: labeled API keys as "Authentication Information" per Chrome terminology
- [x] Updated privacy policy: added explicit Permissions section (section 6) justifying each permission
- [x] Updated privacy policy: expanded Limited Use compliance section (section 11) with 5 specific bullet points
- [x] Updated privacy policy: added HTTPS encryption-in-transit disclosure
- [x] Updated privacy policy: removed contradictory "No prompt content" claim from NOT-collected list
- [x] Privacy policy deployed to GitHub Pages (https://aaryankapoor08.github.io/promptGod-privacypolicy/)
- [x] Developer Dashboard: checked "Authentication Information" checkbox
- [x] Developer Dashboard: checked "Website Content" checkbox
- [x] Developer Dashboard: checked all 3 Limited Use certification boxes
- [x] Re-zip `dist/` folder with updated manifest (activeTab removed)
- [x] Upload new zip to Chrome Web Store Developer Dashboard
- [x] Resubmit extension for review
- [ ] Extension approved and published
- [ ] Published extension tested end-to-end on all 4 platforms
- Notes: Initial submission rejected for requesting but not using `activeTab` permission (violation ref: Purple Potassium). Full compliance audit performed — manifest, privacy policy, and dashboard disclosures all aligned.

### PHASE 16 — Post-Launch Optimization [in progress — v2 deployed through 16.5, 16.6+ deferred]

#### 16.1 — Quick Wins
- [x] `max_tokens: 768` present in all three provider call functions
- [x] Temperature set to 0.2 (tested with 6 standard prompts — coding, research, writing, learning, creative, business — all produced quality rewrites, creative not formulaic)
- [x] `callOpenRouterAPIOnce` and `OpenRouterNonStreamResponse` removed
- [x] `server/` directory removed from repo
- [x] Zero remaining `promptpilot-` CSS class references in `extension/src/` (renamed to `promptgod-`)
- [x] Popup shows supported sites list
- [x] `pnpm test` passes (45/45), `pnpm build` passes
- [ ] Commit: `perf(llm-client): reduce max_tokens, temperature, and remove dead code`

#### 16.2 — Speed & Reliability
- [x] AbortController cancels in-flight fetch when port disconnects
- [x] MutationObserver callback debounced (200ms)
- [x] Settings cached with `storage.onChanged` invalidation
- [x] Single retry with 1s backoff for 429/500/503 (pre-first-token only, no retry on 401/403)
- [x] Input element retry increased to 20 attempts
- [x] Network-blocked fetch shows privacy-browser-specific error message (Brave/Shields)
- [x] `pnpm test` passes (45/45), `pnpm build` passes
- [ ] Manual test: all 4 platforms work, undo works, errors display
- [ ] Commit: `perf(service-worker): add abort, retry, caching, and observer debounce`

#### 16.3 — Prompt Quality
- [x] Platform-specific hints in meta-prompt for all 4 platforms
- [x] `getRecentMessages(maxTokens)` method on each adapter (returns last 1-2 messages, cap ~500 tokens)
- [x] Recent context passed to `buildUserMessage()` when toggle is on
- [x] "Include conversation context" toggle in popup (default: on)
- [ ] Privacy policy updated and deployed with conversation context disclosure
- [x] `pnpm test` passes (45/45), `pnpm build` passes
- [x] Meta-prompt has context-use rule: ignore context for self-contained prompts
- [x] `[NO_CHANGE]` prefix detected → info toast "Your prompt is already strong", input not replaced
- [ ] Already-specific prompt triggers smart pass-through
- [ ] Short follow-up in ongoing conversation gets light enhancement (not restructured into standalone)
- [ ] Long/vague prompt in new conversation gets full enhancement
- [ ] Manual test: ongoing conversation enhancement uses context, new conversation does not
- [ ] Manual test: self-contained prompt in ongoing conversation — context ignored
- [ ] Manual test: "make it shorter" at message #5 → light touch, not standalone rewrite
- [ ] Manual test: detailed prompt with constraints → pass-through toast
- [ ] Commit: `feat(meta-prompt): add platform hints, conversation context, smart pass-through, and rewrite intensity`

#### 16.4 — UX Polish
- [x] "Enhancing..." status text visible during API wait, disappears on first token
- [x] Undo button persistent until user types or sends (no 10s auto-dismiss)
- [x] Second/third enhance click uses pre-first-enhancement original (if unedited)
- [x] If user edits enhanced text then clicks enhance, edited version is used (not stale original)
- [x] Keyboard shortcut changed to Ctrl+Shift+G
- [x] First-run tooltip on trigger button (one-time, gated by `hasSeenTooltip` flag)
- [x] Cost hints visible per model in popup
- [x] Local usage counters: total enhancements, per-platform, error count
- [x] Enhancement count shown in popup footer
- [x] `[DIFF: ...]` tag stripped from enhanced text, diff label shown next to undo button
- [x] Render loop ceiling prevents `[DIFF:]` tag from ever being typed into DOM (race condition fixed)
- [x] Trailing newlines before `[DIFF:]` tag trimmed — no blank cursor line after enhancement
- [x] Graceful degradation if model doesn't output `[DIFF:]` tag (no label, no error)
- [x] `pnpm test` passes (45/45), `pnpm build` passes
- [ ] Manual test: first-run flow, undo persistence, re-enhance, counters, diff label
- [ ] Commit: `feat(ux): persistent undo, re-enhance, first-run tooltip, usage stats, diff label`

#### 16.5 — Resilience & Future-Proofing
- [x] `insertTextViaInputEvent()` exported for testability
- [ ] `insertTextViaInputEvent()` fallback tested on all 4 platforms with `execCommand` mocked to fail
- [ ] Documented plan for alternative if fallback fails on any platform
- [x] Stale-selector warning after 20 failed injection attempts
- [x] Custom model ID input for OpenRouter (validates format: must contain `/`)
- [x] OpenRouter model list fetched and cached (24h TTL, hardcoded fallback)
- [x] Shift+click preview mode: overlay with "Use this" and "Dismiss" buttons
- [ ] Normal click still works as before (no regression)
- [x] `pnpm test` passes (45/45), `pnpm build` passes
- [ ] Manual test: custom model, preview mode, stale-selector warning
- [ ] Commit: `feat(resilience): fallback hardening, custom models, preview mode`

- Notes: All code written in single session (2026-04-04). Deferred from Phase 16: i18n (separate future phase), Firefox MV3 support (separate future phase). Tracked in Phase 21. Temperature set to 0.2 — needs quality gate testing with 6 prompt types before finalizing.

**v2 Deployment (2026-04-06):** Chrome Web Store zip `PromptGod-v2.zip` built and uploaded. Version bumped to 2.0.0. Includes all work through Phase 16.5 (OpenRouter retry logic, stream-merge dedup, adapter streaming methods). Does NOT include Phase 16.6 (adapter input strategy refactor) or later — those are deferred to future sessions. 59 unit tests passing at time of build. Some Phase 16 manual testing checkboxes remain unchecked — code is deployed but not all UX flows have been manually verified on every platform.

#### 16.6 — Adapter Consistency Refactor (Input Strategy)
- [ ] `ContentEditableInput` class created in `src/content/input-strategies/contenteditable.ts`
- [ ] `TextAreaInput` class created in `src/content/input-strategies/textarea.ts`
- [ ] ChatGPT adapter delegates to `ContentEditableInput` — manual test passes
- [ ] Claude adapter delegates to `ContentEditableInput` — manual test passes
- [ ] Gemini adapter delegates to `ContentEditableInput` with `onMutate` — manual test passes (text syncs, send button enables)
- [ ] Perplexity adapter resolves strategy dynamically (textarea vs contenteditable) — manual test passes (homepage + follow-up)
- [ ] No DIFF tag visible in input field on any platform
- [ ] Enhanced text persists (no disappearing text on any platform)
- [ ] Undo restores original prompt on all 4 platforms
- [ ] Strategy-level unit tests pass
- [ ] `pnpm test` passes, `pnpm build` passes
- [ ] One commit per adapter migration (4) + strategy files (1) + tests (1)
- [ ] Commit: `refactor(adapters): extract input strategies for cross-platform consistency`

- Notes: Motivated by Phase 16 bug fixes — DIFF tag leak, Perplexity textarea streaming broken, Gemini rich-textarea desync. Root cause: each adapter independently reimplements text ops. Migration order: ChatGPT → Claude → Gemini → Perplexity, each commit independently revertable via git.

### PHASE 17 — Context Menu: Foundation + Injection [complete — highlighted-text popup v1]

- [x] `contextMenus`, `scripting`, and `activeTab` permissions added to `manifest.json` (activeTab justified: required for `executeScript` on arbitrary pages via context menu)
- [x] Selected-text flow uses a separate neutral prompt module: `extension/src/lib/context-enhance-prompt.ts`
- [x] Context selected text is intentionally separate from normal `Platform` adapters and normal `meta-prompt.ts`
- [x] Context menu item "Enhance with PromptGod" registered in service worker via `chrome.contextMenus.create()`
- [x] Context menu item appears ONLY when text is selected (`contexts: ['selection']`)
- [x] Context menu item does NOT appear when no text is selected
- [x] On click: service worker reads `info.selectionText`, validates it, and creates a one-shot enhancement request
- [x] `extension/src/content/context-menu-handler.ts` created as a self-contained injected handler
- [x] Handler is injected on demand via `chrome.scripting.executeScript({ target, func, args })` using the clicked tab/frame
- [x] Selected text is passed as an injected function argument, not stored in DOM attributes, URLs, or logs
- [x] Handler renders isolated Shadow DOM CSS and does not rely on the main `styles.css`
- [x] Handler shows loading state: "Enhancing selected text..."
- [x] Handler opens port to service worker: `chrome.runtime.connect({ name: 'context-enhance' })`
- [x] Service worker listens for `context-enhance` port connections alongside existing `enhance` port connections
- [x] Smart skip: selection under 3 words shows "Select a little more text to enhance.", no LLM call
- [x] No API key: service worker sends ERROR through port -> handler shows "Set your API key in PromptGod settings."
- [x] Works on arbitrary webpages through `activeTab` after explicit context-menu gesture; no `<all_urls>` permission added
- [x] Works alongside the existing trigger button without sharing the normal composer path
- [x] Commits pushed: `881d483`, `bfcf4b9`, `54c0f43`, `a5e64e9`, `a39d7ea`, `22ca59b`, `8f8bb62`
- Notes: Implemented as popup/copy highlighted-text v1. It does not add `'generic'` to the platform adapter type and does not route selected text through normal `buildMetaPrompt()`; this keeps the normal composer enhancer and selected-text enhancer behavior separate.

### PHASE 18 — Context Menu: Enhancement + Popup Result [complete — inline replacement intentionally not implemented]

- [x] Service worker handles `context-enhance` port: reads API key, makes LLM call, and collects the full response before returning a result
- [x] Anthropic/OpenAI context paths collect streamed chunks before sending one `RESULT`
- [x] Google context path uses existing non-streaming `callGoogleAPI`
- [x] OpenRouter context path uses completion mode plus existing fallback/backoff helpers
- [x] Service worker sends `{ type: 'RESULT', text: enhancedText }`, then `DONE` and `SETTLEMENT`
- [x] Service worker sends `{ type: 'ERROR', message }` and `SETTLEMENT` on failures
- [x] Handler shows the final enhanced text in a centered overlay with `Copy` and `Dismiss`
- [x] Copy uses `navigator.clipboard.writeText()` with hidden-textarea/`document.execCommand('copy')` fallback
- [x] Handler shows scoped error state for provider, API key, runtime, and timeout failures
- [x] Selected-text prompt never asks clarifying questions, never emits placeholders, and rewrites the selected text itself
- [x] Output cleanup strips `[DIFF:]`, `[NO_CHANGE]`, source echoes, placeholders, and clarifying-question outputs
- [x] Unit tests cover selected-text validation, frame targeting, prompt rules, output cleanup, placeholders, and clarification fallback
- [x] `npm run build` passed after latest context work
- [x] `npm test` passed after latest context work: 143/143 tests
- [x] Commits pushed: `54c0f43`, `a5e64e9`, `a39d7ea`, `22ca59b`, `8f8bb62`
- Notes: Original inline replacement/clipboard-fallback plan was deliberately changed. v1 never mutates page text; users copy from the overlay. Textarea/contenteditable replacement, automatic clipboard fallback, and OpenAI Playground/AI Studio replacement tests are not part of this shipped scope.

### PHASE 19 — Context Menu: Edge Cases + Cross-site QA [partial — guards implemented, undo/replacement QA deferred]

- [x] Existing `.promptgod-context-overlay` is removed before rendering a new highlighted-text overlay
- [x] `Escape`, backdrop click, and `Dismiss` close the overlay
- [x] `frameId` from the context-menu click is passed to `chrome.scripting.executeScript`
- [x] Selection over 10,000 characters is rejected before provider calls with "Selection is too long. Try a shorter passage."
- [x] Page/runtime disconnects are handled without crashing the content handler
- [x] Restricted-page injection failures are caught and logged with metadata only, not selected text
- [x] Request data is cleared from page globals after request start, settlement, and cleanup
- [x] Selected text is not logged in background or content handler
- [x] Coexistence architecture is separate from ChatGPT/Claude/Gemini/Perplexity trigger-button enhancement
- [x] Guard/cleanup behavior is covered by context-menu unit tests
- [ ] Inline replacement undo implemented
- [ ] Clipboard undo implemented
- [ ] Shadow DOM selection replacement fallback implemented
- [ ] Google Docs/canvas editor replacement fallback implemented
- [ ] Full cross-site manual QA matrix run
- [ ] Privacy policy final check completed for the context-menu selected-text disclosure before store submission
- Notes: Highlighted-text v1 is shipped as a non-mutating popup/copy flow. Gmail-specific manual smoke testing is still recommended; no browser automation smoke test has been run for Gmail yet.

### PHASE 20 — Future Expansion [optional — pick any]

These are independent expansion paths. Pick any. Order doesn't matter.

**Option A — Email Platform Adapters: Gmail, Outlook (medium effort)**
- [ ] `GmailAdapter` implements `PlatformAdapter` — trigger button in compose toolbar
- [ ] `OutlookAdapter` implements `PlatformAdapter` — trigger button in compose toolbar
- [ ] Email-specific meta-prompt branch (communication enhancement, not prompt engineering)
- [ ] Thread context: subject line, recent replies inform tone/style
- [ ] Multiple Gmail compose windows each get their own trigger button
- [ ] Streaming, undo, and error handling work in email compose
- [ ] Privacy policy updated for email content processing
- [ ] Commit: `feat(email): add Gmail and Outlook adapters with email-aware enhancement`

**Option B — System-wide Clipboard Enhancer (medium effort)**
- [ ] Tauri app (Rust + webview, ~5MB) or Electron app sitting in system tray
- [ ] Global hotkey (e.g. Ctrl+Shift+E) works even when app isn't focused
- [ ] On trigger: read clipboard → LLM call with meta-prompt → write enhanced text back to clipboard
- [ ] Small notification: "Prompt enhanced. Paste it."
- [ ] Settings window: API key, model selection (same BYOK setup)
- [ ] Works everywhere: any app, any website, any terminal — no adapters needed
- [ ] Builds for Windows + Mac + Linux
- [ ] Commit: `feat(desktop): system-wide clipboard prompt enhancer`

**Option C — Public API + npm SDK (high effort, weeks + ongoing)**
- [ ] REST API: `POST /enhance` accepts prompt + context, returns enhanced prompt (streaming)
- [ ] npm package: `@promptgod/sdk` — `enhance({ prompt, apiKey, stream })` function
- [ ] Auth: API keys for developers, rate limiting per key
- [ ] Docs: API reference, quickstart guide, example integrations
- [ ] Hosted on Fly.io / Railway with usage dashboard
- [ ] Revenue: free tier (100/day) + paid tier ($10-20/mo)
- [ ] Commit: `feat(api): public prompt enhancement API and SDK`
- Notes:

### PHASE 21 — Platform Expansion [optional — not started]

**Option A — Firefox MV3 Support**
- [ ] Firefox-compatible manifest created
- [ ] Compatibility layer handles `chrome.*` vs `browser.*` API differences
- [ ] All 4 platform adapters work on Firefox
- [ ] Streaming, undo, and error handling work on Firefox
- [ ] Separate build target in Vite for Firefox output
- [ ] Submitted to Firefox Add-ons (AMO)
- [ ] Commit: `feat(firefox): add Firefox MV3 support`

**Option B — Internationalization (i18n)**
- [ ] All popup strings use `chrome.i18n.getMessage()`
- [ ] All toast/tooltip strings use `chrome.i18n.getMessage()`
- [ ] Meta-prompt includes language-matching instruction
- [ ] Extension works correctly in at least 2 locales
- [ ] Commit: `feat(i18n): add internationalization support`
- Notes:
