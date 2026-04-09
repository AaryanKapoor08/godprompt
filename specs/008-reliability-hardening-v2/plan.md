# Implementation Plan: PromptGod Reliability Hardening v2.0
 
**Branch**: `008-reliability-hardening-v2` | **Date**: 2026-04-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-reliability-hardening-v2/spec.md`
 
## Summary
 
This release focuses on production reliability and regression prevention. The primary goal is to eliminate "silent" failures (infinite spinners), fix critical platform-specific bugs (Perplexity duplication), and ensure a deterministic user experience across all supported LLM providers by implementing a robust request lifecycle and strict error translation.
 
## Technical Context
 
**Language/Version**: TypeScript (Chrome Extension MV3)  
**Primary Dependencies**: Chrome Extension API (`chrome.storage`, `chrome.runtime`), Fetch API  
**Storage**: `chrome.storage.local`  
**Testing**: Unit tests for core logic, Manual Smoke Matrix for platform adapters  
**Target Platform**: Chrome Browser (ChatGPT, Claude, Gemini, Perplexity)
**Project Type**: Chrome Extension  
**Performance Goals**: Settlement of all requests within a bounded timeout (e.g., 30s).
**Constraints**: BYOK-only architecture; No backend; Content-script to Service-worker communication via ports.
**Scale/Scope**: High reliability across 4 major AI platforms.
 
## Constitution Check
 
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design. Verify operational mode (Feature/Bugfix/Stabilization).*
 
**Mandatory Verification**:
- [x] **Core Law Compliance**: Design ensures secret safety (storage.local), streaming determinism (global timeouts), and causal context preservation.
- [x] **Mode Protocol**: Operating in **Bugfix Mode**. Sequence: Reproduce $\rightarrow$ Isolate $\rightarrow$ Patch $\rightarrow$ Regression Test.
- [x] **High-Risk Controls**: Explicitly addresses Spinner Settlement, OpenRouter no-token behavior, and Perplexity duplication.
- [x] **DoD Alignment**: Bugfix DoD adopted: Reproducible state $\rightarrow$ Root cause $\rightarrow$ Regression test $\rightarrow$ Validation.
 
**Outcome**: PASS
 
## Project Structure
 
### Documentation (this feature)
 
```text
specs/008-reliability-hardening-v2/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```
 
### Source Code (repository root)
 
```text
src/
├── background/          # Service worker, streaming logic, timeout management
├── content/             # Platform adapters, DOM manipulation, spinner control
├── popup/               # Model selection, key validation UI
└── lib/                 # ErrorTranslator, ProviderPolicy, TextUtils
```
 
**Structure Decision**: Maintain existing extension structure. Add `lib/` utilities for centralized policy and error management.
 
## Technical Approach by Bug Cluster
 
### 1. Streaming Lifecycle & Settlement
- **Strategy**: Implement a `RequestSupervisor` in the service worker that wraps `chrome.runtime.connect` ports. It will start a timer upon connection; if no `DONE` or `ERROR` signal is received within the threshold, it forces an `ERROR` settlement and closes the port.
- **Spinner Fix**: Content scripts must listen for a specific `SETTLEMENT` event from the service worker to guarantee the spinner is hidden regardless of the outcome.
 
### 2. Provider & Key Validation
- **Strategy**: Define a `ProviderPolicy` map (Regex for keys, supported models list).
- **UX**: Update the key input field to provide real-time validation. If a key is recognized as a direct provider (e.g., OpenAI) but the system is configured for OpenRouter, provide a clear "Provider Mismatch" warning.
 
### 3. Model Persistence & Save Semantics
- **Strategy**: Implement a `PreferenceManager` using `chrome.storage.local`. 
- **Logic**: Every model selection event triggers an immediate async write. The popup `onLoad` event retrieves the last saved model. Ensure errors in the streaming process do not trigger a "reset to default" in the state management.
 
### 4. Text Integrity & Perplexity Fix
- **Strategy**: 
  - **Perplexity**: Modify the adapter to perform a "Hard Reset" of the input field (clear all text $\rightarrow$ focus $\rightarrow$ insert) to prevent duplication.
  - **Normalization**: Pass all generated text through a `TextNormalization` utility to fix common spacing/word-join issues before DOM insertion.
 
### 5. Error Translation & Guidance
- **Strategy**: Implement `ErrorTranslator`. This service will take raw provider responses (JSON) and match them against a known error map (e.g., "401" $\rightarrow$ "Your API key is invalid. Please check your settings.").
 
### 6. OpenRouter Resilience
- **Strategy**: Implement a capped retry loop (max 3 attempts) for "no-token" responses. If failure persists, fall back to a "safe" model (e.g., o4-mini) or surface a polished error.
 
## Risk Matrix
 
| Bug Cluster | User Impact | Regression Risk | Rollback Strategy |
|-------------|-------------|-----------------|-------------------|
| Streaming   | High (Hangs) | Medium          | Revert timeout value |
| Key Valid.  | High (Blocked)| Low             | Revert to simple regex |
| Persistence | Medium (Annoyance)| Low        | Clear storage.local |
| Perplexity  | Medium (UI)  | Medium          | Revert adapter logic |
| Error Map   | Medium (UX)  | Low             | Revert to raw output |
 
## Test Strategy
 
- **Unit Tests**: 
  - `ErrorTranslator`: Verify raw JSON $\rightarrow$ Friendly string mappings.
  - `ProviderPolicy`: Verify key regexes for all supported providers.
  - `TextNormalization`: Test with broken spacing/joined word samples.
  - `RetryPolicy`: Verify max retry count and fallback logic.
- **Integration Tests**: 
  - Mock service worker ports to simulate timeouts and verify spinner settlement.
- **Manual Smoke Matrix**: 
  - Test on ChatGPT, Claude, Gemini, and Perplexity using both free and paid models.
 
## Migration & Compatibility
- **Settings**: Existing keys in `chrome.storage.local` are preserved.
- **Provider Policy**: Users with previously "valid" (but technically incorrect) keys will be prompted to re-validate upon the first use of the new version.
 
## Release Validation Checklist
- [ ] No infinite loading states across all 4 platforms.
- [ ] All raw JSON errors replaced by friendly messages.
- [ ] Model selection persists after popup close/reopen.
- [ ] Perplexity output is a clean overwrite (no duplication).
- [ ] All regression tests for listed bugs pass.
- [ ] Build passes and no secret leakage in logs.
