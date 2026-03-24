# PromptPilot — Project Summary

**Make your AI prompts smarter with one click.**

Most people write vague, underspecified prompts and get mediocre AI responses. They don't know prompt engineering, and they shouldn't have to. PromptPilot is a Chrome extension that sits inside ChatGPT, Claude, and Gemini. The user types their prompt, clicks one button, and an LLM rewrites the prompt to be more precise — adding missing context, constraints, and structure. The enhanced prompt streams back into the input field in under 3 seconds. One click to undo if they don't like it.

---

## System Overview

```
┌──────────────────────────────────────────────────────┐
│  Chrome Extension (TypeScript, Manifest V3, Vite)    │
│                                                      │
│  Content Scripts          Service Worker             │
│  ┌─────────────────┐     ┌──────────────────────┐   │
│  │ Platform Adapters│◄═══▶│ Route requests       │   │
│  │ • ChatGPT       │port │ Handle streaming     │   │
│  │ • Claude.ai     │     │ (Anthropic + OpenAI) │   │
│  │ • Gemini        │     └──────────┬───────────┘   │
│  │                 │                │               │
│  │ UI Components   │     Popup (Settings)           │
│  │ • Trigger button│     ┌──────────────────────┐   │
│  │ • Undo button   │     │ API key input        │   │
│  │ • Error toast   │     │ Model selection      │   │
│  └─────────────────┘     │ Mode toggle          │   │
│                          │ Usage counter (synced)│   │
│                          └──────────────────────┘   │
└──────────────────────────┬───────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             │                           │
       Free tier path              BYOK path
             │                           │
             ▼                           │
┌────────────────────────┐               │
│ Backend (Node + Hono)  │               │
│ Railway / Fly.io       │               │
│                        │               │
│ • IP rate limiter      │               │
│ • Input validation     │               │
│ • API proxy            │               │
│ • Rate limit headers   │               │
│ • CORS (extension ID)  │               │
└────────────┬───────────┘               │
             │                           │
             ▼                           ▼
┌──────────────────────────────────────────┐
│  LLM APIs                                │
│  ┌─────────────────┐ ┌────────────────┐  │
│  │ Anthropic API   │ │ OpenAI API     │  │
│  │ Haiku / Sonnet  │ │ GPT-4o / mini  │  │
│  │ SSE: content_   │ │ SSE: choices   │  │
│  │ block_delta     │ │ [0].delta      │  │
│  └─────────────────┘ └────────────────┘  │
└──────────────────────────────────────────┘
```

**Messaging architecture:** Content script ↔ service worker communication uses `chrome.runtime.connect` (ports), NOT `chrome.runtime.sendMessage`. Ports allow the service worker to push multiple TOKEN messages as the stream arrives. The port stays open for the duration of the enhancement and disconnects on DONE or ERROR.

**Core constraint:** Total time from button click to completed rewrite must be under 3 seconds. Text starts appearing in the input field at ~600ms.

---

## Core Features

- Trigger button injected adjacent to each platform's send button
- Smart skip — prompts too short (< 3 words) are not sent to the LLM
- One-click prompt enhancement powered by an LLM meta-prompt
- Streaming text replacement — enhanced prompt appears token-by-token in the input field
- Undo button restores the original prompt instantly (auto-disappears after 10s)
- Error toast for failures (API errors, rate limits, offline, DOM not found)
- Free tier: 10 enhancements/hour via backend proxy (no API key needed)
- BYOK mode: user provides their own API key for unlimited use (Anthropic or OpenAI)
- Popup settings: mode toggle, API key input, model selection, synced usage counter
- Platform adapters for ChatGPT, Claude.ai, Gemini, and Perplexity with MutationObserver resilience
- Keyboard shortcut: Ctrl+Shift+E
- Right-click context menu: "Enhance with PromptGod" on selected text on any webpage — replaces text in editable fields or copies enhanced text to clipboard

---

## Tech Stack

