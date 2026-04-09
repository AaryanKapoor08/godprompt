import { analyzeApiKey, detectProviderFromApiKey, type Provider } from '../lib/provider-policy'
import { PreferenceManager } from '../lib/preferences'
import { listGoogleModels } from '../lib/llm-client'

const headerLogo = document.getElementById('header-logo') as HTMLImageElement
const apiKeyInput = document.getElementById('api-key') as HTMLInputElement
const keyStatus = document.getElementById('key-status') as HTMLDivElement
const providerSelect = document.getElementById('provider-select') as HTMLSelectElement
const modelSelect = document.getElementById('model-select') as HTMLSelectElement
const modelHint = document.getElementById('model-hint') as HTMLSpanElement
const costHint = document.getElementById('cost-hint') as HTMLSpanElement
const contextToggle = document.getElementById('context-toggle') as HTMLInputElement
const enhancementCountEl = document.getElementById('enhancement-count') as HTMLSpanElement
const customModelSection = document.getElementById('custom-model-section') as HTMLDivElement
const customModelInput = document.getElementById('custom-model') as HTMLInputElement
const customModelStatus = document.getElementById('custom-model-status') as HTMLDivElement
const saveButton = document.getElementById('save-settings') as HTMLButtonElement
const saveStatus = document.getElementById('save-status') as HTMLDivElement

headerLogo.src = chrome.runtime.getURL('assets/icon-48.png')

interface ModelOption {
  label: string
  value: string
  cost: string
  tier: 'free' | 'paid'
}

const MODELS: Record<Provider, ModelOption[]> = {
  anthropic: [
    { label: 'Claude Haiku 3.5', value: 'claude-3-5-haiku-20241022', cost: 'Low cost', tier: 'paid' },
    { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514', cost: 'Higher quality, higher cost', tier: 'paid' },
  ],
  openai: [
    { label: 'GPT-4o-mini', value: 'gpt-4o-mini', cost: '~$0.001/enhance', tier: 'paid' },
    { label: 'GPT-4o', value: 'gpt-4o', cost: '~$0.01/enhance', tier: 'paid' },
  ],
  google: [
    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash', cost: 'Free tier available', tier: 'free' },
    { label: 'Gemini 2.5 Flash Lite', value: 'gemini-2.5-flash-lite', cost: 'Free tier available', tier: 'free' },
    { label: 'Gemma 3 27B IT', value: 'gemma-3-27b-it', cost: 'Free tier available', tier: 'free' },
  ],
  openrouter: [
    { label: 'GPT-OSS 20B', value: 'openai/gpt-oss-20b:free', cost: 'Free', tier: 'free' },
    { label: 'Llama 3.3 70B', value: 'meta-llama/llama-3.3-70b-instruct:free', cost: 'Free', tier: 'free' },
    { label: 'Nemotron Nano 30B', value: 'nvidia/nemotron-3-nano-30b-a3b:free', cost: 'Free', tier: 'free' },
    { label: 'Gemma 3 27B', value: 'google/gemma-3-27b-it:free', cost: 'Free', tier: 'free' },
    { label: 'GPT-4o-mini', value: 'openai/gpt-4o-mini', cost: '~$0.001/enhance', tier: 'paid' },
  ],
}

const PROVIDER_NAMES: Record<Provider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  openrouter: 'OpenRouter',
}

const draftModelByProvider: Partial<Record<Provider, string>> = {}
const savedApiKeysByProvider: Partial<Record<Provider, string>> = {}
const draftApiKeysByProvider: Partial<Record<Provider, string>> = {}

function isProvider(value: string | undefined): value is Provider {
  return value === 'anthropic' || value === 'openai' || value === 'google' || value === 'openrouter'
}

function normalizeModelId(model: string | undefined): string | undefined {
  if (!model) return model

  if (model === 'nvidia/nemotron-nano-30b-a3b:free') {
    return 'nvidia/nemotron-3-nano-30b-a3b:free'
  }

  if (
    model === 'gemma-4'
    || model === 'models/gemma-4'
    || model === 'gemma-4-it'
    || model === 'gemma-4-31b-it'
    || model === 'gemma-4-26b-a4b-it'
  ) {
    return 'gemma-3-27b-it'
  }

  if (model === 'claude-haiku-4-5-20251001') {
    return 'claude-3-5-haiku-20241022'
  }

  return model
}

