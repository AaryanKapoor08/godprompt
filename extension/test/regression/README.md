# PromptGod Regression Corpus

This directory locks the Phase 1 regression corpus for the non-Gemma rewrite stabilization plan.

Add/remove policy:
- Add a new entry whenever a real regression is reported or a new known failure shape is discovered.
- Every new entry must include a recorded reason in `notes`.
- Do not remove an entry without recording why it is safe to remove in the commit or follow-up handoff.
- Keep entries provider-neutral unless the failure only applies to one provider family.
- Gemma targets are intentionally excluded from this corpus by the pipeline-isolation rule.

Per-entry schema:

```json
{
  "id": "stable-kebab-case-id",
  "branch": "LLM",
  "source": "Original prompt or selected text.",
  "expected_violation_codes": ["DROPPED_DELIVERABLE"],
  "expected_preserved_constraints": ["preserve explicit deliverables"],
  "severity": "regression-must-not-recur",
  "notes": "Why this entry exists."
}
```

Allowed branches:
- `LLM`
- `Text`

Allowed severities:
- `regression-must-not-recur`
- `quality-target`

The runner expands applicable entries across four non-Gemma targets:
- `LLM + Google`
- `LLM + OpenRouter`
- `Text + Google`
- `Text + OpenRouter`

