# PromptGod Handoff — 2026-04-27 End Of Session

Read first in the next chat:

1. `AGENTS.md`
2. `codex/productvision.md`
3. `codex/buildflow.md`
4. `codex/Progress.md`
5. this file
6. `codex/testing.md`

## Latest Session Update — 2026-04-27 Context Isolation

New work after the OpenRouter stability pass:

- Added Gemini Flash `503` retry observability and a short `300-500ms` jittered backoff before the second same-model attempt.
- Kept Google Flash at two attempts; no extra retries were added.
- Tried a direct-Gemma no-op retry/correction prompt, but it did not improve Prompt 4 enough and was reverted at the user's request.
- Added LLM recent-context isolation in `extension/src/service-worker.ts`.
- Long/self-contained LLM prompts now drop scraped recent conversation context even when the context toggle is on.
- Short follow-ups and prompts that explicitly reference prior context still keep context.

Why this matters:

- Prompt 4 contamination was reproduced: a shortened customer-escalation prompt inherited the previous Stage 1/2/3 messy-notes structure and the wrong team audience (`Engineering, Design, Support`).
- After context isolation, shortened Prompt 4 outputs no longer borrowed that prior structure.
- The remaining Gemma issue is quality/no-op behavior on full Prompt 4, not context bleed.

Current verification:

- `npm test`: passed, `38` files / `238` tests, `1` skipped live OpenRouter eval
- `npm run build`: passed

Do not bring back:

- direct Gemma no-op retry/correction prompt
- conservative Gemma exact-echo fallback hacks

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
- Do not send scraped recent context into long/self-contained LLM prompts; keep the current `selectLlmRecentContext()` policy unless browser evidence shows a regression.
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

### 5. OpenRouter Stability Pass — Reasoning, Wrapper, Echo (Claude, late 2026-04-27)

Layered onto Codex's earlier work in the same session. All edits are OpenRouter-only by construction. Gemini Flash and Gemma never traverse `sanitizeOpenRouterRewriteResponse`, `callOpenRouterCompletionAPI`, or `collectOpenRouterCompletionText`, and were verified untouched by the full test suite.

Files changed:

- `extension/src/lib/llm-client.ts`
- `extension/src/service-worker.ts`
- `extension/test/unit/openrouter-completion.test.ts`

Browser-confirmed result:

- Full Prompt 4 with `provider=openrouter` now produces a deploy-quality structured rewrite end-to-end.
- Service-worker logs from the successful run: `Retrying context request with fallback model` (Super → Nano), then `LLM branch first-pass validation`, `firstOutputLength: 949`, `Enhancement complete`.
- Pipeline path: Nemotron Super was rejected by the new echo or wrapper guard, chain advanced to Nano, Nano produced a valid 949-char rewrite that passed all validators.
- Composer received: ordered checks, separated customer update, separated internal update with team owners. No wrapper framing, no echo, no fake success.

Five additions:

1. **Diagnostic-rich `no text output` error**. New `describeOpenRouterNoTextPayload(payload, model)` inspects the JSON shape and emits `<model>; choices=N; finish=<x>; hasContent=<bool>; hasReasoning=<bool>; refusal=<truncated>; error=<code>: <message>`. No raw prompt or output text. The `[LLMClient] OpenRouter completion returned no text output` prefix is preserved so existing error routing keeps working.

2. **Per-model failure attribution** in `collectOpenRouterCompletionText`. Replaced the single `lastError` with `perModelFailures: Array<{ model, failure }>`, one push per model in each catch branch. The exhausted-chain message now reads `super: <reason> | nano: <reason>` instead of collapsing both failures to the last one.

3. **`reasoning: { enabled: false }`** in both `callOpenRouterAPI` (streaming) and `callOpenRouterCompletionAPI` (non-stream) request bodies, via module constant `OPENROUTER_REASONING_DISABLED`. OpenRouter's unified reasoning controller; non-reasoning models ignore it. Diagnosed via (1): both Nemotron-3 variants are reasoning models that were burning the entire token budget on hidden CoT — Super leaked CoT into the visible content channel, Nano returned `finish=length, hasContent=false, hasReasoning=true`. The flag stops both failures.

4. **Wrapper-framing rejection** in `sanitizeOpenRouterRewriteResponse`. Three regexes rejecting Nemotron's "You are an AI assistant helping with X… Your task is to… Output only the plan as a rewritten prompt for the next AI to follow" antipattern. Throws `OpenRouter completion returned wrapper framing instead of rewritten prompt`. Existing `detectsFirstPersonBrief` was first-person only; wrapper framing slipped through.

5. **Echo guard via word-level Levenshtein**. `sanitizeOpenRouterRewriteResponse` now takes optional `sourceText`, threaded through `callOpenRouterCompletionAPI` via the existing `extractRewriteSourceText(userMessage)` helper. New `isOpenRouterNearEchoRewrite(source, output)` rejects when similarity ≥ 0.9 and source is ≥ 20 words. Catches the `firstOutputLength: 1385 vs sourceLength: 1384` echo-with-trivial-edits case that the byte-exact `isUnchangedRewrite` validator missed. Throws `OpenRouter completion returned near-identical rewrite (echo of source)`.

Tests added (9 total in `openrouter-completion.test.ts`):

- 3 for diagnostic shapes: reasoning+length, refusal, top-level error.
- 3 for wrapper-framing variants: role-assignment opening, second-person task brief, meta self-reference.
- 3 for echo guard: trivial-swap echo (rejected), genuine restructuring rewrite (accepted), no `"""..."""` delimiters (gracefully skipped, backward-compat).

Verification:

