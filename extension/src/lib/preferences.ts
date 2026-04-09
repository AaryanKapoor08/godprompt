export interface UserPreferences {
  apiKey?: string
  provider?: string
  model?: string
  includeConversationContext?: boolean
  providerApiKeys?: Record<string, string>
}

export class PreferenceManager {
  private static STORAGE_KEY = 'settings'

  static async getPreferences(): Promise<UserPreferences> {
    const result = await chrome.storage.local.get(['apiKey', 'provider', 'model', 'includeConversationContext', 'providerApiKeys'])
    return result as UserPreferences
  }

  static async setPreference<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]): Promise<void> {
    await chrome.storage.local.set({ [key]: value })
  }

  static async updatePreferences(prefs: Partial<UserPreferences>): Promise<void> {
    await chrome.storage.local.set(prefs)
  }

  static async clearPreferences(): Promise<void> {
    await chrome.storage.local.remove(['apiKey', 'provider', 'model', 'includeConversationContext', 'providerApiKeys'])
  }
}
