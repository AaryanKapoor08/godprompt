# PromptGod Product Vision

Last updated: 2026-04-25 (critique-pass revision)
Status: buildflow-ready

This file captures the current product-direction discussion for PromptGod so work can resume later without rebuilding context from chat history.

It is not an implementation log. It is a decision-and-direction document covering:
- what the product is trying to become
- why recent prompt-quality work has been unstable
- what constraints are non-negotiable
- what has been verified in code and from provider docs
- what is still unresolved

---

## Current Product Language

Use these names consistently:

- `LLM branch`
  - the normal chatbot enhancement flow
  - user writes a rough prompt inside a chat composer and PromptGod rewrites it before sending
- `Text branch`
  - the highlighted-text flow
  - user selects text on a page and PromptGod rewrites the selected text itself

Older names like `normal chatbot enhancement`, `highlighted-text enhancement`, and `context enhancement` are now secondary/internal only unless they refer to existing code ids.

---

## Non-Negotiable Constraints

These constraints were explicitly stated and should be treated as active product requirements:

- Do not break existing behavior while stabilizing quality.
- Highest practical quality is the target, not incremental cosmetic tuning.
- `Gemma` must remain untouched for this stabilization effort.
- The `Text branch` is already considered strong overall and should not get broad style changes.
- The `Text branch` may still get narrow hardening if needed, but not a sweeping rewrite of its behavior.
- OpenRouter and Google are the two providers that matter for the next planning phase.
- The important Google models are:
  - `gemma`
  - `gemini-2.5-flash`
  - `gemini-2.5-flash-lite`
- For OpenRouter, the focus is the free-model ecosystem, not paid models.

Related user intent:
- fix this once, not through endless prompt toggling
- stop creating regressions by treating everything the same
- separate what should be separate

---

## Why The Work Has Dragged On

The core diagnosis reached in discussion:

- this has not been one bug
- it has been a system-design problem expressed as many prompt bugs

More concretely:

- Two different product branches were being tuned too similarly even though they have different jobs.
- Multiple providers and model families behave differently enough that prompt-only tuning is not a durable control mechanism.
- The current system relies too heavily on soft prompt instructions instead of deterministic local validation and repair.
- Some requirements compete:
  - preserve deliverables
  - stay plain text
  - ask questions only when critical
  - never ask questions in `Text branch`
  - preserve staged workflows
  - do not become verbose or robotic
- Many failure cases were discovered by ugly real prompts after the fact, not by a frozen acceptance suite up front.

Bottom line:

- PromptGod has been tuned too much like a prompt.
- It now needs to be engineered more like a constrained rewrite pipeline.

---

## Current Strategic Direction

The preferred direction is to turn non-Gemma rewrite behavior into a compiler-style pipeline.

Planned high-level flow for non-Gemma paths:

1. Normalize source text.
2. Extract hard constraints locally.
3. Build a smaller branch-specific rewrite spec.
4. Call the model.
5. Validate the output against explicit rules.
6. Repair deterministic violations locally.
7. Retry only when necessary and only with targeted failure information.
8. Fall back conservatively if the output still violates the contract.

Important design note:

- most of the new enforcement should happen locally in code
- local logic costs zero provider tokens
- the model should stop carrying the full burden of correctness

---

## Architecture Direction

### Shared Core

The following should be shared across providers where safe:

- input normalization
- constraint extraction
- output validation
- deterministic cleanup and repair
- conservative fallback builders
- regression prompt corpus

### Provider-Specific Engineering

Google and OpenRouter should not be engineered as if they are the same environment.

Reason:

- Google is relatively explicit and stable.
- OpenRouter is dynamic, routed, and free-model availability changes often.

Planned split:

- `LLM branch + Google`
- `LLM branch + OpenRouter`
- `Text branch + Google`
- `Text branch + OpenRouter`

Not all 4 need equal effort:

- `LLM branch`
  - heavy engineering
  - biggest source of prompt bloat and regressions
- `Text branch`
  - lighter-touch hardening only
  - preserve current strengths
  - focus on contract enforcement, no-brief framing, deliverable preservation, no source echo, and no duplicate summary behavior

### Gemma Boundary

Gemma is explicitly frozen.

That means:

- no prompt-template rework for Gemma
- no retry-policy redesign for Gemma
- no cleanup behavior changes for Gemma
- no quality retuning of Gemma paths

Gemma may remain available in the product, but it is outside the current stabilization scope.

Pipeline isolation rule:

- Gemma calls bypass the shared rewrite-core pipeline entirely
- no shared normalization runs against Gemma input
- no shared constraint extraction is fed into Gemma prompts
- no shared validator runs against Gemma output
- no shared deterministic repair runs against Gemma output
- Gemma keeps its existing minimal cleanup and existing prompt as-is

Reason:

- the new pipeline is built around new compact-contract prompts
- running shared validators against frozen-prompt Gemma output would generate high false-positive rates
- running shared repair against Gemma output would risk breaking working behavior

Product implication:

- Gemma is a `best-effort fallback tier`, not a `same-quality fallback tier`
- when the chain falls from Gemini to Gemma, the user is moving from `engineered pipeline output` to `frozen legacy output`
- this is acceptable because Gemma is a degradation path, not a peer
- this difference is internal-only and does not need to surface in the UI

---

## Exact Architecture Map

This section turns the earlier direction into a concrete boundary map.

The goal is not to over-engineer everything into tiny abstractions. The goal is to separate the parts that actually have different failure modes.

### Shared Across Both Providers And Both Branches

These pieces should exist once and be reused.

