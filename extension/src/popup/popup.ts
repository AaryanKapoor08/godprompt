// Popup script — BYOK settings page with provider detection and model selection

import { validateApiKey, type Provider } from '../lib/llm-client'

// --- DOM Elements ---
const headerLogo = document.getElementById('header-logo') as HTMLImageElement
const apiKeyInput = document.getElementById('api-key') as HTMLInputElement
const keyStatus = document.getElementById('key-status') as HTMLDivElement
const modelSelect = document.getElementById('model-select') as HTMLSelectElement
const modelHint = document.getElementById('model-hint') as HTMLSpanElement

// Set header logo from extension assets
headerLogo.src = chrome.runtime.getURL('assets/icon-48.png')

// --- Model Options ---
const MODELS: Record<string, { label: string; value: string }[]> = {
  anthropic: [
    { label: 'Claude Haiku 4.5 (fast, cheap)', value: 'claude-haiku-4-5-20251001' },
    { label: 'Claude Sonnet 4 (balanced)', value: 'claude-sonnet-4-20250514' },
  ],
  openai: [
    { label: 'GPT-4o-mini (fast, cheap)', value: 'gpt-4o-mini' },
    { label: 'GPT-4o (powerful)', value: 'gpt-4o' },
  ],
  openrouter: [
    { label: 'Nemotron Nano (free)', value: 'nvidia/nemotron-3-nano-30b-a3b:free' },
    { label: 'Claude Haiku 3.5', value: 'anthropic/claude-3.5-haiku' },
    { label: 'GPT-4o-mini', value: 'openai/gpt-4o-mini' },
  ],
}

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
}

// --- Init: Load saved settings ---
chrome.storage.local.get(['apiKey', 'provider', 'model'], (result) => {
  if (result.apiKey) {
    apiKeyInput.value = result.apiKey
    updateKeyValidationUI(result.apiKey)
    updateModelDropdown(result.provider, result.model)
  }
})

// --- API Key Input ---
let saveTimeout: ReturnType<typeof setTimeout> | null = null

apiKeyInput.addEventListener('input', () => {
  if (saveTimeout) clearTimeout(saveTimeout)

  const key = apiKeyInput.value.trim()

  // Immediate visual feedback
  updateKeyValidationUI(key)

  saveTimeout = setTimeout(() => {
    if (!key) {
      chrome.storage.local.remove(['apiKey', 'provider', 'model'])
      showKeyStatus('Key cleared', 'saved')
      clearModelDropdown()
      return
    }

    const { valid, provider } = validateApiKey(key)

    if (!valid) {
      showKeyStatus('Invalid key format', 'error')
      clearModelDropdown()
      return
    }

    chrome.storage.local.set({ apiKey: key, provider }, () => {
      showKeyStatus(`${PROVIDER_NAMES[provider!]} key saved`, 'saved')
      updateModelDropdown(provider!)
    })
  }, 500)
})

function updateKeyValidationUI(key: string): void {
  if (!key) {
    apiKeyInput.classList.remove('input--valid', 'input--invalid')
    return
  }

  const { valid } = validateApiKey(key)
  apiKeyInput.classList.toggle('input--valid', valid)
  apiKeyInput.classList.toggle('input--invalid', !valid)
}

// --- Model Dropdown ---
function updateModelDropdown(provider: Provider | null, selectedModel?: string): void {
  updateModelHint(provider)

  if (!provider || !MODELS[provider]) {
    clearModelDropdown()
    return
  }

  const models = MODELS[provider]
  modelSelect.innerHTML = ''

  for (const model of models) {
    const option = document.createElement('option')
    option.value = model.value
    option.textContent = model.label
    modelSelect.appendChild(option)
  }

  // Restore selected model or use first as default
  if (selectedModel && models.some((m) => m.value === selectedModel)) {
    modelSelect.value = selectedModel
  } else {
    modelSelect.value = models[0].value
    chrome.storage.local.set({ model: models[0].value })
  }
}

function clearModelDropdown(): void {
  modelSelect.innerHTML = '<option value="">Enter an API key first</option>'
}

function updateModelHint(provider: Provider | null): void {
  modelHint.textContent = provider === 'openrouter' ? 'Haiku recommended' : ''
}

modelSelect.addEventListener('change', () => {
  const model = modelSelect.value
  if (model) {
    chrome.storage.local.set({ model })
  }
})

// --- Status Helpers ---
function showKeyStatus(message: string, type: 'saved' | 'error'): void {
  keyStatus.textContent = message
  keyStatus.className = `status status--${type}`
}
