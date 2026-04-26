# PromptGod — Build Flow

This is a stabilization and re-architecture buildflow for non-Gemma rewrite paths in the existing extension. It is not a greenfield build. Every phase is gated by checkpoints; nothing advances until the relevant `[ ]` boxes are `[x]` with proof.

`codex/productvision.md` is the product-truth source. This file translates the settled decisions there into ordered execution.

---

## Prerequisites

- Node.js 20+ and npm (extension uses `npm run build` / `npm test` per current scripts)
- Production code lives in `extension/src/`
- Tests live in `extension/test/` (`extension/test/unit/` and `extension/test/integration/`)
- Test command: `npm test` (vitest)
- Build command: `npm run build` (vite)
- Regression corpus (introduced in Phase 1) lives at `extension/test/regression/` and is invoked by the same vitest run
- Chrome extension MV3 host; service worker entry `extension/src/service-worker.ts`, popup `extension/src/popup/`, content scripts `extension/src/content/`

Do not assume any prior Hono/server scaffolding; the backend in `server/` was removed in Phase 16 of the legacy plan.

---

## Global Rules

- No-regression rollout: the regression corpus must stay green on every PR after Phase 1; Gemma is exempt per the pipeline-isolation rule.
- Gemma freeze: do not edit Gemma prompts, Gemma cleanup, or Gemma retry logic in any phase of this buildflow.
- Branch separation: `LLM branch` and `Text branch` evolve through their own spec-builders, validators, retry, and repair. No shared branch validator or shared spec-builder.
- Provider separation: Google and OpenRouter evolve through their own model registry, request policy, retry policy, and budget policy. No shared provider router.
- Token-budget enforcement: every prompt change must measure tokens via the Phase 2 seam and assert against the cap defined in `productvision.md` (`Done: Final Token Budget Policy`). PR fails if the assertion fails.
- Checkpoint-first phase completion: a phase is only complete when every checkpoint is `[x]` with proof (test run, log, manual verification screenshot, or measured token count).
- No destructive refactors: existing files (`meta-prompt.ts`, `context-enhance-prompt.ts`, `llm-client.ts`) stay until their last responsibility moves into the new layout. No parallel old+new path may stay in production for more than one phase.
- Acceptance gates before broad rollout: no default-model change ships without passing the OpenRouter Primary Eval Gate (`productvision.md` `Done: OpenRouter Primary Eval Gate`).
- Branching and commits follow the existing repo style: `feat/<phase>/<short>` branches, conventional-commit messages with scope (`feat(rewrite-core): ...`).

---

## Phases

### Phase 1 — Lock acceptance criteria and regression corpus

- **Goal.** Freeze the regression corpus, schema, and runner so every later phase has a stable pass/fail signal.
- **Why now.** Without a locked corpus, prompt and pipeline edits cannot be evaluated objectively, and prior regressions will silently return.
- **Tasks.**
  1. Create `extension/test/regression/` with a per-entry JSON file format matching the schema in `productvision.md` `Done: Regression Corpus Specification` (`id`, `branch`, `source`, `expected_violation_codes`, `expected_preserved_constraints`, `severity`, `notes`).
  2. Seed `30-50` entries from `claude/Progress.md` bug history, `codex/` notes, and prior commit messages — covering each known violation category (placeholder leak, source echo, duplicate summary, first-person brief, dropped deliverable, answered-instead-of-rewriting, decorative markdown, merged tasks, forbidden Text-branch question).
  3. Add a vitest runner under `extension/test/regression/runner.test.ts` that loads every entry and asserts `severity = regression-must-not-recur` entries pass at `100%` and `quality-target` entries pass at `>= 90%`.
  4. Define the four run targets: `LLM + Google`, `LLM + OpenRouter`, `Text + Google`, `Text + OpenRouter`. The runner skips Gemma combinations explicitly.
  5. Document the add/remove policy at the top of `extension/test/regression/README.md`: new entries require a recorded reason, no entry is removed without one.
- **Code areas.** `extension/test/regression/`, `extension/test/regression/runner.test.ts`, `extension/test/regression/README.md`, `package.json` test script if a new pattern is needed.
- **Checkpoints.**
  - [x] `extension/test/regression/` exists with at least 30 entries split across `LLM` and `Text` branches
  - [x] Every entry validates against the schema in a schema test
  - [x] Runner reports per-branch and per-provider pass rates
  - [x] Runner enforces `100%` on `regression-must-not-recur` and `>= 90%` on `quality-target`
  - [x] Runner skips Gemma combinations and logs the skip
  - [x] `npm test` runs the regression runner as part of the standard suite
  - [x] `README.md` documents add/remove policy
- **Proof.**
  - `npm test -- --run test/regression/runner.test.ts`: passed, 1 file / 5 tests
  - `npm test`: passed, 23 files / 159 tests
- **Risks.** Corpus is too small to catch real regressions; corpus uses only synthetic prompts and misses real-world failure shapes.
- **Commit message.** `test(regression): seed corpus, schema, and runner for stabilization`
- **Rollback / containment.** No user-facing change; revert the test files only.

---

### Phase 2 — Token-budget measurement seam

- **Goal.** Add a deterministic token-counting seam so every prompt change can be measured against the `productvision.md` budget caps before any prompt edits ship.
- **Why now.** The 70% cut and the per-branch caps cannot be enforced without an objective token measurement that runs in CI.
- **Tasks.**
  1. Add `extension/src/lib/rewrite-core/budget.ts` exposing `measureTokens(text)` using a deterministic local approximation (no provider call) calibrated against the OpenAI token-counting reference in `productvision.md`.
  2. Expose `assertBudget({ kind: 'llm-first' | 'llm-retry' | 'text-first' | 'text-retry', tokens, hardCap, target? })` that throws on cap violation and warns outside target range.
  3. Add a budget snapshot test under `extension/test/unit/budget-snapshots.test.ts` that loads every production prompt currently in use (`meta-prompt.ts`, `context-enhance-prompt.ts`) and records baseline token counts. The snapshot is informational in this phase; the assertion is wired up in Phase 4 and Phase 5.
  4. Add a `production` vs `debug` mode flag (build-flag based per `productvision.md` `Done: Production vs Debug Prompt Modes`); production builds compile out debug-only content. Wire the flag into `vite.config.ts`.
  5. Write `extension/src/lib/rewrite-core/README.md` describing the budget seam and the production/debug build flag contract.
- **Code areas.** `extension/src/lib/rewrite-core/budget.ts`, `extension/src/lib/rewrite-core/README.md`, `extension/test/unit/budget-snapshots.test.ts`, `vite.config.ts`.
- **Checkpoints.**
  - [x] `measureTokens` is deterministic (same input produces same count across runs) and covered by unit tests
  - [x] `assertBudget` throws with a structured error including `{ kind, tokens, hardCap }`
  - [x] Baseline snapshot test records current `meta-prompt.ts` and `context-enhance-prompt.ts` token counts
  - [x] Build flag toggles production vs debug prompt content; production build excludes debug-only sections
  - [x] No production prompt content has changed in this phase
- **Proof.**
  - `npm test -- --run test/unit/budget-snapshots.test.ts test/unit/rewrite-core/normalize.test.ts test/unit/rewrite-core/constraints.test.ts test/unit/rewrite-core/validate.test.ts test/unit/rewrite-core/repair.test.ts test/unit/rewrite-core/fallback.test.ts test/regression/runner.test.ts`: passed, 7 files / 28 tests
  - `npm test`: passed, 29 files / 182 tests
  - `npm run build`: passed
- **Risks.** Token approximation drifts from real provider counts and lets oversize prompts pass; build flag leaks debug content into a production bundle.
- **Commit message.** `feat(rewrite-core): add token-budget measurement seam and prompt build mode`
- **Rollback / containment.** No user-facing change; revert the new files and the `vite.config.ts` flag wiring.

---

### Phase 3 — Shared rewrite-core primitives

