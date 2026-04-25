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

When resuming work, planning implementation, or answering questions about current project direction, read the `codex/` docs by default unless the user explicitly says otherwise.

Use this order:

1. `codex/productvision.md`
   - canonical source of current product direction and settled decisions
2. `codex/buildflow.md` if it exists
   - canonical execution/phase plan once created
3. `codex/Progress.md`
   - latest implementation and verification handoff

Treat these files as the default project-planning context for Codex sessions. If they conflict with older docs in `claude/` or elsewhere, prefer the `codex/` versions unless the user explicitly redirects you.
<!-- MANUAL ADDITIONS END -->
