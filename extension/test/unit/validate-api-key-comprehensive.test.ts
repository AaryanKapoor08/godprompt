import { describe, it, expect } from 'vitest'
import { validateApiKey } from '../../src/lib/llm-client'

describe('validateApiKey', () => {
  it('validates Google key with AIza prefix', () => {
    const result = validateApiKey('AIzaSyA123-abc')
    expect(result).toEqual({ valid: true, provider: 'google' })
  })

  it('validates Anthropic key', () => {
    expect(validateApiKey('sk-ant-api03-abc')).toEqual({ valid: true, provider: 'anthropic' })
  })

  it('validates OpenRouter key', () => {
    expect(validateApiKey('sk-or-v1-abc')).toEqual({ valid: true, provider: 'openrouter' })
  })

  it('prefers OpenRouter over generic sk- matching', () => {
    expect(validateApiKey('sk-or-v1-abc123')).toEqual({ valid: true, provider: 'openrouter' })
  })

  it('validates OpenAI key', () => {
    expect(validateApiKey('sk-proj-abc')).toEqual({ valid: true, provider: 'openai' })
  })

  it('rejects random strings', () => {
    expect(validateApiKey('not-a-key')).toEqual({ valid: false, provider: null })
  })

  it('rejects empty string', () => {
    expect(validateApiKey('')).toEqual({ valid: false, provider: null })
  })
})
