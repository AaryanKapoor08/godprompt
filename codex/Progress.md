# PromptGod — Codex Progress

> [!CAUTION]
> **CRITICAL: Recent Regression & Reversion (2026-04-26)**
> Reverted commit `2679a2c` ("fix(rewrite): isolate context and restore optimistic streaming").
> **Issue:** The "optimistic streaming" implementation caused severe UI instability (flickering, multiple rapid rewrite attempts, and disjointed output) in the non-Gemma LLM branch.
> **Root Cause:** `resetOptimisticStream` cleared the UI immediately upon validation failure, causing a "wipe-and-restart" effect during the pipeline's targeted retry loop.
> **Note:** Gemma remained stable as it bypasses the new pipeline (legacy isolation).
> **Action:** Fully reverted to restore a stable user experience.

## Session Notes — 2026-04-27 Flash Retry Logging + LLM Context Isolation

Goal: stop guessing why Prompt 4/5 were falling back, and fix the observed cross-prompt contamination without reopening broad Gemma tuning.

### What changed

1. **Gemini Flash 503 observability and short backoff**

- File: `extension/src/lib/llm-client.ts`
- Added explicit logs for Google same-model retry and retry exhaustion.
- Added a `300-500ms` jittered delay only before retrying HTTP `503`.
- Kept the existing two-attempt Google policy; no extra retries were added.
- Browser result: logs now show whether Flash failed attempt `1/2`, then exhausted attempt `2/2` before provider fallback.

2. **Gemma retry experiment was reverted**

- A direct-Gemma no-op retry was briefly tried after Gemma echoed Prompt 4.
- It fired correctly, but Gemma still produced unchanged or barely changed output.
- The workaround was removed at the user's request.
- Direct Gemma LLM behavior is back to the previous path: one Gemma call; if the final composer text is unchanged, the content-script unchanged guard shows the warning instead of fake success.
- Do not reintroduce the Gemma retry/correction prompt unless explicitly asked.

3. **LLM recent-context isolation**

- File: `extension/src/service-worker.ts`
- Added `selectLlmRecentContext()`.
- Long/self-contained LLM prompts now drop scraped recent conversation context even when the popup context toggle is on.
- Short follow-ups and prompts that explicitly reference prior context still keep recent context.
- This fixed the observed Prompt 4 contamination where a shortened customer-escalation prompt inherited the previous Stage 1/2/3 messy-notes structure and wrong team audience.

Current policy:

- Drop recent context when the prompt is not a new conversation, has prior context available, but is long/self-contained.
- Keep recent context when prompt word count is `<= 18`.
- Keep recent context when the prompt explicitly references prior context, e.g. `above`, `previous`, `last answer`, `this conversation`, `as discussed`, `continue from`, etc.

### Browser findings after context isolation

- Shortened Prompt 4 no longer borrowed the previous Stage 1/2/3 structure.
- Gemma and Flash both produced outputs focused on the current customer-escalation prompt instead of the earlier messy-notes prompt.
- Flash output for the complete Prompt 4 shape with a fresh project/key was rated as a pass (`~9/10`) before later quota/rate-limit issues.
- Remaining Gemma weakness is model quality/no-op behavior on full Prompt 4, not context bleed.

### Verification

```powershell
cd extension
npm test -- --run test/unit/service-worker-provider-fallback.test.ts test/unit/service-worker-gemma-isolation.test.ts test/unit/google-api.test.ts
npm test
npm run build
```

Latest result:

- `npm test`: passed, `38` files / `238` tests, `1` skipped live OpenRouter eval
- `npm run build`: passed
- Expected Vite warning remains: `src/content/perplexity-main.ts` is a `MAIN` world content script and does not support HMR.

### Files touched in this section

Runtime:

- `extension/src/lib/llm-client.ts`
- `extension/src/service-worker.ts`

Tests:

- `extension/test/unit/google-api.test.ts`
- `extension/test/unit/service-worker-gemma-isolation.test.ts`
- `extension/test/unit/service-worker-provider-fallback.test.ts`

## Session Notes — 2026-04-27 OpenRouter Stability (Reasoning, Wrapper, Echo Guards) — Claude session

This session ran after Codex's earlier 2026-04-27 work. Goal: stabilize the OpenRouter LLM-branch path on Prompt 4 without touching Gemini or Gemma.

### Browser-confirmed result

Final manual run on full Prompt 4 (`promptLength: 1384`) with `provider=openrouter`:

- Service-worker logs: `Retrying context request with fallback model` (Super → Nano), then `LLM branch first-pass validation`, `firstOutputLength: 949`, `Enhancement complete`.
- Composer received a real structured rewrite (~700 chars, ~250 chars shorter than source after deduplication): ordered checks, separated customer update, separated internal update with team owners. No wrapper framing, no echo, no fake success.
- Pipeline: Nemotron Super was rejected by the new echo or wrapper guard, chain advanced to Nemotron Nano, Nano produced a valid rewrite that passed all validators.

This is the first time full Prompt 4 has produced a deploy-quality rewrite end-to-end on the OpenRouter direct path.

### What changed

All edits are confined to `extension/src/lib/llm-client.ts` and `extension/src/service-worker.ts`. Gemini Flash and Gemma never traverse `sanitizeOpenRouterRewriteResponse`, `callOpenRouterCompletionAPI`, or `collectOpenRouterCompletionText`, so this work is OpenRouter-only by construction.

#### 1. Diagnostic-rich `no text output` error

Problem: the original `OpenRouter completion returned no text output` error was opaque — couldn't tell whether the failure was a length truncation, a refusal, a top-level routing error, or reasoning-into-the-wrong-field.

Fix in `llm-client.ts`:

- Added module-private `describeOpenRouterNoTextPayload(payload, model)` that inspects the JSON shape and emits a sanitized one-liner: model id, top-level `error.code: error.message` (truncated 120 chars), `choices` length, `finish_reason` (or `native_finish_reason`), `hasContent`, `hasReasoning`, and `refusal` (truncated 80 chars). No raw prompt and no raw output text.
- `callOpenRouterCompletionAPI` no-text throw now reads `[LLMClient] OpenRouter completion returned no text output (<diagnostic>)`.

This is what surfaced the actual root cause on the first browser repro: `finish=length; hasContent=false; hasReasoning=true` — the Nemotron variants were spending the entire token budget on hidden reasoning before emitting any visible content.

#### 2. Per-model failure attribution in the chain-exhausted error

Problem: `collectOpenRouterCompletionText` in `service-worker.ts` only kept `lastError`, so the chain-exhausted error reported only the last model's failure. Two distinct failures across Super and Nano collapsed to one line.

Fix in `service-worker.ts`: track an array `perModelFailures: Array<{ model, failure }>` populated in each catch branch (rate-limit, daily-cap, generic). The exhausted-chain message now reads `(super -> nano): super: <reason> | nano: <reason>`. The `[ServiceWorker] OpenRouter curated chain exhausted` prefix is preserved so the existing `formatErrorMessage` regex routing keeps working.

#### 3. Disable reasoning on OpenRouter requests

Diagnostic at (1) confirmed the Nemotron-3 reasoning models burned the token budget on chain-of-thought:

- Nemotron Super: emitted CoT in the visible content channel — caught as `OpenRouter completion returned reasoning instead of rewritten prompt`.
- Nemotron Nano: empty `content`, populated `reasoning`, `finish_reason=length`.

Fix in `llm-client.ts`: added module constant `OPENROUTER_REASONING_DISABLED = { enabled: false } as const` and applied it to both `callOpenRouterAPI` (streaming) and `callOpenRouterCompletionAPI` (non-stream) request bodies. OpenRouter unified field; non-reasoning models ignore it. Test in `openrouter-completion.test.ts` locks the request body shape.

This freed the full 320–384 token budget for visible content and stopped Super from leaking CoT.

#### 4. Wrapper-framing rejection (Nemotron-style anti-pattern)

Browser repro after (3): on a shortened ~250-char prompt, Nemotron returned a 700+ char system-prompt-style rewrite opening with `You are an AI assistant helping with…` and ending with `Output only the plan as a rewritten prompt for the next AI to follow.` Existing validators didn't catch it (`detectsFirstPersonBrief` is first-person only).

