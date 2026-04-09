import { describe, expect, it } from 'vitest'
import { analyzeApiKey, detectProviderFromApiKey, PROVIDER_POLICIES } from '../../src/lib/provider-policy'

describe('ProviderPolicy Validation', () => {
  it('validates OpenAI keys', () => {
    expect(PROVIDER_POLICIES.openai.keyRegex.test('sk-' + 'a'.repeat(48))).toBe(true)
    expect(PROVIDER_POLICIES.openai.keyRegex.test('sk-proj-' + 'a'.repeat(48))).toBe(true)
    expect(PROVIDER_POLICIES.openai.keyRegex.test('invalid-key')).toBe(false)
  })

  it('validates Anthropic keys', () => {
    const validKey = 'sk-ant-api03-' + 'a'.repeat(40)
    expect(PROVIDER_POLICIES.anthropic.keyRegex.test(validKey)).toBe(true)
    expect(PROVIDER_POLICIES.anthropic.keyRegex.test('invalid-key')).toBe(false)
  })

  it('validates Google keys', () => {
    const validKey = 'AIza' + 'a'.repeat(35)
    expect(PROVIDER_POLICIES.google.keyRegex.test(validKey)).toBe(true)
    expect(PROVIDER_POLICIES.google.keyRegex.test('invalid-key')).toBe(false)
  })

  it('validates OpenRouter keys', () => {
    const validKey = 'sk-or-v1-' + 'a'.repeat(51)
    expect(PROVIDER_POLICIES.openrouter.keyRegex.test(validKey)).toBe(true)
    expect(PROVIDER_POLICIES.openrouter.keyRegex.test('invalid-key')).toBe(false)
  })
})

describe('detectProviderFromApiKey', () => {
  it('detects recognized providers by prefix', () => {
    expect(detectProviderFromApiKey('sk-or-v1-abc123')).toBe('openrouter')
    expect(detectProviderFromApiKey('sk-ant-api03-abc123')).toBe('anthropic')
    expect(detectProviderFromApiKey('AIzaSyA123-abc')).toBe('google')
    expect(detectProviderFromApiKey('sk-proj-abc123')).toBe('openai')
  })

  it('returns null for unrecognized keys', () => {
    expect(detectProviderFromApiKey('completely-unknown-key')).toBeNull()
  })
})

describe('analyzeApiKey', () => {
  it('allows saving recognized keys', () => {
    expect(analyzeApiKey('sk-or-v1-abc123')).toEqual({
      detectedProvider: 'openrouter',
      recognizedFormat: true,
      saveable: true,
    })
  })

  it('allows saving unrecognized non-empty keys for manual provider selection', () => {
    expect(analyzeApiKey('my-weird-provider-key')).toEqual({
      detectedProvider: null,
      recognizedFormat: false,
      saveable: true,
    })
  })

  it('rejects empty values', () => {
    expect(analyzeApiKey('   ')).toEqual({
      detectedProvider: null,
      recognizedFormat: false,
      saveable: false,
    })
  })
})