#### Shared data contracts

Proposed shared types:

- `RewriteRequest`
  - branch kind
  - provider kind
  - source text
  - model id
  - conversation context if applicable
  - recent context if applicable
- `ConstraintSet`
  - extracted hard requirements from the source text
- `RewriteSpec`
  - compact instruction payload sent to the model
- `ValidationResult`
  - pass/fail plus machine-readable issues
- `RepairResult`
  - output after local deterministic repair

Reason:

- all later layers should trade structured information, not just raw strings

#### Shared normalization layer

Responsibilities:

- trim and normalize whitespace
- normalize quotes, line endings, and invisible junk
- preserve user-intended paragraph breaks
- detect likely source mode:
  - prompt
  - message
  - note
  - mixed task list

This should not contain provider logic.

#### Shared constraint extraction layer

Responsibilities:

- extract hard constraints from source text such as:
  - plain text only
  - no markdown
  - no bold
  - ask questions first
  - do not solve yet
  - keep tasks separate
  - preserve deliverables
  - word-count or count limits
  - anti-invention language
  - staged workflow instructions

This is one of the biggest planned quality wins because it moves correctness checks out of the prompt and into local code.

Mechanism:

- heuristic, keyword and regex-based detector with a curated phrase set per constraint type
- no LLM call inside extraction (must stay zero-token by definition)
- each detected constraint maps to a typed entry in `ConstraintSet` with the source-text span that triggered it

Precision/recall stance:

- `recall-conservative, precision-strict`
- the extractor only emits a constraint when a high-confidence pattern matches
- undetected constraints fall through to the model + validator path, which is the existing behavior
- a false-positive constraint is worse than a false-negative because it can corrupt rewrites by enforcing rules the user did not state
- when in doubt, do not emit

Maintenance rule:

- the regression corpus must include phrasings the extractor is expected to catch and phrasings it is not expected to catch
- when the corpus surfaces a missed phrasing that should be caught, the fix is to add a pattern, not to make the existing patterns fuzzier

#### Shared validation layer

Responsibilities:

- compare model output against:
  - generic rewrite rules
  - extracted hard constraints
  - branch-specific contract
- emit explicit issue codes like:
  - `DROPPED_DELIVERABLE`
  - `ASKED_FORBIDDEN_QUESTION`
  - `DECORATIVE_MARKDOWN`
  - `FIRST_PERSON_BRIEF`
  - `MERGED_SEPARATE_TASKS`
  - `ANSWERED_INSTEAD_OF_REWRITING`

Shared validation should only cover rules that are truly common.

#### Shared deterministic repair layer

Responsibilities:

- strip decorative wrappers
- remove known bad framing
- restore obvious hard constraints if the output is mostly valid
- remove source-echo blocks
- normalize `[NO_CHANGE]` handling

This layer should not try to be clever. It is for safe repairs only.

Repair classes:

- `cosmetic`
  - whitespace, quote normalization, wrapper stripping, trailing-tail removal
- `structural`
  - source-echo removal, brief-framing removal, duplicate-summary collapse
- `substantive`
  - constraint restoration based on extracted `ConstraintSet`

UX rule:

- repair is silent across all classes in v1
- repair must be deterministic and reproducible from the same input
- repair must never invent new content; it can only remove, reorder, or restore from the source
- if the repair output diverges from the model output by more than a defined edit-distance threshold (set in Phase 2), prefer the conservative fallback over an aggressive repair
- substantive repair operations are logged so we can later decide whether to surface a "rewrite cleaned up" indicator in v2

#### Shared conservative fallback layer

Responsibilities:

- produce the safest acceptable fallback when validation still fails
- preserve source text intent over style
- avoid placeholders and invention

Fallback quality should be intentionally conservative, not aspirational.

#### Shared regression corpus

Responsibilities:

- keep nasty real prompts and expected failure categories in one place
- run them against both branches and both providers where relevant

This is the main anti-regression defense.

### Google-Only

These pieces should be Google-specific and not generalized to OpenRouter.

#### Google model registry

Responsibilities:

- maintain a small explicit supported-model set for non-Gemma planning:
  - `gemini-2.5-flash`
  - `gemini-2.5-flash-lite`
- keep Google Gemma mappings frozen and isolated from the non-Gemma redesign

Reason:

- Google model naming is relatively stable and officially documented
- explicit is better than dynamic here

#### Google request builder policy

Responsibilities:

- use Google’s `systemInstruction` path for Gemini
- keep `thinkingBudget: 0` for prompt rewrite flows unless there is a strong reason to change it
- enforce Google-specific output token caps
- preserve Google-specific no-text and blocked-output handling

#### Google retry and fallback policy

Responsibilities:

- retry on Google-appropriate transient failures only
- keep fallback limited and explicit
- for non-Gemma, plan around:
  - requested model
  - then `gemini-2.5-flash`
  - then `gemini-2.5-flash-lite`

This should stay deterministic and small.

#### Google budget policy

Responsibilities:

- enforce fixed token-budget ceilings for non-Gemma prompts
- optimize around stable quotas and low-latency rewrite behavior
- treat Google as the stable provider path

### OpenRouter-Only

These pieces should be OpenRouter-specific and not projected onto Google.

#### OpenRouter live model catalog

Responsibilities:

- fetch and cache the live OpenRouter models list
- filter text-capable free models
- track disappearance or changes in free variants

Reason:

- OpenRouter free availability changes too often for a static worldview

#### OpenRouter curated free-model policy

Responsibilities:

- maintain a ranked curated ladder of acceptable free models
- separate:
  - stable free
  - experimental free
  - excluded free
- demote expiring or degraded models

This is different from random routing.

#### OpenRouter routing and fallback policy

Responsibilities:

- first try the selected curated free model
- on pre-first-token failure, fall through the ladder
- cool down failed models
- never silently jump to `openrouter/free`
- never switch models after partial output has started

#### OpenRouter account-status awareness

Decided as in-scope.

Responsibilities:

- on first OpenRouter call per session, inspect the OpenRouter key endpoint to detect whether the user is in:
  - `50/day` bucket
  - `1000/day` bucket
- cache the bucket result for the session
- show the detected bucket in the popup near the OpenRouter chain section
- when the daily cap is approached or reached, surface a clear UI message and pause OpenRouter routing for the day
- do not block Google routing when OpenRouter is rate-limited

This is OpenRouter-specific because Google's free-tier model is different.

#### OpenRouter budget policy

Responsibilities:

- optimize for reliability under dynamic free routing
- prioritize prompt compactness because shorter prompts reduce latency and retry pain
- treat OpenRouter as the volatile provider path

### LLM Branch-Only

These pieces belong only to `LLM branch`.

#### Conversation-aware input builder

Responsibilities:

- assemble source prompt plus conversation metadata
- decide whether recent context should be included
- keep short follow-up prompts light

`Text branch` does not need this complexity.

#### LLM branch rewrite-spec builder

Responsibilities:

- preserve staged workflows
- preserve multi-task boundaries
- allow question-first flows only when valid for this branch
- preserve exact deliverables and sequencing

This is the hardest rewrite path because the input often mixes:

- task
- meta-instructions
- workflow order
- context references

#### LLM branch validator

Primary rules:

- do not answer the task
- do not rewrite into first-person brief language
- do not introduce decorative markdown
- do not collapse separate tasks into one blob
- do not drop deliverables
- preserve question-first workflows where required

This is the main quality battleground.

#### LLM branch targeted retry path

If the first output fails validation:

- retry with a compact failure-focused instruction
- tell the model exactly what failed
- do not resend the giant original prompt playbook

This is where major token savings should come from.

### Text Branch-Only

These pieces belong only to `Text branch`.

#### Selected-text scope builder

Responsibilities:

- treat the selected text as standalone source text
- never treat it like a conversation turn
- preserve the exact selected material as the rewrite target

#### Text branch rewrite-spec builder

Responsibilities:

- preserve explicit deliverables nearly verbatim
- keep outputs immediately usable
- never introduce question-first flows
- stay conservative when source context is incomplete

#### Text branch validator

Primary rules:

- never ask clarifying questions
- never emit source-echo blocks
- never append duplicate trailing summary paragraphs
- never rewrite into first-person project-brief framing
- never answer the selected text instead of rewriting it

#### Text branch repair layer

This should stay narrow and safe.

Main responsibilities:

- strip source echo
- strip leading brief framing
- remove duplicate summary tails
- restore critical prompt intent if cosmetic corruption happened

No aggressive style tuning should live here.

### Shared-vs-Separate Boundary Rules

To keep the architecture disciplined, use these rules:

- Share extraction logic, not provider routing logic.
- Share validation primitives, not full branch validators.
- Share cleanup primitives, not branch-specific cleanup policies.
- Share fallback infrastructure, not provider fallback chains.
- Do not merge `LLM branch` and `Text branch` prompt templates.
- Do not merge Google and OpenRouter model-selection logic.
- Do not let Gemma-specific exceptions leak into non-Gemma planning.

### Recommended Module Layout

This is a proposed direction, not yet an implementation commitment.

- `extension/src/lib/rewrite-core/`
  - `types.ts`
  - `normalize.ts`
  - `constraints.ts`
  - `validate.ts`
  - `repair.ts`
  - `fallback.ts`
- `extension/src/lib/rewrite-google/`
  - `models.ts`
  - `request-policy.ts`
  - `retry-policy.ts`
  - `budget-policy.ts`
- `extension/src/lib/rewrite-openrouter/`
  - `catalog.ts`
  - `curation.ts`
  - `route-policy.ts`
  - `budget-policy.ts`
  - `account-status.ts` if adopted
- `extension/src/lib/rewrite-llm-branch/`
  - `spec-builder.ts`
  - `validator.ts`
  - `retry.ts`
- `extension/src/lib/rewrite-text-branch/`
  - `spec-builder.ts`
  - `validator.ts`
  - `repair.ts`

This structure would let the product evolve without mixing provider assumptions with branch assumptions.

---

## Current Code Baseline Relevant To This Discussion

Key current locations:

- `extension/src/lib/meta-prompt.ts`
  - main `LLM branch` system prompt
- `extension/src/lib/context-enhance-prompt.ts`
  - `Text branch` system prompt and cleanup
- `extension/src/lib/llm-client.ts`
  - provider request construction and response cleanup
- `extension/src/service-worker.ts`
  - provider routing, model selection, retries, and branch entry points
- `extension/src/popup/popup.ts`
  - user-facing model list

Verified branch request shape:

- both branches currently pass guidelines as normal prompt text, not API metadata
- usually:
  - `systemPrompt` = rewrite instructions
  - `userMessage` = source text wrapped as content to transform
- Google Gemini gets a separate `systemInstruction`
- Google Gemma inlines instruction and task together

This matters because:

- a lot of current token cost comes from large instruction prompts
- some provider behaviors differ based on how system instructions are delivered

---

## Verified Current Runtime Settings

