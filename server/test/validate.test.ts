import { describe, it, expect } from 'vitest'
import { validateEnhanceRequest } from '../src/middleware/validate'

describe('validateEnhanceRequest', () => {
  const validBody = {
    prompt: 'help me write a python script',
    platform: 'chatgpt',
    context: { isNewConversation: true, conversationLength: 0 },
  }

  it('accepts a valid request', () => {
    const result = validateEnhanceRequest(validBody)
    expect(result.valid).toBe(true)
    expect(result.data?.prompt).toBe(validBody.prompt)
    expect(result.data?.platform).toBe('chatgpt')
  })

  it('accepts request without context (defaults applied)', () => {
    const { context: _, ...bodyWithoutContext } = validBody
    const result = validateEnhanceRequest(bodyWithoutContext)
    expect(result.valid).toBe(true)
    expect(result.data?.context).toEqual({ isNewConversation: true, conversationLength: 0 })
  })

  it('rejects null body', () => {
    const result = validateEnhanceRequest(null)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Request body is required')
  })

  it('rejects missing prompt', () => {
    const result = validateEnhanceRequest({ platform: 'chatgpt' })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('prompt is required')
  })

  it('rejects empty prompt', () => {
    const result = validateEnhanceRequest({ prompt: '   ', platform: 'chatgpt' })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Prompt is empty')
  })

  it('rejects prompt over 10000 characters', () => {
    const result = validateEnhanceRequest({
      prompt: 'a'.repeat(10001),
      platform: 'chatgpt',
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Prompt too long')
  })

  it('accepts prompt at exactly 10000 characters', () => {
    const result = validateEnhanceRequest({
      prompt: 'a'.repeat(10000),
      platform: 'chatgpt',
    })
    expect(result.valid).toBe(true)
  })

  it('rejects missing platform', () => {
    const result = validateEnhanceRequest({ prompt: 'hello' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid platform')
  })

  it('rejects invalid platform', () => {
    const result = validateEnhanceRequest({ prompt: 'hello', platform: 'bard' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid platform')
  })

  it('accepts all valid platforms', () => {
    for (const platform of ['chatgpt', 'claude', 'gemini']) {
      const result = validateEnhanceRequest({ prompt: 'hello world test', platform })
      expect(result.valid).toBe(true)
    }
  })
})