Fix in `llm-client.ts` `sanitizeOpenRouterRewriteResponse`: three new tight regexes — first-line role assignment (`^you are (?:an? )?(?:ai|llm|gpt|chatbot|virtual|helpful|expert|knowledgeable|professional|skilled|advanced)\b`), first-line second-person task brief (`^your (?:task|role|goal|job|primary task|main task|objective) is to\b`), and meta self-reference anywhere in output (`output only (?:the|a) (?:plan|prompt|rewrite|response|answer)\b[^.\n]{0,80}\b(?:rewritten prompt|next ai|next assistant|next model|to follow)\b`). Throws `OpenRouter completion returned wrapper framing instead of rewritten prompt`. Three tests added.

#### 5. Echo guard via word-level Levenshtein

Browser repro after (4): on long Prompt 4, Super returned `firstOutputLength: 1385` against `sourceLength: 1384` — essentially an echo with one or two trivial word swaps. The byte-exact `isUnchangedRewrite` validator missed it because the strings differ after normalization, but the rewrite was useless.

Fix in `llm-client.ts`:

- `sanitizeOpenRouterRewriteResponse` now accepts an optional `sourceText` parameter.
- `callOpenRouterCompletionAPI` extracts source via the existing `extractRewriteSourceText(userMessage)` helper (last `"""..."""` block from the user message). If extraction fails, `sourceText` is `''` and the echo check is silently skipped — fully backward-compatible.
- New helper `isOpenRouterNearEchoRewrite(source, output)` computes word-level Levenshtein distance using the same lower-case-and-strip normalization as `validate.ts:normalizeForCompare`. Skips when source is < 20 words. Threshold: similarity ≥ 0.9 → reject.
- New constants `OPENROUTER_ECHO_SIMILARITY_THRESHOLD = 0.9` and `OPENROUTER_ECHO_MIN_SOURCE_WORDS = 20`.
- Echo check runs **after** fenced-code stripping, reasoning rejection, wrapper rejection, and `Rewritten prompt:` label stripping, so the comparison is on cleaned output.
- Throws `OpenRouter completion returned near-identical rewrite (echo of source)`. Three tests added (echo rejection, genuine restructuring acceptance, no-delimiter fallback).

### Why Gemini and Gemma are unaffected

Verified by grep and by the test suite:

- `sanitizeOpenRouterRewriteResponse` has exactly one caller: `callOpenRouterCompletionAPI`.
- Google path uses `extractGoogleText` → `sanitizeGoogleRewriteResponse` or `sanitizeGemmaResponse`. Neither references the new helpers, regexes, or constants.
- All Gemma/Google tests in `service-worker-provider-fallback.test.ts`, `meta-prompt.test.ts`, `budget-snapshots.test.ts`, and `google-api.test.ts` still pass unchanged.

### Verification

```powershell
cd extension
npm test -- --run test/unit/openrouter-completion.test.ts
npm test
npm run build
```

Latest result:

- focused OpenRouter completion tests: passed, 13 tests (was 4 before this session, +9 added)
- `npm test`: passed, 38 files / 235 tests, 1 skipped live OpenRouter eval
- `npm run build`: passed
- Expected Vite warning remains: `src/content/perplexity-main.ts` MAIN-world HMR notice.

### Files touched in this session

Runtime:

- `extension/src/lib/llm-client.ts` — diagnostic helper, reasoning-disabled constant + both request bodies, wrapper-framing rejection, echo guard, sanitizer signature widened.
- `extension/src/service-worker.ts` — per-model failure attribution in `collectOpenRouterCompletionText`.

Tests:

- `extension/test/unit/openrouter-completion.test.ts` — added 9 tests across diagnostic enrichment, wrapper-framing variants, and echo guard variants.

### Open follow-ups

- The 0.9 similarity threshold is calibrated against the Prompt 4 echo repro and one synthetic genuine-rewrite fixture. If real traffic shows false positives (a legitimately-similar rewrite being rejected), bump to 0.92 in `OPENROUTER_ECHO_SIMILARITY_THRESHOLD`. Single-line change.
- The wrapper-framing rejection is OpenRouter-only by design. If Gemini Flash ever produces this antipattern (none observed today), the fix would be a separate, narrower addition to the LLM-branch validator — do not promote the OpenRouter regex set into shared validation.
- Codex's pending Gemma direct-Prompt-4 retest is still open. My changes do not affect the Gemma path.
- Codex's pending Gemini Flash full-Prompt-4 retest after the Google daily-quota reset is still open. My changes do not affect the Gemini Flash path.

## Session Notes — 2026-04-27 LLM Branch Finalization, Prompt 4 Diagnosis, Gemma No-Op Fix

This session focused on identifying why `codex/testing.md` Prompt 4 failed and making the smallest safe fixes needed to keep the LLM branch debuggable.

### 1. Prompt 4 failure was identified from browser logs

Initial browser symptom:

- Full Prompt 4 showed a terminal toast.
- Before today's error-classification fix, the toast could misleadingly say:
  - `The OpenRouter free chain did not return usable text. Retry once, or switch to a saved custom model.`

Actual failure chain from service-worker logs:

- `gemini-2.5-flash`
  - failed before generation with Google `429 RESOURCE_EXHAUSTED`
  - quota metric: `generativelanguage.googleapis.com/generate_content_free_tier_requests`
  - quota id: `GenerateRequestsPerDayPerProjectPerModel-FreeTier`
  - model: `gemini-2.5-flash`
  - quota value: `20`
- `gemma-3-27b-it`
  - direct and fallback runs returned unchanged / `[NO_CHANGE]`-style output for full Prompt 4
- OpenRouter curated Nemotron chain
  - returned no usable text in the terminal fallback path

Conclusion:

- fallback routing itself was working
- Flash did not receive a true quality attempt because it hit provider quota
- Gemma was the weak fallback for this long, messy-but-specific support escalation prompt
- OpenRouter was only the final failure, not the root cause

### 2. All-provider terminal errors no longer get mislabeled as OpenRouter-only

Files changed:

- `extension/src/service-worker.ts`
- `extension/test/unit/service-worker-provider-fallback.test.ts`

Problem:

- `buildAllProvidersFailedError()` produced a message containing the embedded OpenRouter failure text.
- `formatErrorMessage()` matched `OpenRouter curated chain exhausted` before checking for `All providers failed`.
- That made a full-chain failure look like an OpenRouter-only failure.

Fix:

- added typed `AllProvidersFailedError`
- `formatErrorMessage()` now handles typed/all-provider errors before generic OpenRouter chain-exhausted errors
- added a regression test proving an all-provider error containing OpenRouter failure text produces:
  - `No provider returned a usable rewrite. Retry once, or save an OpenRouter key/custom model and try again.`

### 3. Added structured LLM branch diagnostics

File changed:

- `extension/src/service-worker.ts`

Added service-worker logs for the non-Gemma LLM branch pipeline:

- pipeline entry with provider/model/stage
- first-pass output length, validation status, and issue codes
- targeted-retry fired marker and retry issue codes
- retry output length, validation status, and issue codes
- explicit provider escalation trigger:
  - `validation-failure`
  - `provider-fallback-eligible`

These logs intentionally do not print raw model output.

### 4. Gemma LLM branch was narrowly reopened for `[NO_CHANGE]`

Files changed:

- `extension/src/lib/gemma-legacy/llm-branch.ts`
- `extension/test/unit/meta-prompt.test.ts`
- `extension/test/unit/budget-snapshots.test.ts`

Issue:

- Gemma's LLM prompt said:
  - if already strong, return `[NO_CHANGE]`
- Prompt 4 is ugly and typo-filled, but also very specific.
- Gemma repeatedly treated it as already strong and returned unchanged.

First attempted fix:

- added an exception saying not to use `[NO_CHANGE]` for rough/triage prompts
- browser retest still no-oped

Final current fix:

- removed the LLM-branch no-op escape hatch entirely
- Gemma LLM prompt now says:
  - `Never use [NO_CHANGE] in this LLM branch. Always return a rewritten prompt that improves clarity, structure, wording, or sendability while preserving the user's intent.`
  - `For rough, typo-filled, overloaded, support, incident, escalation, launch, ops, debugging, or triage prompts, rewrite them into clearer sendable instructions even when the substance is already specific`

Scope:

- Gemma LLM branch only
- Gemma Text branch unchanged
- non-Gemma Gemini/OpenRouter prompts unchanged