Verified from code on 2026-04-25:

- global rewrite temperature: `0.2`
- Google output cap for current rewrite calls: `512`
- OpenRouter free output cap:
  - `256` for short prompts
  - `320` for medium prompts
  - `384` for longer prompts
- Google 2.5 Flash family currently gets:
  - `thinkingBudget: 0`

Implication:

- output caps are already conservative
- the bigger waste is fixed prompt overhead, not runaway completions

---

## Current Prompt Overhead Measurements

Measured locally from the current prompt builders on 2026-04-25 using rough token approximations.

These are fixed overhead estimates before the user's actual source prompt text is added.

### Non-Gemma

- `LLM branch` system prompt
  - about `3.6k-4.5k` tokens
- `LLM branch` user wrapper
  - about `100-125` tokens
- `LLM branch` total fixed overhead
  - about `3.7k-4.6k` tokens

- `Text branch` system prompt
  - about `1.1k-1.3k` tokens
- `Text branch` user wrapper
  - about `250-300` tokens
- `Text branch` total fixed overhead
  - about `1.35k-1.6k` tokens

### Gemma

- Gemma `LLM branch` system prompt
  - about `840-1030` tokens
- Gemma `Text branch` system prompt
  - about `840-1010` tokens

Interpretation:

- current non-Gemma prompt overhead is too large
- cutting product-owned tokens by at least `70%` is realistic and desirable
- the biggest win is shrinking `LLM branch` fixed instructions

Target budgets discussed:

- non-Gemma `LLM branch` fixed overhead target:
  - under `1000` tokens
- non-Gemma `Text branch` fixed overhead target:
  - under `600-700` tokens

These targets are not yet finalized, but they represent the current design direction.

---

## Provider Research Snapshot

All model/rate-limit notes below were checked during the 2026-04-25 discussion and should be re-verified before implementation if significant time has passed.

### Google

Current relevant stable model names confirmed:

- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

Gemma note:

- Google’s hosted Gemma documentation now emphasizes Gemma 4 model ids
- the current repo still centers `gemma-3-27b-it`
- this mismatch was noted but intentionally left out of the current scope because Gemma is frozen

### OpenRouter

Important provider facts confirmed:

- free variants use ids ending in `:free`
- free-model usage is request-limited first
- OpenRouter explicitly says free-model availability changes often
- `openrouter/free` randomly selects from the currently available free pool

This means:

- static hardcoded free-model assumptions age badly
- quality planning for OpenRouter must account for model churn

---

## Google Free-Tier Reality

### Confirmed Free-Tier Quotas

For one Google free-tier project:

- `gemini-2.5-flash`
  - `10 RPM`
  - `250,000 TPM`
  - `250 RPD`
- `gemini-2.5-flash-lite`
  - `15 RPM`
  - `250,000 TPM`
  - `1,000 RPD`
- `Gemma 3 & 3n`
  - `30 RPM`
  - `15,000 TPM`
  - `14,400 RPD`

Important:

- quotas are per project, not per API key
- extra keys do not increase quota

### Practical Product Interpretation

For `gemini-2.5-flash`:

- current PromptGod requests usually hit `RPM` or `RPD` before `TPM`
- current token overhead is still wasteful
- but it is not usually the main reason Flash users hit free-tier limits

Practical estimate discussed:

- a user on free-tier Flash can think of `250/day` as the hard wall
- `150-200/day` is the more realistic comfortable budget with headroom for retries and accidental repeats

Takeaway:

- cutting PromptGod token cost is still worth doing
- but token cuts alone will not materially increase Google free-tier request ceilings

Google planning has not been finalized yet.

---

## OpenRouter Free-Tier Reality

### Confirmed Public Limits

OpenRouter public free-usage rules discussed:

- up to `20` requests per minute for `:free` model variants
- if the account has purchased less than `10` credits:
  - `50` free-model requests per day
- if the account has purchased at least `10` credits:
  - `1000` free-model requests per day

Important:

- public limits are request-based, not a clean published TPM table per model
- additional accounts or API keys do not meaningfully change the governed capacity model

### Current Repo Free Models

The repo currently hardcodes these OpenRouter free models:

- `openai/gpt-oss-20b:free`
- `meta-llama/llama-3.3-70b-instruct:free`
- `nvidia/nemotron-3-nano-30b-a3b:free`
- `google/gemma-3-27b-it:free`

Verified current context windows:

- `openai/gpt-oss-20b:free`
  - `131,072`
- `meta-llama/llama-3.3-70b-instruct:free`
  - `65,536`
- `nvidia/nemotron-3-nano-30b-a3b:free`
  - `256,000`
- `google/gemma-3-27b-it:free`
  - `131,072`
- `openrouter/free`
  - `200,000`

Interpretation:

- PromptGod is not close to crashing into OpenRouter free model context windows
- OpenRouter problems are more about:
  - volatility
  - availability
  - routing quality
  - stale model assumptions
  - request caps

### Newer Free-Model Signals Observed During Research

OpenRouter free-router activity and model pages showed notable newer free options such as:

- `inclusionai/ling-2.6-flash:free`
- `inclusionai/ling-2.6-1t:free`
- `nvidia/nemotron-3-super-120b-a12b:free`
- `tencent` Hy3 preview in the free router mix

Important note:

- `inclusionai/ling-2.6-1t:free` was observed with a page note saying:
  - `Going away April 30, 2026`

This is a strong example of why OpenRouter free engineering should not be built on static assumptions.

---

## OpenRouter Planning Direction

OpenRouter planning is now decided at the product-direction level, even though implementation details are still pending.