- **Goal.** Land the shared, branch-agnostic and provider-agnostic primitives: `types`, `normalize`, `constraints`, `validate`, `repair`, `fallback`.
- **Why now.** The compact-contract prompt strategy in Phases 4 and 5 depends on local validation and repair carrying the correctness load. These primitives must exist before the prompts shrink.
- **Tasks.**
  1. Create `extension/src/lib/rewrite-core/types.ts` with the contracts named in `productvision.md` `Shared data contracts` (`RewriteRequest`, `ConstraintSet`, `RewriteSpec`, `ValidationResult`, `RepairResult`).
  2. Create `extension/src/lib/rewrite-core/normalize.ts` covering whitespace, quote, line-ending, and invisible-character normalization plus source-mode detection (`prompt`, `message`, `note`, `mixed task list`). No provider logic.
  3. Create `extension/src/lib/rewrite-core/constraints.ts` as a heuristic regex/keyword detector with a curated phrase set per constraint type. Implement the `recall-conservative, precision-strict` stance from `productvision.md`. Each detected constraint records the source-text span.
  4. Create `extension/src/lib/rewrite-core/validate.ts` exposing the shared issue codes (`DROPPED_DELIVERABLE`, `ASKED_FORBIDDEN_QUESTION`, `DECORATIVE_MARKDOWN`, `FIRST_PERSON_BRIEF`, `MERGED_SEPARATE_TASKS`, `ANSWERED_INSTEAD_OF_REWRITING`). Branch-specific rules are not added here.
  5. Create `extension/src/lib/rewrite-core/repair.ts` with `cosmetic`, `structural`, and `substantive` repair classes per `productvision.md`. Repair must be deterministic, must never invent content, and must respect the divergence threshold (set to a measured edit-distance value here and documented in the file header).
  6. Create `extension/src/lib/rewrite-core/fallback.ts` producing the conservative fallback string when validation cannot be repaired.
  7. Add unit tests for each module under `extension/test/unit/rewrite-core/`. Tests must include corpus-aligned phrasings for the constraint detector (positive and negative cases per `Maintenance rule`).
  8. Do not modify any existing call site or production behavior in this phase.
- **Code areas.** `extension/src/lib/rewrite-core/`, `extension/test/unit/rewrite-core/`.
- **Checkpoints.**
  - [x] `types.ts` exports every contract named in `productvision.md` `Shared data contracts`
  - [x] `constraints.ts` precision tests pass: every test labeled "must-not-emit" produces zero constraints
  - [x] `constraints.ts` recall tests pass for the curated phrase set per constraint type
  - [x] `validate.ts` emits each issue code at least once across unit tests
  - [x] `repair.ts` passes determinism test (same input twice → identical output)
  - [x] `repair.ts` divergence-threshold guard prefers fallback over aggressive repair when threshold exceeded
  - [x] `fallback.ts` produces output that the validator accepts
  - [x] No file under `extension/src/lib/meta-prompt.ts`, `extension/src/lib/context-enhance-prompt.ts`, `extension/src/lib/llm-client.ts`, or `extension/src/service-worker.ts` is touched
  - [x] Regression corpus (Phase 1) remains green
- **Proof.**
  - `npm test -- --run test/unit/budget-snapshots.test.ts test/unit/rewrite-core/normalize.test.ts test/unit/rewrite-core/constraints.test.ts test/unit/rewrite-core/validate.test.ts test/unit/rewrite-core/repair.test.ts test/unit/rewrite-core/fallback.test.ts test/regression/runner.test.ts`: passed, 7 files / 28 tests
  - `npm test`: passed, 29 files / 182 tests
  - `npm run build`: passed
- **Risks.** Constraint detector is too aggressive and starts emitting false positives that corrupt rewrites in later phases; repair divergence threshold is set too loose and hides real failures.
- **Commit message.** `feat(rewrite-core): add shared types, normalize, constraints, validate, repair, fallback`
- **Rollback / containment.** No user-facing change; revert the new directory and tests.

---

### Phase 4 — LLM branch migration to compact-contract prompting

- **Goal.** Move the `LLM branch` onto the compact-contract pipeline (normalize → extract → spec → call → validate → repair → targeted retry → fallback) within the `1000`-token first-pass cap and `220`-token retry cap.
- **Why now.** `LLM branch` is the largest source of token bloat and regressions; it is the pipeline's main quality battleground and must move first so Phase 5 has a stable shared core to lean on.
- **Tasks.**
  1. Create `extension/src/lib/rewrite-llm-branch/spec-builder.ts` producing a compact `RewriteSpec` from `RewriteRequest + ConstraintSet`. Preserve staged workflows, multi-task boundaries, and exact deliverables.
  2. Create `extension/src/lib/rewrite-llm-branch/validator.ts` with the `LLM branch`-specific rules in `productvision.md` `LLM branch validator`. Layer it on top of the shared validator.
  3. Create `extension/src/lib/rewrite-llm-branch/retry.ts` implementing the targeted-retry payload schema in `productvision.md` `Done: Final Token Budget Policy` (framing prefix, up to 3 issue codes, up to 1 failing substring per issue capped at 30 chars, instruction tail). Max one retry. If more than 3 issues fired, surface only the highest-severity 3.
  4. Wire `service-worker.ts` `LLM branch` entry point through the new pipeline behind the existing branch identifier. The legacy `meta-prompt.ts` path remains importable but unreferenced after this phase.
  5. Replace the runtime `LLM branch` system prompt with a compact production-mode contract that fits the `1000`-token hard cap and aims for the `700-850` target. Long teaching/example content moves to debug-mode prompts only.
  6. Wire `assertBudget({ kind: 'llm-first', hardCap: 1000 })` and `assertBudget({ kind: 'llm-retry', hardCap: 220 })` into the build/test step so any regression on prompt size fails CI.
  7. Run the regression corpus against `LLM + Google` and `LLM + OpenRouter` and fix violations until both targets pass per acceptance criteria.
  8. Delete `meta-prompt.ts` only after every responsibility has moved (per the migration rule in `productvision.md` `Done: Module Layout Commitment`).
- **Code areas.** `extension/src/lib/rewrite-llm-branch/`, `extension/src/service-worker.ts`, `extension/src/lib/meta-prompt.ts` (deleted at end), `extension/src/lib/llm-client.ts` (call shape only, no provider routing changes).
- **Checkpoints.**
  - [x] `LLM branch` first-pass production prompt measured tokens `< 1000`, target `700-850`
  - [x] `LLM branch` retry payload measured tokens `< 220` and conforms to schema in `productvision.md`
  - [x] Targeted retry runs at most once per request
  - [x] Two validator failures (first-pass + retry) trigger provider fallback per `Validation-to-fallback coupling rule`
  - [x] Regression corpus passes on `LLM + Google` and `LLM + OpenRouter`
  - [x] No-output-answering tests pass
  - [x] No decorative-markdown, no first-person-brief, no merged-task regressions
  - [x] `meta-prompt.ts` removed; no production call site imports it
  - [x] `npm test` and `npm run build` pass
- **Proof.**
  - `npm test -- --run test/unit/rewrite-llm-branch.test.ts test/unit/rewrite-text-branch.test.ts test/unit/rewrite-core/validate.test.ts test/unit/rewrite-core/repair.test.ts test/regression/runner.test.ts`: passed, 5 files / 21 tests
  - `npm test -- --run test/unit/service-worker-provider-fallback.test.ts test/unit/meta-prompt.test.ts test/unit/context-enhance-prompt.test.ts test/unit/context-menu.test.ts test/unit/google-api.test.ts test/unit/budget-snapshots.test.ts test/unit/rewrite-llm-branch.test.ts test/unit/rewrite-text-branch.test.ts`: passed, 8 files / 59 tests
  - `npm test`: passed, 36 files / 197 tests
  - `npm run build`: passed
- **Phase note.**
  - Non-Gemma `LLM branch` production calls now use `rewrite-llm-branch/` compact-contract builders, validation, deterministic repair, and one targeted retry.
  - Frozen Gemma LLM prompt behavior is isolated in `gemma-legacy/llm-branch.ts`; `meta-prompt.ts` has been removed.
  - Validation failure after first pass plus targeted retry is covered by a service-worker provider-fallback test and escalates to frozen Gemma on the Google path.