function getSelectedProvider(): Provider {
  return providerSelect.value as Provider
}

function getOpenRouterOptionLabel(modelId: string): string {
  if (modelId.endsWith(':free')) {
    return `${modelId} [FREE]`
  }

  return `${modelId} [PAID?]`
}

function createModelOption(model: string, label: string): HTMLOptionElement {
  const option = document.createElement('option')
  option.value = model
  option.textContent = label
  return option
}

function replaceApiKeyMap(
  target: Partial<Record<Provider, string>>,
  source: Partial<Record<Provider, string>>
): void {
  for (const provider of Object.keys(PROVIDER_NAMES) as Provider[]) {
    delete target[provider]
  }

  Object.assign(target, source)
}

async function initPopup() {
  const prefs = await PreferenceManager.getPreferences()
  const extraPrefs = await chrome.storage.local.get(['customModel', 'totalEnhancements'])

  const normalizedModel = normalizeModelId(prefs.model)
  if (normalizedModel && normalizedModel !== prefs.model) {
    await PreferenceManager.setPreference('model', normalizedModel)
  }

  const providerApiKeys = { ...(prefs.providerApiKeys ?? {}) } as Partial<Record<Provider, string>>
  const detectedProvider = detectProviderFromApiKey(prefs.apiKey ?? '')
  const savedProvider = isProvider(prefs.provider) ? prefs.provider : (detectedProvider ?? 'openrouter')

  if (prefs.apiKey && savedProvider && !providerApiKeys[savedProvider]) {
    providerApiKeys[savedProvider] = prefs.apiKey
    await chrome.storage.local.set({ providerApiKeys })
  }

  replaceApiKeyMap(savedApiKeysByProvider, providerApiKeys)
  replaceApiKeyMap(draftApiKeysByProvider, providerApiKeys)

  apiKeyInput.value = draftApiKeysByProvider[savedProvider] ?? ''
  providerSelect.value = savedProvider
  contextToggle.checked = prefs.includeConversationContext !== false

  if (typeof normalizedModel === 'string') {
    draftModelByProvider[savedProvider] = normalizedModel
  }

  updateModelDropdown(savedProvider, normalizedModel)

  if (typeof extraPrefs.customModel === 'string') {
    customModelInput.value = extraPrefs.customModel
  }

  updateKeyValidationUI(apiKeyInput.value, savedProvider)
  updateEnhancementCount(extraPrefs.totalEnhancements ?? 0)

  if (savedProvider === 'openrouter') {
    void loadOpenRouterModels()
  }

  if (savedProvider === 'google' && apiKeyInput.value.trim()) {
    await loadGoogleModels(apiKeyInput.value.trim(), normalizedModel)
  }
}

void initPopup()

apiKeyInput.addEventListener('input', () => {
  draftApiKeysByProvider[getSelectedProvider()] = apiKeyInput.value
  updateKeyValidationUI(apiKeyInput.value, getSelectedProvider())
  clearSaveStatus()
})

providerSelect.addEventListener('change', async () => {
  const provider = getSelectedProvider()
  const draftModel = draftModelByProvider[provider]
  apiKeyInput.value = draftApiKeysByProvider[provider] ?? savedApiKeysByProvider[provider] ?? ''

  updateModelDropdown(provider, draftModel)
  updateKeyValidationUI(apiKeyInput.value, provider)
  clearSaveStatus()

  if (provider === 'openrouter') {
    void loadOpenRouterModels()
  }

  if (provider === 'google' && apiKeyInput.value.trim()) {
    await loadGoogleModels(apiKeyInput.value.trim(), draftModel)
  }
})

modelSelect.addEventListener('change', () => {
  const provider = getSelectedProvider()
  const model = modelSelect.value
  if (model) {
    draftModelByProvider[provider] = model
  }

  if (provider === 'openrouter' && customModelInput.value.trim() === '') {
    customModelStatus.textContent = ''
    customModelStatus.className = 'status'
  }

  updateCostHint()
  clearSaveStatus()
})