### Final Stance

- do not make `openrouter/free` the default path
- do not rely on a stale hardcoded free-model ladder
- do use a curated free-model ladder informed by the live Models API
- do keep a pinned local fallback list if the live catalog cannot be fetched
- do show the actual fallback order visibly in the product
- do make the visible order match the real runtime order

Reason:

- random router selection is bad for a rewrite product that cares about consistency
- free-model availability shifts too often to trust an old static list forever

### Final Visible Recommended Chain As Of 2026-04-25

This is the current agreed product chain:

1. `Gemini 2.5 Flash`
   - Primary
   - new compact-contract pipeline tier
2. `Gemma`
   - Fallback 1
   - frozen best-effort tier (see Gemma Boundary, pipeline isolation rule)
3. `OpenRouter Free Chain`
   - Fallback 2
   - new compact-contract pipeline tier

Important:

- `gemini-2.5-flash-lite` is not part of the automatic fallback chain
- the chain should be visible to the user
- the runtime order must match the visible order
- the tier difference between Gemma and the other two is an internal architecture fact, not a UI label

### Final OpenRouter Free Chain As Of 2026-04-25

Inside `OpenRouter Free Chain`, the current agreed order is:

Primary default:

- `inclusionai/ling-2.6-flash:free`

Reasoning:

- recent
- active
- `262,144` context
- positioned around fast execution and token efficiency

Quality fallback:

- `nvidia/nemotron-3-super-120b-a12b:free`

Reasoning:

- strong-looking reasoning/agent profile
- `262,144` context
- very high observed activity

Stable fallback:

- `openai/gpt-oss-20b:free`

Reasoning:

- already in repo
- solid instruction-following candidate
- `131,072` context

Safety fallback:

- `nvidia/nemotron-3-nano-30b-a3b:free`

Reasoning:

- `256,000` context
- still present in current free activity

Deprioritize:

- `meta-llama/llama-3.3-70b-instruct:free`

Reasoning:

- older in this product context
- lower context than several current free alternatives

Avoid as automatic fallback:

- `inclusionai/ling-2.6-1t:free`

Reason:

- it was explicitly observed as going away on `2026-04-30`

### Final Routing Rules

These are the current product decisions:

- first try the user-selected curated free model
- on failure before first token, fall through the curated ladder
- cool down failed models for `5 minutes` from the time of failure
  - cooldown state is in-memory only
  - cooldown resets when the service worker restarts
  - cooldown is per-model, not per-provider
- do not silently jump to `openrouter/free`
- do not switch models after partial output begins
- if the live catalog shows a pinned model disappeared, demote it automatically
- if every model in the curated ladder is in cooldown or known-failed, do not silently fall back to `openrouter/free`; surface the terminal-failure behavior (see Done: All-Providers-Failed Terminal Behavior)

Live catalog refresh:

- fetch on extension install
- fetch on popup open if last successful fetch was more than `24 hours` ago
- background refresh every `24 hours` while the service worker is alive
- a pinned local fallback ladder ships with each extension build, used when the live catalog cannot be fetched
- the pinned local fallback ladder equals the visible curated chain at build time

### Final Product/UI Direction For OpenRouter

Current direction:

- replace the static popup free-model list with a live-aware curated list
- still allow custom model entry
- classify models as something like:
  - stable free
  - experimental free
- show the recommended order visibly so the user understands the fallback path
- `openrouter/free` should not appear as a recommended model
- the app may inspect the OpenRouter key endpoint so it can tell whether the user is in the:
  - `50/day` bucket
  - `1000/day` bucket

OpenRouter planning is considered done for discussion purposes. Remaining work here is implementation detail, not product-direction uncertainty.

---

## Text Branch Position

`Text branch` should be part of the redesign, but not treated like the main problem area.

Current position:

- the `Text branch` is already considered good overall
- it should not receive aggressive stylistic retuning
- it still needs strong output contracts and narrow hardening

What `Text branch` should likely get:

- strict output contract
- smaller prompt footprint
- preservation of explicit deliverables and hard constraints
- no clarifying questions
- no first-person brief framing
- no duplicate trailing summaries
- no source echo
- provider-specific validation and cleanup where needed

What `Text branch` should probably not get:

- broad style changes
- experimental output shaping
- any “make it more creative” style retuning
- Gemma changes

Open question:

- how far the provider-specific layer should go for `Text branch` before it becomes unnecessary complexity

---

## Pending Discussions

These are the main unresolved product conversations and should be treated as active.

### Done: OpenRouter Product Plan

Settled decisions:

- visible cross-provider chain:
  - `Gemini 2.5 Flash`
  - `Gemma`
  - `OpenRouter Free Chain`
- `gemini-2.5-flash-lite` is not in the automatic fallback chain
- visible order should match runtime order
- OpenRouter should use a curated free-model ladder, not random routing
- `openrouter/free` is not the recommended path
- current OpenRouter chain order:
  - `inclusionai/ling-2.6-flash:free`
  - `nvidia/nemotron-3-super-120b-a12b:free`
  - `openai/gpt-oss-20b:free`
  - `nvidia/nemotron-3-nano-30b-a3b:free`

Remaining implementation-detail questions may still exist, but the product decision itself is treated as finished.

### Done: Google Product Plan

The current Google-side product direction is considered settled.

Settled chain:

- `Gemini 2.5 Flash`
  - primary
- `Gemma`
  - fallback 1
- then `OpenRouter Free Chain`
  - fallback 2

Important:

- `gemini-2.5-flash-lite` is not part of the automatic fallback chain
- `gemini-2.5-flash-lite` may remain available as a manual selectable option
- Google provider switching must respect the visible chain already settled in the product

Settled Google-side policy:

- first try `gemini-2.5-flash`
- retry `gemini-2.5-flash` once on clearly transient failure
- if Flash fails before first token with a hard enough provider failure, move to `gemma`
- retry `gemma` once only on clearly transient pre-output failure
- if `gemma` also fails, move to the OpenRouter chain
- never switch providers or models after partial output has started

Failure classes that justify moving from Flash to Gemma:

- repeated rate limiting (HTTP 429 twice within the retry window)
- repeated provider/server errors (HTTP 5xx twice within the retry window)
- model unavailable / model routing issue
- empty or unusable rewrite output after retry
- malformed provider response before usable output

Definition of "empty or unusable rewrite output after retry":

- empty: provider returned 0 content tokens or only whitespace
- unusable: shared validator failed on both first pass and the targeted retry
- malformed: response could not be parsed into a usable text body

Failure classes that do not justify moving from Flash to Gemma:

- output is imperfect but still valid after local repair
- cosmetic defects that deterministic cleanup can fix
- partial output has already begun
- validator failed exactly once (use the targeted retry path, do not switch providers)

Validation-to-fallback coupling rule:

- a single validator failure triggers the targeted retry, not a provider switch
- two validator failures (first pass + retry) on the same call escalate to provider fallback
- the next provider does not inherit the failed prompt; it gets a fresh first-pass call
- when escalating from Gemini to Gemma, the pipeline-isolation rule applies: shared validation does not run against Gemma output, so Gemma's own minimal cleanup is the only enforcement

Google planning tradeoff that was chosen implicitly:

- prioritize a simple, high-quality visible chain over maximum free-tier throughput
- keep `gemini-2.5-flash-lite` out of auto fallback to avoid muddying the product story

Remaining Google implementation details may still exist, but the product decision itself is treated as finished.

### Done: Final Token Budget Policy

The token-budget policy is now settled at the product-direction level.

Definition used here:

- `product-owned token cost`
  - all fixed runtime prompt overhead created by PromptGod
  - system prompt
  - wrapper text
  - rewrite contract text
  - retry instructions
  - provider hints
- it does not include the user's own source text

Core rule:

- PromptGod should cut non-Gemma product-owned prompt overhead by at least `70%` from the current baseline

Final non-Gemma fixed-overhead budgets:

- `LLM branch` first pass
  - hard cap: `1000` tokens
  - target operating range: `700-850`
- `LLM branch` retry pass
  - max one retry
  - hard cap: `220` tokens
  - payload schema:
    - fixed framing prefix (`~40` tokens)
    - up to `3` issue codes from the validator (`~30` tokens)
    - up to `1` failing substring per issue, max `30` chars each (`~80` tokens)
    - retry instruction tail (`~40` tokens)
    - if more than `3` issues fired, surface only the highest-severity `3`
- `Text branch` first pass
  - hard cap: `400` tokens
  - target operating range: `280-360`
- `Text branch` retry pass
  - only on catastrophic invalid output
  - hard cap: `140` tokens
  - payload schema:
    - fixed framing prefix (`~30` tokens)
    - up to `2` issue codes (`~20` tokens)
    - source-text re-anchor (`~60` tokens)
    - retry instruction tail (`~30` tokens)

Provider-budget rule:

- branch type should drive most of the token budget
- provider-specific instructions should only add a small delta
- Google and OpenRouter may have different retry/fallback logic, but they should not carry giant provider essays in the runtime prompt

Runtime prompt rules implied by this budget:

- production prompts should be compact contracts, not long teaching documents
- runtime examples should be removed from non-debug production prompts
- long domain checklists should move to tests, validators, or local logic
- repeated bans and repeated wording should be collapsed
- duplicated constraints across system and user wrapper should be removed
- non-Gemma `[DIFF:]` tags should not be part of the normal production path unless specifically needed in debug/test mode

Rationale for the 70% cut:

- the primary reason is code-quality and pipeline-design clarity, not provider-cost relief
- on Google free-tier, requests usually hit RPM/RPD before TPM, so token cuts do not materially raise the request ceiling
- on OpenRouter, free-model limits are also request-based, not token-based
- the actual benefit of the cut:
  - shorter prompts are easier to reason about and easier to keep correct
  - shorter prompts shift behavior responsibility from soft prompt instructions into deterministic local validation/repair, which is the entire point of the redesign
  - shorter prompts reduce latency on volatile OpenRouter free models
  - shorter prompts make targeted retry payloads cheap enough to use freely
- token cost is a secondary benefit, not the driver

Output-cap stance:

- current output caps are already conservative
- the main budget problem is fixed prompt overhead, not runaway completions

This policy is considered done for product-direction purposes.

### Done: Shared-vs-Separate Architecture Boundary

This is considered settled enough for buildflow planning.

Final boundary:

- share:
  - normalization
  - constraint extraction
  - validation primitives
  - deterministic repair primitives
  - fallback infrastructure
  - regression corpus
- separate by provider:
  - model registry
  - request policy
  - retry logic
  - fallback chain
  - budget policy details
- separate by branch:
  - rewrite-spec builder
  - branch validator
  - branch repair policy
  - branch retry policy

The `Exact Architecture Map` section earlier in this document is the authoritative source for this boundary.

### Done: Scope Control For Text Branch

This is also considered settled enough for buildflow planning.

Allowed `Text branch` work in this stabilization phase:

- reduce fixed prompt overhead to fit the final budget
- add strict output validation
- preserve explicit deliverables and hard constraints
- preserve no-question behavior
- preserve no-source-echo behavior
- preserve no-duplicate-summary behavior
- preserve no-first-person-brief behavior
- add narrow deterministic repair where needed
- add provider-specific hardening only when it protects the existing quality bar

Not allowed in this stabilization phase:

- broad style retuning
- changing the branch into a more “creative” or more verbose product
- adding question-first behavior
- redesigning the feature into something other than selected-text rewrite
- Gemma retuning

Honest acknowledgement of the budget cut:

- Text branch fixed overhead drops from ~`1.35k-1.6k` to a `400` cap
- this is a ~`70%` reduction, identical in magnitude to the LLM branch cut
- this means meaningful behavior responsibility shifts from the prompt into the validator and repair layers
- this is not "narrow hardening" in the sense of leaving the prompt mostly alone
- it is "narrow personality preservation" implemented via compact-contract prompting plus stronger local enforcement
- the branch personality (no-question, no-source-echo, no-brief-framing, deliverable-preservation) is preserved, but the enforcement mechanism shifts

The main principle is:

- `Text branch` should become stricter and lighter, not different in personality

### Done: Regression Corpus Specification

The regression corpus is the main anti-regression defense and must exist before Phase 3 begins.

Source seed:

- existing bug history captured in `claude/Progress.md`, `codex/` notes, and prior commit messages
- all "ugly real prompts" referenced during the recent stabilization effort
- manually curated set of `30-50` adversarial prompts covering each known violation category

Per-entry schema:

- `id` (stable string)
- `branch` (`LLM` or `Text`)
- `source` (the input text)
- `expected_violation_codes` (validator codes that must NOT appear in the rewrite)
- `expected_preserved_constraints` (extracted constraints that must be honored)
- `severity` (`regression-must-not-recur` or `quality-target`)
- `notes` (why this entry exists, originating bug if any)

Run targets:

- the corpus must run against:
  - `LLM branch + Google` path
  - `LLM branch + OpenRouter` path
  - `Text branch + Google` path
  - `Text branch + OpenRouter` path
- Gemma path is exempt because of the pipeline-isolation rule

Acceptance criteria:

- `100%` pass on entries marked `regression-must-not-recur`
- `>= 90%` pass on entries marked `quality-target`
- new entries are added when any new regression is reported
- no entry is removed without a recorded reason

Storage and runner:

- corpus lives under `extension/test/regression/` with one consolidated JSON or one file per entry, decided at Phase 1
- runner is part of the unit-test command set so CI catches regressions

This specification must be locked in Phase 1 before any prompt or pipeline change ships.

### Done: All-Providers-Failed Terminal Behavior

When Gemini, Gemma, and the entire OpenRouter curated chain all fail before producing a usable output, the product behavior is:

- do not silently jump to `openrouter/free`
- do not return a placeholder or partial rewrite
- do not silently return the original source text as if nothing happened
- surface a clear in-product error with:
  - a one-line cause summary (e.g. "all providers rate-limited" or "no provider responded")
  - a manual retry button
  - a hint to switch models if the user has a custom model set
- log the full failure chain (which providers were tried, which class of failure each had) for diagnosis

Definition of "all providers failed":

