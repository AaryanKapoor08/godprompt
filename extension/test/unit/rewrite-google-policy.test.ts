import { describe, expect, it } from 'vitest'
import {
  GOOGLE_NON_GEMMA_MODELS,
  GOOGLE_PRIMARY_MODEL,
  isSupportedGoogleNonGemmaModel,
} from '../../src/lib/rewrite-google/models'
import { buildGoogleRequestBody } from '../../src/lib/rewrite-google/request-policy'
import { classifyGoogleEscalation, shouldRetryGoogleSameModel } from '../../src/lib/rewrite-google/retry-policy'

describe('rewrite-google policy modules', () => {
  it('exports only the non-Gemma supported model set', () => {
    expect(GOOGLE_NON_GEMMA_MODELS).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite'])
    expect(GOOGLE_PRIMARY_MODEL).toBe('gemini-2.5-flash')
    expect(isSupportedGoogleNonGemmaModel('gemini-2.5-flash')).toBe(true)
    expect(isSupportedGoogleNonGemmaModel('gemma-3-27b-it')).toBe(false)
  })

  it('uses systemInstruction and disables thinking for Gemini rewrites', () => {
    const body = buildGoogleRequestBody('gemini-2.5-flash', 'system', 'user', 512)

    expect(body.systemInstruction).toEqual({ parts: [{ text: 'system' }] })
    expect(body.generationConfig).toMatchObject({
      temperature: 0.2,
      maxOutputTokens: 512,
      thinkingConfig: { thinkingBudget: 0 },
    })
  })

  it('keeps Gemma on the legacy inline request shape', () => {
    const body = buildGoogleRequestBody('gemma-3-27b-it', 'system', 'user', 512)

    expect(body.systemInstruction).toBeUndefined()
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Instruction:\nsystem\n\nTask:\nuser' }] },
    ])
  })

  it('retries only within the two-attempt Google transient window', () => {
    expect(shouldRetryGoogleSameModel(429, 1)).toBe(true)
    expect(shouldRetryGoogleSameModel(502, 1)).toBe(true)
    expect(shouldRetryGoogleSameModel(599, 1)).toBe(true)
    expect(shouldRetryGoogleSameModel(429, 2)).toBe(false)
    expect(shouldRetryGoogleSameModel(502, 2)).toBe(false)
    expect(shouldRetryGoogleSameModel(401, 1)).toBe(false)
    expect(shouldRetryGoogleSameModel(499, 1)).toBe(false)
  })

  it('classifies only product-approved Google fallback failures', () => {
    expect(classifyGoogleEscalation(new Error('[LLMClient] Google API returned 429: quota'))).toBe('rate-limit')
    expect(classifyGoogleEscalation(new Error('[LLMClient] Google API returned 502: bad gateway'))).toBe('server-error')
    expect(classifyGoogleEscalation(new Error('[LLMClient] Google API returned unusable output (truncated output)'))).toBe('unusable-output')
    expect(classifyGoogleEscalation(new Error('[LLMClient] Google API returned 401: bad key'))).toBeNull()
  })
})
