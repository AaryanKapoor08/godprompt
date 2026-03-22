# PromptPilot — Project Specification v1
## A Chrome extension that makes AI prompts smarter in under 3 seconds

---

## Product overview

PromptPilot is a Chrome extension. The user types a prompt into ChatGPT, Claude, or Gemini. They click a button injected by the extension. The extension sends the raw prompt to an LLM with a carefully engineered meta-prompt. The LLM analyzes the prompt, detects the domain and intent, identifies what's missing, and rewrites it. The rewritten prompt streams back and replaces the original text in the input field. A small undo button appears. If the user likes it, they send it normally. If not, one click restores the original.

Total time from button click to completed rewrite: under 3 seconds.

---

## v1 scope — what to build

### In scope
- Chrome extension (Manifest V3)
- Content scripts for ChatGPT, Claude.ai, and Gemini
- Trigger button injected near each platform's send button
- Service worker that routes requests (backend vs BYOK)
- Streaming LLM response with live text replacement in the input field
- Undo button that restores the original prompt instantly
- Popup settings page (API key input, model selection)
- Lightweight backend API proxy with rate limiting for free tier
- The meta-prompt (system prompt that powers the rewriting)

### Out of scope for v1
- User accounts / authentication
- Usage analytics / dashboards
- Conversation history analysis
- Personalization / learning from past prompts
- User preferences / saved defaults
- Any database
- Mobile support
- Firefox / Safari / other browsers

---

## Architecture

### System components

```
┌─────────────────────────────────────────────────┐
│  Chrome Extension (TypeScript, Manifest V3)     │
│                                                 │
│  ┌──────────────────┐  ┌─────────────────────┐  │
│  │ Content Scripts   │  │ Service Worker      │  │
│  │ - ChatGPT adapter│→ │ - Route requests    │  │
│  │ - Claude adapter  │  │ - Handle streaming  │  │
│  │ - Gemini adapter  │  │ - Cache for undo    │  │
│  │ - Button injection│  │                     │  │
│  │ - DOM read/write  │  │                     │  │
│  └──────────────────┘  └────────┬────────────┘  │
│                                 │                │
│  ┌──────────────────────────────┘                │
│  │  Popup (settings page)                        │
│  │  - API key input                              │
│  │  - Model selection                            │
│  │  - Free tier vs BYOK toggle                   │
│  └──────────────────────────────────────────────┘│
└─────────────────────┬───────────────────────────┘
                      │
          ┌───────────┴───────────┐
          │                       │
    Free tier path          BYOK path
          │                       │
          ▼                       │
┌──────────────────┐              │
│ Backend Server   │              │
│ Node.js + Hono   │              │
│                  │              │
│ - Rate limiter   │              │
│ - API proxy      │              │
│ - Your API key   │              │
└────────┬─────────┘              │
         │                        │
         ▼                        ▼
┌─────────────────────────────────────┐
│  LLM API                            │
│  Claude Haiku (free) / User's model │
│                                     │
│  System message: meta-prompt        │
│  User message: raw prompt + context │
│                                     │
│  → Streamed response                │
└─────────────────────────────────────┘
```

### Data flow (step by step)

1. User types prompt into ChatGPT/Claude/Gemini input field
2. User clicks the PromptPilot trigger button (injected by content script)
3. Content script reads the raw prompt text from the DOM
4. Content script gathers context: which platform, conversation length (new vs ongoing)
5. Content script sends message to service worker: `{ rawPrompt, platform, context }`
6. Service worker checks: does user have a BYOK API key stored?
   - YES → Service worker calls the LLM API directly using user's key
   - NO → Service worker calls the PromptPilot backend
7. The LLM receives the meta-prompt (system) + raw prompt with context (user message)
8. LLM streams the enhanced prompt back
9. Service worker forwards streamed tokens to content script
10. Content script replaces input field text in real-time as tokens arrive
11. Content script shows a floating undo button near the input
12. User either:
    - Sends the enhanced prompt (normal platform send button)
    - Clicks undo → original prompt is restored from in-memory cache

### Latency budget

| Step | Target |
|------|--------|
| DOM read + context gathering | < 50ms |
| Network to backend (free tier only) | < 200ms |
| LLM first token | < 800ms |
| LLM full generation | < 2s |
| DOM write (streaming) | Real-time |
| **Total (perceived)** | **~1-2s** (text starts changing at ~600ms) |
| **Total (actual)** | **< 3s** |

---

## Chrome Extension — detailed spec

### Manifest V3 structure

