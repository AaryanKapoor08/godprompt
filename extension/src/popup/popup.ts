// Popup script — saves API key to chrome.storage.local
// Minimal for Phase 5 — full settings UI comes in Phase 8

import { validateApiKey } from '../lib/llm-client'

const apiKeyInput = document.getElementById('api-key') as HTMLInputElement
const statusEl = document.getElementById('status') as HTMLDivElement

// Load saved key on popup open
chrome.storage.local.get(['apiKey'], (result) => {
  if (result.apiKey) {
    apiKeyInput.value = result.apiKey
    showStatus('Key saved', 'saved')
  }
})

// Save on input change (debounced)
let saveTimeout: ReturnType<typeof setTimeout> | null = null

apiKeyInput.addEventListener('input', () => {
  if (saveTimeout) clearTimeout(saveTimeout)

  saveTimeout = setTimeout(() => {
    const key = apiKeyInput.value.trim()

    if (!key) {
      chrome.storage.local.remove(['apiKey', 'provider'])
      showStatus('Key cleared', 'saved')
      return
    }

    const { valid, provider } = validateApiKey(key)

    if (!valid) {
      showStatus('Invalid key format — expected sk-ant-..., sk-or-..., or sk-...', 'error')
      return
    }

    const providerNames = { anthropic: 'Anthropic', openai: 'OpenAI', openrouter: 'OpenRouter' }
    chrome.storage.local.set({ apiKey: key, provider }, () => {
      showStatus(`${providerNames[provider!]} key saved`, 'saved')
    })
  }, 500)
})

function showStatus(message: string, type: 'saved' | 'error'): void {
  statusEl.textContent = message
  statusEl.className = `status status--${type}`
}
