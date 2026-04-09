import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callGoogleAPI, listGoogleModels } from '../../src/lib/llm-client'

describe('Google API client helpers', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('filters and normalizes listed models for generation', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      models: [
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['streamGenerateContent'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      ],
    }), { status: 200 }))

    const models = await listGoogleModels('AIzaTestKey')

    expect(models).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro'])
  })

  it('maps legacy gemma-4 ids to gemma-3-27b-it', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Rewritten prompt' }] } }],
    }), { status: 200 }))

    const text = await callGoogleAPI('AIzaTestKey', 'system', 'user', 'gemma-4')

    expect(text).toBe('Rewritten prompt')
    const calledUrl = String(mockFetch.mock.calls[0][0])
    expect(calledUrl).toContain('/models/gemma-3-27b-it:generateContent')
  })

  it('falls back to gemini-2.5-flash after a 404 model error', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('model not found', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Fallback rewrite' }] } }],
      }), { status: 200 }))

    const text = await callGoogleAPI('AIzaTestKey', 'system', 'user', 'unknown-model')

    expect(text).toBe('Fallback rewrite')
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const firstUrl = String(mockFetch.mock.calls[0][0])
    const secondUrl = String(mockFetch.mock.calls[1][0])
    expect(firstUrl).toContain('/models/unknown-model:generateContent')
    expect(secondUrl).toContain('/models/gemini-2.5-flash:generateContent')
  })

  it('surfaces blocked responses when no text is returned', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      promptFeedback: { blockReason: 'SAFETY' },
      candidates: [{ finishReason: 'SAFETY' }],
    }), { status: 200 }))

    await expect(
      callGoogleAPI('AIzaTestKey', 'system', 'user', 'gemini-2.5-flash')
    ).rejects.toThrow('Google API returned no text output (blocked (SAFETY))')
  })

  it('retries when output is truncated to one word', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'Provide' }] } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Give me a 4-phase Java learning roadmap with projects.' }] } }],
      }), { status: 200 }))

    const text = await callGoogleAPI('AIzaTestKey', 'system', 'user', 'gemini-2.5-flash')

    expect(text).toBe('Give me a 4-phase Java learning roadmap with projects.')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('rejects blocked partial text outputs', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'Provide' }] } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'Provide' }] } }],
      }), { status: 200 }))

    await expect(
      callGoogleAPI('AIzaTestKey', 'system', 'user', 'gemini-2.5-flash')
    ).rejects.toThrow('Google API returned unusable output (finish reason: SAFETY)')
  })

  it('uses header auth and disables thinking for Gemini 2.5 Flash rewrites', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Rewritten prompt' }] } }],
    }), { status: 200 }))

    await callGoogleAPI('AIzaTestKey', 'system prompt', 'user prompt', 'gemini-2.5-flash')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'AIzaTestKey',
    })

    const body = JSON.parse(String(init.body))
    expect(body.generationConfig).toMatchObject({
      temperature: 0.2,
      maxOutputTokens: 512,
      thinkingConfig: { thinkingBudget: 0 },
    })
    expect(body.systemInstruction).toEqual({
      parts: [{ text: 'system prompt' }],
    })
  })

  it('falls back to Flash-Lite after retryable Flash failures', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('temporary outage', { status: 503 }))
      .mockResolvedValueOnce(new Response('temporary outage', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Flash Lite rewrite' }] } }],
      }), { status: 200 }))

    const text = await callGoogleAPI('AIzaTestKey', 'system', 'user', 'gemini-2.5-flash')

    expect(text).toBe('Flash Lite rewrite')
    expect(mockFetch).toHaveBeenCalledTimes(3)
    const thirdUrl = String(mockFetch.mock.calls[2][0])
    expect(thirdUrl).toContain('/models/gemini-2.5-flash-lite:generateContent')
  })

  it('uses Gemma-compatible request shape without systemInstruction', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Rewritten prompt' }] } }],
    }), { status: 200 }))

    await callGoogleAPI('AIzaTestKey', 'system prompt', 'user prompt', 'gemma-3-27b-it')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))

    expect(body.systemInstruction).toBeUndefined()
    expect(body.contents).toEqual([
      {
        role: 'user',
        parts: [{ text: 'Instruction:\nsystem prompt\n\nTask:\nuser prompt' }],
      },
    ])
  })

  it('sanitizes Gemma analysis leakage down to the final prompt', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{
        finishReason: 'STOP',
        content: {
          parts: [{
            text: '* User Prompt: "how to learn java"\n* Platform: ChatGPT\n* Draft: roadmap\nPrompt: Give me a focused roadmap to learn Java.\n[DIFF: roadmap structure, practical focus]',
          }],
        },
      }],
    }), { status: 200 }))

    const text = await callGoogleAPI('AIzaTestKey', 'system prompt', 'user prompt', 'gemma-3-27b-it')

    expect(text).toBe('Give me a focused roadmap to learn Java.\n[DIFF: roadmap structure, practical focus]')
  })
})