- focused OpenRouter completion tests: passed, 13 tests.
- `npm test`: passed, 38 files / 235 tests, 1 skipped live OpenRouter eval.
- `npm run build`: passed.

Changes from this section to be committed alongside Codex's earlier work today:

- `extension/src/lib/llm-client.ts` (already in the file list above)
- `extension/src/service-worker.ts` (already in the file list above)
- `extension/test/unit/openrouter-completion.test.ts` (already in the file list above)

Open follow-ups specific to this section:

- Echo similarity threshold is `0.9` (`OPENROUTER_ECHO_SIMILARITY_THRESHOLD` in `llm-client.ts`). If real traffic surfaces a false positive on a legitimately-similar rewrite, bump to `0.92` — single-line change.
- Wrapper-framing regexes are intentionally OpenRouter-only. If Gemini Flash ever produces this antipattern (none observed today), the fix is a separate narrower addition to the LLM-branch validator. Do not promote the OpenRouter regex set into shared validation.
- Wrapper rejection plus echo rejection means a worst-case Prompt 4 run on OpenRouter could now exhaust both Nemotron variants and surface the chain-exhausted toast. Per-model attribution from (2) makes diagnosis trivial. This is the desired behavior — bad output as error beats fake success in the composer.

### 6. Flash Retry Logging And LLM Context Isolation

Files changed:

- `extension/src/lib/llm-client.ts`
- `extension/src/service-worker.ts`
- `extension/test/unit/google-api.test.ts`
- `extension/test/unit/service-worker-gemma-isolation.test.ts`
- `extension/test/unit/service-worker-provider-fallback.test.ts`

Changes:

- Added `waitBeforeGoogleRetry()` and `logGoogleAttemptsExhausted()` around Google retryable HTTP failures.
- HTTP `503` gets a `300-500ms` jittered delay before the second same-model attempt.
- Non-503 retryable Google failures are logged but not delayed.
- Added `selectLlmRecentContext()` in the service worker.
- Long/self-contained LLM prompts drop recent scraped conversation context.
- Short prompts (`<= 18` words) keep recent context.
- Prompts that explicitly reference prior context keep recent context.

Browser evidence:

- Before this change, Prompt 4 could borrow the previous messy-notes Stage 1/2/3 structure and wrong team audience from the Claude conversation.
- After this change, shortened Prompt 4 no longer inherited that structure.
- Flash and Gemma outputs were now focused on the customer-escalation prompt itself.

Reverted experiment:

- Direct Gemma no-op retry/correction prompt was removed.
- Exact-echo conservative fallback hack was removed.
- Direct Gemma remains a one-call legacy path; unchanged output is handled by the content-script unchanged guard.

## Current Open Issues

### Prompt 4 On Gemma

Status:

- Final code still forbids `[NO_CHANGE]` in Gemma LLM branch.
- The direct Gemma retry/correction experiment was tried and reverted.
- Gemma can still no-op or produce weak minimal edits on full Prompt 4.
- Do not broaden Gemma tuning unless explicitly asked.

Next action:

1. Reload `extension/dist`.
2. Confirm service worker bundle is the latest build.
3. Select `gemma-3-27b-it`.
4. Run full Prompt 4 from `codex/testing.md`.
5. If Gemma returns unchanged, the UI unchanged guard should warn instead of fake success.

If it still no-ops:

- verify stale extension bundle first
- record it as Gemma fallback weakness
- do not reintroduce the failed retry/correction workaround without an explicit product decision

### Prompt 4 On OpenRouter Direct (Resolved late 2026-04-27)

Status:

- Browser-confirmed working with `provider=openrouter`, full Prompt 4, both Nemotron variants.
- Pipeline: Super echoed once, was rejected by the new echo guard, chain fell through to Nano, Nano returned a deploy-quality structured rewrite (~949 chars, ordered checks + customer update + internal update with team owners).
- No further action on OpenRouter direct path.

Reference for next session if regression appears:

- The five OpenRouter-only guards live in `extension/src/lib/llm-client.ts` (diagnostic helper, reasoning-disable constant, wrapper-framing rejection, echo guard) and `extension/src/service-worker.ts` (per-model failure attribution).
- Threshold knob: `OPENROUTER_ECHO_SIMILARITY_THRESHOLD = 0.9` in `llm-client.ts`. Bump to `0.92` if a legitimately-similar rewrite gets falsely rejected.

### Prompt 4 On Gemini Flash

Status:

- Fresh project/key testing showed Flash can produce a strong full Prompt 4 rewrite when quota/provider health allows.
- Some later attempts hit Google `429` and `503`; these are now easier to diagnose because Google retry attempts are logged.

Next action after quota reset:

1. Select `gemini-2.5-flash`.
2. Run full Prompt 4 with service-worker logs open.
3. If Flash succeeds, Prompt 4 blocker is essentially a fallback/Gemma/provider-quota limitation.
4. If Flash produces output but validation fails, inspect `firstIssueCodes` / `retryIssueCodes`.
5. If Flash fails with HTTP `503`, logs should show attempt `1/2`, short backoff, then attempt `2/2` exhaustion before fallback.

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

Latest full result (Codex pass):

- `npm test`: passed, `38` files, `226` tests, `1` skipped live OpenRouter eval
- `npm run build`: passed

Latest full result after Claude's section 5 pass (late 2026-04-27):

- `npm test`: passed, `38` files, `235` tests, `1` skipped live OpenRouter eval (+9 tests added in `openrouter-completion.test.ts`)
- `npm run build`: passed

Latest full result after context-isolation pass:

- `npm test`: passed, `38` files / `238` tests, `1` skipped live OpenRouter eval
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
