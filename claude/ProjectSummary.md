# PromptGod — Project Summary

**Make your AI prompts smarter with one click.**

Most people write vague, underspecified prompts and get mediocre AI responses. They don't know prompt engineering, and they shouldn't have to. PromptGod is a Chrome extension that sits inside ChatGPT, Claude, Gemini, and Perplexity. The user types their prompt, clicks one button, and an LLM rewrites the prompt to be more precise — adding missing context, constraints, and structure. The enhanced prompt streams back into the input field in under 3 seconds. One click to undo if they don't like it.

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
│  │ • Claude.ai     │     │ (Anthropic + OpenAI  │   │
│  │ • Gemini        │     │  + OpenRouter)        │   │
│  │ • Perplexity    │     └──────────────────────┘   │
│  │                 │                                │
│  │ UI Components   │     Popup (Settings)           │
│  │ • Trigger button│     ┌──────────────────────┐   │
│  │ • Undo button   │     │ API key input        │   │
│  │ • Error toast   │     │ Provider detection   │   │
│  └─────────────────┘     │ Model selection      │   │
│                          └──────────────────────┘   │
└──────────────────────────┬───────────────────────────┘
                           │ BYOK (direct API calls)
                           ▼
┌──────────────────────────────────────────┐
│  LLM APIs                                │
│  ┌─────────────────┐ ┌────────────────┐  │
│  │ Anthropic API   │ │ OpenAI API     │  │
│  │ Haiku / Sonnet  │ │ GPT-4o / mini  │  │
│  └─────────────────┘ └────────────────┘  │
│  ┌─────────────────────────────────────┐ │
│  │ OpenRouter API (free models avail)  │ │
│  │ Nemotron Nano / Claude / GPT-4o    │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

**Architecture:** BYOK-only (Bring Your Own Key). No backend server. Users get their own API key from OpenRouter (free models available), Anthropic, or OpenAI. The service worker makes direct API calls.

**Messaging:** Content script ↔ service worker communication uses `chrome.runtime.connect` (ports), NOT `chrome.runtime.sendMessage`. Ports allow the service worker to push multiple TOKEN messages as the stream arrives.

---

## Core Features

- Trigger button injected adjacent to each platform's send button (brand icon)
- Smart skip — prompts too short (< 3 words) are not sent to the LLM
- One-click prompt enhancement powered by an LLM meta-prompt
- Streaming text replacement — enhanced prompt appears token-by-token in the input field
- Undo button restores the original prompt instantly (auto-disappears after 10s)
- Error toast for failures (API errors, no API key, DOM not found)
- BYOK: user provides API key for Anthropic, OpenAI, or OpenRouter
- Provider auto-detection from key prefix (sk-ant-, sk-or-, sk-)
- Popup settings: API key input, model selection per provider
- Platform adapters for ChatGPT, Claude.ai, Gemini, and Perplexity with MutationObserver resilience
- Keyboard shortcut: Ctrl+Shift+E

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Extension | TypeScript, Manifest V3 | Chrome Web Store (submitted, awaiting review) |
| Build | Vite + `@crxjs/vite-plugin` | Local dev + production build |
| Content Scripts | Vanilla TypeScript, DOM APIs | Injected into 4 platforms |
| Service Worker | Chrome Extension background script | Routes LLM calls via ports |
| LLM (Anthropic) | Claude Haiku/Sonnet via Anthropic API | Direct from service worker |
| LLM (OpenAI) | GPT-4o / GPT-4o-mini via OpenAI API | Direct from service worker |
| LLM (OpenRouter) | Any model via OpenRouter API | Direct from service worker |
| Storage | `chrome.storage.local` | API keys, provider, model |
| Package Manager | pnpm | |
| Testing | Vitest (unit) | 36 tests passing |

---

## Architecture Decisions

### D1 — Manifest V3, not V2
Chrome is deprecating MV2. MV3 uses a service worker instead of a persistent background page.

### D2 — Service worker routes all LLM calls
Content scripts communicate with the service worker via ports, which makes the actual API call and streams tokens back. API keys never touch the page context.