Token snapshot:

- Gemma LLM prompt baseline is now `921`

Open status:

- Browser retest after the final `Never use [NO_CHANGE]` change is still pending.
- If Gemma still no-ops after reloading the latest `extension/dist`, first verify stale bundle is not running.

### 5. Earlier same-day runtime work still present in the worktree

The session also carries forward earlier work from the same dirty state:

- final-only composer replacement for all LLM branch models
- hardened `replaceText()` fallback when `execCommand()` leaves stale editor content
- long unchanged LLM outputs are not treated as success
- strict preserve-token validation remains disabled
- preserve-token extraction was tightened to avoid false-positive retries
- OpenRouter free chain reduced to Nemotron Super then Nemotron Nano
- OpenRouter reasoning/meta leakage is rejected
- OpenRouter daily-cap errors short-circuit the chain and persist a paused account status with reset timestamp

### Verification

Latest commands:

```powershell
cd extension
npm test -- --run test/unit/service-worker-provider-fallback.test.ts
npm test -- --run test/unit/service-worker-provider-fallback.test.ts test/unit/rewrite-core/validate.test.ts test/unit/rewrite-llm-branch.test.ts test/unit/trigger-button-render-policy.test.ts
npm test -- --run test/unit/meta-prompt.test.ts test/unit/budget-snapshots.test.ts test/unit/google-api.test.ts
npm test
npm run build
```

Latest result:

- focused tests passed
- `npm test`: passed, `38` files / `226` tests, `1` skipped live OpenRouter eval
- `npm run build`: passed
- expected Vite warning remains:
  - `src/content/perplexity-main.ts` is a `MAIN` world content script and does not support HMR

### Next session

1. Reload `extension/dist`.
2. Select `gemma-3-27b-it`.
3. Retest full Prompt 4.
4. If Gemma now rewrites it, mark Gemma fallback issue fixed.
5. After Google quota reset, retest full Prompt 4 on `gemini-2.5-flash`.
6. If Flash produces output but validation fails, use the new `firstIssueCodes` and `retryIssueCodes` logs before changing validators.

## Session Notes — 2026-04-26 (later) Conservation Tightening + OpenRouter Daily-Cap UX

Two pieces shipped in the same session.

### 1. Conservation extractor false-positive fix

Problem identified during fresh-eyes review: the salient-clause branch of `extractPreserveTokens` walked every comma-separated clause in the source and added the whole clause as a preserve token whenever any indicator word matched (`small | limited | slow | growing | required | mandatory | ...`). On a Prompt 1-shape source, the clause `"a small csv export from the admin panel"` would become a preserve token because of the word `small`, and a perfectly fine paraphrased rewrite (e.g. one that drops `panel` or `export`) would get `DROPPED_PRESERVE_TOKEN`. This forced unnecessary retries and would push valid Flash output toward Gemma fallback.

What changed:

- `extension/src/lib/rewrite-core/constraints.ts` — replaced the broad clause walker with anchored extraction. Salient-clause preserve tokens now only emit from inside an explicit constraint-list anchor:
  - colon-led lists matching `(?:constraints?|hard constraints?|requirements?|hard requirements?)\s*:`
  - `keep ... in mind` wrappers
- Proper-noun extraction and the explicit `knownTechnologyTokens` (`postgres | clickhouse | bigquery | mongodb`) branches were left alone — those are high-precision and matter for Prompt 3.

Tests added:

- `extension/test/unit/rewrite-core/constraints.test.ts`
  - Prompt 1-shape source emits no clause preserve tokens (no false positives on `small csv export from the admin panel`).
  - Sources without constraint anchors still emit proper nouns and known tech names (`API`, `CSV`, `Postgres`).
  - Incidental `slow / growing / required` usage produces zero preserve tokens.
- `extension/test/unit/rewrite-core/validate.test.ts`
  - Paraphrased Prompt 1 rewrite that drops `panel` / `export` does not flag `DROPPED_PRESERVE_TOKEN`.
- `extension/test/unit/rewrite-llm-branch.test.ts`
  - Retry payload stays under the `220`-token cap when 7 simultaneous `DROPPED_PRESERVE_TOKEN` issues fire.

Verification: 220 tests pass, 1 skipped (live OpenRouter eval). Build clean.

The two Prompt 3-shape tests (`analyticsDecisionPrompt`, `manualPrompt3`) still pass because both have explicit `Constraints:` anchors.

### 2. OpenRouter free-models-per-day daily-cap UX

Browser report from this session: after reloading `extension/dist`, every OpenRouter rewrite returned `"The OpenRouter free chain did not return usable text. Retry once, or switch to a saved custom model."` The user suspected the Ling / GPT-OSS removal caused it.

DevTools service-worker console showed the actual error:

```
[ServiceWorker] OpenRouter curated chain exhausted (nvidia/nemotron-3-nano-30b-a3b:free -> nvidia/nemotron-3-super-120b-a12b:free):
[LLMClient] OpenRouter API returned 429: {"error":{"message":"Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day","code":429,"metadata":{"headers":{"X-RateLimit-Limit":"50","X-RateLimit-Remaining":"0","X-RateLimit-Reset":"1777248000000"}}}}
```

Root cause: account-level OpenRouter `50/day` cap on the user's free key. This cap is shared across all `:free` models, not per-model. The cleanup did not cause it; Ling and GPT-OSS would hit the same wall. Verified that both `nvidia/nemotron-3-super-120b-a12b:free` and `nvidia/nemotron-3-nano-30b-a3b:free` are valid live OpenRouter free model ids by hitting the public `/api/v1/models` endpoint.

What changed (no model id changes; pure UX + short-circuit):

- `extension/src/lib/rewrite-openrouter/route-policy.ts` — new helpers:
  - `isOpenRouterDailyCapError(error)` — true when error message contains `free-models-per-day`.
  - `parseOpenRouterDailyCapResetMs(error)` — parses the `X-RateLimit-Reset` ms timestamp from the error body.
- `extension/src/lib/rewrite-openrouter/account-status.ts` — added `resetAtMs?: number | null` to `OpenRouterAccountStatus`, and a new `markOpenRouterDailyCapReached(resetAtMs)` that flips session status to `paused: true` and persists to `chrome.storage.local`. Subsequent OpenRouter calls in the same session short-circuit on the existing `accountStatus?.paused` guard at the top of `collectOpenRouterCompletionText`.
- `extension/src/service-worker.ts`:
  - Both 429 handlers (streaming OpenRouter path around line 432 and completion path around line 1148) now check `isOpenRouterDailyCapError(error)` first. On match: build a structured daily-cap error via `buildOpenRouterDailyCapError()`, mark account paused, and `break` out of the chain immediately. This prevents the chain from spending a second daily-budget request on the next model when the first 429 already proved the bucket is empty.
  - `formatErrorMessage` gained a new daily-cap branch above the generic OpenRouter chain-exhausted matcher. User-facing message: `"OpenRouter's free daily request cap is exhausted on this key. Resets at <ISO>. Switch to Google or save a paid OpenRouter model."`
- `extension/test/unit/rewrite-openrouter-policy.test.ts` — added a test covering daily-cap detection vs the generic per-minute 429 case, and the reset-timestamp parser.

Verification: 220 tests pass, 1 skipped (live OpenRouter eval). Build clean.

### Why the user does not need to do anything except wait

- Cap reset timestamp from the screenshot: `1777248000000` ms → `2026-04-27 00:00:00 UTC`.
- Until reset: switch the popup to Google (Gemini 2.5 Flash) — separate quota, unaffected.
- After reset: OpenRouter free chain will work again with the existing two Nemotron models.
- For a permanent `1000/day` allowance, the OpenRouter account would need ≥10 credits purchased.

### Open follow-ups (not done in this session)

- The clean error message was added but the user has not yet seen it in the browser; reload `extension/dist` to confirm.
- The popup account-status display (`formatOpenRouterAccountStatus`) does not yet read the new `resetAtMs` field. If we want to surface "resets at HH:MM UTC" in the popup near the OpenRouter chain section, that requires a small follow-up in `extension/src/popup/model-options.ts`. Not blocking.
- `codex/openrouter-primary-eval.md` still references `inclusionai/ling-2.6-flash:free` as the primary; that file is now stale and should be updated whenever the eval gate is rerun against `nvidia/nemotron-3-super-120b-a12b:free`.