- **Risks.** Compact contract drops behavior the long prompt was silently enforcing; retry payload leaks failing source text beyond the 30-char cap; production prompt accidentally inherits debug-only content via build flag misconfiguration.
- **Commit message.** `feat(rewrite-llm-branch): migrate LLM branch to compact-contract pipeline`
- **Rollback / containment.** Behavior change is user-facing for `LLM branch` users. Safe revert: revert the merge commit, which restores `meta-prompt.ts` import and the legacy prompt. Keep `rewrite-core/` and `rewrite-llm-branch/` files in place after revert; only the wiring in `service-worker.ts` flips back.

---

### Phase 5 — Text branch hardening within the narrow allowed scope

- **Goal.** Move `Text branch` onto the compact-contract pipeline within the `400`-token first-pass cap and `140`-token retry cap, preserving branch personality (no questions, no source echo, no first-person brief, no duplicate summary, deliverable preservation).
- **Why now.** `LLM branch` proved out the pipeline shape in Phase 4; Text branch can now adopt the same primitives without inventing new patterns. Doing it after Phase 4 keeps the rewrite-core API stable.
- **Tasks.**
  1. Create `extension/src/lib/rewrite-text-branch/spec-builder.ts` per `productvision.md` `Text branch rewrite-spec builder`. Preserve explicit deliverables nearly verbatim. Never introduce question-first flows.
  2. Create `extension/src/lib/rewrite-text-branch/validator.ts` per `productvision.md` `Text branch validator`. Layer on top of shared validator.
  3. Create `extension/src/lib/rewrite-text-branch/repair.ts` per `productvision.md` `Text branch repair layer`. Strip source echo, leading brief framing, duplicate summary tails. Restore critical prompt intent only on cosmetic corruption. No aggressive style tuning.
  4. Wire `service-worker.ts` `Text branch` entry point (`context-enhance` port flow) through the new pipeline.
  5. Replace `context-enhance-prompt.ts` runtime prompt with a compact production-mode contract under the `400`-token cap, target `280-360`. Move long content to debug mode only.
  6. Implement Text-branch retry only for catastrophic invalid output; conform to the `productvision.md` retry payload schema (framing prefix, up to 2 issue codes, source-text re-anchor, instruction tail) within the `140`-token cap.
  7. Wire `assertBudget({ kind: 'text-first', hardCap: 400 })` and `assertBudget({ kind: 'text-retry', hardCap: 140 })` into CI.
  8. Run regression corpus against `Text + Google` and `Text + OpenRouter`. Hold the no-question, no-source-echo, no-duplicate-summary, no-first-person-brief, deliverable-preservation regressions at `100%`.
  9. Delete `context-enhance-prompt.ts` once every responsibility has moved.
- **Code areas.** `extension/src/lib/rewrite-text-branch/`, `extension/src/service-worker.ts`, `extension/src/lib/context-enhance-prompt.ts` (deleted at end), `extension/src/content/context-menu-handler.ts` (only if its call shape needs the new spec).
- **Checkpoints.**
  - [x] `Text branch` first-pass production prompt measured tokens `< 400`, target `280-360`
  - [x] `Text branch` retry payload measured tokens `< 140` and conforms to schema
  - [x] Retry fires only on catastrophic invalid output (verified by unit test on validator output classes)
  - [x] Regression corpus passes on `Text + Google` and `Text + OpenRouter`
  - [x] No clarifying-question regression on any Text-branch entry
  - [x] No source-echo, no duplicate trailing summary, no first-person brief regression
  - [x] Deliverable-preservation tests pass on every entry tagged with explicit deliverables
  - [x] `context-enhance-prompt.ts` removed; no production call site imports it
- **Proof.**
  - `npm test -- --run test/unit/rewrite-text-branch.test.ts test/unit/context-menu.test.ts test/unit/context-enhance-prompt.test.ts test/regression/runner.test.ts`: passed, 4 files / 39 tests
  - `npm test -- --run test/unit/service-worker-provider-fallback.test.ts test/unit/meta-prompt.test.ts test/unit/context-enhance-prompt.test.ts test/unit/context-menu.test.ts test/unit/google-api.test.ts test/unit/budget-snapshots.test.ts test/unit/rewrite-llm-branch.test.ts test/unit/rewrite-text-branch.test.ts`: passed, 8 files / 59 tests
  - `npm test -- --run test/unit/rewrite-llm-branch.test.ts test/unit/rewrite-text-branch.test.ts test/unit/rewrite-core/validate.test.ts test/unit/rewrite-core/repair.test.ts test/regression/runner.test.ts`: passed, 5 files / 21 tests
  - `npm test`: passed, 36 files / 197 tests
  - `npm run build`: passed
- **Phase note.**
  - Non-Gemma `Text branch` production calls now use `rewrite-text-branch/` compact-contract builders, validation, deterministic repair, and catastrophic-output retry.
  - Frozen Gemma Text branch prompt and cleanup behavior is isolated in `gemma-legacy/text-branch.ts`; `context-enhance-prompt.ts` has been removed.
- **Risks.** The 70% Text-branch token cut shifts behavior off the prompt onto the validator/repair faster than expected and a missed local rule lets a regression slip through; Text-branch retry over-fires and introduces latency.
- **Commit message.** `feat(rewrite-text-branch): migrate Text branch to compact-contract pipeline`
- **Rollback / containment.** Behavior change is user-facing for the highlighted-text flow. Safe revert: revert the merge commit; legacy `context-enhance-prompt.ts` returns into the call path. Keep new files in place.

---

### Phase 6 — Google-specific policy alignment

- **Goal.** Land the Google-only model registry, request policy, retry policy, and budget policy aligned with the settled visible chain (`Gemini 2.5 Flash` primary, `Gemma` fallback 1, OpenRouter chain fallback 2).
- **Why now.** Phase 4 and Phase 5 already lean on the shared core; the provider-specific layer can now be cleanly separated without chasing prompt regressions in parallel.
- **Tasks.**
  1. Create `extension/src/lib/rewrite-google/models.ts` with the explicit non-Gemma supported set (`gemini-2.5-flash`, `gemini-2.5-flash-lite`). Gemma mappings stay frozen and isolated.
  2. Create `extension/src/lib/rewrite-google/request-policy.ts` enforcing `systemInstruction` for Gemini, `thinkingBudget: 0` for rewrite flows, Google-specific output-token caps, and Google-specific no-text/blocked-output handling.
  3. Create `extension/src/lib/rewrite-google/retry-policy.ts` covering only Google-appropriate transient failures and the failure classes in `productvision.md` `Done: Google Product Plan`. Empty/unusable definitions match `productvision.md`.
  4. Create `extension/src/lib/rewrite-google/budget-policy.ts` enforcing fixed token-budget ceilings per `productvision.md`.
  5. Wire `service-worker.ts` Google routing through the new modules. Do not change Gemma routing or Gemma retry. Confirm pipeline-isolation rule: shared validator and shared repair never run against Gemma output.
  6. Verify the validation-to-fallback coupling rule: a single validator failure triggers the Phase 4/5 targeted retry; two validator failures (first pass + retry) escalate to provider fallback without inheriting the failed prompt.
  7. Manual verification matrix: run regression corpus on `LLM + Google` and `Text + Google`, exercise the rate-limit fallback path, and confirm Gemma escalation is reached only on the failure classes listed in `productvision.md`.
- **Code areas.** `extension/src/lib/rewrite-google/`, `extension/src/service-worker.ts`, `extension/src/lib/llm-client.ts` (Google call shape only).
- **Checkpoints.**
  - [x] `models.ts` exports only the non-Gemma supported set; Gemma identifiers stay in their existing isolated location
  - [x] Gemini requests use `systemInstruction` and `thinkingBudget: 0`
  - [x] Two HTTP 429s within retry window escalate from Flash to Gemma; one does not
  - [x] Two HTTP 5xx within retry window escalate from Flash to Gemma; one does not
  - [x] Empty/unusable rewrite output after retry escalates to Gemma per the `productvision.md` definitions
  - [x] Provider does not switch after partial output starts (verified by streaming test)
  - [x] Shared validator/repair never runs against Gemma output (verified by code path assertion test)
  - [x] Regression corpus passes on `LLM + Google` and `Text + Google`
