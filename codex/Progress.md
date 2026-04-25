# PromptGod — Codex Progress

Last updated: 2026-04-24

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
