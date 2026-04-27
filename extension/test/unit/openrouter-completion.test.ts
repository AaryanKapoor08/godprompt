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

    const text = await callOpenRouterCompletionAPI('sk-or-v1-test', 'system', 'user', 'nvidia/nemotron-3-super-120b-a12b:free')

    expect(text).toBe('Rewrite this prompt more clearly.')
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.stream).toBe(false)
  })

  it('throws when the non-stream response has no usable text', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{}] }), { status: 200 }))

    await expect(
      callOpenRouterCompletionAPI('sk-or-v1-test', 'system', 'user', 'nvidia/nemotron-3-super-120b-a12b:free')
    ).rejects.toThrow('OpenRouter completion returned no text output')
  })

  it('rejects OpenRouter reasoning leakage instead of passing it through as a rewrite', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: `We need to rewrite the user's prompt as a prompt for the next AI, preserving intent and constraints.

Thus rewrite the prompt as a directive to the next AI.`,
          },
        },
      ],
    }), { status: 200 }))

    await expect(
      callOpenRouterCompletionAPI('sk-or-v1-test', 'system', 'user', 'nvidia/nemotron-3-nano-30b-a3b:free')
    ).rejects.toThrow('OpenRouter completion returned reasoning instead of rewritten prompt')
  })

  it('strips simple OpenRouter prompt labels without touching valid prompt text', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: 'Rewritten prompt: Use the API logs and support tickets for a hard triage pass.',
          },
        },
      ],
    }), { status: 200 }))

    const text = await callOpenRouterCompletionAPI('sk-or-v1-test', 'system', 'user', 'nvidia/nemotron-3-super-120b-a12b:free')

    expect(text).toBe('Use the API logs and support tickets for a hard triage pass.')
  })
})
