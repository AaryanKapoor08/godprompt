# PromptGod — Codex Progress

Last updated: 2026-04-26

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

There is no immediate code task queued. The next session should start with manual provider testing, not more edits.

### Primary next task

Once rate limits clear, compare:
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

Use the LLM branch flow first.

### Prepared test categories

1. Hard triage prompt
- Use the API logs / support tickets / screenshots / Slack evidence prompt shape
- Pass if it stays sharp, keeps evidence sources, keeps all deliverables, and does not drift into `Please analyze...`

2. Broad strategy prompt with missing context
- Use a business-strategy ask with insufficient detail
- Pass if it asks only the minimum useful clarifying questions instead of inventing specifics

3. File-based staged workflow prompt
- Use a slides/handout/sample-code prompt where the workflow is:
  - analyze uploaded material first
  - solve later
- Pass if it preserves the staged sequence and does not skip ahead

4. Research / comparison prompt
- Use a comparison prompt such as Postgres vs ClickHouse vs BigQuery
- Pass if it stays decision-oriented and does not add filler

5. Already-strong prompt
- Use a prompt that is already specific and structured
- Pass if it stays close to the source and does not over-rewrite

### Comparison criteria for Flash vs Flash Lite

Check for:
- preserves named inputs
- preserves explicit deliverables
- preserves anti-invention language
- avoids placeholders
- avoids clarifying questions unless truly needed
- avoids `My goal is...` / `Deliverables include...` / project-brief drift
- does not turn a sharp operational ask into generic fluff

### If something fails

Do this before changing code:
- capture the exact provider and model
- capture the full rewritten output
- note whether it was:
  - LLM branch
  - Text branch
- note whether the failure is:
  - dropped deliverables
  - generic softening
  - placeholders
  - unnecessary clarifying questions
  - staged-workflow collapse
  - duplicate-summary output

Rule for next session:
- do not reopen Gemma code just because wording is slightly more polished
- only reopen code if there is a real regression or a new prompt family failure

---

## Recommended Manual Checks

When testing resumes:

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