| Layer | Technology | Host / Notes |
|---|---|---|
| Extension | TypeScript, Manifest V3 | Chrome Web Store |
| Build | Vite + `@crxjs/vite-plugin` | Local dev + production build |
| Content Scripts | Vanilla TypeScript, DOM APIs | Injected into ChatGPT / Claude / Gemini |
| Service Worker | Chrome Extension background script | Runs in extension context |
| Backend | Node.js 20+ / Hono | Railway or Fly.io |
| LLM (free tier) | Claude Haiku 4.5 via Anthropic API | Proxied through backend |
| LLM (BYOK Anthropic) | Claude Haiku/Sonnet via Anthropic API | Direct from service worker |
| LLM (BYOK OpenAI) | GPT-4o / GPT-4o-mini via OpenAI API | Direct from service worker |
| Rate Limiting | In-memory Map (IP-based) | No Redis for v1 |
| Storage | `chrome.storage.local` | API keys, settings, usage counter |
| Package Manager | pnpm | Monorepo optional |
| Testing | Vitest (unit), Supertest (integration) | Manual E2E for v1 |

---

## Architecture Decisions

### D1 — Manifest V3, not V2
Chrome is deprecating MV2. MV3 uses a service worker instead of a persistent background page. This means no persistent state in the background — must use `chrome.storage` or message passing. Trade-off: slightly more complex architecture, but required for Chrome Web Store submission.

### D2 — Service worker routes all LLM calls, content scripts never call APIs directly
Content scripts run in the page's origin. Making API calls from content scripts would expose API keys in the page's network tab and potentially to the host page's JavaScript. The service worker runs in the extension's isolated context. Content scripts communicate with the service worker via ports, which makes the actual API call and streams tokens back.

### D3 — `chrome.runtime.connect` (ports), not `chrome.runtime.sendMessage`
`sendMessage` is request/response — you send one message and get one response. We need to push multiple TOKEN messages as the LLM stream arrives. `chrome.runtime.connect` creates a persistent port that stays open for the duration of the enhancement. The content script opens the port, sends the ENHANCE message, and the service worker pushes TOKEN messages through it until DONE or ERROR, then the port disconnects.

### D4 — Platform adapters behind a common interface, not a monolithic content script
Each platform (ChatGPT, Claude, Gemini) has different DOM structure, different input handling, and different update cadence. A shared interface (`PlatformAdapter`) lets us build and test one platform at a time while keeping the enhancement flow code platform-agnostic. New platforms can be added by implementing the interface.

### D5 — SSE streaming with provider-specific parsers
Anthropic and OpenAI use different SSE formats:
- **Anthropic:** `event: content_block_delta` with `delta.text`
- **OpenAI:** `data:` lines with `choices[0].delta.content`

Each provider gets its own parser function (`parseAnthropicStream`, `parseOpenAIStream`) behind a common interface that yields text chunks. The service worker selects the parser based on the model/provider setting.

### D6 — In-memory rate limiter, not Redis
v1 has a single backend instance. An in-memory `Map<string, { count, resetTime }>` keyed by IP is sufficient. If the server restarts, counters reset — acceptable for a free tier. Redis would add deployment complexity for zero user benefit at this scale.

### D7 — `chrome.storage.local`, not `chrome.storage.sync`
API keys must not sync across devices via Google's servers. `chrome.storage.local` keeps sensitive data on the local machine only. Trade-off: settings don't roam between devices, but that's acceptable for v1.

### D8 — Synthetic InputEvent for DOM writes, with execCommand as primary strategy
ChatGPT uses ProseMirror, Claude and Gemini use their own rich text editors. Setting `textContent` or `innerHTML` directly doesn't update the platform's internal state — the send button stays disabled, undo doesn't work, etc. Strategy:
1. **Primary:** `document.execCommand('insertText', false, text)` — deprecated but widely supported and reliably triggers ProseMirror state updates
2. **Fallback:** Create an `InputEvent` with `inputType: 'insertText'`, attach text via `DataTransfer` on the event's `dataTransfer` property, dispatch on the contenteditable element
3. **Verification:** Always check that the platform's send button becomes enabled after injection

