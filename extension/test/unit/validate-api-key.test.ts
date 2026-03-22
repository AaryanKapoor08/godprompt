import { describe, it, expect } from 'vitest'
import { validateApiKey } from '../../src/lib/llm-client'

describe('validateApiKey', () => {
  it('validates Anthropic key with sk-ant- prefix', () => {
    const result = validateApiKey('sk-ant-api03-abc123')
    expect(result).toEqual({ valid: true, provider: 'anthropic' })
  })

  it('validates OpenRouter key with sk-or- prefix', () => {
    const result = validateApiKey('sk-or-v1-abc123')
    expect(result).toEqual({ valid: true, provider: 'openrouter' })
  })

  it('validates OpenAI key with sk- prefix', () => {
    const result = validateApiKey('sk-proj-abc123')
    expect(result).toEqual({ valid: true, provider: 'openai' })
  })

  it('rejects empty string', () => {
    const result = validateApiKey('')
    expect(result).toEqual({ valid: false, provider: null })
  })

  it('rejects random string', () => {
    const result = validateApiKey('not-a-key')
    expect(result).toEqual({ valid: false, provider: null })
  })

  it('trims whitespace before validation', () => {
    const result = validateApiKey('  sk-ant-api03-abc123  ')
    expect(result).toEqual({ valid: true, provider: 'anthropic' })
  })

  it('trims whitespace for OpenRouter key', () => {
    const result = validateApiKey('  sk-or-v1-abc123  ')
    expect(result).toEqual({ valid: true, provider: 'openrouter' })
  })

  it('rejects key with only sk (no dash after)', () => {
    const result = validateApiKey('skabc')
    expect(result).toEqual({ valid: false, provider: null })
  })
})
