# How the Prompting Techniques Document Maps to the Codebase v2
## The short answer

The prompting techniques document is NOT loaded at runtime. It is a developer reference that gets distilled into three things that ARE in the codebase:

```
┌──────────────────────────────────────────────────────────────┐
│  Prompting Techniques Document (880 lines, ~15k tokens)      │
│  THE SOURCE MATERIAL — lives in /docs, never sent to the LLM │
└──────────────────┬──────────────────┬────────────────────────┘
                   │                  │
         ┌─────────┘                  └──────────┐
         ▼                                       ▼
┌─────────────────────┐              ┌───────────────────────────┐
│  Meta-Prompt         │              │  Test Suite                │
│  ~500-800 tokens     │              │  120 example prompts       │
│  THE RUNTIME BRAIN   │              │  expected behaviors        │
│  Sent on every call  │              │  THE QUALITY CHECK         │
└─────────────────────┘              └───────────────────────────┘
```

---

## 1. The meta-prompt (what actually runs)

Location: `src/lib/meta-prompt.ts` (extension) and `server/src/meta-prompt.ts` (backend)

The meta-prompt is a ~500-800 token system message that distills the entire techniques document into actionable rules. Here's how each section of your document maps:

### Part 1 (Academic Foundation) → Informs the meta-prompt's decision logic

Your document says: "CoT improved MultiArith from 17.7% to 78.7%, but Wharton found it's wasteful on reasoning models."

The meta-prompt distills this to:
```
For multi-step reasoning tasks (math, logic, analysis), add "Let's work this
out step by step to be sure we have the right answer" — BUT ONLY if the target
model is NOT a reasoning model (o1, DeepSeek R1). For reasoning models, skip
this entirely.
```

### Part 3 (Six Categories + 120 Examples) → Becomes the gap-analysis rules

Your document has 20 examples per category. The meta-prompt compresses these into pattern-matching rules:

```
DOMAIN-SPECIFIC GAP CHECKLIST:

For coding prompts, check for:
- Missing language/framework/version
- Missing error handling preference
- Missing input/output examples
- Vague architecture requirements

For writing prompts, check for:
- Missing audience specification
- Missing tone/style direction
- Missing length/format constraints
- Missing purpose (persuade, inform, explain)

For research prompts, check for:
- Missing scope boundaries
- Missing depth preference
- Missing what they already know
- Missing output format preference

[...etc for each domain]
```

### Part 4 (Anti-Patterns) → Becomes hard rules in the meta-prompt

Your document lists 8 anti-patterns. These become explicit "NEVER do this" rules:

```
RULES:
- NEVER make the prompt longer just for length
- NEVER add "be thorough and comprehensive" or similar filler
- NEVER add CoT triggers to reasoning models
- NEVER use negations — reframe as affirmative directives
- NEVER add few-shot examples to math/logic prompts
- If the prompt is already specific and clear, return it unchanged
```

### Part 5 (Technique Selection Table) → Becomes the decision tree

Your high-impact/conditional/sparingly tables become the meta-prompt's priority order:

```
APPLY IN THIS ORDER (stop when the prompt is complete):
1. Specificity — add missing constraints, format, audience (ALWAYS)
2. Output format — define structure if it would help (USUALLY)
3. Task decomposition — break multi-part asks into steps (WHEN COMPLEX)
4. Audience framing — specify who it's for (WHEN WRITING/EXPLAINING)
5. Chain-of-Thought — add reasoning trigger (ONLY for reasoning tasks
   on non-reasoning models)
6. Few-shot examples — SKIP for v1 (adds too many tokens for a rewrite)
7. Self-criticism — SKIP for v1 (user can do this manually)
8. Ensembling — SKIP entirely (requires multiple API calls)
```

### Part 7 (Architecture Recommendations) → Becomes the meta-prompt's process

Your 7 architecture recommendations become the meta-prompt's internal workflow:

```
PROCESS (internal, do not output reasoning):
1. Classify domain: coding / writing / research / learning / creative / business
2. Detect intent: build / understand / compare / debug / brainstorm / create
3. Identify gaps using the domain-specific checklist above
4. Apply techniques in priority order
5. Optimize for target platform (Claude → structure / GPT → delimiters)
6. Return ONLY the enhanced prompt
```

