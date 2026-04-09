import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PreferenceManager } from '../../src/lib/preferences'

describe('PreferenceManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock chrome.storage.local
    global.chrome = {
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn(),
          remove: vi.fn(),
        },
      },
    } as any
  })

  it('should retrieve preferences', async () => {
    const mockPrefs = { apiKey: 'sk-123', provider: 'openai', model: 'gpt-4o', providerApiKeys: { openai: 'sk-123' } }
    vi.mocked(chrome.storage.local.get).mockResolvedValue(mockPrefs)
    
    const prefs = await PreferenceManager.getPreferences()
    expect(prefs).toEqual(mockPrefs)
    expect(chrome.storage.local.get).toHaveBeenCalledWith(['apiKey', 'provider', 'model', 'includeConversationContext', 'providerApiKeys'])
  })

  it('should set a single preference', async () => {
    await PreferenceManager.setPreference('model', 'gpt-4o')
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ model: 'gpt-4o' })
  })

  it('should update multiple preferences', async () => {
    await PreferenceManager.updatePreferences({ apiKey: 'sk-456', provider: 'anthropic' })
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ apiKey: 'sk-456', provider: 'anthropic' })
  })

  it('should clear preferences', async () => {
    await PreferenceManager.clearPreferences()
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['apiKey', 'provider', 'model', 'includeConversationContext', 'providerApiKeys'])
  })
})
