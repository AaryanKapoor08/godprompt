import { describe, it, expect } from 'vitest'
import { shouldRetryOpenRouterSameModel, shouldRetryWithOpenRouterFallback, OPENROUTER_FALLBACK_MODEL } from '../../src/lib/openrouter-retry'

describe('OpenRouter Retry Policy', () => {
  it('should retry same model on transient error before tokens', () => {
    const error = new Error('API returned 429')
    expect(shouldRetryOpenRouterSameModel(false, error)).toBe(true)
  })

  it('should not retry same model if tokens were already sent', () => {
    const error = new Error('API returned 429')
    expect(shouldRetryOpenRouterSameModel(true, error)).toBe(false)
  })

  it('should not retry same model on auth error', () => {
    const error = new Error('API returned 401')
    expect(shouldRetryOpenRouterSameModel(false, error)).toBe(false)
  })

  it('should retry with fallback on transient error before tokens', () => {
    const error = new Error('API returned 500')
    expect(shouldRetryWithOpenRouterFallback('some-model', false, error)).toBe(true)
  })

  it('should allow trying the next fallback model if the current fallback fails before tokens', () => {
    const error = new Error('API returned 500')
    expect(shouldRetryWithOpenRouterFallback(OPENROUTER_FALLBACK_MODEL, false, error)).toBe(true)
  })

  it('should not retry with fallback if tokens were sent', () => {
    const error = new Error('API returned 500')
    expect(shouldRetryWithOpenRouterFallback('some-model', true, error)).toBe(false)
  })
})
