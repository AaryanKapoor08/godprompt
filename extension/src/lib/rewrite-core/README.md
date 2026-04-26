# Rewrite Core

`rewrite-core` contains shared, branch-agnostic primitives for the non-Gemma rewrite pipeline.

Phase 2 adds the token-budget seam:

- `measureTokens(text)` is a deterministic local approximation. It does not call a provider.
- `assertBudget(...)` throws `BudgetExceededError` when a hard cap is exceeded.
- Target ranges are advisory in Phase 2; hard caps become enforced for runtime prompts in later phases.

Prompt build modes:

- `production` is the default mode and is the only mode intended for shipped extension builds.
- `debug` may include examples, longer rationale, and diagnostic tags for local development.
- Vite defines `__PROMPTGOD_PROMPT_MODE__` from `PROMPTGOD_PROMPT_MODE`; any value other than `debug` resolves to `production`.
- Debug-only prompt content must be selected through `prompt-mode.ts` helpers so production builds compile with production content only.

Gemma remains outside this shared pipeline by product decision.