customModelInput.addEventListener('input', () => {
  const value = customModelInput.value.trim()
  if (!value) {
    customModelStatus.textContent = ''
    customModelStatus.className = 'status'
    updateCostHint()
    clearSaveStatus()
    return
  }

  if (!value.includes('/')) {
    customModelStatus.textContent = 'Custom model IDs must look like org/model-name.'
    customModelStatus.className = 'status status--error'
    updateCostHint()
    clearSaveStatus()
    return
  }

  customModelStatus.textContent = 'Custom model will be saved for OpenRouter.'
  customModelStatus.className = 'status status--saved'
  draftModelByProvider.openrouter = value
  updateCostHint()
  clearSaveStatus()
})

contextToggle.addEventListener('change', () => {
  clearSaveStatus()
})

saveButton.addEventListener('click', async () => {
  const provider = getSelectedProvider()
  const apiKey = apiKeyInput.value.trim()

  let modelToSave = modelSelect.value.trim()
  const customModel = customModelInput.value.trim()
  if (provider === 'openrouter' && customModel) {
    if (!customModel.includes('/')) {
      customModelStatus.textContent = 'Custom model IDs must look like org/model-name.'
      customModelStatus.className = 'status status--error'
      showSaveStatus('Fix the custom model ID before saving.', 'error')
      return
    }

    modelToSave = customModel
  }

  if (!modelToSave) {
    showSaveStatus('Select a model before saving.', 'error')
    return
  }

  const updates: Record<string, unknown> = {
    provider,
    model: normalizeModelId(modelToSave),
    includeConversationContext: contextToggle.checked,
  }

  const nextProviderApiKeys: Partial<Record<Provider, string>> = { ...savedApiKeysByProvider }
  if (apiKey) {
    nextProviderApiKeys[provider] = apiKey
  } else {
    delete nextProviderApiKeys[provider]
  }

  replaceApiKeyMap(savedApiKeysByProvider, nextProviderApiKeys)
  replaceApiKeyMap(draftApiKeysByProvider, nextProviderApiKeys)

  await chrome.storage.local.set({
    ...updates,
    apiKey,
    providerApiKeys: nextProviderApiKeys,
  })

  if (provider === 'openrouter' && customModel) {
    await chrome.storage.local.set({ customModel })
  } else {
    await chrome.storage.local.remove(['customModel'])
  }

  draftModelByProvider[provider] = normalizeModelId(modelToSave)
  updateKeyValidationUI(apiKey, provider)
  showSaveStatus(apiKey ? 'Settings saved.' : 'Settings saved. Add an API key before enhancing prompts.', 'saved')
})

function updateKeyValidationUI(key: string, provider: Provider): void {
  const analysis = analyzeApiKey(key)
  apiKeyInput.classList.remove('input--valid', 'input--invalid')

  if (!key.trim()) {
    keyStatus.textContent = ''
    keyStatus.className = 'status'
    return
  }

  if (analysis.recognizedFormat) {
    apiKeyInput.classList.add('input--valid')
    if (analysis.detectedProvider === provider) {
      keyStatus.textContent = `${PROVIDER_NAMES[provider]} key format recognized. Click Save to apply changes.`
      keyStatus.className = 'status status--saved'
      return
    }

    keyStatus.textContent = `This key looks like ${PROVIDER_NAMES[analysis.detectedProvider!]}. It will still be saved for ${PROVIDER_NAMES[provider]}.`
    keyStatus.className = 'status status--warning'
    return
  }

  keyStatus.textContent = `Format not recognized. The key will still be saved for ${PROVIDER_NAMES[provider]}.`
  keyStatus.className = 'status status--warning'
}