---

## 2. The test suite (how you know it's working)

Location: `tests/meta-prompt/` or `tests/enhancement/`

The 120 examples from Part 3 of your document become test cases. For each one:

```typescript
// tests/enhancement/coding.test.ts

const testCases = [
  {
    name: "vague coding prompt gets specificity",
    input: "help me with authentication",
    platform: "chatgpt",
    // The enhanced prompt SHOULD contain these elements:
    shouldContain: ["framework", "language", "JWT OR session OR OAuth"],
    // The enhanced prompt should NOT contain these:
    shouldNotContain: ["be thorough", "comprehensive", "you are an expert"],
  },
  {
    name: "already-specific prompt stays minimal",
    input: "Write a Python 3.12 function that validates JWT tokens using PyJWT, returning the decoded payload or raising InvalidTokenError",
    platform: "claude",
    // Should come back nearly unchanged
    maxLengthIncrease: 1.2, // no more than 20% longer
  },
  {
    name: "math prompt on non-reasoning model gets CoT",
    input: "If a train travels 120km in 1.5 hours, what is its speed?",
    platform: "chatgpt", // GPT-4o-mini (non-reasoning)
    shouldContain: ["step by step"],
  },
  {
    name: "math prompt on reasoning model does NOT get CoT",
    input: "If a train travels 120km in 1.5 hours, what is its speed?",
    platform: "chatgpt", // targeting o1
    model: "o1",
    shouldNotContain: ["step by step", "think through", "reasoning"],
  },
];
```

You can build 50-100 of these from your document's examples across all 6 categories.

---

## 3. The iteration workflow

When the meta-prompt produces bad output for a specific type of prompt:

1. Find the relevant section in your techniques document
2. Identify which principle is being violated
3. Adjust the meta-prompt's instructions for that case
4. Add a regression test from the document's examples
5. Re-run the test suite

Example: Users report that coding prompts are getting bloated with unnecessary instructions.

→ Check Part 4 (Anti-Patterns): "Don't just make prompts longer"
→ Check Part 5 (Technique Selection): coding prompts mainly need specificity injection
→ Adjust meta-prompt: add "For coding prompts, add ONLY missing technical constraints (language, framework, version, error handling). Do not add instructional scaffolding."
→ Add test case from Part 3 Category 1 example #20 (output primer for code)

---

## 4. File locations in the project

```
promptpilot/
├── docs/
│   ├── prompting-techniques.md      ← YOUR FILE LIVES HERE
│   ├── research-foundation.md       ← The earlier research doc
│   └── meta-prompt-changelog.md     ← Track changes to the meta-prompt
│
├── extension/
│   └── src/
│       └── lib/
│           └── meta-prompt.ts       ← DISTILLED VERSION (~500-800 tokens)
│
├── server/
│   └── src/
│       └── meta-prompt.ts           ← SAME distilled version (shared)
│
└── tests/
    └── enhancement/
        ├── zero-shot.test.ts        ← Tests from Category 1 examples
        ├── few-shot.test.ts         ← Tests from Category 2 examples
        ├── cot.test.ts              ← Tests from Category 3 examples
        ├── decomposition.test.ts    ← Tests from Category 4 examples
        ├── anti-patterns.test.ts    ← Tests from Part 4
        └── platform-specific.test.ts ← Tests for Claude vs GPT differences
```

---

## 5. What NOT to do with this document

- **DON'T** load it into the LLM context on every call (too expensive, too slow)
- **DON'T** try to encode all 120 examples into the meta-prompt (it needs to be tight)
- **DON'T** include the academic citations in the meta-prompt (the LLM doesn't need to know where the rules came from)
- **DON'T** include ensembling techniques in v1 (they require multiple API calls, which breaks the <3s latency target)
- **DON'T** include self-criticism/self-refine in v1 (it requires multi-turn, which doubles latency)

---

## Summary

Your prompting techniques document is the KNOWLEDGE BASE.
The meta-prompt is the COMPRESSED RUNTIME VERSION.
The test suite VERIFIES the meta-prompt against the knowledge base.

Think of it like this: a doctor reads textbooks for years, but when they see a patient, they don't re-read the textbook. They apply distilled clinical judgment in seconds. Your document is the textbook. The meta-prompt is the clinical judgment.