```
promptpilot/
├── manifest.json
├── src/
│   ├── service-worker.ts        # Background service worker
│   ├── content/
│   │   ├── index.ts             # Content script entry point
│   │   ├── adapters/
│   │   │   ├── chatgpt.ts       # ChatGPT DOM adapter
│   │   │   ├── claude.ts        # Claude.ai DOM adapter
│   │   │   └── gemini.ts        # Gemini DOM adapter
│   │   ├── ui/
│   │   │   ├── trigger-button.ts  # The "enhance" button
│   │   │   └── undo-button.ts     # The undo floating button
│   │   └── dom-utils.ts         # Shared DOM helpers
│   ├── popup/
│   │   ├── popup.html           # Settings popup
│   │   ├── popup.ts             # Settings logic
│   │   └── popup.css            # Settings styles
│   ├── lib/
│   │   ├── llm-client.ts        # LLM API caller (streaming)
│   │   ├── meta-prompt.ts       # The meta-prompt text
│   │   └── types.ts             # Shared TypeScript types
│   └── config.ts                # Constants, API URLs
├── assets/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── package.json
├── tsconfig.json
└── vite.config.ts               # Build with Vite
```

### manifest.json key fields

```json
{
  "manifest_version": 3,
  "name": "PromptPilot",
  "version": "1.0.0",
  "description": "Make your AI prompts smarter with one click",
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://chat.openai.com/*",
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*"
  ],
  "background": {
    "service_worker": "src/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "https://chat.openai.com/*",
        "https://chatgpt.com/*",
        "https://claude.ai/*",
        "https://gemini.google.com/*"
      ],
      "js": ["src/content/index.js"],
      "css": ["src/content/styles.css"]
    }
  ],
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_icon": {
      "16": "assets/icon-16.png",
      "48": "assets/icon-48.png",
      "128": "assets/icon-128.png"
    }
  }
}
```

### Platform adapters

Each adapter implements this interface:

```typescript
interface PlatformAdapter {
  // Detect if we're on this platform
  matches(): boolean;

  // Find the active input field element
  getInputElement(): HTMLElement | null;

  // Read the current prompt text from the input
  getPromptText(): string;

  // Write text into the input field (for streaming replacement)
  setPromptText(text: string): void;

  // Find the send button (to position trigger button nearby)
  getSendButton(): HTMLElement | null;

  // Get platform name for context
  getPlatform(): 'chatgpt' | 'claude' | 'gemini';
}
```

**Important DOM considerations:**
- ChatGPT uses a `contenteditable` div (ProseMirror editor). Text must be set via input events, not just innerHTML, or ChatGPT won't recognize the change.
- Claude uses a `contenteditable` div. Similar approach needed.
- Gemini uses a rich text input. Needs its own handling.
- All three platforms update their DOM frequently. Selectors should be resilient — use data attributes and aria labels where possible, fall back to structural selectors. Include a MutationObserver to re-inject the button if the platform re-renders the input area.

### Trigger button

- Small button injected adjacent to the platform's send button
- Visually minimal — a small icon (lightning bolt or wand) with a tooltip "Enhance prompt"
- Clicking it triggers the enhancement flow
- Button shows a loading spinner while waiting for the LLM response
- Button is disabled during streaming (prevents double-clicks)
- Keyboard shortcut: Ctrl+Shift+E (configurable later)

### Undo button

- Floating button that appears after enhancement completes
- Positioned near the input field, non-intrusive
- Label: "Undo" or a simple ↩ icon
- Clicking it instantly restores the original prompt from cache
- Auto-disappears after 10 seconds or when the user sends the message
- Also disappears if the user starts manually editing the enhanced prompt

### Streaming text replacement

When tokens stream in from the LLM:
1. Clear the input field on first token
2. Append each token as it arrives
3. Trigger appropriate input events so the platform registers the change
4. Maintain cursor position at the end
5. The user sees the enhanced prompt appearing character by character (or chunk by chunk)

---

## Backend server — detailed spec

### Overview

Minimal Node.js server. One purpose: proxy LLM API calls for free-tier users with rate limiting.

### Tech

- **Runtime**: Node.js 20+
- **Framework**: Hono (lightweight, fast) or Express
- **Rate limiting**: In-memory (Map with IP-based counters). No Redis needed for v1.
- **Deployment**: Railway, Fly.io, or Vercel (serverless functions)
- **Environment variables**: `ANTHROPIC_API_KEY`, `RATE_LIMIT_PER_HOUR` (default: 10)

### API endpoint

```
POST /api/enhance
```

