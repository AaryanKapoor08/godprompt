import { describe, expect, it } from 'vitest'
import {
  OPENROUTER_FALLBACK_MODEL,
  shouldRetryOpenRouterSameModel,
  shouldRetryWithOpenRouterFallback,
} from '../../src/lib/openrouter-retry'

describe('shouldRetryWithOpenRouterFallback', () => {
  it('allows moving to the next fallback model when the current one fails before tokens', () => {
    const shouldRetry = shouldRetryWithOpenRouterFallback(
      OPENROUTER_FALLBACK_MODEL,
      false,
      new Error('timeout')
    )

    expect(shouldRetry).toBe(true)
  })

  it('does not retry after any token was already emitted', () => {
    const shouldRetry = shouldRetryWithOpenRouterFallback(
      'anthropic/claude-sonnet-4',
      true,
      new Error('[ServiceWorker] OpenRouter stream timed out while waiting for tokens')
    )

    expect(shouldRetry).toBe(false)
  })

  it('does not retry on authentication errors', () => {
    const shouldRetry = shouldRetryWithOpenRouterFallback(
      'anthropic/claude-sonnet-4',
      false,
      new Error('[LLMClient] OpenRouter API returned 401: Unauthorized')
    )

    expect(shouldRetry).toBe(false)
  })

  it('retries on transient non-auth failures before first token', () => {
    const shouldRetry = shouldRetryWithOpenRouterFallback(
      'anthropic/claude-sonnet-4',
      false,
      new Error('[ServiceWorker] OpenRouter stream timed out while waiting for tokens')
    )

    expect(shouldRetry).toBe(true)
  })

  it('does not retry on non-Error values', () => {
    const shouldRetry = shouldRetryWithOpenRouterFallback(
      'anthropic/claude-sonnet-4',
      false,
      { message: 'timeout' }
    )

    expect(shouldRetry).toBe(false)
  })
})

describe('shouldRetryOpenRouterSameModel', () => {
  it('retries on first-run no-token stream failures', () => {
    const shouldRetry = shouldRetryOpenRouterSameModel(
      false,
      new Error('[ServiceWorker] OpenRouter stream ended before emitting tokens')
    )

    expect(shouldRetry).toBe(true)
  })

  it('does not retry when a token was already emitted', () => {
    const shouldRetry = shouldRetryOpenRouterSameModel(
      true,
      new Error('[ServiceWorker] OpenRouter stream timed out while waiting for tokens')
    )

    expect(shouldRetry).toBe(false)
  })

  it('does not retry authentication failures', () => {
    const shouldRetry = shouldRetryOpenRouterSameModel(
      false,
      new Error('[LLMClient] OpenRouter API returned 401: Unauthorized')
    )

    expect(shouldRetry).toBe(false)
  })

  it('does not retry non-rate-limit 4xx request errors', () => {
    const shouldRetry = shouldRetryOpenRouterSameModel(
      false,
      new Error('[LLMClient] OpenRouter API returned 400: Invalid model')
    )

    expect(shouldRetry).toBe(false)
  })
})