- **Proof.**
  - `npm test -- --run test/unit/google-api.test.ts test/unit/rewrite-google-policy.test.ts test/unit/rewrite-openrouter-policy.test.ts test/unit/openrouter-account-status.test.ts test/unit/openrouter-retry.test.ts test/unit/retry-policy.test.ts`: passed, 6 files / 43 tests
  - `npm test -- --run test/unit/service-worker-gemma-isolation.test.ts test/unit/service-worker-provider-fallback.test.ts`: passed, 2 files / 6 tests
  - `npm test`: passed, 36 files / 197 tests
  - `npm run build`: passed
- **Phase note.**
  - Google non-Gemma policy now lives under `rewrite-google/`; Flash no longer falls through to Flash-Lite inside `llm-client.ts`.
  - Non-Gemma Google branch calls now escalate Flash validation/provider failures to frozen Gemma, then to the OpenRouter curated chain when an OpenRouter key is saved.
  - Gemma prompt builders, cleanup, and retry behavior remain legacy/frozen. The service-worker Gemma isolation test mocks shared repair/validator modules to throw and proves direct Gemma LLM/Text paths do not call them.
- **Risks.** Retry policy escalates too eagerly and sends Flash users to Gemma on a single transient blip; Gemma isolation is broken by an accidental shared-validator call.
- **Commit message.** `feat(rewrite-google): split Google policy into models, request, retry, budget`
- **Rollback / containment.** Behavior change is user-facing for Google routing. Revert path: revert the merge commit so `service-worker.ts` falls back to its prior Google routing.

---

### Phase 7 — OpenRouter live-catalog, curated chain, cooldown, account-status

- **Goal.** Replace the static OpenRouter free-model list with a live-catalog-aware curated chain, cooldown policy, and account-status detection.
- **Why now.** OpenRouter free-model availability changes too often for a static worldview, and the new pipeline must not silently fall back to `openrouter/free`.
- **Tasks.**
  1. Create `extension/src/lib/rewrite-openrouter/catalog.ts` fetching and caching the live OpenRouter Models API; filter text-capable `:free` variants. Cache key includes catalog version.
  2. Implement live-catalog refresh lifecycle: fetch on extension install, fetch on popup open if last successful fetch was `> 24 hours` ago, background refresh every `24 hours` while the service worker is alive. A pinned local fallback ladder ships with each build (equal to the visible curated chain at build time) and is used when the live fetch fails.
  3. Create `extension/src/lib/rewrite-openrouter/curation.ts` exposing the curated chain in the order from `productvision.md`: `inclusionai/ling-2.6-flash:free`, `nvidia/nemotron-3-super-120b-a12b:free`, `openai/gpt-oss-20b:free`, `nvidia/nemotron-3-nano-30b-a3b:free`. Demote any model whose live entry disappears or is marked deprecated. Explicitly exclude `inclusionai/ling-2.6-1t:free` and `meta-llama/llama-3.3-70b-instruct:free`.
  4. Create `extension/src/lib/rewrite-openrouter/route-policy.ts` implementing curated-ladder fallback on pre-first-token failures, `5-minute` per-model in-memory cooldown that resets on service-worker restart, and the rule that the chain never silently jumps to `openrouter/free`. No model switch after partial output begins.
  5. Create `extension/src/lib/rewrite-openrouter/budget-policy.ts` enforcing the OpenRouter budget caps and prompt compactness.
  6. Create `extension/src/lib/rewrite-openrouter/account-status.ts` per `productvision.md` `OpenRouter account-status awareness`. Detect `50/day` vs `1000/day` bucket on first OpenRouter call per session; cache for the session; surface in popup; pause OpenRouter routing on cap-reached without blocking Google.
  7. Implement the All-Providers-Failed terminal behavior per `productvision.md` `Done: All-Providers-Failed Terminal Behavior`: surface the in-product error within `< 1 second`, log the full failure chain, never silently jump to `openrouter/free`, never return source as if it were a rewrite.
  8. Run the OpenRouter Primary Eval Gate on `inclusionai/ling-2.6-flash:free`. If it fails, promote `nvidia/nemotron-3-super-120b-a12b:free`. If both fail, fall back to `openai/gpt-oss-20b:free`. Record the eval result with model id, date, and corpus version.
- **Code areas.** `extension/src/lib/rewrite-openrouter/`, `extension/src/service-worker.ts`, `extension/src/lib/llm-client.ts` (OpenRouter call shape only).
- **Checkpoints.**
  - [x] Live catalog fetch succeeds and caches; pinned fallback ladder is used when live fetch fails (verified with mocked failure)
  - [x] Curated chain order matches the `productvision.md` order in both runtime and the cached catalog projection
  - [x] Failed model enters `5-minute` per-model cooldown; cooldown resets on service-worker restart
  - [x] Chain never falls back to `openrouter/free`; verified by unit test
  - [x] No model switch after partial output begins (verified by streaming test)
  - [x] Account-status detection populates `50/day` or `1000/day` bucket and surfaces it in popup state
  - [x] OpenRouter rate-limit pause does not block Google routing
  - [x] Terminal failure UI reachable in `< 1 second` after chain exhaustion; full failure chain logged
  - [ ] OpenRouter Primary Eval Gate recorded for the chosen primary with model id, date, corpus version
  - [x] Regression corpus passes on `LLM + OpenRouter` and `Text + OpenRouter`
- **Proof.**
  - `npm test -- --run test/unit/google-api.test.ts test/unit/rewrite-google-policy.test.ts test/unit/rewrite-openrouter-policy.test.ts test/unit/openrouter-account-status.test.ts test/unit/openrouter-retry.test.ts test/unit/retry-policy.test.ts`: passed, 6 files / 43 tests
  - `npm test -- --run test/unit/service-worker-gemma-isolation.test.ts test/unit/service-worker-provider-fallback.test.ts`: passed, 2 files / 6 tests
  - `npm test`: passed, 36 files / 197 tests
  - `npm run build`: passed
- **Phase note.**
  - OpenRouter runtime routing now uses `rewrite-openrouter/` catalog, curation, route policy, budget policy, and account-status modules.
  - The pinned curated chain is `inclusionai/ling-2.6-flash:free` → `nvidia/nemotron-3-super-120b-a12b:free` → `openai/gpt-oss-20b:free` → `nvidia/nemotron-3-nano-30b-a3b:free`.
  - `openrouter/free`, `inclusionai/ling-2.6-1t:free`, and `meta-llama/llama-3.3-70b-instruct:free` are excluded from the curated free chain.
  - Terminal-failure behavior is now covered by service-worker tests for both LLM and Text branches: the user-facing error is posted in `< 1 second` after mocked chain exhaustion and a structured full provider failure chain is logged.
  - The OpenRouter Primary Eval Gate remains unchecked. It was attempted with the developer-provided key using only `inclusionai/ling-2.6-flash:free`, but the full corpus could not complete because the account hit OpenRouter's `50/day` free-model cap. The blocked attempt is recorded in `codex/openrouter-primary-eval.md`.
- **Risks.** Catalog fetch failure silently degrades to a stale ladder without surfacing; cooldown leaks across sessions; account-status check leaks the user's API key into a UI surface.
- **Commit message.** `feat(rewrite-openrouter): add live catalog, curated chain, cooldown, account-status`
- **Rollback / containment.** Behavior change is user-facing for OpenRouter routing. Revert path: revert the merge commit so `service-worker.ts` falls back to its prior static OpenRouter routing.

---

### Phase 8 — UI alignment with the visible chain

- **Goal.** Make the popup's model list reflect the live curated chain, with visible order matching runtime order and `openrouter/free` excluded from recommendations.
- **Why now.** Phase 7 lands the runtime chain; the popup must match the runtime order before broad rollout, otherwise users will see one chain and experience another.
- **Tasks.**
  1. Replace the static popup free-model list in `extension/src/popup/popup.ts` and `extension/src/popup/popup.html` with a live-aware curated list driven by `rewrite-openrouter/curation.ts`.
  2. Render the visible chain: `Gemini 2.5 Flash` → `Gemma` → `OpenRouter Free Chain`. The internal Gemma tier difference (best-effort vs engineered) is not surfaced as a UI label.
  3. Inside `OpenRouter Free Chain`, render the curated chain with `stable free` and `experimental free` classifications. Do not render `openrouter/free` as a recommended option.
  4. Surface the account-status bucket near the OpenRouter chain section. Show a clear UI message and pause indicator when the daily cap is approached or reached.
  5. Keep custom model entry available; validate format (must contain `/`).
  6. Add a popup unit test asserting that the rendered order equals the curation module's output order at render time.
