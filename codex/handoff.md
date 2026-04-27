# PromptGod Handoff — 2026-04-27 End Of Session

Read first in the next chat:

1. `AGENTS.md`
2. `codex/productvision.md`
3. `codex/buildflow.md`
4. `codex/Progress.md`
5. this file
6. `codex/testing.md`

## Current Goal

Finalize the LLM branch so it is stable enough to move on after the remaining verification work.

Current user priorities:

- LLM branch quality and stability.
- Gemini Flash should remain the primary quality path.
- Gemma should work better as fallback, but keep changes narrow.
- Do not let OpenRouter-specific changes harm Gemini behavior.
- Keep runtime simple and predictable.
- Avoid broad validator/prompt churn without browser evidence.

## Critical Guardrails

- Do not reintroduce optimistic streaming or progressive composer writes.
- All LLM branch models use final-only composer replacement.
- Preserve-token validation stays disabled unless the user explicitly reopens it.
- OpenRouter free chain must stay Nemotron-only:
  - `nvidia/nemotron-3-super-120b-a12b:free`
  - `nvidia/nemotron-3-nano-30b-a3b:free`
- Ling, GPT-OSS, and `openrouter/free` must not return to runtime fallback or recommendations.
- Gemma was reopened narrowly today only for LLM branch `[NO_CHANGE]` behavior.
- Do not broaden Gemma retuning unless the next browser run proves the current minimal fix still fails.

## Key Browser Findings

### Prompt 4 Failure Chain

Full Prompt 4 from `codex/testing.md` originally failed with the toast:

```text
The OpenRouter free chain did not return usable text. Retry once, or switch to a saved custom model.
```

That toast was misleading. After diagnostics, the actual chain was:

```text
Gemini Flash: Google API returned 429 RESOURCE_EXHAUSTED
Gemma: returned unchanged / [NO_CHANGE]-style output
OpenRouter Nemotron chain: returned no usable text
Terminal state: all providers failed
```

The Google quota error was specifically for:

```text
quotaMetric: generativelanguage.googleapis.com/generate_content_free_tier_requests
quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier
model: gemini-2.5-flash
quotaValue: 20
```

Important interpretation:

- Flash did not get a real quality attempt on full Prompt 4 during this session because it hit 429.
- Shorter prompts working did not disprove the Flash 429; shorter tests were succeeding through Gemma.
- Fallback routing itself is working.
- The remaining user-visible weakness is Gemma no-oping on full Prompt 4 when Flash is unavailable.

### Direct Gemma Prompt 4

Direct Gemma on full Prompt 4 showed:

```text
Model returned the prompt unchanged. Try another model or shorten the prompt.
```

Root cause identified:

- Gemma LLM prompt previously had an escape hatch:
  - if already strong, return `[NO_CHANGE]`
- Prompt 4 is typo-filled and messy, but it is also highly specific.
- Gemma interpreted it as already strong and returned unchanged.

## Changes Made Today

### 1. All-Providers Error Classification

File:

- `extension/src/service-worker.ts`

Problem:

- `buildAllProvidersFailedError()` generated a string containing the embedded OpenRouter failure.
- `formatErrorMessage()` checked the OpenRouter chain-exhausted regex before the all-providers regex.
- Result: true all-provider terminal failures could display an OpenRouter-only toast.

Fix:

- Added typed `AllProvidersFailedError`.
- `formatErrorMessage()` now handles `AllProvidersFailedError` / `All providers failed` before generic OpenRouter chain failures.
- Added regression coverage in `extension/test/unit/service-worker-provider-fallback.test.ts`.

Expected user-facing all-provider message:

```text
No provider returned a usable rewrite. Retry once, or save an OpenRouter key/custom model and try again.
```

### 2. Structured LLM Branch Diagnostics

File:

- `extension/src/service-worker.ts`

Added structured logs without raw model output:

- pipeline entry:
  - branch
  - provider
  - model
  - stage
- first pass:
  - `firstOutputLength`
  - `firstValidationOk`
  - `firstIssueCodes`
- retry:
  - `retryFired`
  - `retryIssueCodes`
  - `retryOutputLength`
  - `retryValidationOk`
- escalation:
  - from/to provider
  - trigger type (`validation-failure` or `provider-fallback-eligible`)

Use these logs for the next Prompt 4 run if needed.

### 3. Gemma LLM `[NO_CHANGE]` Narrow Fix

File:

- `extension/src/lib/gemma-legacy/llm-branch.ts`

First attempted fix:

- Added a line saying not to use `[NO_CHANGE]` for rough/triage prompts.
- Browser retest showed Gemma still no-oped.
- Conclusion: the older "already strong => `[NO_CHANGE]`" line was still too strong.

Final current fix:

```text
Never use [NO_CHANGE] in this LLM branch. Always return a rewritten prompt that improves clarity, structure, wording, or sendability while preserving the user's intent.
For rough, typo-filled, overloaded, support, incident, escalation, launch, ops, debugging, or triage prompts, rewrite them into clearer sendable instructions even when the substance is already specific
```

Tests updated:

- `extension/test/unit/meta-prompt.test.ts`
- `extension/test/unit/budget-snapshots.test.ts`

Gemma LLM token snapshot is now:

```text
gemmaLlm: 921
```

Important:

- This only changes Gemma LLM branch prompt instructions.
- It does not touch Gemma Text branch.
- It does not touch non-Gemma Gemini/OpenRouter prompts.
- Browser retest after the final "Never use [NO_CHANGE]" change is still pending.

### 4. Earlier Same-Day Runtime Work Still In Tree

These changes were already present in the dirty worktree and are part of the session state:

- `extension/src/content/ui/trigger-button.ts`
  - all LLM branch models use final-only composer replacement
  - unchanged final text shows a warning instead of fake success
- `extension/src/content/dom-utils.ts`
  - `replaceText()` detects failed `execCommand` replacement and falls back to DOM replacement
- `extension/src/lib/rewrite-core/validate.ts`
  - `ENABLE_LLM_PRESERVE_TOKEN_VALIDATION = false`
  - `UNCHANGED_REWRITE` exists for long unchanged LLM outputs
- `extension/src/lib/rewrite-core/constraints.ts`
  - preserve-token extraction tightened to avoid false positives from incidental operational words
- `extension/src/lib/rewrite-openrouter/curation.ts`
  - OpenRouter free chain is Nemotron Super then Nemotron Nano only
- `extension/src/lib/llm-client.ts`
  - OpenRouter completion rejects reasoning/meta leakage
- `extension/src/lib/rewrite-openrouter/account-status.ts`
  - OpenRouter daily-cap paused state records reset timestamp
- `extension/src/lib/rewrite-openrouter/route-policy.ts`
  - daily-cap detection helpers

## Current Open Issues

### Prompt 4 On Gemma

Status:

- Final code now forbids `[NO_CHANGE]` in Gemma LLM branch.
- Browser retest after that exact final change is pending.

Next action:

1. Reload `extension/dist`.
2. Confirm service worker bundle is the latest build.
3. Select `gemma-3-27b-it`.
4. Run full Prompt 4 from `codex/testing.md`.
5. Expected: Gemma should now return a changed rewrite.

If it still no-ops:

- verify stale extension bundle first
- then consider whether Gemma is ignoring prompt instructions and whether service-worker fallback should transform `[NO_CHANGE]` from Gemma into a conservative rewrite for LLM branch

### Prompt 4 On Gemini Flash

Status:

- Not actually quality-tested today due to Google 429.

Next action after quota reset:

1. Select `gemini-2.5-flash`.
2. Run full Prompt 4 with service-worker logs open.
3. If Flash succeeds, Prompt 4 blocker is essentially a fallback/Gemma limitation.
4. If Flash produces output but validation fails, inspect `firstIssueCodes` / `retryIssueCodes`.

Potential issue codes to watch:

- `UNCHANGED_REWRITE`
- `DROPPED_DELIVERABLE`
- `ANSWERED_INSTEAD_OF_REWRITING`

### Error Message Quality

The all-provider message is now accurate, but still generic.

Potential future improvement:

- make terminal error summarize the main cause:
  - Flash quota-limited
  - Gemma unchanged
  - OpenRouter no text

Do not do this before Prompt 4 Gemma retest unless the user asks.

## Verification Run Today

Passed:

```powershell
cd extension
npm test -- --run test/unit/service-worker-provider-fallback.test.ts
npm test -- --run test/unit/service-worker-provider-fallback.test.ts test/unit/rewrite-core/validate.test.ts test/unit/rewrite-llm-branch.test.ts test/unit/trigger-button-render-policy.test.ts
npm test -- --run test/unit/meta-prompt.test.ts test/unit/budget-snapshots.test.ts test/unit/google-api.test.ts
npm test
npm run build
```

Latest full result:

- `npm test`: passed, `38` files, `226` tests, `1` skipped live OpenRouter eval
- `npm run build`: passed
- Expected Vite warning remains:
  - `src/content/perplexity-main.ts` is a `MAIN` world content script and does not support HMR

## Files Expected To Be Committed From This Session

Runtime:

- `extension/src/content/dom-utils.ts`
- `extension/src/content/ui/trigger-button.ts`
- `extension/src/lib/gemma-legacy/llm-branch.ts`
- `extension/src/lib/llm-client.ts`
- `extension/src/lib/rewrite-core/constraints.ts`
- `extension/src/lib/rewrite-core/types.ts`
- `extension/src/lib/rewrite-core/validate.ts`
- `extension/src/lib/rewrite-llm-branch/retry.ts`
- `extension/src/lib/rewrite-llm-branch/spec-builder.ts`
- `extension/src/lib/rewrite-openrouter/account-status.ts`
- `extension/src/lib/rewrite-openrouter/curation.ts`
- `extension/src/lib/rewrite-openrouter/route-policy.ts`
- `extension/src/service-worker.ts`

Tests:

- `extension/test/unit/budget-snapshots.test.ts`
- `extension/test/unit/dom-utils.test.ts`
- `extension/test/unit/meta-prompt.test.ts`
- `extension/test/unit/openrouter-completion.test.ts`
- `extension/test/unit/popup-model-options.test.ts`
- `extension/test/unit/rewrite-core/constraints.test.ts`
- `extension/test/unit/rewrite-core/validate.test.ts`
- `extension/test/unit/rewrite-llm-branch.test.ts`
- `extension/test/unit/rewrite-openrouter-policy.test.ts`
- `extension/test/unit/rewrite-text-branch.test.ts`
- `extension/test/unit/service-worker-provider-fallback.test.ts`
- `extension/test/unit/trigger-button-render-policy.test.ts`

Docs and local artifacts:

- `codex/handoff.md`
- `codex/Progress.md`
- `codex/testing.md`
- `codex/llm-branch-quality-plan.md`
- `codex/remindme.md`
- `extension/or-models.json`

Do not commit:

- `.claude/settings.local.json`

## Resume Command

After pulling latest:

```powershell
cd extension
npm test
npm run build
```

Then browser retest:

1. reload `extension/dist`
2. direct Gemma full Prompt 4
3. Gemini Flash full Prompt 4 after quota reset
