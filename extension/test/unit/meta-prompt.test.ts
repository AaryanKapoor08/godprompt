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
})