- Gemini Flash failed twice (per the targeted retry rule)
- Gemma failed twice (frozen path's existing retry)
- every model in the OpenRouter curated ladder failed once or is in cooldown

The terminal-failure UI must be reachable in `< 1 second` from the moment the chain decides it is exhausted.

### Done: Production vs Debug Prompt Modes

Token-budget compliance requires removing examples and teaching content from production prompts. To preserve developer ergonomics, prompts ship in two modes:

- `production`
  - shipped to end users
  - examples removed
  - long teaching language collapsed
  - `[DIFF:]` and similar debug tags excluded
  - subject to the hard token-budget caps
- `debug`
  - used in local dev and tests only
  - may include examples, longer rationale, and `[DIFF:]` tags
  - not subject to the production token-budget caps
  - never reaches end users

Switching mechanism:

- build-flag based, not runtime-toggle based
- production builds compile out debug-only prompt content
- the regression corpus runs against the production-mode prompts (not debug-mode)

This avoids a runtime branch that could leak debug content into a user-facing call.

### Done: OpenRouter Primary Eval Gate

Before any OpenRouter free model is shipped as the default primary in the curated chain, it must pass an eval gate.

Eval gate definition:

- run the locked regression corpus against the candidate model on both branches
- require:
  - `100%` pass on `regression-must-not-recur` entries
  - `>= 85%` pass on `quality-target` entries
- record the eval result with the model id, date, and corpus version
- demote the model from primary if a re-run drops below threshold

Application to current chain:

- `inclusionai/ling-2.6-flash:free` is currently named primary on research signals only
- it must pass the eval gate in Phase 6 before being shipped as the user-facing default
- if it fails, promote `nvidia/nemotron-3-super-120b-a12b:free` to primary and re-eval
- if both fail, fall back to `openai/gpt-oss-20b:free` as primary

This eval gate is the only acceptable mechanism for choosing the OpenRouter primary.

### Done: Module Layout Commitment

The proposed module layout in `Recommended Module Layout` is committed as the target structure for Phase 2 onwards.

Final committed layout:

- `extension/src/lib/rewrite-core/`
  - `types.ts`
  - `normalize.ts`
  - `constraints.ts`
  - `validate.ts`
  - `repair.ts`
  - `fallback.ts`
- `extension/src/lib/rewrite-google/`
  - `models.ts`
  - `request-policy.ts`
  - `retry-policy.ts`
  - `budget-policy.ts`
- `extension/src/lib/rewrite-openrouter/`
  - `catalog.ts`
  - `curation.ts`
  - `route-policy.ts`
  - `budget-policy.ts`
  - `account-status.ts`
- `extension/src/lib/rewrite-llm-branch/`
  - `spec-builder.ts`
  - `validator.ts`
  - `retry.ts`
- `extension/src/lib/rewrite-text-branch/`
  - `spec-builder.ts`
  - `validator.ts`
  - `repair.ts`

Migration rule:

- existing files (`meta-prompt.ts`, `context-enhance-prompt.ts`, `llm-client.ts`) stay in place during migration
- they are deleted only when their last responsibility has moved into the new layout
- no parallel "old + new" code path may stay in production for more than one phase

Reason:

- this layout is the only one analyzed in detail; alternatives would require fresh architecture work
- committing now removes ambiguity from buildflow phasing
- keeping existing files until last-responsibility-move avoids partial-migration regressions

### Buildflow Readiness

The product-direction discussion is now mature enough to create the buildflow.

Current judgment:

- there are no critical product-direction blockers left before buildflow creation
- the next document should be an implementation/buildflow document, not more product vision text
- remaining uncertainty is implementation-level and belongs inside phased execution, acceptance gates, and verification plans

Gaps closed during the 2026-04-25 critique pass:

- Gemma's role in the new pipeline (pipeline-isolation rule)
- visible chain tier annotation (Gemma as best-effort tier)
- constraint extraction mechanism and precision/recall stance
- repair UX policy and divergence threshold rule
- targeted retry payload schema for both branches
- definition of "empty or unusable rewrite output"
- validation-to-fallback coupling rule
- honest rationale for the 70% token cut
- honest acknowledgement of the Text branch budget cut
- OpenRouter cooldown duration, scope, and reset policy
- OpenRouter live catalog refresh lifecycle
- OpenRouter account-status awareness moved from pending to in-scope
- regression corpus seed, schema, run targets, acceptance criteria, storage
- all-providers-failed terminal behavior
- production vs debug prompt modes
- OpenRouter primary eval gate
- module layout committed with migration rule

Fresh-eyes review guidance for another model:

- read this file as the product truth source
- do not reopen already settled provider-chain decisions without strong evidence
- treat the token budgets as hard guardrails, not suggestions
- create the buildflow from this file, not from fragmented chat history

Recommended buildflow file:

- `codex/buildflow.md`

Reason:

- `productvision.md` should remain the stable product-truth document
- `buildflow.md` should contain phased execution, dependencies, acceptance gates, and rollout order

What the buildflow should include:

- phase 1: acceptance criteria and regression corpus lock
- phase 2: shared rewrite-core pipeline
- phase 3: `LLM branch` migration to compact-contract prompting
- phase 4: `Text branch` hardening within the narrow allowed scope
- phase 5: Google-specific layer alignment with the settled chain
- phase 6: OpenRouter-specific live-catalog and curated-chain work
- phase 7: UI alignment so visible model order matches runtime order
- phase 8: verification, manual eval matrix, and rollout safety checks

This means:

- yes, PromptGod is at the stage where buildflow creation is appropriate
- no further product-direction discussion is required before that, unless a new hard constraint is introduced

---

## Recommended Resume Order

If resuming this discussion later, do not restart from first principles.

Recommended order:

1. Re-check whether any provider model/rate-limit facts have changed.
2. Ask a fresh model or reviewer to critique this file if desired.
3. Create `codex/buildflow.md`.
4. Translate the settled product direction into phased implementation work.

Suggested immediate resume questions:

- Is the buildflow phased in the safest order for a no-regression rollout?
- Are the acceptance gates strong enough to catch prompt regressions before implementation spreads?

---

## Sources Referenced During Discussion

These sources informed the current planning direction and should be re-checked if the discussion resumes much later.

Google:

- Gemini API rate limits:
  - <https://ai.google.dev/gemini-api/docs/rate-limits>
- Gemini 2.5 Flash:
  - <https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash>
- Gemini 2.5 Flash-Lite:
  - <https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite>
- Gemma on Gemini API:
  - <https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api>

OpenRouter:

- Limits:
  - <https://openrouter.ai/docs/api/reference/limits>
- Free models router docs:
  - <https://openrouter.ai/docs/guides/routing/routers/free-models-router>
- Free router page:
  - <https://openrouter.ai/openrouter/free>
- Specific free model pages reviewed during discussion:
  - <https://openrouter.ai/inclusionai/ling-2.6-flash%3Afree>
  - <https://openrouter.ai/inclusionai/ling-2.6-1t%3Afree>
  - <https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b%3Afree>
  - <https://openrouter.ai/nvidia/nemotron-3-nano-30b-a3b%3Afree>
  - <https://openrouter.ai/openai/gpt-oss-20b%3Afree>
  - <https://openrouter.ai/meta-llama/llama-3.3-70b-instruct%3Afree>
  - <https://openrouter.ai/google/gemma-3-27b-it%3Afree>

Token estimation reference used in discussion:

- OpenAI token counting guide:
  - <https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-do-i-count-them>

---

## Next Documenting Advice

If this file is updated in later sessions:

- keep exact dates when provider facts are re-verified
- separate confirmed facts from product opinions
- mark any changed recommendation clearly
- preserve unresolved discussions instead of silently overwriting them