- **Code areas.** `extension/src/popup/popup.html`, `extension/src/popup/popup.ts`, `extension/src/popup/popup.css`, `extension/test/unit/popup-*` tests.
- **Checkpoints.**
  - [x] Popup renders the visible chain in the order from `productvision.md`
  - [x] OpenRouter section renders the curated chain in the runtime order; visible order equals runtime order
  - [x] `openrouter/free` does not appear as a recommended option
  - [x] Account-status bucket renders for OpenRouter users with a valid key
  - [x] Cap-reached state shows a clear message and pause indicator
  - [x] Custom model input preserved and validates `/` format
  - [x] Popup test asserts visible order equals curation output order
- **Proof.**
  - `npm test -- --run test/unit/popup-model-options.test.ts test/unit/rewrite-openrouter-policy.test.ts`: passed, 2 files / 13 tests
  - `npm test`: passed, 37 files / 202 tests; 1 live OpenRouter eval test skipped
  - `npm run build`: passed
- **Phase note.**
  - Popup model options now derive from `extension/src/popup/model-options.ts`, which consumes `rewrite-openrouter/curation.ts` so visible OpenRouter order matches runtime curation.
  - The popup renders the visible fallback chain as `Gemini 2.5 Flash` → `Gemma` → `OpenRouter Free Chain`; it does not surface Gemma's internal best-effort tier label.
  - The OpenRouter chain list renders curated free models with `stable free` / `experimental free` classifications and excludes `openrouter/free`.
  - OpenRouter account-status display now formats bucket, near-cap warning, and cap-reached pause states through a tested helper.
- **Risks.** Popup renders a stale order from cached state when the live catalog refreshes mid-session; account-status bucket label confuses users without a key.
- **Commit message.** `feat(popup): align model list with live curated chain and account-status`
- **Rollback / containment.** Behavior change is user-facing in the popup. Revert path: revert the merge commit so the prior static popup returns. No data migration needed.

---

### Phase 9 — Verification matrix and rollout gates

- **Goal.** Run the full verification matrix and gate the broad rollout on objective acceptance criteria across branches and providers.
- **Why now.** Every prior phase added a slice; this phase confirms the slices compose correctly under realistic conditions before the change reaches all users.
- **Tasks.**
  1. Run the regression corpus against all four targets (`LLM + Google`, `LLM + OpenRouter`, `Text + Google`, `Text + OpenRouter`). Acceptance: `100%` on `regression-must-not-recur`, `>= 90%` on `quality-target`. Gemma is exempt.
  2. Run token-budget assertions across all four targets and confirm CI fails if any cap is exceeded.
  3. Run provider-specific verification: Google quota path (Flash → Gemma escalation classes), OpenRouter cooldown/cycle (per-model `5-minute` cooldown, restart reset, no fallback to `openrouter/free`), account-status bucket detection (`50/day` vs `1000/day`).
  4. Run branch-specific verification: `LLM branch` staged-workflow preservation, `Text branch` deliverable preservation; no clarifying questions in `Text branch` under any source.
  5. Run regression set for: no-output-answering, deliverable-preservation, no decorative markdown, no first-person brief, no duplicate trailing summary.
  6. Run manual verification matrix at the completion of this phase covering the four branch+provider targets, the terminal failure UI (`< 1 second`), and the popup visible-chain alignment.
  7. Confirm that the OpenRouter Primary Eval Gate result from Phase 7 is still valid; re-run it if the curated chain or corpus changed.
  8. If every gate passes, mark the rollout cleared. If any gate fails, file the failing phase as the only allowed in-flight work until it passes again.
- **Code areas.** `extension/test/regression/`, `extension/test/unit/budget-snapshots.test.ts`, `extension/test/integration/`, `codex/Progress.md` (handoff record only — note that `Progress.md` editing is out of scope for the buildflow itself).
- **Checkpoints.**
  - [x] Regression corpus passes on all four targets at the `productvision.md` thresholds
  - [x] Token-budget assertions hold across all four targets
  - [x] Google quota path verified (Flash → Gemma on the listed failure classes only)
  - [x] OpenRouter cooldown verified (per-model `5-minute`, resets on service-worker restart)
  - [x] Account-status bucket detection verified for both `50/day` and `1000/day` accounts (or mocked equivalents)
  - [x] Terminal failure UI reachable `< 1 second` from chain exhaustion
  - [ ] Manual verification matrix complete; results recorded
  - [ ] OpenRouter Primary Eval Gate result current; re-run logged if anything changed
- **Proof.**
  - `npm test -- --run test/regression/runner.test.ts test/unit/budget-snapshots.test.ts test/unit/rewrite-llm-branch.test.ts test/unit/rewrite-text-branch.test.ts test/unit/rewrite-google-policy.test.ts test/unit/rewrite-openrouter-policy.test.ts test/unit/openrouter-account-status.test.ts test/unit/service-worker-provider-fallback.test.ts test/unit/popup-model-options.test.ts`: passed, 9 files / 41 tests
  - `npm test`: passed, 37 files / 202 tests; 1 live OpenRouter eval test skipped
  - `npm run build`: passed
- **Phase note.**
  - Automated/local Phase 9 gates are complete.
  - The manual browser/provider verification matrix remains pending and is expected to be performed manually.
  - The live OpenRouter Primary Eval Gate remains intentionally deferred because both available free-key attempts hit OpenRouter's `50/day` free-model daily cap. The blocked attempts are recorded in `codex/openrouter-primary-eval.md`.
- **Risks.** Manual matrix is signed off without exercising the rate-limit and terminal-failure paths; eval gate ages out without a re-run.
- **Commit message.** `chore(verification): run rollout gate matrix and record results`
- **Rollback / containment.** No code change in this phase by default. If a gate fails, the relevant prior phase's revert path is the rollback.

---

### Phase 10 — LLM branch 10/10 quality hardening

- **Goal.** Drive the `LLM branch` manual quality dimensions from the 2026-04-26 Gemini Flash test set to the user's stated `10/10` target: hard contract compliance, structural deliverable preservation, natural-language constraint extraction, tone/voice/urgency preservation, cosmetic quality, and composite-directive integrity.
- **Why now.** Phases 4-9 stabilized the compact pipeline structurally, but manual tests show the branch still drops high-signal messy intent: persona, taste, urgency, anti-fluff, anti-invention, user-supplied strategy ideas, and ask-first-then-build workflows. A 10/10 target requires hard gates, not "material improvement".
- **10/10 gates by dimension.**

  | Dimension | 10/10 gate |
  |---|---|
  | Hard contract compliance | Output is only the rewritten prompt; no answering, no preamble, no source echo, no fences, no XML/debug tags, no change notes, no meta-routing sentence. |
  | Structural deliverable preservation | Every explicit deliverable, evidence source, named input, user idea, and required output section survives in the rewrite unless the source explicitly says to omit it. |
  | Constraint extraction from natural language | Persona, anti-invention, anti-fluff, anti-generic, missing-context, and no-placeholder constraints are extracted from messy phrasing and reappear as enforceable instructions. |
  | Tone / voice / urgency preservation | Explicit taste/tone cues are preserved and operationalized, not merely copied as labels. The rewritten prompt should make the next AI produce the requested voice. |
  | Cosmetic quality | No trailing punctuation artifacts, malformed placeholders, accidental double periods, wrapper junk, duplicate summary tails, or obvious whitespace damage. |
  | Composite-directive integrity | If the source says ask first then build/draft/analyze, the output must preserve both stages in order and cannot collapse into only questions or only final work. |

