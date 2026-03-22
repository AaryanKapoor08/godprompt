// Popup script — full settings page with mode toggle, model selection, and usage counter

import { validateApiKey, type Provider } from '../lib/llm-client'

// --- DOM Elements ---
const modeFreeBtn = document.getElementById('mode-free') as HTMLButtonElement
const modeByokBtn = document.getElementById('mode-byok') as HTMLButtonElement
const usageSection = document.getElementById('usage-section') as HTMLDivElement
const usageFill = document.getElementById('usage-fill') as HTMLDivElement
const usageText = document.getElementById('usage-text') as HTMLParagraphElement
const byokSection = document.getElementById('byok-section') as HTMLDivElement
const apiKeyInput = document.getElementById('api-key') as HTMLInputElement
const keyStatus = document.getElementById('key-status') as HTMLDivElement
const modelSelect = document.getElementById('model-select') as HTMLSelectElement

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

// --- State ---
let currentMode: 'free' | 'byok' = 'free'
let currentProvider: Provider | null = null

// --- Init: Load saved settings ---
chrome.storage.local.get(
  ['mode', 'apiKey', 'provider', 'model', 'usageCount', 'usageResetTime', 'rateLimitMax'],
  (result) => {
    // Set mode
    currentMode = result.mode === 'byok' ? 'byok' : 'free'
    updateModeUI()

    // Set API key
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey
      currentProvider = result.provider ?? null
      updateKeyValidationUI(result.apiKey)
      updateModelDropdown(result.provider, result.model)
    }

    // Check if usage window has expired — reset counter if so
    const usageResetTime = result.usageResetTime ?? 0
    const usageCount = (usageResetTime > 0 && Date.now() > usageResetTime)
      ? 0
      : (result.usageCount ?? 0)

    updateUsageCounter(usageCount, result.rateLimitMax ?? 10)
  }
)

// Listen for storage changes so usage counter updates live
// (e.g., when service worker syncs rate limit headers after an enhancement)
chrome.storage.local.onChanged.addListener((changes) => {
  if (changes.usageCount || changes.rateLimitMax) {
    const usageCount = changes.usageCount?.newValue ?? 0
    const rateLimitMax = changes.rateLimitMax?.newValue ?? 10
    updateUsageCounter(usageCount, rateLimitMax)
  }
})

// --- Mode Toggle ---
modeFreeBtn.addEventListener('click', () => {
  currentMode = 'free'
  chrome.storage.local.set({ mode: 'free' })
  updateModeUI()
})

modeByokBtn.addEventListener('click', () => {
  currentMode = 'byok'
  chrome.storage.local.set({ mode: 'byok' })
  updateModeUI()
})

function updateModeUI(): void {
  if (currentMode === 'free') {
    modeFreeBtn.classList.add('mode-btn--active')
    modeByokBtn.classList.remove('mode-btn--active')
    usageSection.style.display = ''
    byokSection.style.display = 'none'
  } else {
    modeFreeBtn.classList.remove('mode-btn--active')
    modeByokBtn.classList.add('mode-btn--active')
    usageSection.style.display = 'none'
    byokSection.style.display = ''
  }
}

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
      currentProvider = null
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

    currentProvider = provider
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
    // Save default model selection
    chrome.storage.local.set({ model: models[0].value })
  }
}

function clearModelDropdown(): void {
  modelSelect.innerHTML = '<option value="">Enter an API key first</option>'
}

modelSelect.addEventListener('change', () => {
  const model = modelSelect.value
  if (model) {
    chrome.storage.local.set({ model })
  }
})

// --- Usage Counter ---
function updateUsageCounter(used: number, max: number): void {
  const percent = Math.min((used / max) * 100, 100)
  usageFill.style.width = `${percent}%`

  usageFill.classList.remove('usage-bar__fill--warning', 'usage-bar__fill--full')
  if (percent >= 100) {
    usageFill.classList.add('usage-bar__fill--full')
  } else if (percent >= 70) {
    usageFill.classList.add('usage-bar__fill--warning')
  }

  usageText.textContent = `${used} of ${max} enhancements used this hour`
}

// --- Status Helpers ---
function showKeyStatus(message: string, type: 'saved' | 'error'): void {
  keyStatus.textContent = message
  keyStatus.className = `status status--${type}`
}