## Session Update — 2026-04-26 Conservation / OpenRouter Cleanup

Important guardrail kept:
- The critical composer/injection lesson above still applies.
- Do not reintroduce optimistic streaming, progressive non-Gemma composer writes, or `resetOptimisticStream` behavior.
- Today’s conservation work runs inside the service worker before final output is sent to the content script. It should increase wait time only when a retry is needed; it should not cause composer flicker.

### LLM Branch Conservation Architecture Change

Implemented a narrow conservation check in the existing non-Gemma LLM branch pipeline:

`extractConstraints()` -> `validateLlmBranchRewrite()` -> `buildLlmRetryUserMessage()`

Files changed:
- `extension/src/lib/rewrite-core/types.ts`
- `extension/src/lib/rewrite-core/constraints.ts`
- `extension/src/lib/rewrite-core/validate.ts`
- `extension/src/lib/rewrite-llm-branch/retry.ts`
- `extension/test/unit/rewrite-core/constraints.test.ts`
- `extension/test/unit/rewrite-core/validate.test.ts`
- `extension/test/unit/rewrite-llm-branch.test.ts`

What changed:
- Added `preserveTokens: string[]` to `ConstraintSet`.
- Extractor now records opaque preserve tokens for:
  - proper-noun / known technology names, including lower-case `postgres`, `clickhouse`, `bigquery`, and `mongodb`
  - salient operational clauses containing signals such as `small`, `ops time`, `limited`, `near-real-time`, `slow`, `growing`, `customer-facing`, `accuracy`, or `cannot be wrong`
- LLM branch validation now emits `DROPPED_PRESERVE_TOKEN` when preserved source details are absent from the model output.
- Retry payload now includes `DROPPED_PRESERVE_TOKEN` in the existing top-3 issue list and names the missing detail, capped by the existing retry budget behavior.

Scope:
- Applies to non-Gemma `LLM branch` validation.
- Shared extraction computes `preserveTokens`, but Text branch validation does not enforce `DROPPED_PRESERVE_TOKEN`.
- Gemma remains frozen and bypasses the shared validator/repair pipeline.
- No system prompt changes.
- No deterministic repair/splicing of missing content.
- No provider routing changes for Google/Gemma fallback in this conservation pass.
- No composer/injection changes.

Manual Prompt 3 findings after this change:
- Gemini 2.5 Flash improved and preserved the concrete constraints:
  - `small team`
  - `limited ops time`
  - near-real-time dashboard preference as not mandatory
  - slow current queries
  - growing data volume
  - customer-facing report correctness
  - MongoDB exclusion / no prior context
- Gemini 2.5 Flash Lite still produced a compressed version on one browser test.
  - Root cause found: the exact `codex/testing.md` Prompt 3 uses lower-case and variant wording such as `postgres`, `clickhouse`, `bigquery`, `mongodb`, `not much ops time`, and `customer-facing reports that cannot be wrong`.
  - Tests were expanded to cover the exact Lite failure and those lower-case / variant phrasings.

### OpenRouter Chain Cleanup

User explicitly removed Ling and GPT-OSS from the desired OpenRouter free chain.

Files changed:
- `extension/src/lib/rewrite-openrouter/curation.ts`
- `extension/src/lib/llm-client.ts`
- `extension/test/unit/rewrite-openrouter-policy.test.ts`
- `extension/test/unit/popup-model-options.test.ts`
- `extension/test/unit/service-worker-provider-fallback.test.ts`
- `extension/test/unit/openrouter-completion.test.ts`
- `extension/test/unit/rewrite-text-branch.test.ts`

Runtime curated chain is now only:
1. `nvidia/nemotron-3-super-120b-a12b:free`
2. `nvidia/nemotron-3-nano-30b-a3b:free`

Removed/excluded from recommendations and runtime curated fallback:
- `inclusionai/ling-2.6-flash:free`
- `openai/gpt-oss-20b:free`
- `openrouter/free` remains excluded

Low-level OpenRouter default model in `llm-client.ts` was also changed from GPT-OSS to `OPENROUTER_PRIMARY_FREE_MODEL`, which now resolves to Nemotron Super.

Verification run so far:
- `npm test -- --run test/unit/rewrite-core/constraints.test.ts test/unit/rewrite-core/validate.test.ts test/unit/rewrite-llm-branch.test.ts`: passed, 21 tests
- `npm test`: passed, 38 files / 214 tests, 1 skipped
- `npm run build`: passed
- After OpenRouter cleanup:
  - `npm test -- --run test/unit/rewrite-openrouter-policy.test.ts test/unit/popup-model-options.test.ts test/unit/service-worker-provider-fallback.test.ts test/unit/openrouter-completion.test.ts test/unit/rewrite-text-branch.test.ts`: passed, 5 files / 22 tests
- Final verification after docs + OpenRouter cleanup:
  - `npm test`: passed, 38 files / 214 tests, 1 skipped
  - `npm run build`: passed

Reload `extension/dist` before any browser retest.

Last updated: 2026-04-26

## Session Handoff — 2026-04-26 Evening

User decision:
- Skip injection/streaming UX work for now after the non-Gemma flicker regression.
- Focus on manual testing and quality characterization.
- Gemma remains frozen unless explicitly reopened.

### Injection / Composer Write Status

- The critical regression remains active context: optimistic/progressive non-Gemma injection caused flickering, multiple rapid rewrite-looking writes, pauses, and another write.
- Root cause identified in this session: non-Gemma LLM branch outputs are already final validated/repaired strings from the service worker, but the content script still rendered them as if they were a stream by repeatedly calling `appendChunk()` into contenteditable composers.
- Fix kept:
  - `extension/src/content/ui/trigger-button.ts` now uses final-only composer replacement for non-Gemma models.
  - Gemma remains on the legacy progressive path except Perplexity, which remains final-only.
  - Added `extension/test/unit/trigger-button-render-policy.test.ts`.
- Expected browser behavior after reloading `extension/dist`:
  - non-Gemma original prompt stays visible while waiting
  - final rewrite is pasted once
  - no flicker / no repeated partial rewrites
- Tradeoff accepted for now:
  - non-Gemma live typing/injection feel is gone.
  - Stability is preferred over speed/typing effect.

### LLM Branch Final Manual Prompt Set

- Created `codex/testing.md` with three rough LLM branch prompts:
  1. launch/billing/onboarding/trial triage with evidence and 45-minute sync constraint
  2. first-100-customers acquisition strategy with missing context and anti-invention constraints
  3. Postgres vs ClickHouse vs BigQuery staged workflow with context-isolation and concrete operational constraints

### LLM Branch Manual Test Findings

Gemini 2.5 Flash:
- Prompt 1: green. Natural coherent rewrite, strong evidence/deliverable preservation.
- Prompt 2: green. Preserved anti-invention, clarifying-first sequencing, founder usefulness, and channel framing.
- Prompt 3: mixed but acceptable. Flash usually produces a more natural coherent prompt, but sometimes compresses concrete constraints:
  - source says small team, limited ops time, near-real-time dashboards optional, slow current queries, growing data volume, and customer-facing reports must be accurate
  - Flash may compress these into broader phrases such as `data volume characteristics`, `data accuracy requirements`, `latency`, or `operational burden`
  - this is visually better but less explicit

Gemini 2.5 Flash Lite:
- Prompt 1: green.
- Prompt 2: green, with occasional minor detail loss around explicit channel examples.
- Prompt 3: functionally green but visually weaker.
  - Lite tends to preserve concrete constraints better than Flash.
  - Lite often outputs mechanical/spec-like structure:
    - `Wait for the user's "continue" command`
    - `Upon receiving...`
    - `Constraints:`
    - `User context:`
    - bullet-heavy sections
  - This is a soft quality/style issue, not a correctness failure.

Gemma:
- Tested on the same three prompts.
- Overall pass.
- Gemma remains stable and should not be retuned.

OpenRouter:
- User reports OpenRouter testing focus has been reduced to the two Nemotron models.
- `Nemotron 3 Super 120B` was manually tested and considered green.
- Before editing OpenRouter docs/code, verify whether the runtime curated list has actually been reduced; current repo state may still list more than the two Nemotron models.

### Quality Decision