- **Manual test baseline.** Source findings are documented in `codex/Progress.md` under `LLM Branch Manual Test Findings — 2026-04-26 (later session)` and `Additional LLM branch manual tests — 2026-04-26 (3 shabby prompt set)`. The implementation must not move those findings out of `Progress.md`; build planning lives here.
- **Tasks.**
  1. Lock the 8 manual tests into documented acceptance traits before runtime changes. For each test, record: source prompt, observed bad output summary, required preserved items, forbidden output shapes, and target output traits. Prefer a dedicated `codex/llm-branch-quality-plan.md` if the table becomes too large for this phase section.
  2. Add regression entries before changing validators or prompts:
     - Tests 1, 2, 4, and 5 as `regression-must-not-recur`.
     - The 3 newer tests as `quality-target` / "must not regress currently-good behavior" entries.
     - Test 3 as a staged-workflow guard if the original source/output is available.
  3. Extend regression/unit expectations beyond broad issue-code pass/fail where needed:
     - must contain required concepts
     - must not contain bad openings
     - must preserve staged flow markers
     - must preserve named deliverables and user ideas.
  4. Add strict issue codes for the observed failure classes:
     - `META_PREAMBLE`
     - `DESCRIPTIVE_PROMPT_BRIEF`
     - `DROPPED_PERSONA`
     - `DROPPED_TONE_CUE`
     - `DROPPED_USER_IDEA`
     - `DROPPED_NATURAL_LANGUAGE_CONSTRAINT`
     - `BROKEN_COMPOSITE_DIRECTIVE`
     Keep existing codes where they fit, but do not overload `DROPPED_DELIVERABLE` for every failure type.
  5. Add `META_PREAMBLE` validation for sentence-start routing/preamble shapes such as `Rewrite this prompt for...`, `Here is a rewritten...`, `This prompt is for...`, and `The rewritten prompt should...`.
  6. Add LLM-branch descriptive/project-brief drift detection for bad opening shapes such as `The user needs to...`, `The goal is to...`, `To develop/create/build a...`, and `This task involves...`. Keep this LLM-specific unless a Text-branch regression proves shared behavior is needed.
  7. Add narrow cosmetic repair for terminal double-period artifacts. Collapse terminal `..` or longer dot runs to a single `.` only when clearly sentence punctuation; do not rewrite intentional ellipses inside the text.
  8. Add a high-signal LLM-branch extraction layer, keeping shared `constraints.ts` precision-strict. Extract structured items for:
     - next-AI persona
     - tone/taste cues
     - anti-fluff / anti-generic instructions
     - expanded anti-invention instructions
     - named evidence sources
     - named deliverables
     - user-provided ideas/examples
     - ask-first-then-build workflows.
  9. Upgrade `rewrite-llm-branch/spec-builder.ts` so the first-pass compact prompt includes the extracted high-signal constraints. Example compact lines:
     - `Preserve role: expert systems engineer`
     - `Preserve tone: sharp, weird`
     - `Preserve anti-invention: do not make up business details`
     - `Preserve user ideas: LinkedIn ads, cold outreach`
     - `Workflow: ask B2B/B2C-level clarifying questions first, then build execution plan`
  10. Add persona preservation checks. Detect and preserve high-confidence role forms such as `act as an? ...`, `be an? ...`, `force/make/tell the llm/ai/model/assistant to be ...`, `for a better llm that knows ...`, and domain expert hints like `expert systems engineer`, `lawyer-ish llm`, or `senior auth/debugging engineer`.
  11. Add anti-fluff / anti-generic / expanded anti-invention preservation checks for high-confidence phrases such as `avoid corporate fluff`, `not startup bro bullshit`, `no generic AI assistant garbage`, `no excited-to-help`, `not LinkedIn sludge`, `dont/don't make up a business`, and `use only what I give it`.
  12. Improve deliverable and user-idea preservation. Enforce concrete source concepts such as `execution plan`, `first 100 customers`, `LinkedIn ads`, `cold outreach`, `B2B vs B2C`, `ranked hypotheses`, and `exact commands/checks` when present. Keep false positives controlled by requiring concrete noun chunks or explicit list items.
  13. Add composite ask-first-then-build validation. When the source requires asking questions/numbers/details before drafting/building/creating/proceeding, the output must preserve both the question gate and the later artifact/action.
  14. Add cautious but first-class tone/taste preservation. Start with a curated explicit cue set (`sharp`, `weird`, `direct`, `practical`, `calm`, `honest`, `technical`, `high standards`, `human`, `lean`, `non-fluffy`) and require preservation/operationalization when those cues are source intent. Avoid rejecting good rewrites for paraphrasing non-critical adjectives.
  15. Improve `rewrite-llm-branch/retry.ts` so retry payloads include the top failure codes plus exact missing/forbidden concepts while staying under the `220`-token retry cap. Example evidence lines: `DROPPED_PERSONA: expert systems engineer`, `DROPPED_USER_IDEA: LinkedIn ads`, `META_PREAMBLE: Rewrite this prompt for...`.
  16. Keep deterministic repair limited to safe cosmetic/structural cleanup. Repair may strip wrappers/preambles if the remaining output validates, remove duplicate summary tails, and fix punctuation artifacts. It must not invent a missing persona, missing deliverable, or manufactured tone.
  17. Run a final anti-overfitting pass with at least 3 fresh shabby LLM branch prompts not used during implementation.
- **Code areas.**
  - `extension/src/lib/rewrite-core/types.ts`
  - `extension/src/lib/rewrite-core/validate.ts`
  - `extension/src/lib/rewrite-core/repair.ts`
  - `extension/src/lib/rewrite-core/constraints.ts` only for truly shared high-confidence constraints
  - `extension/src/lib/rewrite-llm-branch/spec-builder.ts`
  - `extension/src/lib/rewrite-llm-branch/validator.ts`
  - `extension/src/lib/rewrite-llm-branch/retry.ts`
  - `extension/test/regression/entries/`
  - `extension/test/regression/runner.test.ts` if richer expectations require runner support
  - `extension/test/unit/rewrite-llm-branch.test.ts`
  - `extension/test/unit/rewrite-core/constraints.test.ts`
  - `extension/test/unit/rewrite-core/validate.test.ts`
  - `extension/test/unit/rewrite-core/repair.test.ts`
- **Checkpoints.**
  - [x] 8 manual tests are locked with acceptance traits before runtime changes
  - [x] New regression entries exist for Tests 1, 2, 4, 5 and the 3 newer "must not regress" tests
  - [x] Regression/unit tests cover meta-preamble, descriptive brief drift, trailing punctuation, dropped persona, dropped natural-language constraints, dropped user ideas, dropped tone cues, and broken ask-first-then-build workflows
  - [x] `META_PREAMBLE` catches Test 4-style plain-English preambles
  - [x] `DESCRIPTIVE_PROMPT_BRIEF` or equivalent catches third-person/project-brief drift without breaking valid prompts
  - [x] Persona extraction/preservation keeps `expert systems engineer` and MongoDB-expert intent
  - [x] Anti-fluff / anti-generic / anti-invention extraction preserves Test 2 and Test 5 taste constraints
  - [x] Structural preservation catches dropped execution plan, first-100-customers, LinkedIn ads, cold outreach, evidence sources, ranked hypotheses, and exact commands/checks
  - [x] Composite ask-first-then-build validation rejects outputs that preserve only questions or only final work
  - [x] Tone/taste preservation catches explicit `sharp`, `weird`, `direct`, `technical`, and `high standards` cues without overstuffing currently-good rewrites
  - [x] Retry payloads include useful missing/forbidden evidence for all new high-severity issue codes and remain under `220` tokens
  - [x] First-pass `LLM branch` product-owned prompt budget remains under `1000` tokens
  - [x] Existing regression corpus remains green
  - [ ] Manual rerun of all 8 LLM branch prompts on `gemini-2.5-flash` scores every target dimension at `10/10`, or no dimension below `9/10` with a documented follow-up before claiming final completion
  - [ ] At least 3 fresh shabby prompts pass the anti-overfitting spot check
- **Proof.**
  - `npm test -- --run test/unit/rewrite-llm-branch.test.ts test/unit/rewrite-core/repair.test.ts test/regression/runner.test.ts`: passed, 3 files / 17 tests
  - `npm test`: passed, 37 files / 208 tests; 1 live OpenRouter eval test skipped
  - `npm run build`: passed