### D9 — Meta-prompt as a separate constant, single source of truth
The meta-prompt is the core IP — it will be iterated on frequently. Stored as an exported constant in `meta-prompt.ts`. Both the extension and the backend need it. For v1, the meta-prompt is maintained in the extension's `src/lib/meta-prompt.ts` and manually copied to `server/src/meta-prompt.ts`. A build-time copy script (`scripts/sync-meta-prompt.ts`) ensures they stay in sync. This avoids monorepo complexity while preventing drift.

### D10 — Backend validates all inputs and returns rate limit headers
The backend is a public endpoint. It must:
- Validate `platform` is one of `['chatgpt', 'claude', 'gemini']` — reject with 400 otherwise
- Reject prompts longer than 10,000 characters — prevents API cost abuse
- Return `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers on every response (200 and 429)
- The extension reads these headers to sync the client-side usage counter accurately

### D11 — CORS scoped to extension origin
Extension requests come from `chrome-extension://<id>`. The extension ID differs between development (unpacked) and production (Web Store). The backend accepts `ALLOWED_ORIGINS` as a comma-separated env var. In development, use `*` or the local extension ID. In production, lock it to the published extension ID. Never use wildcard CORS in production — the rate limiter alone is not sufficient protection against abuse.

---

## Data Models

PromptPilot v1 has **no database**. All state is ephemeral or stored in `chrome.storage.local`.

### chrome.storage.local schema

```typescript
interface StoredSettings {
  mode: 'free' | 'byok'           // Enhancement mode — default: 'free'
  apiKey: string | null            // User's API key (Anthropic or OpenAI) — default: null
  provider: 'anthropic' | 'openai' // Detected from API key format — default: 'anthropic'
  model: string                    // Selected model ID — default: 'claude-haiku-4-5-20251001'
  usageCount: number               // Free tier enhancements used this hour (synced from server headers) — default: 0
  usageResetTime: number           // Timestamp when usageCount resets (synced from server headers) — default: 0
  rateLimitMax: number             // Max enhancements per hour (synced from server) — default: 10
}
```

### In-memory state (content script)

```typescript
interface EnhancementState {
  originalPrompt: string | null    // Cached for undo — cleared on send or timeout
  isEnhancing: boolean             // Prevents double-clicks
  platform: 'chatgpt' | 'claude' | 'gemini'
  port: chrome.runtime.Port | null // Active port to service worker during enhancement
}
```

### In-memory state (backend rate limiter)

```typescript
interface RateLimitEntry {
  count: number                    // Requests in current window
  resetTime: number                // Epoch ms when window resets
}
// Map<string, RateLimitEntry> keyed by IP address
```

---

## Seed Data

Not applicable — PromptPilot has no database. For testing the meta-prompt, maintain a test fixture file:

```typescript
// test/fixtures/prompts.ts
export const TEST_PROMPTS = [
  { raw: 'help me write a python script', domain: 'coding', expectation: 'should add language version, I/O spec, error handling' },
  { raw: 'write a blog post about AI', domain: 'writing', expectation: 'should add audience, tone, length, format' },
  { raw: 'explain kubernetes', domain: 'learning', expectation: 'should add skill level, depth, format preference' },
  { raw: 'make my resume better', domain: 'writing', expectation: 'should add target role, industry, tone' },
  { raw: 'debug this error: TypeError cannot read property map of undefined', domain: 'coding', expectation: 'should ask for code context, stack trace, framework' },
  { raw: 'hi', domain: 'skip', expectation: 'should be caught by smart skip — too short to enhance' },
  { raw: 'thanks', domain: 'skip', expectation: 'should be caught by smart skip — too short to enhance' },
]
```

---

## Core Service Logic

