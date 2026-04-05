// Popup script — BYOK settings page with provider detection and model selection

import { validateApiKey, type Provider } from '../lib/llm-client'

// --- DOM Elements ---
const headerLogo = document.getElementById('header-logo') as HTMLImageElement
const apiKeyInput = document.getElementById('api-key') as HTMLInputElement
const keyStatus = document.getElementById('key-status') as HTMLDivElement
const modelSelect = document.getElementById('model-select') as HTMLSelectElement
const modelHint = document.getElementById('model-hint') as HTMLSpanElement
const costHint = document.getElementById('cost-hint') as HTMLSpanElement
const contextToggle = document.getElementById('context-toggle') as HTMLInputElement
const enhancementCountEl = document.getElementById('enhancement-count') as HTMLSpanElement
const customModelSection = document.getElementById('custom-model-section') as HTMLDivElement
const customModelInput = document.getElementById('custom-model') as HTMLInputElement
const customModelStatus = document.getElementById('custom-model-status') as HTMLDivElement

// Set header logo from extension assets
headerLogo.src = chrome.runtime.getURL('assets/icon-48.png')

// --- Model Options ---
interface ModelOption {
  label: string
  value: string
  cost: string
}

const MODELS: Record<string, ModelOption[]> = {
  anthropic: [
    { label: 'Claude Haiku 4.5 (fast, cheap)', value: 'claude-haiku-4-5-20251001', cost: '~$0.001/enhance' },
    { label: 'Claude Sonnet 4 (balanced)', value: 'claude-sonnet-4-20250514', cost: '~$0.01/enhance' },
  ],
  openai: [
    { label: 'GPT-4o-mini (fast, cheap)', value: 'gpt-4o-mini', cost: '~$0.001/enhance' },
    { label: 'GPT-4o (powerful)', value: 'gpt-4o', cost: '~$0.01/enhance' },
  ],
  openrouter: [
    { label: 'Nemotron Nano (free)', value: 'nvidia/nemotron-3-nano-30b-a3b:free', cost: 'Free' },
    { label: 'Claude Haiku 3.5', value: 'anthropic/claude-3.5-haiku', cost: '~$0.001/enhance' },
    { label: 'GPT-4o-mini', value: 'openai/gpt-4o-mini', cost: '~$0.001/enhance' },
  ],
}

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
}

// --- Init: Load saved settings ---
chrome.storage.local.get(['apiKey', 'provider', 'model', 'includeConversationContext', 'totalEnhancements'], (result) => {
  if (result.apiKey) {
    apiKeyInput.value = result.apiKey
    updateKeyValidationUI(result.apiKey)
    updateModelDropdown(result.provider, result.model)
  }

  contextToggle.checked = result.includeConversationContext !== false // default: on
  updateEnhancementCount(result.totalEnhancements ?? 0)
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
let currentProvider: Provider | null = null

function updateModelDropdown(provider: Provider | null, selectedModel?: string): void {
  currentProvider = provider
  updateModelHint(provider)

  // Show/hide custom model input for OpenRouter
  customModelSection.style.display = provider === 'openrouter' ? 'block' : 'none'

  if (!provider || !MODELS[provider]) {
    clearModelDropdown()
    costHint.textContent = ''
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

  updateCostHint()

  // Fetch and cache OpenRouter model list
  if (provider === 'openrouter') {
    loadOpenRouterModels()
    // Restore custom model input
    chrome.storage.local.get(['customModel'], (result) => {
      if (result.customModel) {
        customModelInput.value = result.customModel
      }
    })
  }
}

function clearModelDropdown(): void {
  modelSelect.innerHTML = '<option value="">Enter an API key first</option>'
  costHint.textContent = ''
}

function updateModelHint(provider: Provider | null): void {
  modelHint.textContent = provider === 'openrouter' ? 'Haiku recommended' : ''
}

function updateCostHint(): void {
  if (!currentProvider) {
    costHint.textContent = ''
    return
  }
  const models = MODELS[currentProvider]
  const selected = models?.find((m) => m.value === modelSelect.value)
  costHint.textContent = selected ? selected.cost : ''
}

modelSelect.addEventListener('change', () => {
  const model = modelSelect.value
  if (model) {
    chrome.storage.local.set({ model })
  }
  updateCostHint()
})

// --- Custom Model ID (OpenRouter only) ---
let customModelTimeout: ReturnType<typeof setTimeout> | null = null

customModelInput.addEventListener('input', () => {
  if (customModelTimeout) clearTimeout(customModelTimeout)
  customModelTimeout = setTimeout(() => {
    const value = customModelInput.value.trim()

    if (!value) {
      // Cleared — use dropdown selection
      chrome.storage.local.remove(['customModel'])
      customModelStatus.textContent = ''
      const model = modelSelect.value
      if (model) chrome.storage.local.set({ model })
      return
    }

    if (!value.includes('/')) {
      customModelStatus.textContent = 'Invalid format — must contain / (e.g., org/model-name)'
      customModelStatus.className = 'status status--error'
      return
    }

    chrome.storage.local.set({ model: value, customModel: value })
    customModelStatus.textContent = 'Custom model saved'
    customModelStatus.className = 'status status--saved'
  }, 500)
})

// --- OpenRouter Model List Fetch ---
const OPENROUTER_CACHE_KEY = 'openrouterModelCache'
const OPENROUTER_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h

async function loadOpenRouterModels(): Promise<void> {
  try {
    const cached = await chrome.storage.local.get([OPENROUTER_CACHE_KEY])
    const cache = cached[OPENROUTER_CACHE_KEY] as { models: string[]; timestamp: number } | undefined

    if (cache && Date.now() - cache.timestamp < OPENROUTER_CACHE_TTL_MS) {
      appendOpenRouterModels(cache.models)
      return
    }

    const response = await fetch('https://openrouter.ai/api/v1/models')
    if (!response.ok) return

    const data = await response.json() as { data?: Array<{ id: string; name?: string }> }
    const ids = data.data?.map((m) => m.id).filter(Boolean) ?? []

    if (ids.length > 0) {
      await chrome.storage.local.set({
        [OPENROUTER_CACHE_KEY]: { models: ids, timestamp: Date.now() },
      })
      appendOpenRouterModels(ids)
    }
  } catch {
    // Fetch failed (e.g., airplane mode) — use hardcoded fallback, already in dropdown
  }
}

function appendOpenRouterModels(modelIds: string[]): void {
  const existing = new Set(Array.from(modelSelect.options).map((o) => o.value))
  for (const id of modelIds.slice(0, 50)) {
    if (!existing.has(id)) {
      const option = document.createElement('option')
      option.value = id
      option.textContent = id
      modelSelect.appendChild(option)
    }
  }
}

// --- Context Toggle ---
contextToggle.addEventListener('change', () => {
  chrome.storage.local.set({ includeConversationContext: contextToggle.checked })
})

// --- Enhancement Counter ---
function updateEnhancementCount(count: number): void {
  if (count > 0) {
    enhancementCountEl.textContent = `${count} prompt${count === 1 ? '' : 's'} enhanced`
  } else {
    enhancementCountEl.textContent = ''
  }
}

// --- Status Helpers ---
function showKeyStatus(message: string, type: 'saved' | 'error'): void {
  keyStatus.textContent = message
  keyStatus.className = `status status--${type}`
}
