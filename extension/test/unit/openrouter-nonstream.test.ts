import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callOpenRouterAPIOnce } from '../../src/lib/llm-client'

describe('callOpenRouterAPIOnce', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns trimmed text when message content is a string', async () => {
    const mockResponse = new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '  rewritten prompt  ',
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse)

    const result = await callOpenRouterAPIOnce('sk-or-test', 'system', 'user', 'model/test')

    expect(result).toBe('rewritten prompt')
  })

  it('returns joined text when message content is an array', async () => {
    const mockResponse = new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: [
                { type: 'text', text: 'first line' },
                { type: 'tool', text: 'ignore this' },
                { type: 'text', text: 'second line' },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse)

    const result = await callOpenRouterAPIOnce('sk-or-test', 'system', 'user', 'model/test')

    expect(result).toBe('first line\nsecond line')
  })

  it('throws if non-stream response has no text content', async () => {
    const mockResponse = new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: [],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse)

    await expect(
      callOpenRouterAPIOnce('sk-or-test', 'system', 'user', 'model/test')
    ).rejects.toThrow('[LLMClient] OpenRouter non-stream response did not contain text output')
  })

  it('throws on non-ok response', async () => {
    const mockResponse = new Response('bad request', { status: 400 })

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse)

    await expect(
      callOpenRouterAPIOnce('sk-or-test', 'system', 'user', 'model/test')
    ).rejects.toThrow('[LLMClient] OpenRouter API (non-stream) returned 400: bad request')
  })
})