function updateModelDropdown(provider: Provider, selectedModel?: string): void {
  updateModelHint(provider)
  customModelSection.style.display = provider === 'openrouter' ? 'block' : 'none'

  const models = MODELS[provider]
  modelSelect.innerHTML = ''

  for (const model of models) {
    const tierLabel = model.tier === 'free' ? ' [FREE]' : ' [PAID]'
    modelSelect.appendChild(createModelOption(model.value, `${model.label}${tierLabel}`))
  }

  const normalizedSelectedModel = normalizeModelId(selectedModel)
  if (normalizedSelectedModel && !models.some((model) => model.value === normalizedSelectedModel)) {
    modelSelect.appendChild(createModelOption(normalizedSelectedModel, `${normalizedSelectedModel} [SAVED]`))
  }

  const modelValue = normalizedSelectedModel
    ?? draftModelByProvider[provider]
    ?? models[0].value

  modelSelect.value = modelValue
  draftModelByProvider[provider] = modelValue
  updateCostHint()
}

function updateModelHint(provider: Provider): void {
  if (provider === 'openrouter') {
    modelHint.textContent = '4o-mini recommended (paid) | GPT-OSS recommended (free)'
  } else if (provider === 'openai') {
    modelHint.textContent = '4o-mini recommended'
  } else if (provider === 'anthropic') {
    modelHint.textContent = 'Haiku 3.5 is cheapest | Sonnet 4 for quality'
  } else {
    modelHint.textContent = 'Gemini 2.5 Flash recommended | Gemma 3 27B is free'
  }
}

function updateCostHint(): void {
  const provider = getSelectedProvider()
  const customModel = customModelInput.value.trim()

  if (provider === 'openrouter' && customModel) {
    costHint.textContent = customModel.endsWith(':free')
      ? 'Custom OpenRouter model marked free'
      : 'Custom OpenRouter model may be paid'
    return
  }

  const selected = MODELS[provider].find((model) => model.value === modelSelect.value)
  costHint.textContent = selected?.cost ?? 'Saved custom model'
}

function updateEnhancementCount(count: number): void {
  if (count > 0) {
    enhancementCountEl.textContent = `${count} prompt${count === 1 ? '' : 's'} enhanced`
  } else {
    enhancementCountEl.textContent = ''
  }
}

function showSaveStatus(message: string, type: 'saved' | 'error'): void {
  saveStatus.textContent = message
  saveStatus.className = `status status--${type}`
}

function clearSaveStatus(): void {
  saveStatus.textContent = ''
  saveStatus.className = 'status'
}

const OPENROUTER_CACHE_KEY = 'openrouterModelCache'
const OPENROUTER_CACHE_TTL_MS = 24 * 60 * 60 * 1000

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

    const data = await response.json() as { data?: Array<{ id: string }> }
    const ids = data.data?.map((model) => model.id).filter(Boolean) ?? []
    if (ids.length === 0) return

    await chrome.storage.local.set({
      [OPENROUTER_CACHE_KEY]: { models: ids, timestamp: Date.now() },
    })
    appendOpenRouterModels(ids)
  } catch (error) {
    console.error({ cause: error }, '[PromptGod] Failed to load OpenRouter models')
  }
}

function appendOpenRouterModels(modelIds: string[]): void {
  const currentValue = modelSelect.value
  const existing = new Set(Array.from(modelSelect.options).map((option) => option.value))

  for (const id of modelIds.slice(0, 80)) {
    if (!existing.has(id)) {
      modelSelect.appendChild(createModelOption(id, getOpenRouterOptionLabel(id)))
    }
  }

  if (currentValue && Array.from(modelSelect.options).some((option) => option.value === currentValue)) {
    modelSelect.value = currentValue
  }
}

async function loadGoogleModels(apiKey: string, selectedModel?: string): Promise<void> {
  try {
    const currentValue = selectedModel ?? modelSelect.value
    const modelIds = await listGoogleModels(apiKey)
    if (modelIds.length === 0) return

    const existing = new Set(Array.from(modelSelect.options).map((option) => option.value))
    for (const id of modelIds.slice(0, 80)) {
      if (!existing.has(id)) {
        const label = id.startsWith('gemma-') ? `${id} [FREE?]` : id
        modelSelect.appendChild(createModelOption(id, label))
      }
    }

    if (currentValue && Array.from(modelSelect.options).some((option) => option.value === currentValue)) {
      modelSelect.value = currentValue
    }
  } catch (error) {
    console.error({ cause: error }, '[PromptGod] Failed to load Google models')
  }
}