### D3 — `chrome.runtime.connect` (ports), not `sendMessage`
Ports allow pushing multiple TOKEN messages as the LLM stream arrives. The port stays open for the duration of the enhancement.

### D4 — Platform adapters behind a common interface
Each platform has different DOM structure. A shared `PlatformAdapter` interface lets us build and test one platform at a time.

### D5 — SSE streaming with provider-specific parsers
- **Anthropic:** `event: content_block_delta` with `delta.text`
- **OpenAI/OpenRouter:** `data:` lines with `choices[0].delta.content`

### D6 — BYOK-only, no backend server
Free tier was removed. Users bring their own API key. OpenRouter offers free models. This eliminates backend deployment and maintenance.

### D7 — `chrome.storage.local`, not `sync`
API keys must not sync across devices via Google's servers.

### D8 — Synthetic InputEvent for DOM writes
Strategy: `execCommand('insertText')` as primary, `InputEvent` with `DataTransfer` as fallback.

---

## Data Models

### chrome.storage.local schema

```typescript
interface StoredSettings {
  apiKey: string | null                    // User's API key — default: null
  provider: 'anthropic' | 'openai' | 'openrouter' // Detected from key prefix
  model: string                            // Selected model ID
}
```

### Extension Internal Messages (chrome.runtime.connect port)

| Type | Direction | Payload | Notes |
|---|---|---|---|
| `ENHANCE` | Content → Service Worker | `{ rawPrompt, platform, context }` | Sent once to start enhancement |
| `TOKEN` | Service Worker → Content | `{ text }` | Sent per-chunk as stream arrives |
| `DONE` | Service Worker → Content | `{}` | Stream complete, port disconnects |
| `ERROR` | Service Worker → Content | `{ message, code? }` | Error occurred, port disconnects |

---

## File Structure

```
godprompt/
├── extension/
│   ├── manifest.json                    # MV3 manifest (PromptGod)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts                   # Vite + CRXJS plugin
│   ├── src/
│   │   ├── service-worker.ts            # Background: routes BYOK requests, handles streaming
│   │   ├── content/
│   │   │   ├── index.ts                 # Content script entry: detect platform, init adapter
│   │   │   ├── styles.css               # Trigger button + undo button + toast styles
│   │   │   ├── dom-utils.ts             # Shared: synthetic events, execCommand fallback
│   │   │   ├── adapters/
│   │   │   │   ├── types.ts             # PlatformAdapter interface
│   │   │   │   ├── index.ts             # Re-exports
│   │   │   │   ├── chatgpt.ts           # ChatGPT DOM adapter
│   │   │   │   ├── claude.ts            # Claude.ai DOM adapter
│   │   │   │   ├── gemini.ts            # Gemini DOM adapter
│   │   │   │   └── perplexity.ts        # Perplexity DOM adapter
│   │   │   └── ui/
│   │   │       ├── trigger-button.ts    # Enhance button injection + click handler
│   │   │       ├── undo-button.ts       # Undo floating button
│   │   │       └── toast.ts             # Error/info toast component
│   │   ├── popup/
│   │   │   ├── popup.html               # Settings popup markup
│   │   │   ├── popup.ts                 # Settings logic: API key, model selection
│   │   │   └── popup.css                # Settings styles (dark mode)
│   │   └── lib/
│   │       ├── llm-client.ts            # LLM API caller: Anthropic + OpenAI + OpenRouter
│   │       ├── meta-prompt.ts           # Meta-prompt template (single source of truth)
│   │       ├── smart-skip.ts            # shouldSkipEnhancement()
│   │       └── types.ts                 # Shared message types
│   ├── assets/
│   │   ├── icon-16.png                  # Brand icon (人)
│   │   ├── icon-48.png
│   │   └── icon-128.png
│   └── test/
│       └── unit/                        # 36 unit tests
├── server/                              # Backend (built but unused — BYOK-only architecture)
├── claude/                              # Claude Code workflow files
│   ├── Claude_guide.md
│   ├── ProjectSummary.md
│   ├── BuildFlow.md
│   └── Progress.md
├── promptgod.zip                        # Chrome Web Store submission zip (read-only reference)
├── CLAUDE.md
└── .gitignore
```
