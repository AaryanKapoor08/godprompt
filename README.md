# PromptGod

PromptGod is a Chrome extension that turns rough, half-formed AI prompts into sharper, safer, model-ready instructions before they hit the chat box.

It is built for people who live inside LLMs every day: builders, researchers, operators, students, founders, and anyone who knows the difference between "ask the model" and "give the model a clean operating brief."

The project is intentionally engineered like a prompt compiler, not a prompt template. It reads intent, extracts constraints, routes through provider-specific policy, validates the output, repairs safe failures, and only then writes the final prompt back into the page.

## What It Does

- Enhances prompts directly inside ChatGPT, Claude.ai, Gemini, and Perplexity.
- Rewrites selected text from any supported page through the right-click Text branch.
- Supports bring-your-own-key flows for Google, OpenRouter, OpenAI, and Anthropic APIs.
- Preserves hard constraints such as "plain text only", "do not solve yet", "ask questions first", word limits, staged workflows, deliverables, and anti-invention rules.
- Avoids common AI rewrite failures: source echo, vague project-brief drift, fake answers, decorative markdown, merged tasks, dropped deliverables, and duplicate summary tails.
- Uses a curated provider fallback chain instead of blindly trusting one model.

## Why It Is Different

Most prompt tools are wrappers. PromptGod is a rewrite pipeline.

The core idea is simple: the model should not carry the whole correctness burden. The extension does local work first, then asks the model for the part it is best at.

That gives PromptGod its niche:

- **LLM branch**: normal chat prompt enhancement inside a composer.
- **Text branch**: selected-text rewrite with stricter no-question behavior.
- **Compact-contract prompting**: small production prompts instead of giant instruction walls.
- **Constraint extraction**: local detection of hard user rules before the model call.
- **Branch validators**: different quality gates for chat prompts and selected text.
- **Deterministic repair**: safe cleanup for wrappers, echoes, duplicate tails, and formatting drift.
- **Targeted retry**: one compact retry with issue codes instead of resending the whole prompt playbook.
- **Provider policy**: Google and OpenRouter are handled as different systems, because they fail in different ways.
- **Gemma legacy isolation**: Gemma stays frozen and isolated so fallback behavior does not mutate the engineered non-Gemma pipeline.

It is over-engineered in the useful way: not bigger for its own sake, but layered so weird real prompts stop breaking the product.

## Architecture

PromptGod is a Manifest V3 extension built with TypeScript, Vite, and Vitest.

```text
extension/src/
  content/
    adapters/              Platform adapters for ChatGPT, Claude.ai, Gemini, Perplexity
    ui/                    Trigger button, toast, undo button
    context-menu-handler.ts

  lib/
    rewrite-core/          Shared compiler-style primitives
    rewrite-llm-branch/    Normal chat prompt pipeline
    rewrite-text-branch/   Highlighted text pipeline
    rewrite-google/        Google model, request, retry, and budget policy
    rewrite-openrouter/    Catalog, curation, route policy, account status
    gemma-legacy/          Frozen Gemma behavior
    llm-client.ts          Provider API calls and response sanitation

  popup/
    popup UI, model selection, account status, curated chain display

  service-worker.ts        Routing, provider fallback, streaming orchestration
```

The important split is deliberate:

- shared primitives live in `rewrite-core`
- branch behavior lives in `rewrite-llm-branch` and `rewrite-text-branch`
- provider behavior lives in `rewrite-google` and `rewrite-openrouter`
- Gemma is isolated in `gemma-legacy`

That keeps product behavior from collapsing into one giant meta-prompt.

## The Pipeline

For non-Gemma paths, PromptGod runs a compiler-style flow:

```text
source text
  -> normalize
  -> extract hard constraints
  -> build branch-specific compact rewrite spec
  -> call provider
  -> validate output
  -> deterministic repair when safe
  -> targeted retry when needed
  -> conservative fallback if all else fails
  -> write back to the page
```

This is the core reason the extension can handle messy prompts without turning every bug fix into another paragraph of prompt instructions.

## Fallback Chain

The visible runtime chain is:

```text
Gemini 2.5 Flash
  -> Gemma 4 26B A4B IT
  -> OpenRouter Free Chain
```

The OpenRouter free chain is curated, not random:

```text
Nemotron 3 Super 120B
  -> Nemotron 3 Nano 30B
```

PromptGod explicitly avoids the generic `openrouter/free` router and excludes unstable free models from the recommended chain. If the curated chain fails, the extension surfaces a real failure instead of pretending the original text was enhanced.

## Algorithms And Guardrails

PromptGod uses a small set of practical algorithms around the model call:

- **Whitespace and source-mode normalization** to stabilize messy input.
- **Regex and keyword constraint extraction** with a precision-first stance.
- **Issue-code validation** for dropped deliverables, forbidden questions, markdown drift, first-person brief framing, task merging, and answer-instead-of-rewrite failures.
- **Near-echo detection** for OpenRouter outputs that barely change the source.
- **Wrapper rejection** for system-prompt-shaped outputs like "You are an AI assistant..."
- **Reasoning-channel suppression** for OpenRouter reasoning models that would otherwise burn tokens before producing visible text.
- **Deterministic repair** for cosmetic and structural failures.
- **Conservative fallback** when the model output is not trustworthy.

The result is a product that treats prompt rewriting as a constrained transformation problem, not a vibes-only generation task.

## Token Efficiency

The newer architecture cuts fixed prompt overhead by moving correctness into code.

Instead of sending long teaching prompts on every call, PromptGod uses compact production contracts and local validation:

- LLM branch first pass target: roughly `700-850` product-owned tokens, hard cap `1000`.
- LLM branch retry cap: `220` tokens.
- Text branch first pass target: roughly `280-360` product-owned tokens, hard cap `400`.
- Text branch retry cap: `140` tokens.

That is the real win: fewer repeated instructions, faster retries, less provider friction, and better control over regressions.

## Agentic AI Angle

PromptGod is built for agentic workflows where prompts are not just questions. They are task specs, execution plans, review rubrics, research briefs, escalation notes, and multi-step operating instructions.

The pipeline preserves the things agents actually need:

- staged sequencing
- tool or file references
- deliverables
- constraints
- uncertainty language
- role boundaries
- "ask before solving" workflows
- no-invention rules

It helps turn loose human intent into a cleaner instruction surface for the next model or agent.

## Development

```powershell
cd extension
npm install
npm run build
npm test
```

Useful scripts:

```powershell
npm run dev
npm run build
npm test
npm run eval:openrouter
```

## Status

PromptGod is currently in a stabilization-heavy architecture pass focused on:

- stronger provider fallback behavior
- lower token overhead
- regression corpus coverage
- OpenRouter free-model reliability
- Google and Gemma fallback boundaries
- branch-specific rewrite quality

The goal is simple: make prompt enhancement feel instant, sharp, and boringly reliable, even when the source prompt is ugly.

<!-- metadata refresh -->
