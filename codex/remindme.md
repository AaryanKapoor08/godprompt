Read `AGENTS.md`, then `codex/productvision.md`, `codex/buildflow.md`, and `codex/Progress.md` first.
Phase 12 context isolation was implemented: standalone prompts now omit recent chat context unless they explicitly reference prior context.
`INTRODUCED_UNRELATED_CONTEXT` was added to catch cross-prompt contamination such as MongoDB terms leaking into launch triage prompts.
Gemini 2.5 Flash launch/MongoDB contamination looked fixed in manual testing, but one final browser retest is still worth doing.
Optimistic streaming was restored for the non-Gemma LLM branch so Gemini 2.5 Flash should start typing into the composer quickly again.
The final streamed text is still validated/repaired and can be replaced with the clean final output.
Manual testing left: LLM branch streaming feel, final Flash launch/MongoDB isolation check, Text branch context-contamination spot checks, and Nano probation retest.
Gemma remains frozen unless explicitly reopened.
