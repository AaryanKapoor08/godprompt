# PromptGod — Codex Progress

Last updated: 2026-04-09

This file is a Codex handoff log for the current workspace. It is intentionally shorter than `claude/Progress.md` and focused on what changed in the latest working session so the next Codex window can resume quickly.

---

## Current Focus

Google / Gemini / Gemma reliability hardening for the Chrome extension.

Primary outcome of this session:
- `gemini-2.5-flash` now works end-to-end in the extension.
- Gemma support was added and then hardened after Gemma-specific failures.
- Silent spinner-only failures on the Google path were reduced and surfaced better.

---

## What Was Done Today

### 1. Researched Google support and free-tier viability

Confirmed from official Google docs on 2026-04-09:
- Gemini API can be used from environments that support HTTP requests, including this BYOK extension architecture.
- `gemini-2.5-flash` and `gemini-2.5-flash-lite` are on the free tier.
- Gemma is available through the Gemini API.
- Current hosted Gemma docs list:
  - `gemma-4-31b-it`
  - `gemma-4-26b-a4b-it`
- Gemini pricing page shows Gemma 4 as free-tier.

Important conclusion:
- BYOK with a user-supplied Google API key is viable.
- A shared embedded key would still be a bad idea; the extension should keep BYOK.

---

### 2. Fixed the Google request path for Gemini models

Updated:
- `extension/src/lib/llm-client.ts`
- `extension/src/popup/popup.ts`
- `extension/src/lib/provider-policy.ts`

Key fixes:
- Google requests now use `x-goog-api-key` header consistently.
- `listGoogleModels()` uses header auth.
- `callGoogleAPI()` retries transient Google failures (`429`, `500`, `503`).
- Google model fallback chain now prefers:
  1. requested model
  2. `gemini-2.5-flash`
  3. `gemini-2.5-flash-lite`
- For `gemini-2.5-flash`, rewrite requests disable thinking via `thinkingBudget: 0` to reduce latency and overthinking.
- Popup provider detection now reuses shared `validateApiKey()` logic instead of drifting from backend logic.
- Google provider defaults were updated from stale 1.5-era entries to current 2.5-era entries.

Why this mattered:
- The previous Google path was more brittle and too slow for rewrite use.
- The popup and backend had inconsistent provider detection behavior.

---

### 3. Fixed the Gemini “spinner then nothing” bug

Updated:
- `extension/src/content/ui/trigger-button.ts`

Root cause:
- Google’s one-shot response path could send `TOKEN`, `DONE`, and `SETTLEMENT` so quickly that the content script settled before the animation-frame render loop committed the final text into the page.

Fix:
- Added a final-output commit path before settlement.
- This ensures fast one-shot providers still write the final enhanced prompt into the input field.

Result:
- User confirmed `gemini-2.5-flash` works after this fix.

---

### 4. Added Gemma 4 models to the extension

Updated:
- `extension/src/popup/popup.ts`
- `extension/src/lib/provider-policy.ts`
- `extension/src/lib/llm-client.ts`

Added visible Google model options:
- `gemma-4-31b-it`
- `gemma-4-26b-a4b-it`

Also added:
- model alias normalization for `gemma-4` variants
- saved-model preservation in the popup so Google-exposed model IDs do not get reset just because they are not hardcoded yet

---

### 5. Fixed the Gemma request-shape problem

Updated:
- `extension/src/lib/llm-client.ts`
- `extension/src/service-worker.ts`
- `extension/src/content/ui/trigger-button.ts`

Observed problem:
- After Gemma was added, the button could spin and then stop with no useful visible result.

Likely root cause:
- Gemma-on-Gemini behaved differently from Gemini 2.5 Flash when given a separate `systemInstruction`.
- Service-worker port shutdown was also tight enough to risk swallowing final messages on fast paths.

Fixes:
- Added Gemma-specific Google request body builder:
  - for Gemma models, do not send `systemInstruction`
  - instead fold the instruction into the user content
- Delayed `port.disconnect()` slightly in the service worker via `disconnectPortSoon()`
- Added a visible warning if a model finishes without returning rewrite text

Why this mattered:
- Google’s hosted Gemma docs show simple content-based requests.
- Flash tolerated the bigger instruction structure better than Gemma.

---

