# OpenRouter Primary Eval Gate

- Date: 2026-04-26
- Model: `inclusionai/ling-2.6-flash:free`
- Corpus: locked regression corpus under `extension/test/regression/entries/`
- Result: BLOCKED

The live eval was attempted with the developer-provided OpenRouter key, using only the free model id above and no paid fallback.

The first run hit OpenRouter's free-model-per-minute limit. The harness was updated to throttle requests.

The throttled rerun then hit OpenRouter's `free-models-per-day` cap:

- account bucket observed from provider response: `50/day`
- provider message: free-model daily limit reached
- no paid model was used
- no `openrouter/free` fallback was used
- no result is recorded as passing

Phase 7's OpenRouter Primary Eval Gate remains open until the corpus can be completed after the daily free quota resets, or with a dev account that has the `1000/day` free-model bucket.

## Second free-key probe — 2026-04-26

A newly provided free OpenRouter key was checked without storing it in the repo.

- `/api/v1/key` request succeeded
- key was valid and free-tier
- usage fields reported `0`
- one primary-model generation probe against `inclusionai/ling-2.6-flash:free` was attempted
- provider returned `free-models-per-day`
- `X-RateLimit-Limit`: `50`
- `X-RateLimit-Remaining`: `0`
- `X-RateLimit-Reset`: `2026-04-27 00:00:00 UTC`

Conclusion:
- the new key does not unblock the eval today
- the free-model daily bucket is still exhausted
- no full corpus eval was run with this key
- no paid model or `openrouter/free` fallback was used

## Resumption

When a working OpenRouter key is available (`1000/day` bucket preferred, or `50/day` after the daily reset):

```powershell
cd extension
$env:OPENROUTER_API_KEY = "sk-or-..."
npm run eval:openrouter
```

The harness lives at `extension/test/regression/openrouter-primary-eval.test.ts`. It reads `OPENROUTER_API_KEY` from the environment, throttles requests at `~4.5s` spacing, runs the locked corpus under `extension/test/regression/entries/` against `OPENROUTER_PRIMARY_FREE_MODEL` (currently `inclusionai/ling-2.6-flash:free`), and appends the result to this file.

If the eval passes, mark the Phase 7 and Phase 9 OpenRouter eval-gate boxes `[x]` in `codex/buildflow.md` and record model id, date, and corpus version here.