- Do not keep prompt-tweaking the LLM branch based on the Flash vs Lite style tradeoff.
- A runtime prompt-polish line was tried and then reverted because it could affect Flash quality:
  - tried intent: prefer natural prompt over checklist/spec sheet while keeping concrete constraints explicit
  - outcome: not reliably enough better; Flash still compressed constraints, Lite still checklist-like
  - final state: shared LLM branch prompt contract restored to prior baseline
- Kept only a non-runtime test documenting that checklist/spec-like style should not be treated as a hard validator failure:
  - `extension/test/unit/rewrite-llm-branch.test.ts`

### Claude Fresh-Eyes Review Summary

Claude agreed with the conservative path:
- Flash issue is semantic compression of concrete constraints.
- Lite issue is surface-form/checklist style.
- These should not be solved with one shared prompt tweak.
- Checklist style should not become a hard validator failure because it can cause retry/fallback churn on otherwise correct outputs.
- Do not touch Gemma, injection, retry count, fallback ordering, or post-processing.
- Best next move is documentation and fixtures before any runtime quality change.

Recommended future path if this is reopened:
- Add fixtures first, not runtime changes.
- Document Flash compression and Lite checklist behavior as model variance.
- If a real fix is needed later, investigate existing constraint extraction/validation carefully.
- Do not add deterministic post-processing that rewrites bullets into prose.
- Do not add model-specific prompt branching until fixture evidence justifies the maintenance cost.

Latest verification after final state:
- `npm test -- --run test/unit/rewrite-llm-branch.test.ts test/unit/budget-snapshots.test.ts test/unit/trigger-button-render-policy.test.ts`: passed, 3 files / 14 tests
- `npm test -- --run test/regression/runner.test.ts`: passed, 1 file / 5 tests
- `npm test`: passed, 38 files / 207 tests; 1 skipped live OpenRouter eval
- `npm run build`: passed

## Branch Quality Review — 2026-04-26 (later session)

Code-level review of both rewrite branches against `productvision.md`.

### LLM branch — solid, one functional gap
- Prompt size: `303` tokens. Cap `1000`, target `700-850`. Well within cap; below target is fine.
- Wiring: normalize → constraints → spec → `assertBudget` at every call. Clean.
- Retry severity ordering and 3-issue cap match `productvision.md` schema.
- **Gap:** `extension/src/lib/rewrite-llm-branch/retry.ts` `extractFailingSubstring` only emits substrings for `FIRST_PERSON_BRIEF` and `DECORATIVE_MARKDOWN`. The other four codes (`ANSWERED_INSTEAD_OF_REWRITING`, `DROPPED_DELIVERABLE`, `MERGED_SEPARATE_TASKS`, `ASKED_FORBIDDEN_QUESTION`) emit code only. `productvision.md` `Done: Final Token Budget Policy` allows up to one failing substring per issue. The retry payload is intentionally undersized for 4 of 6 codes, weakening feedback for the most severe failures.

### Text branch — tighter contract, narrower retry
- Prompt size: `233` tokens. Cap `400`, target `280-360`. Within cap.
- Validator layers source-echo and placeholder regexes on top of shared rules.
- Repair stays narrow per spec: `[NO_CHANGE]`, `[DIFF:]`, source-echo tail strip.
- **Gap:** `extension/src/lib/rewrite-text-branch/retry.ts` `shouldRetryTextBranch` only fires on `ANSWERED_INSTEAD_OF_REWRITING`, `ASKED_FORBIDDEN_QUESTION`, `FIRST_PERSON_BRIEF`. A `DROPPED_DELIVERABLE` failure skips retry and escalates straight to provider fallback. Deliverable preservation is core to Text branch per `productvision.md`; treating it as non-catastrophic conflicts with that priority.
- **Soft:** retry anchor uses `sourceText.slice(0, 180)`. Character-bounded slicing can cut a hard constraint mid-phrase. Sentence-bounded slicing would be safer.

### Cross-cutting notes
- Token measurement is `length/4` heuristic — deterministic but coarse. Phase 2 risk register already flagged this.
- Branch separation is clean. Pipeline-isolation rule holds — no shared validator/repair runs against Gemma.

### Suggested follow-ups (not implemented)
- Extend `extractFailingSubstring` in `rewrite-llm-branch/retry.ts` to cover all 6 issue codes within the `220`-token retry cap.
- Add `DROPPED_DELIVERABLE` to `shouldRetryTextBranch`'s catastrophic set, or document the deliberate exclusion in `productvision.md`.
- Replace `slice(0, 180)` with sentence-aware truncation in Text retry anchor.

## Buildflow Gap Audit — 2026-04-26 (later session)

A full audit of `codex/buildflow.md` against the working tree was performed to find any implementation gaps.

Method:
- Re-read `AGENTS.md`, `codex/productvision.md`, `codex/buildflow.md`, and prior `codex/Progress.md`.
- Verified the committed module layout matches the Phase 2 commitment in `productvision.md` `Done: Module Layout Commitment`:
  - `extension/src/lib/rewrite-core/` with `types`, `normalize`, `constraints`, `validate`, `repair`, `fallback`, plus `budget` and `prompt-mode`.
  - `extension/src/lib/rewrite-llm-branch/` with `spec-builder`, `validator`, `retry`.
  - `extension/src/lib/rewrite-text-branch/` with `spec-builder`, `validator`, `repair`, `retry`.
  - `extension/src/lib/rewrite-google/` with `models`, `request-policy`, `retry-policy`, `budget-policy`.
  - `extension/src/lib/rewrite-openrouter/` with `catalog`, `curation`, `route-policy`, `budget-policy`, `account-status`.
  - `extension/src/lib/gemma-legacy/` with `llm-branch`, `text-branch`.
  - `extension/src/lib/meta-prompt.ts` and `extension/src/lib/context-enhance-prompt.ts` are removed.
- Verified `extension/test/regression/entries/` has 33 JSON entries, plus `runner.test.ts` and `openrouter-primary-eval.test.ts`.
- Verified `assertBudget` is wired into `rewrite-llm-branch/spec-builder.ts`, `rewrite-llm-branch/retry.ts`, `rewrite-text-branch/spec-builder.ts`, `rewrite-text-branch/retry.ts`, and `rewrite-google/budget-policy.ts`, so token caps run at every spec build (not just in a snapshot test).
- Verified `extension/test/unit/budget-snapshots.test.ts` snapshots production prompt sizes (`llmFirst: 303`, `textFirst: 233`, both well under the `1000` and `400` hard caps from `productvision.md` `Done: Final Token Budget Policy`).
- Verified `extension/test/regression/openrouter-primary-eval.test.ts` exists and runs when `OPENROUTER_API_KEY` is set (skipped otherwise).
- Verified `codex/openrouter-primary-eval.md` records the blocked eval attempts.
- Grep for `TODO`/`FIXME`/`XXX`/`HACK` under `extension/src/lib`: none.

Result:

There are no implementation gaps left in Phases 1–8. Every checkbox marked `[x]` in `codex/buildflow.md` is backed by code on disk and tests in the suite.

The only remaining `[ ]` boxes are not implementation gaps. They are real-world blockers that cannot be closed by code edits:

- Phase 7 — OpenRouter Primary Eval Gate (`inclusionai/ling-2.6-flash:free` corpus eval).
  - Blocked: every free OpenRouter key tried so far is in the `50/day` bucket and exhausts before the corpus completes.
  - Resolution requires either waiting for the daily reset and re-running, or using a `1000/day` bucket key.
  - Recorded in `codex/openrouter-primary-eval.md`.
- Phase 9 — Manual browser/provider verification matrix.
  - Blocked: requires a human to load the unpacked extension, exercise composer flows on ChatGPT/Claude/Gemini/Perplexity, exercise the right-click Text branch, and capture failures.
  - The checklist is already documented under `Next Session Manual Testing Checklist` in this file.
- Phase 9 — OpenRouter Primary Eval Gate currency.
  - Blocked: same root cause as the Phase 7 eval gate.

No code changes were made in this audit pass because there is nothing for code to fix. The next concrete action is the manual browser matrix and the eval-gate rerun once the OpenRouter daily quota allows it.

## Session Update — 2026-04-26

Phase 8 popup alignment update from this session:
- Added `extension/src/popup/model-options.ts` so popup model options and visible chain display are derived from shared OpenRouter curation data.
- Updated the popup UI to show the visible fallback chain:
  - `Gemini 2.5 Flash`
  - `Gemma`
  - `OpenRouter Free Chain`
