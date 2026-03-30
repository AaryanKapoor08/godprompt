import { describe, it, expect } from 'vitest'
import { buildUserMessage } from '../../src/lib/llm-client'

describe('buildUserMessage', () => {
  it('wraps prompt with rewrite instruction and delimiters', () => {
    const result = buildUserMessage(
      'help me write a python script',
      'chatgpt',
      { isNewConversation: true, conversationLength: 0 }
    )
    expect(result).toContain('Rewrite the following prompt')
    expect(result).toContain('Output ONLY the rewritten prompt')
    expect(result).toContain('"""')
    expect(result).toContain('help me write a python script')
  })

  it('includes platform and context for new conversation', () => {
    const result = buildUserMessage(
      'test prompt',
      'chatgpt',
      { isNewConversation: true, conversationLength: 0 }
    )
    expect(result).toContain('Platform: chatgpt')
    expect(result).toContain('Context: New conversation')
  })

  it('includes platform and context for ongoing conversation', () => {
    const result = buildUserMessage(
      'test prompt',
      'claude',
      { isNewConversation: false, conversationLength: 5 }
    )
    expect(result).toContain('Platform: claude')
    expect(result).toContain('Context: Ongoing conversation, message #6')
  })

  it('preserves whitespace and formatting inside delimiters', () => {
    const prompt = '  multi\n  line\n  prompt  '
    const result = buildUserMessage(
      prompt,
      'claude',
      { isNewConversation: false, conversationLength: 5 }
    )
    expect(result).toContain(prompt)
  })

  it('handles empty prompt', () => {
    const result = buildUserMessage(
      '',
      'gemini',
      { isNewConversation: true, conversationLength: 0 }
    )
    expect(result).toContain('"""\n\n"""')
  })
})