### 6. Fixed Gemma output leaking internal analysis

Updated:
- `extension/src/lib/meta-prompt.ts`
- `extension/src/lib/llm-client.ts`
- `extension/src/service-worker.ts`

Observed problem from real user output:
- Gemma sometimes returned scratchpad-like text such as:
  - prompt analysis
  - domain/intent notes
  - draft notes
  - then the final rewritten prompt

Root cause:
- Gemma was being asked to follow a long, example-heavy rewrite policy originally tuned for stronger system-role models.
- Because Gemma no longer received a true separate system role, it was more likely to expose the internal reasoning structure.

Fixes:
- Added a compact Gemma-specific meta prompt:
  - no long examples
  - no “internal process” section
  - direct output contract only
- Added Gemma response sanitization:
  - if Gemma leaks analysis, keep the final prompt
  - keep `[DIFF: ...]` if present
  - strip the scratchpad-style prefix

Expected result:
- Gemma should now behave much closer to Flash for rewrite tasks.
- It may still be slower than Flash simply because it is a heavier model.

---

## Files Changed This Session

- `extension/src/lib/llm-client.ts`
- `extension/src/popup/popup.ts`
- `extension/src/lib/provider-policy.ts`
- `extension/src/content/ui/trigger-button.ts`
- `extension/src/service-worker.ts`
- `extension/src/lib/meta-prompt.ts`
- `extension/test/unit/google-api.test.ts`
- `extension/test/unit/validate-api-key-comprehensive.test.ts`
- `extension/test/unit/meta-prompt.test.ts`

Also added:
- `codex/Progress.md`

---

## Verification Performed

Verified during this session:
- targeted Google/Gemma tests passed
- targeted meta-prompt tests passed
- production build passed

Latest successful checks run:

```powershell
cd extension
npm test -- --run test/unit/google-api.test.ts test/unit/provider-policy.test.ts test/unit/validate-api-key-comprehensive.test.ts test/unit/meta-prompt.test.ts
npm run build
```

At the end of the session:
- tests passed
- build passed
- user confirmed `gemini-2.5-flash` works

---

## Current Status

### Working

- Google API key detection in popup
- Gemini 2.5 Flash rewrite flow
- Gemini 2.5 Flash Lite fallback flow
- final-text commit for fast Google responses
- Gemma 4 models exposed in popup
- Gemma-specific prompt path and response cleanup implemented

### Needs Final Manual Validation

- Re-test `gemma-4-31b-it` after reload with the latest changes
- Re-test `gemma-4-26b-a4b-it`
- Compare quality / latency vs `gemini-2.5-flash`

Important:
- The final Gemma hardening code was implemented and verified by tests/build, but the user has not yet confirmed the post-fix Gemma behavior in the browser.

---

## Recommended Next Step

Reload the unpacked extension and refresh the target AI tab, then test:

1. `gemma-4-31b-it`
2. `gemma-4-26b-a4b-it`
3. `gemini-2.5-flash` as control

Use the same short prompt for comparison:

```text
how to learn java
```

Check for:
- whether the prompt is rewritten at all
- whether analysis leakage is gone
- whether response time is acceptable
- whether `[DIFF:]` is stripped from the DOM as expected

---

## If Gemma Still Fails Next Session

If the user reports another Gemma failure, ask for the exact visible result and then inspect:

1. The toast or lack of toast
2. The final inserted text
3. Service worker console logs on the Google path

Most likely next debug branches:
- Gemma still returns low-quality text, but not silent failure
- Gemma returns text that sanitization does not fully clean
- Gemini page DOM replacement differs for long one-shot outputs

---

## Resume Commands

From repo root:

```powershell
cd extension
npm test -- --run test/unit/google-api.test.ts test/unit/provider-policy.test.ts test/unit/validate-api-key-comprehensive.test.ts test/unit/meta-prompt.test.ts
npm run build
```

If you need a quick diff review first:

```powershell
git diff -- extension/src/lib/llm-client.ts extension/src/service-worker.ts extension/src/content/ui/trigger-button.ts extension/src/lib/meta-prompt.ts extension/src/popup/popup.ts
```

---

## Notes

- The repo already has a much larger long-term tracker in `claude/Progress.md`.
- This file is intended as a short Codex session handoff, not a replacement for the full project tracker.
