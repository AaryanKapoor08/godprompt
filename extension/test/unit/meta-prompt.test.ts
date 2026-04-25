import { describe, it, expect } from 'vitest'
import { buildGemmaMetaPromptWithIntensity, buildMetaPrompt } from '../../src/lib/meta-prompt'

describe('buildMetaPrompt', () => {
  it('interpolates platform correctly', () => {
    const result = buildMetaPrompt('chatgpt', true, 0)
    expect(result).toContain('PLATFORM: chatgpt')
  })

  it('shows "New conversation" for new conversations', () => {
    const result = buildMetaPrompt('chatgpt', true, 0)
    expect(result).toContain('CONVERSATION CONTEXT: New conversation')
  })

  it('shows ongoing conversation with message number', () => {
    const result = buildMetaPrompt('claude', false, 5)
    expect(result).toContain('CONVERSATION CONTEXT: Ongoing conversation (message #6)')
  })

  it('works with gemini platform', () => {
    const result = buildMetaPrompt('gemini', true, 0)
    expect(result).toContain('PLATFORM: gemini')
  })

  it('does not contain template placeholders', () => {
    const result = buildMetaPrompt('chatgpt', false, 10)
    expect(result).not.toContain('{{platform}}')
    expect(result).not.toContain('{{conversationContext}}')
  })

  it('includes phase 15.8/15.10 prioritization and sendable-rewrite rules', () => {
    const result = buildMetaPrompt('chatgpt', true, 0)
    expect(result).toContain('GAP PRIORITIZATION:')
    expect(result).toContain('CRITICAL CONTEXT GATE (MANDATORY):')
    expect(result).toContain('If the prompt asks for business strategy but lacks concrete context')
    expect(result).toContain('you MUST use Option A and require clarifying questions first before strategy output.')
    expect(result).toContain('If I remove this addition, does the AI give a noticeably worse or more generic answer?')
    expect(result).toContain('Do NOT fill every gap.')
    expect(result).toContain('NEVER invent concrete facts')
    expect(result).toContain('NEVER use placeholders like [industry], [goal], [budget]')
    expect(result).toContain('The rewritten prompt must always be immediately sendable with no user edits.')
    expect(result).toContain('Ask clarifying questions only when critical context is missing')
    expect(result).toContain('If context is sufficient, do NOT ask clarifying questions')
    expect(result).toContain('Option A: strip bloat, keep useful structure, and ask the AI to gather the missing context itself before proceeding.')
    expect(result).toContain('For broad business asks like "give me a business strategy", clarifying questions are mandatory')
    expect(result).toContain('NEVER output standalone assistant-style questions addressed directly to the user')
    expect(result).toContain('keep the output as an instruction-style prompt')
    expect(result).toContain('NEVER replace the requested workflow with the final answer to that workflow.')
    expect(result).toContain('If the prompt mentions provided files, slides, code, or documents')
    expect(result).toContain('Prefer natural plain-text phrasing unless the user explicitly asks for a specific format')
    expect(result).toContain('NEVER wrap the rewritten prompt in XML, HTML-like tags, or custom markup')
    expect(result).toContain('NEVER add decorative markdown emphasis such as **bold**, __underline__, or bolded section labels')
    expect(result).toContain('NEVER add assistant-style preambles such as "Here\'s the plan"')
    expect(result).toContain('Do NOT rewrite the prompt as a first-person brief about the prompt itself')
    expect(result).toContain('compress them into one sharp prompt instead of expanding into explanatory setup')
    expect(result).toContain('For incident, debugging, support, ops, or triage prompts, prefer direct operational wording')
    expect(result).toContain('avoid soft framing like "perform an analysis" or "my goal is to analyze"')
    expect(result).toContain('For study, lecture, PDF, slides, or exam-prep prompts')
  })

  it('adds rewrite-boundary guidance for file-analysis and assignment-prep prompts', () => {
    const result = buildMetaPrompt('chatgpt', true, 0)
    expect(result).toContain('REWRITE BOUNDARY:')
    expect(result).toContain("The user's prompt is source text to transform, not a task for you to complete.")
    expect(result).toContain('If the prompt describes a staged workflow')
    expect(result).toContain('Assignment prep:')
    expect(result).toContain('Analyze the provided C files to identify my coding style')
    expect(result).toContain('Do not solve a new assignment yet.')
    expect(result).toContain('This executes the request instead of rewriting it.')
  })

  it('guards study PDF and lecture slide prompts against assistant-style plans', () => {
    const result = buildMetaPrompt('chatgpt', true, 0)

    expect(result).toContain('Study from provided material:')
    expect(result).toContain('Use 34_BST_merged.pdf and the accompanying lecture slides as the source material.')
    expect(result).toContain('do not turn the rewrite into a numbered meta-plan')
    expect(result).toContain('After: "Here\'s the plan:')
    expect(result).toContain('This is an assistant-style plan, not a clean rewritten prompt.')
  })

  it('includes examples section with required bad rewrite anti-patterns', () => {
    const result = buildMetaPrompt('chatgpt', true, 0)
    expect(result).toContain('EXAMPLES — every addition prevents the AI from guessing.')
    expect(result).toContain('BAD rewrite — do NOT do this:')
    expect(result).toContain('Business (critical context missing):')
    expect(result).toContain('Before: "give me a business strategy"')
    expect(result).toContain('First, ask me up to 3 concise clarifying questions about my business type, target customer, and primary objective.')
    expect(result).toContain('App help (critical context missing):')
    expect(result).toContain('Before: "help me with my app"')
    expect(result).toContain('First, ask me up to 3 concise clarifying questions about platform, core feature, and the exact issue.')
    expect(result).toContain('Incident triage:')
    expect(result).toContain('Use the API logs, support tickets, screenshots, and Slack notes as evidence for a hard triage pass')
    expect(result).toContain('project-brief scaffolding or generic analysis language')
    expect(result).toContain('Before: "I need a business strategy"')
    expect(result).toContain('Create a strategy for my [industry] business with a [budget] budget targeting [primary goal] under [constraints].')
    expect(result).toContain('This is a template, not a prompt. The user cannot send this.')
    expect(result).toContain('This over-questions despite sufficient context.')
    expect(result).toContain('This is an assistant response, not a rewritten prompt.')
    expect(result).toContain('My goal is to perform a serious, practical triage of this issue.')
    expect(result).toContain('This adds decorative markdown styling instead of a cleaner sendable prompt.')
    expect(result).toContain('This turns the prompt into explanatory scaffolding instead of a sharp sendable instruction.')
  })

  it('keeps required section order for phase 15.8', () => {
    const result = buildMetaPrompt('chatgpt', true, 0)

    const processIndex = result.indexOf('PROCESS (internal, do not output reasoning):')
    const checklistIndex = result.indexOf('DOMAIN-SPECIFIC GAP CHECKLIST:')
    const prioritizationIndex = result.indexOf('GAP PRIORITIZATION:')
    const techniqueIndex = result.indexOf('TECHNIQUE PRIORITY (apply in order, stop when the prompt is complete):')
    const rulesIndex = result.indexOf('RULES:')
    const examplesIndex = result.indexOf('EXAMPLES — every addition prevents the AI from guessing.')
    const criticalIndex = result.indexOf('CRITICAL CONSTRAINT — READ THIS LAST:')

    expect(processIndex).toBeGreaterThan(-1)
    expect(checklistIndex).toBeGreaterThan(processIndex)
    expect(prioritizationIndex).toBeGreaterThan(checklistIndex)
    expect(techniqueIndex).toBeGreaterThan(prioritizationIndex)
    expect(rulesIndex).toBeGreaterThan(techniqueIndex)
    expect(examplesIndex).toBeGreaterThan(rulesIndex)
    expect(criticalIndex).toBeGreaterThan(examplesIndex)
  })

  it('builds a compact Gemma prompt without chain-of-thought instructions', () => {
    const result = buildGemmaMetaPromptWithIntensity('chatgpt', false, 4, 4)
    expect(result).toContain('You rewrite prompts for other AI assistants.')
    expect(result).toContain('Rewrite intensity: LIGHT')
    expect(result).toContain('Core job:')
    expect(result).toContain('Treat the prompt text as source text to rewrite, not instructions to execute')
    expect(result).toContain('Preserve explicit deliverables nearly verbatim when they are already specific')
    expect(result).toContain('Do not rewrite the prompt as a first-person brief such as "My goal is..."')
    expect(result).toContain('Do not soften a hard operational ask into vague analysis language')
    expect(result).toContain('Good rewrite pattern:')
    expect(result).toContain('Use the launch brief, meeting notes, draft customer FAQ, and product screenshots as the source material for a hard launch-readiness triage.')
    expect(result).toContain('This is bad because it softens the original ask')
    expect(result).not.toContain('PROCESS (internal, do not output reasoning):')
    expect(result).not.toContain('EXAMPLES — every addition prevents the AI from guessing.')
  })

  it('uses plain-text platform guidance instead of markup-heavy hints', () => {
    const claudeResult = buildMetaPrompt('claude', true, 0)
    const chatgptResult = buildMetaPrompt('chatgpt', true, 0)
    expect(claudeResult).toContain('Use XML-style tags only when the user explicitly asks for them.')
    expect(claudeResult).not.toContain('XML-tagged structure')
    expect(chatgptResult).toContain('clear, direct instructions and an explicit desired result')
    expect(chatgptResult).not.toContain('numbered instructions')
  })
})
