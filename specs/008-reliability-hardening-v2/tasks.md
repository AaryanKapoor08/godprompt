---
description: "Task list template for feature implementation"
---

# Tasks: PromptGod Reliability Hardening v2.0

**Input**: Design documents from `/specs/008-reliability-hardening-v2/`
**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: Mandatory for this feature set. All implementation tasks must be preceded by corresponding tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and utility foundations

- [ ] T001 [P] Create `src/lib/` directory for centralized reliability utilities
- [ ] T002 [P] Define `ProviderPolicy` types and initial map in `src/lib/provider-policy.ts`
- [ ] T003 [P] Implement `TextNormalization` utility in `src/lib/text-utils.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before any user story can be implemented

- [ ] T004 [P] Implement `ErrorTranslator` service in `src/lib/error-translator.ts`
- [ ] T005 [P] Implement `PreferenceManager` for `chrome.storage.local` in `src/lib/preferences.ts`
- [ ] T006 Implement `RequestSupervisor` logic in `src/background/supervisor.ts` to manage port timeouts
- [ ] T007 Update service worker to dispatch `SETTLEMENT` events in `src/background/index.ts`

**Checkpoint**: Foundational infrastructure ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Reliable Request Lifecycle (Priority: P1) 🎯 MVP

**Goal**: Eliminate infinite loading states and ensure deterministic settlement.
**Independent Test**: Verify all requests on all platforms settle within timeout.

### Tests for User Story 1
- [ ] T008 [P] Write unit test for `RequestSupervisor` timeout logic in `tests/unit/supervisor.test.ts`
- [ ] T009 [P] Write integration test for service worker port settlement in `tests/integration/streaming.test.ts`

### Implementation for User Story 1
- [ ] T010 [US1] Integrate `RequestSupervisor` with active streaming ports in `src/background/streaming.ts`
- [ ] T011 [US1] Implement `SETTLEMENT` event listener in all platform adapters in `src/content/adapters/`
- [ ] T012 [US1] Ensure spinner is hidden on `SETTLEMENT` event in `src/content/ui-manager.ts`
- [ ] T013 [US1] Implement partial response detection for "stream ended" errors in `src/background/streaming.ts`

---

## Phase 4: User Story 2 - Transparent Provider & Key Management (Priority: P1)

**Goal**: Clear key validation and provider support UX.
**Independent Test**: Verify immediate and accurate feedback for various key types.

### Tests for User Story 2
- [ ] T014 [P] Write unit tests for `ProviderPolicy` regex validation in `tests/unit/provider-policy.test.ts`
- [ ] T015 [P] Write unit tests for `ErrorTranslator` mappings in `tests/unit/error-translator.test.ts`

### Implementation for User Story 2
- [ ] T016 [US2] Implement real-time key validation in popup UI in `src/popup/settings.tsx`
- [ ] T017 [US2] Add "Provider Mismatch" warning for non-OpenRouter keys in `src/popup/settings.tsx`
- [ ] T018 [US2] Add visual indicators for Free vs Paid models in `src/popup/model-selector.tsx`
- [ ] T019 [US2] Integrate `ErrorTranslator` into the error display pipeline in `src/popup/error-view.tsx`

---

## Phase 5: User Story 3 - Persistent Model Configuration (Priority: P2)

**Goal**: Persistence of model selection across sessions and errors.
**Independent Test**: Select model $\rightarrow$ error $\rightarrow$ reopen popup $\rightarrow$ verify selection.

### Tests for User Story 3
- [ ] T020 [P] Write unit tests for `PreferenceManager` save/load in `tests/unit/preferences.test.ts`

### Implementation for User Story 3
- [ ] T021 [US3] Integrate `PreferenceManager` with model selection events in `src/popup/model-selector.tsx`
- [ ] T022 [US3] Implement `onLoad` retrieval of saved model in `src/popup/index.tsx`
- [ ] T023 [US3] Update model recommendation hints based on reliability data in `src/popup/model-selector.tsx`
- [ ] T024 [US3] Ensure error paths in `src/background/streaming.ts` do not reset model state

---

## Phase 6: User Story 4 - Text Integrity & Platform Precision (Priority: P2)

**Goal**: Eliminate duplication on Perplexity and fix spacing issues.
**Independent Test**: Verify clean overwrite on Perplexity and no word-joining in output.

### Tests for User Story 4
- [ ] T025 [P] Write unit tests for `TextNormalization` in `tests/unit/text-utils.test.ts`

### Implementation for User Story 4
- [ ] T026 [US4] Implement "Hard Reset" overwrite strategy for Perplexity in `src/content/adapters/perplexity.ts`
- [ ] T027 [US4] Integrate `TextNormalization` into the DOM insertion pipeline in `src/content/ui-manager.ts`

---

## Phase 7: User Story 5 - Resilient LLM Interactions (Priority: P2)

**Goal**: Deterministic handling of no-token and free-tier model quirks.
**Independent Test**: Verify retry/fallback logic for OpenRouter no-token failures.

### Tests for User Story 5
- [ ] T028 [P] Write unit tests for OpenRouter retry/fallback logic in `tests/unit/retry-policy.test.ts`

### Implementation for User Story 5
- [ ] T029 [US5] Implement capped retry loop for "no-token" responses in `src/background/streaming.ts`
- [ ] T030 [US5] Implement fallback to safe model (o4-mini) on persistent no-token failure in `src/background/streaming.ts`
- [ ] T031 [US5] Implement specific settlement logic for Gemma free models in `src/background/streaming.ts`

---

## Phase 8: Polish & Regression Checks

**Purpose**: Final validation and cleanup

- [ ] T032 [P] Reconcile and fix currently failing tests to match new behavior in `tests/`
- [ ] T033 [P] Run full manual smoke matrix across all 4 supported platforms
- [ ] T034 [P] Verify no secret leakage in service worker logs
- [ ] T035 [P] Final build and lint check

---

## Phase 9: Constitutional Audit (DoD Validation)

**Purpose**: Explicitly verify adherence to the Project Constitution.

- [ ] T036 [P] Audit: Verify all requests settle within bounded timeout (Core Law: Streaming Determinism)
- [ ] T037 [P] Audit: Verify all user-facing errors are friendly (Core Law: Actionable Errors)
- [ ] T038 [P] Audit: Verify no raw JSON is leaked to the UI (Core Law: Actionable Errors)
- [ ] T039 [P] Audit: Verify all bugfixes ship with a regression test (Core Law: Bugfix Rigor)
- [ ] T040 [P] Audit: Final sign-off on Bugfix DoD (Reproducible $\rightarrow$ Root Cause $\rightarrow$ Regression Test $\rightarrow$ Validated)

---

## Dependencies & Execution Order

### Phase Dependencies
- **Phase 1 (Setup)** $\rightarrow$ **Phase 2 (Foundational)** $\rightarrow$ **User Story Phases (3-7)** $\rightarrow$ **Polish/Audit**

### User Story Dependencies
- Most stories are independent.
- User Story 2 (Provider/Key) and User Story 3 (Persistence) can be developed in parallel with User Story 1.
- User Story 4 (Text Integrity) and User Story 5 (Resilient LLM) depend on the basic streaming infrastructure of User Story 1.

### Parallel Opportunities
- T001-T005 can be run in parallel.
- T008, T009, T014, T015, T020, T025, T028 can be run in parallel.
- User Story 2, 3, and 5 can start as soon as Phase 2 is complete.

## Implementation Strategy
- **MVP First**: Complete Phase 1, 2, and User Story 1 (Reliable Request Lifecycle) to solve the most critical "infinite spinner" issue.
- **Incremental Delivery**: Proceed through User Stories 2-5 in priority order.
- **Regression First**: Write tests before implementing each fix.