- Updated the OpenRouter popup model list to use the live-aware curated chain projection instead of appending arbitrary free catalog entries.
- The popup OpenRouter chain renders `stable free` / `experimental free` classifications and excludes `openrouter/free` from recommended options.
- OpenRouter account-status bucket and cap-reached display are now formatted through a tested popup helper.
- Custom OpenRouter model entry remains available and validates the required `/` model-id format.
- Added `extension/test/unit/popup-model-options.test.ts` covering visible chain order, curated OpenRouter order, exclusion of `openrouter/free`, custom model validation, and account-status display.

Latest focused Phase 8 verification:
- `npm test -- --run test/unit/popup-model-options.test.ts test/unit/rewrite-openrouter-policy.test.ts`: passed, 2 files / 13 tests
- `npm test`: passed, 37 files / 202 tests; skipped 1 live OpenRouter eval test
- `npm run build`: passed

Remaining gate:
- Phase 8 is complete in `codex/buildflow.md`.
- The Phase 7 live OpenRouter Primary Eval Gate remains blocked by the OpenRouter free-model daily cap and is still recorded in `codex/openrouter-primary-eval.md`.
- A second free OpenRouter key was probed on 2026-04-26. The key was valid, but a single primary-model request still returned `free-models-per-day` with `X-RateLimit-Limit: 50`, `X-RateLimit-Remaining: 0`, and reset at `2026-04-27 00:00:00 UTC`. No full corpus eval was run with that key.
- Phase 9 rollout verification should wait until that eval gate is rerun successfully or explicitly accepted as blocked.

Phase 9 automated verification update from this session:
- Ran the automated/local rollout gate subset.
- Marked the automated Phase 9 checkpoints complete in `codex/buildflow.md`:
  - regression corpus thresholds across all four non-Gemma targets
  - token-budget assertions
  - Google quota/fallback policy coverage
  - OpenRouter cooldown policy coverage
  - OpenRouter account-status bucket coverage for mocked `50/day` and `1000/day`
  - terminal failure UI timing/logging coverage
- Left these Phase 9 checkpoints open:
  - manual browser/provider verification matrix
  - live OpenRouter Primary Eval Gate

Latest Phase 9 verification:
- `npm test -- --run test/regression/runner.test.ts test/unit/budget-snapshots.test.ts test/unit/rewrite-llm-branch.test.ts test/unit/rewrite-text-branch.test.ts test/unit/rewrite-google-policy.test.ts test/unit/rewrite-openrouter-policy.test.ts test/unit/openrouter-account-status.test.ts test/unit/service-worker-provider-fallback.test.ts test/unit/popup-model-options.test.ts`: passed, 9 files / 41 tests
- `npm test`: passed, 37 files / 202 tests; skipped 1 live OpenRouter eval test
- `npm run build`: passed

## Recent Manual Verification — 2026-04-26

**LLM Branch (Gemini 2.5 Flash):**
- [x] Hard Launch Triage (Evidence/Deliverables): **PASS**
- [x] Missing-Context Strategy (Anti-Invention): **PASS**
- [x] Staged File Workflow (Sequence): **PASS**
- [x] MongoDB Stress Test (Bait/Sourcing): **PASS** (Note: Earlier attempts showed brief-framing issues, but final version passed bait)
- [x] Chaos-Mode (Extreme Bait/Tone): **PASS**

**Summary:** LLM branch logic is robust against "answer-baiting" and preserves deliverables/tone under extreme stress.

## Next Session Manual Testing Checklist

Start here next time. Automated Phase 9 gates are green; the remaining work is manual browser/provider verification.

Before testing:
- Reload the unpacked extension from `extension/dist`.
- Use a real prompt composer on ChatGPT, Claude, Gemini, or Perplexity for `LLM branch`.
- Use browser text selection + right-click enhancement for `Text branch`.
- Keep Gemma frozen: do not request Gemma code changes unless there is a real regression, not just slightly different wording.

### 1. Popup / Settings UI

Pass conditions:
- Popup shows fallback chain in this order:
  1. `Gemini 2.5 Flash`
  2. `Gemma`
  3. `OpenRouter Free Chain`
- OpenRouter section shows the curated free chain in this order:
  1. `Ling 2.6 Flash`
  2. `Nemotron 3 Super 120B`
  3. `GPT-OSS 20B`
  4. `Nemotron 3 Nano 30B`
- `openrouter/free` is not shown as a recommended option.
- Custom OpenRouter model input still accepts IDs like `org/model-name` and rejects IDs without `/`.
- If OpenRouter account status appears, cap-reached state says routing is paused today.

### 2. LLM Branch — Gemini 2.5 Flash

Use normal prompt enhancement in a chat composer.

Test prompts:
1. Hard launch triage:
   - Ask it to use API logs, support tickets, screenshots, Slack notes, and customer complaints.
   - Require root-cause buckets, missing evidence, team update, and risks.
   - Pass if it stays sharp, preserves all evidence sources and deliverables, and does not become `Please analyze... Deliverables include...`.
2. Missing-context strategy prompt:
   - Ask for business strategy with missing business type/customer/objective.
   - Pass if it asks only minimal useful clarifying questions and does not invent specifics.
3. Staged file workflow:
   - Ask it to analyze uploaded slides/handout/sample code first and wait before solving.
   - Pass if it preserves the staged sequence and does not solve early.
4. Research comparison:
   - Example: compare Postgres vs ClickHouse vs BigQuery for an analytics workload.
   - Pass if it stays decision-oriented, preserves comparison criteria, and avoids filler.
5. Already-strong prompt:
   - Use a clear structured prompt.
   - Pass if it stays close to the source and does not over-rewrite.

### 3. Text Branch — Gemini 2.5 Flash

Use highlighted selected text + right-click enhancement.

Test prompts:
1. Complaint triage selection:
   - `read these complaints and tell me what is actually broken, what is user confusion, what evidence is missing, and what update i should send the team today`
   - Pass if output is one consolidated rewrite, not an answer, and no duplicate trailing summary appears.
2. Launch deliverables selection:
   - Include files/evidence/deliverables.
   - Pass if named inputs and deliverables are preserved.
3. Message polish:
   - Select a rough team-update message.
   - Pass if it rewrites the selected text directly, with no clarifying questions.
4. Plain-text constraint:
   - Include `plain text only, no markdown, under 150 words`.
   - Pass if the output preserves the hard constraint.

### 4. OpenRouter Free Chain

Only test lightly because of free quota.

Use OpenRouter provider and the default curated free model.

Pass conditions:
- The selected model is from the curated chain, not `openrouter/free`.
- If a model fails before output, fallback/cooldown behavior does not break the UI.
- If the free daily cap is reached, the user gets a clear error/pause state instead of a fake rewrite.

Recommended OpenRouter prompts:
1. One LLM Branch hard launch triage prompt.
2. One Text Branch complaint triage selection.

Do not burn the full quota on repeated OpenRouter testing. Manual behavior is enough for now.

### 5. Failure Capture Rules

If anything fails, record:
- provider
- model
- branch: `LLM branch` or `Text branch`
- exact source prompt/selected text
- full rewritten output
- failure category:
  - dropped deliverables
  - generic softening / project-brief drift
  - placeholder leak
  - unnecessary clarifying questions
  - staged-workflow collapse
  - duplicate summary
  - source echo
  - answered instead of rewriting
  - provider/rate-limit failure

Then add a new regression entry before changing prompts or code.

Phase 4/5 cleanup update from this session:
- Closed the remaining Phase 4/5 buildflow checkboxes without changing Gemma behavior.
- Moved frozen Gemma LLM prompt behavior into `extension/src/lib/gemma-legacy/llm-branch.ts`.
- Moved frozen Gemma Text branch prompt/user-message/cleanup behavior into `extension/src/lib/gemma-legacy/text-branch.ts`.
- Deleted the old mixed modules:
  - `extension/src/lib/meta-prompt.ts`
  - `extension/src/lib/context-enhance-prompt.ts`
- Added `extension/test/unit/service-worker-provider-fallback.test.ts` proving Google non-Gemma first-pass validation failure plus targeted-retry validation failure escalates to frozen Gemma for both LLM and Text branches.
- Gemma prompt strings, cleanup behavior, and retry policy were not retuned.