**Request body:**
```json
{
  "prompt": "the user's raw prompt text",
  "platform": "chatgpt" | "claude" | "gemini",
  "context": {
    "isNewConversation": true,
    "conversationLength": 0
  }
}
```

**Response:** Server-Sent Events (SSE) stream. Each event contains a chunk of the enhanced prompt text.

```
data: {"type": "token", "text": "Here"}
data: {"type": "token", "text": " is"}
data: {"type": "token", "text": " the"}
data: {"type": "token", "text": " enhanced"}
data: {"type": "done", "text": ""}
```

### Rate limiting

- Free tier: 10 enhancements per hour per IP
- Return `429 Too Many Requests` with a `Retry-After` header when exceeded
- The extension should show a friendly message: "Free tier limit reached. Add your own API key in settings for unlimited use."

### Server file structure

```
server/
├── src/
│   ├── index.ts           # Server entry point
│   ├── routes/
│   │   └── enhance.ts     # POST /api/enhance handler
│   ├── middleware/
│   │   └── rate-limit.ts  # IP-based rate limiter
│   ├── llm/
│   │   └── anthropic.ts   # Anthropic API client (streaming)
│   └── meta-prompt.ts     # The meta-prompt text (shared)
├── package.json
├── tsconfig.json
└── Dockerfile             # For Railway/Fly.io deployment
```

---

## The meta-prompt — detailed spec

This is the system message sent to the LLM on every enhancement call. It is the core IP of the product. The meta-prompt instructs the LLM to do the following in a SINGLE pass:

### Meta-prompt structure

```
You are PromptPilot, an expert prompt enhancer. Your job is to take a user's
raw prompt and rewrite it to get a significantly better response from an AI.

RULES:
- Return ONLY the enhanced prompt. No explanations, no preamble, no markdown
  wrappers, no "Here's your enhanced prompt:" prefix. Just the prompt text.
- Do NOT make the prompt longer for the sake of length. Make it more precise.
- Do NOT change the user's intent or add things they didn't ask for.
- Do NOT add generic filler like "be thorough" or "be comprehensive."
- Do NOT add "you are an expert" unless domain expertise genuinely matters.
- PRESERVE the user's tone. If they're casual, keep it casual.
- If the prompt is already good, return it with minimal changes or unchanged.

PROCESS (do this internally, do not output your reasoning):

1. CLASSIFY the domain:
   - coding / writing / research / learning / creative / business / general

2. DETECT the intent:
   - What is the user trying to DO? (build, understand, compare, debug,
     brainstorm, get feedback, create, analyze)

3. IDENTIFY GAPS — what's missing that would make the AI's response 10x better?
   For coding: language/framework version, error handling preference, input/output
     examples, edge cases, architecture constraints
   For writing: audience, tone, length, format, purpose, what to avoid
   For research: scope, depth level, what they already know, format preference
   For learning: current skill level, preferred learning style, what it's for
   For creative: style references, constraints, mood, medium
   For business: context, stakeholders, desired outcome, constraints

4. ENHANCE by adding ONLY what's missing:
   - Add specific constraints that will shape the response
   - Add output format if it would help (table, steps, code block, etc.)
   - Add evaluation criteria ("prioritize readability" / "focus on performance")
   - Break vague asks into specific sub-questions if needed
   - Add audience framing if it would change the response quality

5. OPTIMIZE for the target platform:
   - If targeting Claude: use clear structure, XML tags are not needed in user
     prompts
   - If targeting ChatGPT: use clear delimiters and explicit instructions
   - If targeting Gemini: be explicit about format and constraints

CONTEXT:
- Target platform: {{platform}}
- Conversation state: {{isNewConversation ? "New conversation" : "Ongoing conversation (message #" + conversationLength + ")"}}

USER'S RAW PROMPT:
{{prompt}}
```

### Meta-prompt guidelines

- Keep total system prompt under 800 tokens for speed
- The meta-prompt should be stored as a separate text file/constant, not buried in code
- It will be iterated on frequently — make it easy to edit and test
- Consider A/B testing different meta-prompt versions later

---

## Popup settings page

### Fields

1. **Enhancement mode** (radio buttons)
   - "Free tier (10/hour)" — default
   - "Use my API key (unlimited)"

2. **API key** (text input, only shown when BYOK is selected)
   - Placeholder: "sk-ant-... or sk-..."
   - Stored in `chrome.storage.local` (encrypted if possible)
   - Validate format on input

3. **Model selection** (dropdown, only shown when BYOK is selected)
   - Claude Haiku (fast, cheap) — default
   - Claude Sonnet (smarter, slower)
   - GPT-4o-mini (fast, cheap)
   - GPT-4o (smarter, slower)

