# Feature Specification: PromptGod Reliability Hardening v2.0
 
**Feature Branch**: `008-reliability-hardening-v2`  
**Created**: 2026-04-08  
**Status**: Draft  
**Input**: User request for reliability hardening focused on production bugfixes and deterministic behavior across multiple LLM platforms.
 
## User Scenarios & Testing *(mandatory)*
 
### User Story 1 - Reliable Request Lifecycle (Priority: P1)
 
The user triggers a prompt enhancement and expects a deterministic outcome (success or actionable error) without the UI hanging.
 
**Why this priority**: Infinite loaders and "silent" failures are the most critical blockers for user trust and usability.
 
**Independent Test**: Trigger enhancements across all supported platforms (ChatGPT, Claude, Gemini, Perplexity) and verify that every request settles with either the enhanced text or a friendly error message within a bounded timeout.
 
**Acceptance Scenarios**:
 
1. **Given** a slow or failing API response, **When** the enhancement is triggered, **Then** the spinner MUST disappear and a friendly error MUST appear after the timeout threshold is reached.
2. **Given** a "stream ended before tokens" error (common in non-o4-mini models), **When** the stream terminates prematurely, **Then** the system MUST detect the partial response and either attempt a deterministic retry or provide a clear "Partial response" warning with an option to retry.
3. **Given** an enhancement that fails to start, **When** triggered, **Then** the system MUST NOT remain in a loading state indefinitely.
 
---
 
### User Story 2 - Transparent Provider & Key Management (Priority: P1)
 
The user configures their API keys and expects clear feedback on validity and provider support.
 
**Why this priority**: Incorrect key validation and unclear provider policies prevent users from successfully using the tool.
 
**Independent Test**: Input various key types (OpenRouter, direct OpenAI, invalid strings) and verify that the UX provides immediate, clear, and accurate validation feedback.
 
**Acceptance Scenarios**:
 
1. **Given** a non-OpenRouter key, **When** entered, **Then** the system MUST either validate it against a supported provider list (OpenAI, Anthropic, Google) or explicitly reject it with guidance on using OpenRouter.
2. **Given** an OpenRouter key, **When** viewing model lists, **Then** the user MUST be able to clearly distinguish between free and paid models.
3. **Given** an invalid key, **When** used, **Then** the error message MUST be a polished, human-readable explanation rather than a raw JSON payload.
 
---
 
### User Story 3 - Persistent Model Configuration (Priority: P2)
 
The user selects a preferred model and expects it to remain selected across different sessions and error states.
 
**Why this priority**: Constant resetting to a default model (e.g., Nemotron) is a significant friction point.
 
**Independent Test**: Select a specific model, trigger a failing request, reopen the popup, and verify the selected model is still active.
 
**Acceptance Scenarios**:
 
1. **Given** a selected model, **When** an error occurs during enhancement, **Then** the model selection MUST NOT reset to the default.
2. **Given** a selected model, **When** the popup is closed and reopened, **Then** the previously selected model MUST be persisted.
3. **Given** the model selection screen, **When** viewing hints, **Then** the recommended model MUST align with current real-world reliability data.
 
---
 
### User Story 4 - Text Integrity & Platform Precision (Priority: P2)
 
The user receives enhanced text and expects it to be formatted correctly and integrated seamlessly into the target platform.
 
**Why this priority**: Spacing issues and duplication (especially on Perplexity) degrade the quality of the output.
 
**Independent Test**: Run enhancements on Perplexity and other platforms, verifying that the original text is replaced exactly once without duplication or spacing corruption.
 
**Acceptance Scenarios**:
 
1. **Given** a Perplexity prompt, **When** the rewrite is applied, **Then** the system MUST overwrite the original text and MUST NOT duplicate the rewritten prompt.
2. **Given** any enhanced output, **When** inserted into the DOM, **Then** the system MUST ensure no broken spacing or joined words are introduced.
 
---
 
### User Story 5 - Resilient LLM Interactions (Priority: P2)
 
The user utilizes a variety of models (including free tiers) and expects a consistent experience.
 
**Why this priority**: Inconsistent reliability of free models or specific provider quirks (like OpenRouter no-token) leads to unpredictable UX.
 
**Independent Test**: Trigger requests using Gemma free models and OpenRouter models that may return no tokens, verifying the retry/fallback logic.
 
**Acceptance Scenarios**:
 
1. **Given** an OpenRouter "no-token" failure, **When** detected, **Then** the system MUST follow a deterministic retry/fallback policy before surfacing an error.
2. **Given** a Gemma free model, **When** used, **Then** the system MUST handle the specific reliability patterns of that model to ensure a successful settlement.
 
---
 
## Requirements *(mandatory)*
 
### Functional Requirements
 
- **FR-001**: System MUST implement a global request timeout that forces a settlement (DONE or ERROR) for all enhancements.
- **FR-002**: System MUST implement a "Save" mechanism for model preferences that persists across popup sessions and error paths.
- **FR-003**: System MUST validate API keys against a defined Provider Policy (OpenRouter primary, explicit support/rejection for others) with clear UX copy.
- **FR-004**: System MUST implement a text normalization pass to prevent joined words and spacing corruption during DOM insertion.
- **FR-005**: System MUST implement a dedicated Perplexity overwrite strategy that explicitly prevents prompt duplication.
- **FR-006**: System MUST intercept all raw provider JSON errors and translate them into a mapped list of human-friendly, actionable messages.
- **FR-007**: System MUST implement a retry boundary for OpenRouter no-token failures to prevent infinite loops while ensuring resilience.
- **FR-008**: System MUST synchronize all failing tests with the intended product behavior defined in this spec.
 
### Key Entities *(include if feature involves data)*
 
- **ProviderPolicy**: Configuration defining supported keys, validation regexes, and associated UX guidance.
- **ModelPreference**: Persistent storage object containing the user's selected model and the associated provider.
- **RequestSettlement**: State machine tracking the lifecycle of an enhancement (Pending $\rightarrow$ Streaming $\rightarrow$ Done/Error).
 
## Success Criteria *(mandatory)*
 
### Measurable Outcomes
 
- **SC-001**: 100% of requests settle (no infinite loading states) within the defined timeout.
- **SC-002**: 0% raw JSON error leakage to the user interface.
- **SC-003**: 100% of model preference selections persist across popup re-opens and error states.
- **SC-004**: 0% duplicated text insertions on the Perplexity platform.
- **SC-005**: All existing regression tests for the listed bug scope pass.
 
## Assumptions
 
- **BYOK Architecture**: It is assumed that users will provide their own keys; no proxy backend will be introduced.
- **Streaming Protocol**: It is assumed that `chrome.runtime.connect` remains the primary communication channel.
- **Platform Stability**: It is assumed that the underlying target platforms (ChatGPT, etc.) do not change their DOM structure significantly during this hardening phase.
 
## Constitution Alignment *(mandatory)*
 
- **Core Law Adherence**: This feature directly implements "Streaming Determinism" (bounded timeouts) and "Actionable Errors" (no raw JSON). It reinforces "Architecture & Security" by maintaining the BYOK-only boundary.
- **Mode Protocol Application**: This is a **Bugfix Mode** release. It follows the required sequence: reproducing the spinner/duplication bugs, isolating the root cause in the platform adapters, and implementing minimal patches with mandatory regression tests.
- **High-Risk Safeguards**: Implements explicit controls for "Spinner Settlement", "OpenRouter no-token behavior", and "Perplexity overwrite duplication".
- **DoD Verification**: Success is defined by the Bugfix DoD: reproducible before-state documented, regression tests added, and validated across affected and unaffected platforms.
