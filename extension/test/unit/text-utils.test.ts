import { describe, expect, it } from 'vitest'
import { cleanEnhancedPromptOutput } from '../../src/lib/text-utils'

describe('cleanEnhancedPromptOutput', () => {
  it('strips decorative bold emphasis from rewritten prompts by default', () => {
    const result = cleanEnhancedPromptOutput(
      '**Task 1: Incident Triage**\n\n1. **A prioritized launch checklist.**\n2. **A short internal risk memo.**',
      'use these files to do hard launch triage and give me a checklist and memo'
    )

    expect(result).toBe('Task 1: Incident Triage\n\n1. A prioritized launch checklist.\n2. A short internal risk memo.')
    expect(result).not.toContain('**')
  })

  it('preserves markdown emphasis when the source prompt explicitly asks for markdown', () => {
    const result = cleanEnhancedPromptOutput(
      '**Summary**\n- Key points\n\n**Risks**\n- Main risks',
      'rewrite this prompt and ask the model to return the final answer in markdown with bold section headings'
    )

    expect(result).toBe('**Summary**\n- Key points\n\n**Risks**\n- Main risks')
  })
})
