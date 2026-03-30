import { describe, it, expect } from 'vitest'
import { buildMetaPrompt } from '../../src/lib/meta-prompt'

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
    expect(result).toContain('Before: "I need a business strategy"')
    expect(result).toContain('Create a strategy for my [industry] business with a [budget] budget targeting [primary goal] under [constraints].')
    expect(result).toContain('This is a template, not a prompt. The user cannot send this.')
    expect(result).toContain('This over-questions despite sufficient context.')
    expect(result).toContain('This is an assistant response, not a rewritten prompt.')
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
})