### Enhancement flow (the main pipeline)

1. **Smart skip check** — content script checks `prompt.trim().split(/\s+/).length < 3`. If too short, show subtle message "Prompt too short to enhance" and abort. No API call.
2. **Content script reads prompt** — adapter calls `getPromptText()`, gathers platform context via `getConversationContext()`
3. **Open port to service worker** — `chrome.runtime.connect({ name: 'enhance' })` creates a persistent port
4. **Send ENHANCE message** — `port.postMessage({ type: 'ENHANCE', rawPrompt, platform, context })`
5. **Service worker routes request:**
   - Read `chrome.storage.local` for mode and provider
   - BYOK + Anthropic → build request with user's API key, call Anthropic API directly
   - BYOK + OpenAI → build request with user's API key, call OpenAI API directly
   - Free → call `POST /api/enhance` on backend
6. **Stream processing** — parse SSE response using provider-specific parser:
   - Anthropic: extract `content_block_delta` events → `delta.text`
   - OpenAI: extract `data:` lines → `choices[0].delta.content`
   - Backend (free tier): extract `data:` lines → `{"type": "token", "text": "..."}`
7. **Token forwarding** — service worker sends `port.postMessage({ type: 'TOKEN', text })` for each chunk
8. **DOM replacement** — content script receives tokens via `port.onMessage`, calls adapter's `setPromptText()` with accumulated text, dispatches synthetic events
9. **Completion** — service worker sends `port.postMessage({ type: 'DONE' })`, port disconnects, content script shows undo button
10. **Rate limit sync** (free tier only) — service worker reads `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers from backend response and updates `chrome.storage.local`

### Meta-prompt template interpolation

```
System message = META_PROMPT_TEMPLATE
  .replace('{{platform}}', platform)
  .replace('{{conversationContext}}', isNew ? 'New conversation' : `Ongoing (message #${length})`)

User message = raw prompt text (no wrapping needed — the system prompt handles framing)
```

### Backend request validation

```
On each request:
  1. Check Content-Type is application/json
  2. Parse body — reject if missing prompt field (400)
  3. Validate platform is one of ['chatgpt', 'claude', 'gemini'] (400)
  4. Check prompt.length <= 10000 characters (400: "Prompt too long")
  5. Check prompt.trim().length > 0 (400: "Prompt is empty")
  6. Proceed to rate limit check
```

### Backend rate limiter logic

```
On each request:
  1. Extract IP from request (X-Forwarded-For or socket)
  2. Look up Map entry for IP
  3. If no entry OR resetTime < now → create new entry { count: 1, resetTime: now + 1 hour }
  4. If count >= RATE_LIMIT_PER_HOUR → return 429 with headers:
     - X-RateLimit-Remaining: 0
     - X-RateLimit-Reset: <epoch seconds>
     - Retry-After: <seconds until reset>
  5. Else → increment count, proceed to LLM proxy
  6. On success, add response headers:
     - X-RateLimit-Remaining: <remaining>
     - X-RateLimit-Reset: <epoch seconds>
