import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callOpenRouterCompletionAPI } from '../../src/lib/llm-client'

describe('callOpenRouterCompletionAPI', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('extracts text from a non-stream OpenRouter completion response', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: 'Rewrite this prompt more clearly.',
          },
        },
      ],
    }), { status: 200 }))

    const text = await callOpenRouterCompletionAPI('sk-or-v1-test', 'system', 'user', 'openai/gpt-oss-20b:free')

    expect(text).toBe('Rewrite this prompt more clearly.')
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.stream).toBe(false)
  })

  it('throws when the non-stream response has no usable text', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{}] }), { status: 200 }))

    await expect(
      callOpenRouterCompletionAPI('sk-or-v1-test', 'system', 'user', 'openai/gpt-oss-20b:free')
    ).rejects.toThrow('OpenRouter completion returned no text output')
  })
})