- **Phase note.**
  - Acceptance traits for the 8 manual prompts are locked in `codex/llm-branch-quality-plan.md`. Because `Progress.md` captured findings rather than full exact browser prompts, those fixtures are explicitly marked as reconstructed from the recorded traits.
  - Added 7 Phase 10 LLM regression entries for the failing manual tests and the 3 newer "must not regress" tests. The previously passing staged workflow remains covered by the existing staged-workflow corpus.
  - Non-Gemma `LLM branch` now has an LLM-only high-signal extraction layer for persona, tone/taste, natural-language constraints, evidence sources, deliverables, user ideas, and ask-first-then-build workflows.
  - `Text branch` and frozen Gemma behavior were not retuned.
  - Manual Gemini Flash rerun and fresh shabby-prompt anti-overfitting spot check remain open and must be completed before claiming Phase 10 final completion.
- **Risks.**
  - Overfitting to the 8 manual prompts and making fresh prompts rigid or boilerplate-heavy.
  - Adding broad natural-language detectors that create false positives and corrupt otherwise good rewrites.
  - Exceeding the compact prompt budget by stuffing too much extracted metadata into the first-pass prompt.
  - Blurring shared-core and LLM-branch boundaries by pushing LLM-specific tone/persona rules into Text branch behavior.
- **Non-goals / guardrails.**
  - Do not reopen Gemma. These failures are on the non-Gemma `LLM branch`.
  - Do not turn the production prompt back into a giant teaching document.
  - Do not enforce fuzzy tone matching globally across both branches.
  - Do not make `Text branch` inherit LLM-specific persona/tone behavior unless a Text-specific regression proves the need.
  - Do not make repair invent missing content. Substantive preservation failures should trigger retry/fallback, not silent reconstruction.
- **Commit message.** `fix(rewrite-llm-branch): harden high-signal intent preservation`
- **Rollback / containment.** Behavior change is user-facing for the non-Gemma `LLM branch`. Revert path: revert the Phase 10 merge commit to restore the prior compact-contract behavior while keeping prior Phase 1-9 infrastructure intact.

---

### Phase 11 — OpenRouter free-chain quality cleanup

- **Goal.** Remove weak OpenRouter free models from the curated runtime/recommended chain based on manual LLM branch testing, promote the strongest observed free model, and keep Nano only if the observed artifact class can be repaired and retested.
- **Why now.** Manual OpenRouter LLM branch testing on the launch-incident prompt showed that `inclusionai/ling-2.6-flash:free` and `openai/gpt-oss-20b:free` returned the shabby source nearly unchanged, which fails the enhancer job. `nvidia/nemotron-3-super-120b-a12b:free` produced the strongest rewrite. `nvidia/nemotron-3-nano-30b-a3b:free` had usable structure but emitted a contract-breaking `We fixed markdown.` change note and duplicate/restarted output.
- **Manual test baseline.**
  - Ling 2.6 Flash: `5/10`; preservation by pass-through, poor enhancement.
  - Nemotron 3 Super 120B: `9/10`; best observed output, should become OpenRouter free primary.
  - GPT-OSS 20B: `5/10`; preservation by pass-through, poor enhancement.
  - Nemotron 3 Nano 30B: `6/10`; structurally decent but contaminated by change note and duplicate output.
- **Tasks.**
  1. Remove `inclusionai/ling-2.6-flash:free` from `OPENROUTER_CURATED_FREE_MODELS`.
  2. Remove `openai/gpt-oss-20b:free` from `OPENROUTER_CURATED_FREE_MODELS`.
  3. Add both removed model ids to `OPENROUTER_EXCLUDED_FREE_MODELS` so they do not appear in runtime chain or popup recommendations.
  4. Promote `nvidia/nemotron-3-super-120b-a12b:free` to the first curated free model and therefore the OpenRouter free primary.
  5. Keep `nvidia/nemotron-3-nano-30b-a3b:free` as `experimental free` only, not primary.
  6. Add deterministic cleanup for the observed Nano artifact class: known change-note contamination such as `We fixed markdown.` followed by restarted duplicate output.
  7. Add unit coverage proving excluded models do not appear in runtime or popup OpenRouter chain options.
  8. Add unit coverage proving the Nano artifact cleanup strips the change note/restarted duplicate without inventing content.
  9. Manually retest Nano on at least the launch-incident and MongoDB migration prompts. If the artifact or duplication recurs after cleanup, remove Nano from the curated chain and add it to exclusions too.
- **Code areas.**
  - `extension/src/lib/rewrite-openrouter/curation.ts`
  - `extension/src/lib/rewrite-core/repair.ts`
  - `extension/test/unit/rewrite-openrouter-policy.test.ts`
  - `extension/test/unit/popup-model-options.test.ts`
  - `extension/test/unit/rewrite-core/repair.test.ts`
- **Checkpoints.**
  - [x] Ling 2.6 Flash removed from curated runtime/recommended chain
  - [x] GPT-OSS 20B removed from curated runtime/recommended chain
  - [x] Nemotron 3 Super 120B is first curated OpenRouter free model
  - [x] Popup OpenRouter chain excludes Ling and GPT-OSS
  - [x] Runtime chain excludes Ling and GPT-OSS even when requested or present in the live catalog
  - [x] Nano artifact cleanup covers `We fixed markdown.` contamination and duplicate restart
  - [ ] Nano manually retested after cleanup on at least 2 shabby LLM branch prompts
  - [ ] If Nano fails retest, Nano removed from curated chain and added to exclusions
- **Proof.**
  - `npm test -- --run test/unit/rewrite-openrouter-policy.test.ts test/unit/popup-model-options.test.ts test/unit/rewrite-core/repair.test.ts`: passed, 3 files / 17 tests
  - `npm test`: passed, 37 files / 209 tests; 1 live OpenRouter eval test skipped
  - `npm run build`: passed
- **Phase note.**
  - This phase supersedes the older Phase 7/8 curated-chain order. The OpenRouter free chain should now be `Nemotron 3 Super 120B` then `Nemotron 3 Nano 30B` only, with Nano treated as probationary.
- **Risks.**
  - OpenRouter free availability changes and may leave only Nano available.
  - The Nano artifact cleanup may be too narrow to catch future change-note variants.
  - Removing pass-through models lowers chain breadth, but that is preferable to shipping models that do not perform useful enhancement.
- **Commit message.** `fix(openrouter): remove weak free models from curated chain`
- **Rollback / containment.** Revert this phase to restore the previous four-model curated chain. If only the Nano cleanup causes trouble, revert the repair change and remove Nano from curation.

---

### Phase 12 — Context isolation and unrelated-context contamination guard

- **Goal.** Prevent previous conversation/selection context from bleeding into standalone rewrites, and reject branch outputs that introduce unrelated concepts from nearby context.
- **Why now.** Manual Gemini 2.5 Flash testing showed the launch-incident LLM prompt being contaminated by MongoDB migration concepts from a nearby test prompt (`schemas`, `collection names`, `rollback plan`, `pre-production checklist`, `script shapes`). The same failure class can affect `Text branch` if selected text is rewritten while prior page/chat context is available. The fix belongs in context admission and validation, not model-specific prompt tuning.
- **Observed failure baseline.**
  - Source prompt: launch/support incident triage with API logs, Stripe webhook errors, Sentry screenshots, Slack messages, support tickets, and customer emails.
  - Bad output: mostly valid incident prompt but imported unrelated migration/database deliverables and negative constraints from a separate MongoDB test.
  - Likely cause: `recentContext` is passed when `Include conversation context` is enabled, and the compact prompt only says to use it if relevant. That is too soft for context-sensitive models.