Latest focused verification:
- `npm test -- --run test/unit/service-worker-provider-fallback.test.ts test/unit/meta-prompt.test.ts test/unit/context-enhance-prompt.test.ts test/unit/context-menu.test.ts test/unit/google-api.test.ts test/unit/budget-snapshots.test.ts test/unit/rewrite-llm-branch.test.ts test/unit/rewrite-text-branch.test.ts`: passed, 8 files / 59 tests
- `npm test`: passed, 36 files / 197 tests
- `npm run build`: passed

Phase 6/7 completion update from this session:
- Added `extension/test/unit/service-worker-gemma-isolation.test.ts`.
  - Direct Gemma LLM and Text paths now have a code-path assertion test proving shared rewrite-core repair and branch validators are not called.
  - The test mocks those shared modules to throw if touched, while Gemma output still completes through the frozen legacy path.
- Extended `extension/test/unit/service-worker-provider-fallback.test.ts`.
  - LLM and Text all-provider terminal failures now assert the user-facing error is posted in `< 1 second` after mocked chain exhaustion.
  - Terminal failures now log a structured failure chain containing Google, Gemma, and OpenRouter entries.
- Added structured all-provider failure-chain logging in `extension/src/service-worker.ts`.
- Phase 6 is now complete in `codex/buildflow.md`.
- Phase 7 is complete except the live OpenRouter Primary Eval Gate, which cannot be honestly run without an OpenRouter API key. No `OPENROUTER_API_KEY` was present in the environment.
- The OpenRouter Primary Eval Gate was later attempted with the developer-provided key and only `inclusionai/ling-2.6-flash:free`.
  - First attempt hit OpenRouter's `free-models-per-min` limit.
  - The eval harness was updated to throttle requests.
  - The throttled rerun hit OpenRouter's `free-models-per-day` cap for the `50/day` bucket before the full corpus completed.
  - No paid model, custom model, or `openrouter/free` fallback was used.
  - Result is recorded as blocked in `codex/openrouter-primary-eval.md`; the Phase 7 eval checkbox remains open.

Latest focused Phase 6/7 verification:
- `npm test -- --run test/unit/service-worker-gemma-isolation.test.ts test/unit/service-worker-provider-fallback.test.ts`: passed, 2 files / 6 tests
- `npm test`: passed, 36 files / 197 tests; skipped live OpenRouter eval when `OPENROUTER_API_KEY` is unset
- `npm run build`: passed

Phase 6/7 work from the latest session:
- Phase 6 Google policy alignment is implemented in code and covered by unit tests.
- Phase 7 OpenRouter runtime policy is implemented in code and covered by unit tests, with one buildflow checkbox intentionally left open:
  - OpenRouter Primary Eval Gate against live `inclusionai/ling-2.6-flash:free`
- Gemma remains frozen. No Gemma prompt, cleanup, or retry tuning was done.

What landed for Phase 6:
- Added `extension/src/lib/rewrite-google/`:
  - `models.ts`
  - `request-policy.ts`
  - `retry-policy.ts`
  - `budget-policy.ts`
- Refactored Google request policy out of `llm-client.ts`.
- Removed automatic Gemini Flash -> Flash-Lite fallback from `callGoogleAPI`; Flash now retries once on approved transient failures and surfaces fallback-eligible failures to service-worker policy.
- Wired non-Gemma Google LLM/Text branch calls through provider fallback:
  - Gemini Flash pipeline
  - frozen Gemma fallback
  - OpenRouter curated chain fallback when an OpenRouter key is saved

What landed for Phase 7:
- Added `extension/src/lib/rewrite-openrouter/`:
  - `catalog.ts`
  - `curation.ts`
  - `route-policy.ts`
  - `budget-policy.ts`
  - `account-status.ts`
- Replaced the runtime OpenRouter free chain with the curated order:
  - `inclusionai/ling-2.6-flash:free`
  - `nvidia/nemotron-3-super-120b-a12b:free`
  - `openai/gpt-oss-20b:free`
  - `nvidia/nemotron-3-nano-30b-a3b:free`
- Excluded `openrouter/free`, `inclusionai/ling-2.6-1t:free`, and `meta-llama/llama-3.3-70b-instruct:free` from the curated free chain.
- Added live OpenRouter catalog caching with pinned fallback, install/startup/background refresh, and popup-open refresh.
- Added per-model 5-minute in-memory cooldown.
- Added OpenRouter account bucket detection (`50/day`, `1000/day`, `unknown`) and cap pause behavior.
- Popup now reads the shared curated OpenRouter list and displays cached OpenRouter account bucket state.

Latest verification:
- `npm test -- --run test/unit/google-api.test.ts test/unit/rewrite-google-policy.test.ts test/unit/rewrite-openrouter-policy.test.ts test/unit/openrouter-account-status.test.ts test/unit/openrouter-retry.test.ts test/unit/retry-policy.test.ts`: passed, 6 files / 43 tests
- `npm test`: passed, 36 files / 197 tests; skipped live OpenRouter eval when `OPENROUTER_API_KEY` is unset
- `npm run build`: passed
- Expected warning remains: `src/content/perplexity-main.ts` is a `MAIN` world content script and does not support HMR.

Next recommended work:
- Re-run the OpenRouter Primary Eval Gate after the daily free quota resets, or with a dev account in the `1000/day` free-model bucket.
- Then proceed to Phase 9 rollout verification gates.

---

Current uncommitted buildflow status:
- Phases 1, 2, and 3 are complete with all checkpoints checked in `codex/buildflow.md`.
- Phase 4 implementation is complete in `codex/buildflow.md`; repeated Google validation failure now has a service-worker fallback test, and `meta-prompt.ts` is removed.
- Phase 5 implementation is complete in `codex/buildflow.md`; repeated catastrophic Google validation failure now has a service-worker fallback test, and `context-enhance-prompt.ts` is removed.
- Phase 6 is complete in `codex/buildflow.md`.
- Phase 7 runtime policy is implemented and verified, except the live OpenRouter Primary Eval Gate remains open in `codex/buildflow.md`.
- Gemma remains frozen. Do not retune Gemma prompts or cleanup as part of the next phase.

What landed in the worktree:
- `AGENTS.md` now requires new Codex sessions to read `codex/productvision.md`, `codex/buildflow.md`, and `codex/Progress.md` first.
- Phase 1 added `extension/test/regression/` with 33 JSON entries and a Vitest runner.
- Phase 2 added `extension/src/lib/rewrite-core/budget.ts`, `prompt-mode.ts`, budget snapshots, and Vite prompt-mode define wiring.
- Phase 3 added shared rewrite-core primitives:
  - `types.ts`
  - `normalize.ts`
  - `constraints.ts`
  - `validate.ts`
  - `repair.ts`
  - `fallback.ts`
- Phase 4 added `extension/src/lib/rewrite-llm-branch/` and wired non-Gemma LLM branch calls through compact-contract prompting, validation, deterministic repair, one targeted retry, and provider fallback after repeated validation failure.
- Phase 5 added `extension/src/lib/rewrite-text-branch/` and wired non-Gemma Text branch calls through compact-contract prompting, validation, narrow repair, catastrophic-output retry, and provider fallback after repeated catastrophic validation failure.
- Frozen Gemma prompt and Text cleanup code now lives under `extension/src/lib/gemma-legacy/`; the old mixed prompt modules are removed.
- Phase 6 added `extension/src/lib/rewrite-google/` and Google provider fallback policy.
- Phase 7 added `extension/src/lib/rewrite-openrouter/` and curated OpenRouter catalog/routing/account-status policy.

Latest verification:

```powershell
cd extension
npm test
npm run build
```

Latest result:
- `npm test`: passed, 36/36 files and 197/197 tests; skipped live OpenRouter eval when `OPENROUTER_API_KEY` is unset
- `npm run build`: passed
- Expected warning remains: `src/content/perplexity-main.ts` is a `MAIN` world content script and does not support HMR.

Next recommended phase:
- Re-run the OpenRouter Primary Eval Gate after the daily free quota resets, or with a dev account in the `1000/day` free-model bucket, then proceed to Phase 9 rollout verification gates.

---

This handoff supersedes the older 2026-04-23 note. Today’s work is fully committed and pushed to GitHub through commit `61f0733`, `main` matches `origin/main`, and the working tree should be clean after this file is pushed.