4. **Usage counter** (read-only display for free tier)
   - "7 of 10 enhancements used this hour"
   - Resets hourly

### Design

Keep it dead simple. Clean, minimal, fast to scan. No onboarding flow, no tutorial. Just the settings the user needs.

---

## Build tooling

- **Language**: TypeScript throughout (extension + backend)
- **Extension bundler**: Vite with `@crxjs/vite-plugin` for Chrome extension dev, OR use a simple Vite config with manual manifest handling
- **Backend**: `tsx` for development, compile to JS for production
- **Package manager**: pnpm (or npm, either works)
- **Monorepo structure** (optional): If using a monorepo, `packages/extension` and `packages/server` with shared types

### Build commands

```bash
# Extension
cd extension
pnpm install
pnpm dev          # Watch mode, auto-reload extension
pnpm build        # Production build for Chrome Web Store

# Server
cd server
pnpm install
pnpm dev          # Local development server
pnpm build        # Production build
pnpm start        # Start production server
```

---

## Key implementation notes

### Handling contenteditable inputs

The hardest part of this project is reliably reading from and writing to contenteditable divs across three different platforms. Here's what to know:

- Setting `element.textContent` directly often doesn't trigger the platform's internal state update
- You need to dispatch synthetic `InputEvent` and `input` events after modifying the DOM
- For ProseMirror-based editors (ChatGPT), you may need to use `document.execCommand('insertText', false, text)` or dispatch keyboard events
- Always test that the platform's send button becomes active/enabled after your text injection
- Use `MutationObserver` to watch for DOM changes and re-find elements if the platform re-renders

### Streaming from the extension

For BYOK mode, the service worker makes a `fetch` call to the LLM API with streaming enabled:

```typescript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  },
  body: JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    stream: true,
    system: META_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(prompt, platform, context) }]
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
// Process SSE stream...
```

For free tier mode, same approach but pointed at your backend URL instead.

### Error handling

- **LLM API fails**: Show a small error toast near the input. Don't modify the user's prompt.
- **Rate limit hit**: Show "Limit reached. Add your API key for unlimited." in the toast.
- **Network offline**: Show "No connection" toast. Don't attempt the call.
- **Platform DOM changed**: If the adapter can't find the input element, show "PromptPilot can't find the input field. The platform may have updated." Fail gracefully, never crash.
- **Streaming interrupted**: Keep whatever text has been written so far. Show undo button so user can revert.

---

## Testing strategy

### Manual testing checklist for v1

- [ ] Button appears correctly on ChatGPT
- [ ] Button appears correctly on Claude.ai
- [ ] Button appears correctly on Gemini
- [ ] Button re-appears after platform navigation (e.g., new chat)
- [ ] Enhancement works on a simple coding prompt
- [ ] Enhancement works on a writing prompt
- [ ] Enhancement works on a vague/short prompt
- [ ] Enhancement returns quickly (< 3s)
- [ ] Streaming text replacement looks smooth
- [ ] Undo restores original prompt exactly
- [ ] Undo button disappears after sending
- [ ] Free tier rate limit works (blocks after N requests)
- [ ] BYOK mode works with a Claude API key
- [ ] BYOK mode works with an OpenAI API key
- [ ] Settings save and persist across browser restart
- [ ] Extension doesn't break when platform input area re-renders
- [ ] Error states display correctly (no connection, API failure)
- [ ] Already-good prompts come back with minimal changes

---

## Launch checklist

1. Extension builds and loads in Chrome
2. All three platform adapters work
3. Backend deployed and accessible
4. Rate limiting working
5. BYOK mode tested with real API keys
6. Meta-prompt produces consistently good rewrites across domains
7. Chrome Web Store listing created (name, description, screenshots)
8. Privacy policy page (required for Chrome Web Store)
9. Icon and promotional images

---

## Future roadmap (not v1)

- **v1.1**: Keyboard shortcut (Ctrl+Shift+E), diff view option
- **v1.2**: User preferences/defaults (Option A from brainstorm: language, framework, audience)
- **v2.0**: Pattern detection — learn what gaps user commonly has, pre-fill defaults
- **v2.1**: "Why" tooltip showing what was changed and why
- **v2.2**: Prompt history / before-after comparison log
- **v3.0**: Firefox support
- **v3.1**: Team features, shared prompt preferences

---

*This spec is designed to be handed directly to Claude Code for implementation. Start with the Chrome extension structure and platform adapters, then the backend, then the meta-prompt tuning.*
