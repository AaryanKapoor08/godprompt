import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/llm-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/llm-client')>()
  return {
    ...actual,
    callGoogleAPI: vi.fn(),
    callOpenRouterCompletionAPI: vi.fn(),
  }
})

import { callGoogleAPI, callOpenRouterCompletionAPI } from '../../src/lib/llm-client'
import { handleContextEnhance, handleEnhance } from '../../src/service-worker'

const googleCall = vi.mocked(callGoogleAPI)
const openRouterCompletionCall = vi.mocked(callOpenRouterCompletionAPI)

function createPort() {
  return {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as chrome.runtime.Port & {
    postMessage: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  }
}

function postedMessages(port: ReturnType<typeof createPort>) {
  return port.postMessage.mock.calls.map(([message]) => message)
}

describe('service worker provider fallback after validator failures', () => {
  beforeEach(() => {
    googleCall.mockReset()
    openRouterCompletionCall.mockReset()
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (keys: string[] | string) => {
            const keyList = Array.isArray(keys) ? keys : [keys]
            if (keyList.includes('apiKey')) {
              return {
                apiKey: 'AIzaTestKey',
                provider: 'google',
                model: 'gemini-2.5-flash',
                includeConversationContext: true,
                providerApiKeys: {},
              }
            }
            return {
              totalEnhancements: 0,
              enhancementsByPlatform: {},
            }
          }),
          set: vi.fn(async () => undefined),
        },
        onChanged: { addListener: vi.fn() },
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('escalates LLM branch Google output to frozen Gemma after first pass and retry both fail validation', async () => {
    googleCall
      .mockResolvedValueOnce('Write a launch update to [recipient] about [project].')
      .mockResolvedValueOnce('Write a launch update to [recipient] about [project].')
      .mockResolvedValueOnce('Use the launch docs to draft the checklist, memo, FAQ, and internal summary.')

    const port = createPort()
    await handleEnhance(
      port,
      {
        type: 'ENHANCE',
        platform: 'chatgpt',
        rawPrompt: 'Use the launch docs to draft a checklist, memo, FAQ, and internal summary.',
        context: { isNewConversation: true, conversationLength: 0 },
      } as never,
      new AbortController().signal
    )

    expect(googleCall).toHaveBeenCalledTimes(3)
    expect(googleCall.mock.calls[0][3]).toBe('gemini-2.5-flash')
    expect(googleCall.mock.calls[1][3]).toBe('gemini-2.5-flash')
    expect(googleCall.mock.calls[2][3]).toBe('gemma-3-27b-it')
    expect(postedMessages(port)).toContainEqual({
      type: 'TOKEN',
      text: 'Use the launch docs to draft the checklist, memo, FAQ, and internal summary.',
    })
  })

  it('drops recent context for long self-contained non-Gemma LLM prompts', async () => {
    const rawPrompt = 'Use the Zendesk thread, Slack threads, customer Loom video, customer CSV, export job logs, and permissions screenshot to triage the customer data export escalation. Separate confirmed facts from assumptions, identify fast disproof checks, assign owners, draft a cautious customer update, and draft a separate internal update for Engineering, Support, and Customer Success.'
    googleCall.mockResolvedValueOnce('Use the Zendesk thread, Slack threads, Loom video, customer CSV, export job logs, and permissions screenshot to triage the export escalation. Separate facts from assumptions, list fast disproof checks, assign owners, draft a cautious customer update, and draft a separate internal update for Engineering, Support, and Customer Success.')

    const port = createPort()
    await handleEnhance(
      port,
      {
        type: 'ENHANCE',
        platform: 'claude',
        rawPrompt,
        context: { isNewConversation: false, conversationLength: 8 },
        recentContext: 'Stage 1: clean up notes. Stage 2: root cause buckets. Stage 3: internal update for Engineering, Design, and Support.',
      } as never,
      new AbortController().signal
    )

    expect(googleCall).toHaveBeenCalledTimes(1)
    expect(String(googleCall.mock.calls[0][2])).not.toContain('Stage 1')
    expect(String(googleCall.mock.calls[0][2])).not.toContain('Engineering, Design, and Support')
  })

  it('does not treat unchanged Gemma fallback output as a successful LLM rewrite', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/v1/key')) {
        return new Response(JSON.stringify({ data: { limit: 50, usage: 0 } }), { status: 200 })
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 })
    }))

    vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: string[] | string) => {
      const keyList = Array.isArray(keys) ? keys : [keys]
      if (keyList.includes('apiKey')) {
        return {
          apiKey: 'AIzaTestKey',
          provider: 'google',
          model: 'gemini-2.5-flash',
          includeConversationContext: true,
          providerApiKeys: { openrouter: 'sk-or-test' },
        }
      }
      return {
        totalEnhancements: 0,
        enhancementsByPlatform: {},
      }
    })

    const rawPrompt = 'Use the Zendesk thread, Slack notes, customer CSV, export job logs, and permissions screenshot to separate known facts, guesses, next checks, customer update, and internal update for a data export escalation.'
    googleCall
      .mockResolvedValueOnce(rawPrompt)
      .mockResolvedValueOnce(rawPrompt)
      .mockResolvedValueOnce(`[NO_CHANGE] ${rawPrompt}`)
    const port = createPort()
    await handleEnhance(
      port,
      {
        type: 'ENHANCE',
        platform: 'chatgpt',
        rawPrompt,
        context: { isNewConversation: true, conversationLength: 0 },
      } as never,
      new AbortController().signal
    )

    expect(postedMessages(port)).not.toContainEqual({
      type: 'TOKEN',
      text: rawPrompt,
    })
    expect(postedMessages(port)).toContainEqual({
      type: 'ERROR',
      message: 'No provider returned a usable rewrite. Retry once, or save an OpenRouter key/custom model and try again.',
    })
  })

  it('keeps all-provider terminal failures from being masked as OpenRouter-only failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/v1/key')) {
        return new Response(JSON.stringify({ data: { limit: 50, usage: 0 } }), { status: 200 })
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 })
    }))

    vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: string[] | string) => {
      const keyList = Array.isArray(keys) ? keys : [keys]
      if (keyList.includes('apiKey')) {
        return {
          apiKey: 'AIzaTestKey',
          provider: 'google',
          model: 'gemini-2.5-flash',
          includeConversationContext: true,
          providerApiKeys: { openrouter: 'sk-or-test' },
        }
      }
      return {
        totalEnhancements: 0,
        enhancementsByPlatform: {},
      }
    })

    const rawPrompt = 'Use the Zendesk thread, Slack notes, customer CSV, export job logs, and permissions screenshot to separate known facts, guesses, next checks, customer update, and internal update for a data export escalation.'
    googleCall
      .mockResolvedValueOnce(rawPrompt)
      .mockResolvedValueOnce(rawPrompt)
      .mockResolvedValueOnce(`[NO_CHANGE] ${rawPrompt}`)
    openRouterCompletionCall.mockRejectedValue(new Error('[LLMClient] OpenRouter completion returned no text output'))

    const port = createPort()
    await handleEnhance(
      port,
      {
        type: 'ENHANCE',
        platform: 'chatgpt',
        rawPrompt,
        context: { isNewConversation: true, conversationLength: 0 },
      } as never,
      new AbortController().signal
    )

    expect(postedMessages(port)).toContainEqual({
      type: 'ERROR',
      message: 'No provider returned a usable rewrite. Retry once, or save an OpenRouter key/custom model and try again.',
    })
    expect(postedMessages(port)).not.toContainEqual({
      type: 'ERROR',
      message: 'The OpenRouter free chain did not return usable text. Retry once, or switch to a saved custom model.',
    })
  })

  it('escalates Text branch Google output to frozen Gemma after catastrophic retry also fails validation', async () => {
    googleCall
      .mockResolvedValueOnce('Who is the recipient?')
      .mockResolvedValueOnce('Who is the recipient?')
      .mockResolvedValueOnce('Follow up with them about the docs.')

    const port = createPort()
    await handleContextEnhance(
      port,
      {
        type: 'CONTEXT_ENHANCE',
        requestId: 'request-1',
        selectedText: 'follow up with them about the docs',
      } as never,
      new AbortController().signal
    )

    expect(googleCall).toHaveBeenCalledTimes(3)
    expect(googleCall.mock.calls[0][3]).toBe('gemini-2.5-flash')
    expect(googleCall.mock.calls[1][3]).toBe('gemini-2.5-flash')
    expect(googleCall.mock.calls[2][3]).toBe('gemma-3-27b-it')
    expect(postedMessages(port)).toContainEqual({
      type: 'RESULT',
      requestId: 'request-1',
      text: 'Follow up with them about the docs.',
    })
  })

  it('surfaces terminal failure quickly and logs the full LLM branch provider chain', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/v1/key')) {
        return new Response(JSON.stringify({ data: { limit: 50, usage: 0 } }), { status: 200 })
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 })
    }))

    vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: string[] | string) => {
      const keyList = Array.isArray(keys) ? keys : [keys]
      if (keyList.includes('apiKey')) {
        return {
          apiKey: 'AIzaTestKey',
          provider: 'google',
          model: 'gemini-2.5-flash',
          includeConversationContext: true,
          providerApiKeys: { openrouter: 'sk-or-test' },
        }
      }
      return {
        totalEnhancements: 0,
        enhancementsByPlatform: {},
      }
    })

    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    googleCall
      .mockRejectedValueOnce(new Error('Google API returned 503'))
      .mockRejectedValueOnce(new Error('Google API returned 503'))
    openRouterCompletionCall.mockRejectedValue(new Error('OpenRouter API returned 400'))

    const port = createPort()
    const startedAt = Date.now()
    await handleEnhance(
      port,
      {
        type: 'ENHANCE',
        platform: 'chatgpt',
        rawPrompt: 'Use the launch docs to draft a checklist, memo, FAQ, and internal summary.',
        context: { isNewConversation: true, conversationLength: 0 },
      } as never,
      new AbortController().signal
    )
    const elapsedMs = Date.now() - startedAt

    expect(elapsedMs).toBeLessThan(1000)
    expect(postedMessages(port)).toContainEqual({
      type: 'ERROR',
      message: 'No provider returned a usable rewrite. Retry once, or save an OpenRouter key/custom model and try again.',
    })
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: 'LLM',
        failureChain: expect.arrayContaining([
          expect.objectContaining({ provider: 'Google', model: 'gemini-2.5-flash' }),
          expect.objectContaining({ provider: 'Gemma', model: 'gemma-3-27b-it' }),
          expect.objectContaining({ provider: 'OpenRouter', model: 'nvidia/nemotron-3-super-120b-a12b:free' }),
        ]),
      }),
      '[PromptGod] All providers failed for LLM branch'
    )
  })

  it('surfaces terminal failure quickly and logs the full Text branch provider chain', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/v1/key')) {
        return new Response(JSON.stringify({ data: { limit: 50, usage: 0 } }), { status: 200 })
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 })
    }))

    vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: string[] | string) => {
      const keyList = Array.isArray(keys) ? keys : [keys]
      if (keyList.includes('apiKey')) {
        return {
          apiKey: 'AIzaTestKey',
          provider: 'google',
          model: 'gemini-2.5-flash',
          includeConversationContext: true,
          providerApiKeys: { openrouter: 'sk-or-test' },
        }
      }
      return {
        totalEnhancements: 0,
        enhancementsByPlatform: {},
      }
    })

    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    googleCall
      .mockRejectedValueOnce(new Error('Google API returned 503'))
      .mockRejectedValueOnce(new Error('Google API returned 503'))
    openRouterCompletionCall.mockRejectedValue(new Error('OpenRouter API returned 400'))

    const port = createPort()
    const startedAt = Date.now()
    await handleContextEnhance(
      port,
      {
        type: 'CONTEXT_ENHANCE',
        requestId: 'request-1',
        selectedText: 'follow up with them about the docs',
      } as never,
      new AbortController().signal
    )
    const elapsedMs = Date.now() - startedAt

    expect(elapsedMs).toBeLessThan(1000)
    expect(postedMessages(port)).toContainEqual({
      type: 'ERROR',
      message: 'No provider returned a usable rewrite. Retry once, or save an OpenRouter key/custom model and try again.',
    })
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: 'Text',
        failureChain: expect.arrayContaining([
          expect.objectContaining({ provider: 'Google', model: 'gemini-2.5-flash' }),
          expect.objectContaining({ provider: 'Gemma', model: 'gemma-3-27b-it' }),
          expect.objectContaining({ provider: 'OpenRouter', model: 'nvidia/nemotron-3-super-120b-a12b:free' }),
        ]),
      }),
      '[PromptGod] All providers failed for Text branch'
    )
  })
})
