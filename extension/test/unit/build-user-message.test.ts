import { describe, it, expect } from 'vitest'
import { buildUserMessage } from '../../src/lib/llm-client'

describe('buildUserMessage', () => {
  it('returns the raw prompt as-is', () => {
    const result = buildUserMessage(
      'help me write a python script',
      'chatgpt',
      { isNewConversation: true, conversationLength: 0 }
    )
    expect(result).toBe('help me write a python script')
  })

  it('preserves whitespace and formatting', () => {
    const prompt = '  multi\n  line\n  prompt  '
    const result = buildUserMessage(
      prompt,
      'claude',
      { isNewConversation: false, conversationLength: 5 }
    )
    expect(result).toBe(prompt)
  })

  it('handles empty prompt', () => {
    const result = buildUserMessage(
      '',
      'gemini',
      { isNewConversation: true, conversationLength: 0 }
    )
    expect(result).toBe('')
  })
})
