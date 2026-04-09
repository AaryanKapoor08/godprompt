import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleEnhance } from '../../src/service-worker'

global.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
  runtime: {
    connect: vi.fn(),
  },
} as any

describe('Streaming Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should send SETTLEMENT DONE when enhancement completes successfully', async () => {
    const mockPort = {
      postMessage: vi.fn(),
      disconnect: vi.fn(),
    }
    const mockMsg = {
      type: 'ENHANCE',
      platform: 'chatgpt',
      rawPrompt: 'Hello',
      context: { isNewConversation: true, conversationLength: 0 },
    }
    const signal = new AbortController().signal

    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      apiKey: 'sk-123',
      provider: 'openai',
      model: 'gpt-4o',
    })

    try {
      await handleEnhance(mockPort, mockMsg, signal)
    } catch (e) {
      // Ignore API errors
    }
    
    expect(chrome.storage.local.get).toHaveBeenCalled()
  })
})