Current status:
- Gemma hardening is implemented in both the LLM branch and the Text branch.
- Manual Gemma testing passed for the launch-triage and incident-triage prompt shapes that were failing earlier.
- No further Gemma code changes are planned right now unless a different prompt family breaks.
- The natural next step is manual comparison testing on `gemini-2.5-flash` and `gemini-2.5-flash-lite` once provider rate limits clear.

---

## Current Baseline

Branch:
- `main`

Remote state:
- `origin/main...main`: `0 0` at the latest verification on `2026-04-24`
- latest pushed commit: `61f0733` — `docs(progress): update codex handoff`

Latest pushed code commits from today:
- `93b4117` — `fix(meta): sharpen gemma rewrite instructions`
- `0f3f2d6` — `fix(gemma): harden google rewrite cleanup`
- `35f85d3` — `fix(context): expand gemma highlighted rewrite guardrails`

Latest pushed test commits from today:
- `e14a7b1` — `test(llm): cover user message rewrite guardrails`
- `af56b0e` — `test(context): expand highlighted prompt builder coverage`
- `9f311e0` — `test(context): cover highlighted rewrite cleanup regressions`
- `0444707` — `test(google): cover gemma rewrite fallback repair`
- `ce25170` — `test(meta): expand gemma prompt guardrails`

Working tree:
- expected clean after this docs update is committed and pushed

Verification after today’s pushed changes:

```powershell
cd extension
npm run build
npm test
```

Latest result:
- `npm run build`: passed
- `npm test`: 156/156 tests passed

Notes:
- Vite/CRX prints a warning that `src/content/perplexity-main.ts` is a `MAIN` world content script and does not support HMR. This is expected.
- Git may still print a local permission warning for `C:\Users\Jaska/.config/git/ignore`. It did not block status, commits, or pushes.

---

## Session Summary — 2026-04-24

### 1. Text branch duplicate-summary cleanup was hardened and pushed

Status:
- implemented
- tested
- committed
- pushed

Files updated:
- `extension/src/lib/context-enhance-prompt.ts`
- `extension/test/unit/context-enhance-prompt.test.ts`
- `extension/test/unit/context-menu.test.ts`

What changed:
- `removeTrailingDuplicatePromptSummary()` now compares a trailing prompt-like restatement against both:
  - the main rewritten body
  - the original selected text
- duplicate-summary detection now preserves real hard constraints instead of stripping them by accident
- concept coverage was widened so paraphrased duplicate restatements are more likely to be removed
- Text branch regressions were added for:
  - paragraph and single-line duplicate summaries
  - paraphrased duplicate summaries
  - preserved hard constraints
  - the exact launch-triage Text branch prompt shape that was manually tested today

Important nuance:
- the original 2026-04-23 unresolved duplicate-summary browser issue was addressed in code and tests today
- Text branch launch-style prompts passed in manual testing today
- the exact older complaint-prompt browser retest from 2026-04-23 was not rerun today, so that specific manual repro is still worth checking later if you want total closure

### 2. The LLM branch was tightened for hard triage prompts

Status:
- implemented
- tested
- committed
- pushed

Files updated:
- `extension/src/lib/meta-prompt.ts`
- `extension/src/lib/llm-client.ts`
- `extension/test/unit/build-user-message.test.ts`
- `extension/test/unit/meta-prompt.test.ts`

What changed:
- the normal enhancer now explicitly bans the bad rewrite shape:
  - `My goal is...`
  - `Here's what I need you to do...`
  - `Deliverables include...`
- hard triage / ops / incident prompts are now explicitly steered toward direct operational wording instead of generic analysis phrasing
- the normal rewrite path now preserves urgency/tone cues more explicitly
- launch-triage and incident-triage good/bad patterns were added to the prompt instructions and tests

Why this was needed:
- the user reported a bad normal-enhancer output that turned a sharp triage prompt into soft project-brief language
- that failure mode is now directly guarded against in the normal prompt instructions

### 3. Gemma got a dedicated hardening pass without changing non-Gemma runtime behavior

Status:
- implemented
- tested
- committed
- pushed

Files updated:
- `extension/src/lib/meta-prompt.ts`
- `extension/src/lib/context-enhance-prompt.ts`
- `extension/src/lib/llm-client.ts`
- `extension/test/unit/google-api.test.ts`

What changed:
- `buildGemmaMetaPromptWithIntensity()` was expanded so Gemma is told to preserve:
  - named inputs
  - explicit deliverables
  - tone cues such as `sharp`, `practical`, `clear`, `natural-sounding`, and `non-fluffy`
  - anti-invention and uncertainty language
- `buildGemmaSelectedTextMetaPrompt()` was expanded in the same direction for Text branch mode
- `sanitizeGemmaResponse()` was hardened so Gemma-only outputs get cleaned more aggressively
- a Gemma-only repair/fallback path was added:
  - if Gemma softens a sharp prompt into generic project-brief language such as `Please analyze... Deliverables include...`
  - the extension rebuilds a sharper conservative rewrite from the original source prompt instead of letting the degraded output through
- this repair path is only used in the Google Gemma branch
- non-Gemma providers were intentionally left alone

Why this matters:
- the user explicitly wanted Gemma fixed without disturbing the rest of the codebase
- today’s runtime hardening was scoped to Gemma only

### 4. Manual Gemma spot checks passed today

Status:
- manual spot checks passed

Prompt/output classes that passed:
- Text branch launch-triage prompt
- LLM branch launch-triage prompt
- LLM branch incident-triage prompt
- a messier launch-risk prompt with multiple evidence sources and multiple deliverables

Observed outcome:
- Gemma stopped falling back into the earlier generic `Please analyze... Deliverables include...` shape on the tested prompts
- outputs stayed sharp enough that no further Gemma code edits were justified today

### 5. Work stopped at provider comparison testing because of rate limits

Status:
- planned
- not run

What was next:
- compare `gemini-2.5-flash` and `gemini-2.5-flash-lite`

Why it stopped:
- provider rate limits blocked further manual testing during this session

---

## Current Working Behavior

Working:
- ChatGPT LLM branch enhancement
- Claude LLM branch enhancement
- Gemini LLM branch enhancement
- Perplexity LLM branch enhancement
- Text branch via right-click context menu
- Text branch duplicate-summary cleanup is stronger than yesterday and now covered by broader regressions
- Text branch launch-style prompts passed manually today
- LLM branch hard-triage prompts now stay much closer to the intended sharp operational wording
- Gemma now preserves explicit evidence sources, deliverables, and anti-invention constraints much better on the tested prompt family
- Gemma has a dedicated repair path for degraded generic rewrite outputs
- non-Gemma regression suite remains green

No confirmed active code issue from today’s session:
- none

Residual caution:
- the exact older Text branch complaint-prompt duplicate-summary repro from 2026-04-23 was not manually rerun today
- treat that as a targeted manual follow-up, not as an active confirmed bug

---

## What Changed Today

Runtime / prompt code:
- `extension/src/lib/meta-prompt.ts`
- `extension/src/lib/llm-client.ts`
- `extension/src/lib/context-enhance-prompt.ts`

Tests:
- `extension/test/unit/build-user-message.test.ts`
- `extension/test/unit/context-enhance-prompt.test.ts`
- `extension/test/unit/context-menu.test.ts`
- `extension/test/unit/google-api.test.ts`
- `extension/test/unit/meta-prompt.test.ts`

Docs:
- `codex/Progress.md`

---

## Next Session — Start Here

**Immediate Goal:** Complete the manual verification matrix for the Text branch and OpenRouter free chain.

1. Reload the unpacked extension first.


2. Run one normal Gemma prompt from each category above to confirm today’s fixes still behave the same in the browser.

3. Run the prepared Flash / Flash Lite comparison prompts once rate limits clear.

4. Optional but useful:
- rerun the original Text branch complaint-prompt duplicate-summary repro from 2026-04-23:
  - `read these complaints and tell me what is actually broken, what is user confusion, what evidence is missing, and what update i should send the team today`
  - pass condition: one consolidated rewrite only

---

## Resume Commands

From repo root:

```powershell
cd extension
npm run build
npm test
```

For git state:

```powershell
git status --short
git fetch origin main
git rev-list --left-right --count origin/main...main
git log --oneline -10
```