```

---

## Frontend Pages

PromptPilot has no traditional frontend pages. The UI consists of:

| Component | Location | Auth | Notes |
|---|---|---|---|
| Trigger button | Injected into ChatGPT / Claude / Gemini DOM | None | Positioned near send button |
| Undo button | Floating overlay in platform page | None | Appears after enhancement, auto-hides |
| Loading spinner | Replaces trigger button icon during enhancement | None | Disabled state prevents double-click |
| Error toast | Floating notification near input field | None | API failures, rate limits, offline, DOM not found, prompt too short |
| Popup settings | Extension popup (toolbar icon click) | None | Mode toggle, API key, model selection, usage counter |

---

## API Reference

### Backend Routes (No Auth — rate limited by IP)

| Method | Path | Rate Limited | Notes |
|---|---|---|---|
| POST | `/api/enhance` | Yes (10/hr/IP) | Proxies prompt to Anthropic API, returns SSE stream |
| GET | `/health` | No | Returns `{ status: 'ok' }` for deployment health checks |

### POST /api/enhance — Request

```json
{
  "prompt": "help me write a python script",
  "platform": "chatgpt",
  "context": {
    "isNewConversation": true,
    "conversationLength": 0
  }
}
```

### POST /api/enhance — Validation rules

| Field | Rule | Error |
|---|---|---|
| `prompt` | Required, non-empty string | 400: `"prompt is required"` |
| `prompt` | Max 10,000 characters | 400: `"Prompt too long (max 10000 characters)"` |
| `platform` | Must be `chatgpt`, `claude`, or `gemini` | 400: `"Invalid platform"` |
| `context` | Optional object | Defaults to `{ isNewConversation: true, conversationLength: 0 }` |

### POST /api/enhance — Response (SSE stream)

```
data: {"type": "token", "text": "Write"}
data: {"type": "token", "text": " a"}
data: {"type": "token", "text": " Python"}
...
data: {"type": "done", "text": ""}
```

### Response Headers (all responses to /api/enhance)

| Header | Value | Purpose |
|---|---|---|
| `X-RateLimit-Remaining` | `7` | Enhancements remaining in current window |
| `X-RateLimit-Reset` | `1711234567` | Epoch seconds when window resets |
| `Retry-After` | `1832` | Seconds until reset (only on 429) |

### Error Responses

| Status | When | Body |
|---|---|---|
| 400 | Missing or empty `prompt` | `{ "error": "prompt is required" }` |
| 400 | Prompt exceeds 10,000 chars | `{ "error": "Prompt too long (max 10000 characters)" }` |
| 400 | Invalid `platform` value | `{ "error": "Invalid platform. Must be chatgpt, claude, or gemini" }` |
| 429 | Rate limit exceeded | `{ "error": "Rate limit exceeded", "retryAfter": 1832 }` |
| 500 | LLM API failure | `{ "error": "Enhancement failed" }` |
| 503 | LLM API unreachable | `{ "error": "Service unavailable" }` |

### Extension Internal Messages (chrome.runtime.connect port)

| Type | Direction | Payload | Notes |
|---|---|---|---|
| `ENHANCE` | Content → Service Worker | `{ rawPrompt, platform, context }` | Sent once to start enhancement |
| `TOKEN` | Service Worker → Content | `{ text }` | Sent per-chunk as stream arrives |
| `DONE` | Service Worker → Content | `{ rateLimitRemaining?, rateLimitReset? }` | Stream complete, port disconnects |
| `ERROR` | Service Worker → Content | `{ message, code? }` | Error occurred, port disconnects |

### Context Menu Messages (chrome.runtime.connect port, name: 'context-enhance')

| Type | Direction | Payload | Notes |
|---|---|---|---|
| `ENHANCE` | Handler → Service Worker | `{ rawPrompt, platform, context }` | `platform` is auto-detected or `'generic'` |
| `RESULT` | Service Worker → Handler | `{ text }` | Complete enhanced text (not streamed) |
| `ERROR` | Service Worker → Handler | `{ message, code? }` | Error occurred, port disconnects |

---

## File Structure

```
promptpilot/
├── extension/
│   ├── manifest.json                    # MV3 manifest
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts                   # Vite + CRXJS plugin
│   ├── src/
│   │   ├── service-worker.ts            # Background: routes requests, handles streaming via ports
│   │   ├── config.ts                    # Constants: backend URL, defaults
│   │   ├── content/
│   │   │   ├── index.ts                 # Content script entry: detect platform, init adapter
│   │   │   ├── styles.css               # Trigger button + undo button + toast styles
│   │   │   ├── adapters/
│   │   │   │   ├── types.ts             # PlatformAdapter interface (includes getConversationContext)
│   │   │   │   ├── chatgpt.ts           # ChatGPT DOM adapter
│   │   │   │   ├── claude.ts            # Claude.ai DOM adapter
│   │   │   │   ├── gemini.ts            # Gemini DOM adapter
│   │   │   │   └── perplexity.ts        # Perplexity DOM adapter
│   │   │   ├── ui/
│   │   │   │   ├── trigger-button.ts    # Enhance button injection + click handler
│   │   │   │   ├── undo-button.ts       # Undo floating button
│   │   │   │   └── toast.ts             # Error/info toast component
│   │   │   ├── dom-utils.ts             # Shared: synthetic events, element finders, execCommand fallback
│   │   │   └── context-menu-handler.ts  # Self-contained script injected on demand for right-click enhance on any page
│   │   ├── popup/
│   │   │   ├── popup.html               # Settings popup markup
│   │   │   ├── popup.ts                 # Settings logic: save/load chrome.storage
│   │   │   └── popup.css                # Settings styles
│   │   └── lib/
│   │       ├── llm-client.ts            # LLM API caller: fetch + SSE parsing (Anthropic + OpenAI)
│   │       ├── meta-prompt.ts           # Meta-prompt template constant (single source of truth)
│   │       ├── smart-skip.ts            # shouldSkipEnhancement() — too-short / trivial prompt check
│   │       └── types.ts                 # Shared TypeScript types
│   ├── scripts/
│   │   └── sync-meta-prompt.ts          # Copies meta-prompt.ts to server/src/ at build time
│   ├── assets/
│   │   ├── icon-16.png
│   │   ├── icon-48.png
│   │   └── icon-128.png
│   └── test/
│       ├── unit/
│       │   ├── build-user-message.test.ts
│       │   ├── parse-sse-stream.test.ts
│       │   ├── parse-openai-stream.test.ts
│       │   ├── validate-api-key.test.ts
│       │   ├── smart-skip.test.ts
│       │   └── validate-request.test.ts
│       └── fixtures/
│           └── prompts.ts               # Test prompt fixtures
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── .env.example
│   ├── src/
│   │   ├── index.ts                     # Hono server entry point
│   │   ├── routes/
│   │   │   └── enhance.ts              # POST /api/enhance handler (with input validation)
│   │   ├── middleware/
│   │   │   ├── rate-limit.ts           # IP-based in-memory rate limiter (with response headers)
│   │   │   ├── cors.ts                 # CORS middleware (extension-origin scoped)
│   │   │   └── validate.ts            # Request body validation (platform, prompt length)
│   │   ├── llm/
│   │   │   └── anthropic.ts            # Anthropic API client (streaming)
│   │   └── meta-prompt.ts              # Meta-prompt text (synced from extension at build time)
│   └── test/
│       ├── rate-limit.test.ts
│       ├── validate.test.ts
│       └── enhance.test.ts
├── claude/                              # Claude Code workflow files
│   ├── Claude_guide.md
│   ├── ProjectSummary.md
│   ├── BuildFlow.md
│   └── Progress.md
├── CLAUDE.md                            # Claude Code entry point
├── PromptPilot_Project_Spec_v1.md       # Original project specification
├── .gitignore
└── README.md
```

---

## Environment Variables

### Extension (no .env — uses chrome.storage.local)

Settings are stored at runtime via the popup, not environment variables.

### Backend Server (.env)

| Variable | Required | Description | Example |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Server's Anthropic API key for free tier proxy | `sk-ant-api03-...` |
| `RATE_LIMIT_PER_HOUR` | No | Max enhancements per IP per hour (default: 10) | `10` |
| `MAX_PROMPT_LENGTH` | No | Max prompt characters accepted (default: 10000) | `10000` |
| `PORT` | No | Server port (default: 3000) | `3000` |
| `NODE_ENV` | No | Environment (default: development) | `production` |
| `ALLOWED_ORIGINS` | Yes (prod) | Comma-separated CORS origins. Use extension ID in prod, `*` in dev only | `chrome-extension://abcdef123456` |