- **Tasks.**
  1. Add a shared context-admission utility, e.g. `extension/src/lib/rewrite-core/context-admission.ts`, that decides whether recent context may be sent to the model.
  2. Default to omitting `recentContext` for standalone rewrites. Admit it only when the current source text explicitly references prior context with high-confidence phrases such as `above`, `previous message`, `earlier`, `same as before`, `continue`, `based on this conversation`, `use the context`, `the attached/previous files`, or equivalent.
  3. Apply the admission utility before both non-Gemma `LLM branch` and non-Gemma `Text branch` spec builders receive `recentContext`.
  4. Keep Gemma frozen. Do not retune Gemma prompts or cleanup. If Gemma still receives recent context through its legacy path, gate the `recentContext` value before calling the frozen Gemma builder rather than editing Gemma prompt text.
  5. Add branch validation for unrelated-context contamination. Introduce an issue code such as `INTRODUCED_UNRELATED_CONTEXT`.
  6. Start with narrow, high-confidence contamination families:
     - database/migration terms introduced into non-database prompts: `schema`, `collection name`, `MongoDB`, `migration steps`, `rollback plan`, `safe rollback`, `pre-production checklist`, `script outline`
     - incident/support terms introduced into non-incident prompts: `Stripe webhook`, `Sentry`, `support tickets`, `customer emails`, `root-cause paths`, `what not to say to customers`
     - recruiting/job-post terms introduced into unrelated prompts: `compensation`, `remote policy`, `candidate profile`, `job post`
  7. Make the validator precision-strict. It should fire only when the output introduces a foreign concept family that is absent from the source and absent from admitted context.
  8. Wire `INTRODUCED_UNRELATED_CONTEXT` into LLM targeted retry so the retry explicitly removes the foreign concepts while preserving the original source prompt.
  9. For `Text branch`, prefer deterministic rejection + conservative fallback over creative repair when unrelated-context contamination is detected. Text selected content should not inherit chat history unless the selected text explicitly references it.
  10. Add unit tests proving standalone LLM prompts do not include recent context in the model payload even when the popup toggle is enabled.
  11. Add unit tests proving source prompts that explicitly reference prior context still include bounded recent context.
  12. Add LLM validator/regression coverage for the launch-incident prompt contaminated with MongoDB migration concepts.
  13. Add Text branch validator/regression coverage for selected launch/incident text contaminated with database migration concepts, and selected database text contaminated with launch/support concepts.
  14. Update popup or inline help only if needed to clarify that conversation context is conditional, not a guaranteed payload.
  15. Manually retest Gemini 2.5 Flash with the launch-incident and MongoDB prompts in the same browser conversation with `Include conversation context` enabled. Standalone prompts must not import concepts from the other test.
- **Code areas.**
  - `extension/src/lib/rewrite-core/context-admission.ts`
  - `extension/src/lib/rewrite-core/validate.ts`
  - `extension/src/lib/rewrite-core/types.ts`
  - `extension/src/lib/rewrite-llm-branch/spec-builder.ts`
  - `extension/src/lib/rewrite-llm-branch/validator.ts`
  - `extension/src/lib/rewrite-llm-branch/retry.ts`
  - `extension/src/lib/rewrite-text-branch/spec-builder.ts`
  - `extension/src/lib/rewrite-text-branch/validator.ts`
  - `extension/src/service-worker.ts`
  - `extension/test/unit/rewrite-core/`
  - `extension/test/unit/rewrite-llm-branch.test.ts`
  - `extension/test/unit/rewrite-text-branch.test.ts`
  - `extension/test/regression/entries/`
- **Checkpoints.**
  - [x] Standalone `LLM branch` rewrites omit `recentContext` from the model payload by default
  - [x] Standalone `Text branch` rewrites omit `recentContext` from the model payload by default
  - [x] Explicit context-referencing LLM prompts still receive bounded recent context
  - [x] Explicit context-referencing Text prompts still receive bounded recent context only when applicable to the selected text flow
  - [x] `INTRODUCED_UNRELATED_CONTEXT` fires on MongoDB/migration concepts introduced into launch-incident outputs
  - [x] `INTRODUCED_UNRELATED_CONTEXT` fires on launch/support concepts introduced into database-migration outputs
  - [x] LLM targeted retry includes the foreign concept evidence and remains under the `220`-token retry cap
  - [x] Text branch contaminated outputs are rejected or safely fall back without importing foreign concepts
  - [x] Existing regression corpus remains green
  - [x] `npm test` and `npm run build` pass
  - [ ] Manual Gemini 2.5 Flash retest in one ongoing conversation no longer cross-contaminates the launch and MongoDB prompts
- **Proof.**
  - `npm test -- --run test/unit/rewrite-core/context-admission.test.ts test/unit/rewrite-core/validate.test.ts test/unit/rewrite-llm-branch.test.ts test/unit/rewrite-text-branch.test.ts test/regression/runner.test.ts`: passed, 5 files / 34 tests
  - `npm test`: passed, 38 files / 219 tests; 1 live OpenRouter eval test skipped
  - `npm run build`: passed
- **Phase note.**
  - This phase is model-agnostic. Flash exposed the issue, but the product bug is that PromptGod can pass irrelevant recent context and then rely on a soft instruction not to use it.
  - Gemma remains frozen. Any Gemma-related change in this phase must be limited to whether `recentContext` is passed into the existing frozen builder.
  - Implementation added `extension/src/lib/rewrite-core/context-admission.ts`, gated legacy Gemma context before calling the frozen builders, and added Phase 12 regression entries for LLM and Text branch contamination. Manual Gemini Flash browser retest remains open.
- **Risks.**
  - Over-tight context admission may make legitimate follow-up prompts weaker.
  - Over-broad contamination validation may reject valid prompts that naturally combine incident response, rollback, database, and customer communication concerns.
  - Text branch context behavior may need special care because selected text often lacks enough surrounding page context, but broad page/chat context can corrupt it.
- **Commit message.** `fix(rewrite-context): gate recent context and reject unrelated contamination`
- **Rollback / containment.** Revert the context-admission and validator wiring. The popup toggle can keep existing storage behavior; rollback should restore the prior unconditional recent-context payload path.

---

## Testing strategy

Every phase must demonstrate the relevant subset:

- Regression corpus checks: per-branch and per-provider; Gemma exempt. Required from Phase 1 onward.
- Token-budget checks: first-pass and retry, both branches. Required from Phase 2 (snapshot) and enforced from Phase 4 (LLM) and Phase 5 (Text).
- Provider-specific verification: Google quota path (Phase 6), OpenRouter cooldown/cycle (Phase 7), account-status bucket detection (Phase 7).
- Branch-specific verification: LLM staged workflow preservation (Phase 4), Text deliverable preservation and no-question (Phase 5).
- No-output-answering regressions: Phase 1 corpus; re-checked in Phase 4 and Phase 5.
- Deliverable-preservation regressions: Phase 1 corpus; re-checked in Phase 5 and Phase 9.
- No-markdown / no-brief / no-duplicate-summary regressions: Phase 1 corpus; re-checked in Phases 4, 5, and 9.
- Context-isolation regressions: Phase 12; standalone prompts must not import prior-context concepts, while explicit follow-ups still receive bounded recent context.
- Manual verification matrix: at the end of Phase 4, end of Phase 7, and end of Phase 9. Not just at the end.

---

## Token-budget enforcement (first-class)

- Measurement seam: introduced in Phase 2 (`extension/src/lib/rewrite-core/budget.ts`).
- Separate budgets for first pass vs retry: enforced for `LLM branch` in Phase 4; enforced for `Text branch` in Phase 5.
- Branch-specific enforcement: Phase 4 wires `assertBudget({ kind: 'llm-first', hardCap: 1000 })` and `assertBudget({ kind: 'llm-retry', hardCap: 220 })`; Phase 5 wires `assertBudget({ kind: 'text-first', hardCap: 400 })` and `assertBudget({ kind: 'text-retry', hardCap: 140 })`.
- Production prompts ship without examples; debug-mode prompts may include them. Build-flag work lands in Phase 2 and is consumed in Phases 4 and 5.

---

## Phase Strategy Summary

- **Highest-risk phase:** Phase 4 — `LLM branch` migration carries the largest behavior change in the largest blast radius.
- **Highest-leverage phase:** Phase 3 — shared `rewrite-core` primitives unblock every later phase and shift correctness off prompts.
- **Start here:** Phase 1 — lock the regression corpus before any prompt or pipeline edit ships.
- **Do not touch early:** Phase 8 (UI alignment) — wait until Phase 7 lands the runtime chain so visible order can match runtime order in one move.
