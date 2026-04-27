import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  repairRewrite: vi.fn(() => {
    throw new Error('shared repair must not run on Gemma output')
  }),
  validateLlmBranchRewrite: vi.fn(() => {
    throw new Error('LLM branch validator must not run on Gemma output')
  }),
  repairTextBranchRewrite: vi.fn(() => {
    throw new Error('Text branch repair must not run on Gemma output')
  }),
  validateTextBranchRewrite: vi.fn(() => {
    throw new Error('Text branch validator must not run on Gemma output')
  }),
}))

vi.mock('../../src/lib/rewrite-core/repair', () => ({ repairRewrite: mocks.repairRewrite }))
vi.mock('../../src/lib/rewrite-llm-branch/validator', () => ({ validateLlmBranchRewrite: mocks.validateLlmBranchRewrite }))
vi.mock('../../src/lib/rewrite-text-branch/repair', () => ({ repairTextBranchRewrite: mocks.repairTextBranchRewrite }))
vi.mock('../../src/lib/rewrite-text-branch/validator', () => ({ validateTextBranchRewrite: mocks.validateTextBranchRewrite }))
vi.mock('../../src/lib/llm-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/llm-client')>()
  return {
    ...actual,
    callGoogleAPI: vi.fn(),
  }
})

import { callGoogleAPI } from '../../src/lib/llm-client'
import { handleContextEnhance, handleEnhance } from '../../src/service-worker'

const googleCall = vi.mocked(callGoogleAPI)

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

describe('Gemma pipeline isolation', () => {
  beforeEach(() => {
    googleCall.mockReset()
    mocks.repairRewrite.mockClear()
    mocks.validateLlmBranchRewrite.mockClear()
    mocks.repairTextBranchRewrite.mockClear()
    mocks.validateTextBranchRewrite.mockClear()
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (keys: string[] | string) => {
            const keyList = Array.isArray(keys) ? keys : [keys]
            if (keyList.includes('apiKey')) {
              return {
                apiKey: 'AIzaTestKey',
                provider: 'google',
                model: 'gemma-3-27b-it',
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

  it('does not run shared repair or LLM branch validation on direct Gemma LLM output', async () => {
    googleCall.mockResolvedValueOnce('Rewrite this prompt directly.')

    const port = createPort()
    await handleEnhance(
      port,
      {
        type: 'ENHANCE',
        platform: 'chatgpt',
        rawPrompt: 'rewrite this prompt',
        context: { isNewConversation: true, conversationLength: 0 },
      } as never,
      new AbortController().signal
    )

    expect(googleCall).toHaveBeenCalledTimes(1)
    expect(mocks.repairRewrite).not.toHaveBeenCalled()
    expect(mocks.validateLlmBranchRewrite).not.toHaveBeenCalled()
    expect(postedMessages(port)).toContainEqual({ type: 'TOKEN', text: 'Rewrite this prompt directly.' })
  })

  it('drops recent context for long self-contained direct Gemma LLM prompts', async () => {
    const rawPrompt = 'Use the Zendesk thread, Slack threads, customer Loom video, customer CSV, export job logs, and permissions screenshot to triage the customer data export escalation. Separate confirmed facts from assumptions, identify fast disproof checks, and draft customer-facing and internal updates.'
    googleCall.mockResolvedValueOnce('Triage the customer export escalation using the provided evidence.')

    const port = createPort()
    await handleEnhance(
      port,
      {
        type: 'ENHANCE',
        platform: 'claude',
        rawPrompt,
        context: { isNewConversation: false, conversationLength: 5 },
        recentContext: 'Stage 1: clean up notes. Stage 2: root cause buckets. Stage 3: internal update for Engineering, Design, and Support.',
      } as never,
      new AbortController().signal
    )

    expect(googleCall).toHaveBeenCalledTimes(1)
    expect(String(googleCall.mock.calls[0][2])).not.toContain('Stage 1')
    expect(String(googleCall.mock.calls[0][2])).not.toContain('Engineering, Design, and Support')
  })

  it('keeps recent context for short direct Gemma follow-up prompts', async () => {
    googleCall.mockResolvedValueOnce('Make the previous draft sharper.')

    const port = createPort()
    await handleEnhance(
      port,
      {
        type: 'ENHANCE',
        platform: 'claude',
        rawPrompt: 'make this sharper',
        context: { isNewConversation: false, conversationLength: 5 },
        recentContext: 'Previous draft: customer-facing launch note with cautious legal wording.',
      } as never,
      new AbortController().signal
    )

    expect(googleCall).toHaveBeenCalledTimes(1)
    expect(String(googleCall.mock.calls[0][2])).toContain('Previous draft: customer-facing launch note')
  })

  it('does not run shared Text branch repair or validation on direct Gemma Text output', async () => {
    googleCall.mockResolvedValueOnce('Follow up with them about the docs.\n[DIFF: clarity]')

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

    expect(googleCall).toHaveBeenCalledTimes(1)
    expect(mocks.repairTextBranchRewrite).not.toHaveBeenCalled()
    expect(mocks.validateTextBranchRewrite).not.toHaveBeenCalled()
    expect(postedMessages(port)).toContainEqual({
      type: 'RESULT',
      requestId: 'request-1',
      text: 'Follow up with them about the docs.',
    })
  })
})
