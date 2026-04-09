import { describe, it, expect } from 'vitest'
import { translateError } from '../../src/lib/error-translator'

describe('ErrorTranslator', () => {
  it('should translate 401 to invalid API key', () => {
    const error = new Error('API returned 401')
    expect(translateError(error)).toBe('The API key was rejected. Check the key, confirm the provider, and save the settings again.')
  })

  it('should translate 429 to rate limit', () => {
    const error = new Error('API returned 429')
    expect(translateError(error)).toBe('Rate limit exceeded. Wait a moment, then retry or switch to another model.')
  })

  it('should translate NO_TOKENS keyword', () => {
    const error = new Error('You have NO_TOKENS left')
    expect(translateError(error)).toBe('Your account has no credits or tokens left. Add credits or switch to a free model.')
  })

  it('should translate billing-style 400 responses', () => {
    const error = new Error('OpenRouter API returned 400: {"error":{"message":"insufficient credits"}}')
    expect(translateError(error)).toBe('This model needs paid credits on the provider account. Pick a free model or add credits.')
  })

  it('should return default message for unknown errors', () => {
    const error = new Error('Something went wrong')
    expect(translateError(error)).toBe('An unexpected error occurred. Please check your connection and API settings.')
  })
})
