# godprompt Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-08

## Active Technologies
- TypeScript + Chrome Extension API, OpenRouter/OpenAI/Anthropic/Google APIs (004-fix-model-regressions)
- `chrome.storage.local` (004-fix-model-regressions)
- TypeScript (Chrome Extension MV3) + `chrome.storage`, `fetch` API (006-google-api-integration)

- [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION] + [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION] (003-fix-model-reliability-rendering)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

cd src; pytest; ruff check .

## Code Style

[e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]: Follow standard conventions

## Recent Changes
- 007-fix-api-integration: Added TypeScript (Chrome Extension MV3) + `chrome.storage`, `fetch` API
- 006-google-api-integration: Added TypeScript (Chrome Extension MV3) + `chrome.storage`, `fetch` API
- 004-fix-model-regressions: Added TypeScript + Chrome Extension API, OpenRouter/OpenAI/Anthropic/Google APIs


<!-- MANUAL ADDITIONS START -->
## Codex Planning Docs

At the start of every new Codex session in this repository, read the project-planning docs before doing project work or answering questions about implementation direction. This is required startup context, not optional background reading.

Use this order:

1. `codex/productvision.md`
   - canonical source of current product direction and settled decisions
2. `codex/buildflow.md`
   - canonical execution/phase plan
3. `codex/Progress.md`
   - latest implementation and verification handoff

Treat these files as the active project-planning context for the session. If they conflict with older docs in `claude/` or elsewhere, prefer the `codex/` versions unless the user explicitly redirects you.

After reading them, keep the main constraints in mind while working:
- `productvision.md` defines the product truth and settled decisions.
- `buildflow.md` defines the current implementation order and phase gates.
- `Progress.md` defines the latest completed work, verification status, and next-session handoff.
- Gemma is frozen unless the user explicitly asks to reopen Gemma work.
<!-- MANUAL ADDITIONS END -->
