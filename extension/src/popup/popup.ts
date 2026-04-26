import { analyzeApiKey, detectProviderFromApiKey, type Provider } from '../lib/provider-policy'
import { PreferenceManager } from '../lib/preferences'
import { listGoogleModels } from '../lib/llm-client'
import { OPENROUTER_ACCOUNT_STATUS_KEY, type OpenRouterAccountStatus } from '../lib/rewrite-openrouter/account-status'
import { getOpenRouterCatalogWithPinnedFallback } from '../lib/rewrite-openrouter/catalog'
import {
  VISIBLE_PROVIDER_CHAIN,
  formatOpenRouterAccountStatus,
  getModelOptions,
  getOpenRouterFreeChainOptions,
  validateCustomOpenRouterModelId,
} from './model-options'

const headerLogo = document.getElementById('header-logo') as HTMLImageElement
const apiKeyInput = document.getElementById('api-key') as HTMLInputElement
const keyStatus = document.getElementById('key-status') as HTMLDivElement
const providerSelect = document.getElementById('provider-select') as HTMLSelectElement
const modelSelect = document.getElementById('model-select') as HTMLSelectElement
const modelHint = document.getElementById('model-hint') as HTMLSpanElement
const costHint = document.getElementById('cost-hint') as HTMLSpanElement
const openRouterAccountStatus = document.getElementById('openrouter-account-status') as HTMLDivElement
const visibleChainList = document.getElementById('visible-chain') as HTMLOListElement
const openRouterChainList = document.getElementById('openrouter-chain') as HTMLOListElement
const contextToggle = document.getElementById('context-toggle') as HTMLInputElement
const enhancementCountEl = document.getElementById('enhancement-count') as HTMLSpanElement
const customModelSection = document.getElementById('custom-model-section') as HTMLDivElement
const customModelInput = document.getElementById('custom-model') as HTMLInputElement
const customModelStatus = document.getElementById('custom-model-status') as HTMLDivElement
const saveButton = document.getElementById('save-settings') as HTMLButtonElement
const saveStatus = document.getElementById('save-status') as HTMLDivElement

headerLogo.src = chrome.runtime.getURL('assets/icon-48.png')

const PROVIDER_NAMES: Record<Provider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  openrouter: 'OpenRouter',
}

const draftModelByProvider: Partial<Record<Provider, string>> = {}
const savedApiKeysByProvider: Partial<Record<Provider, string>> = {}
const draftApiKeysByProvider: Partial<Record<Provider, string>> = {}
let openRouterLiveModelIds: string[] | undefined

function isProvider(value: string | undefined): value is Provider {
  return value === 'anthropic' || value === 'openai' || value === 'google' || value === 'openrouter'
}

function isSelectableProvider(value: string | undefined): value is Extract<Provider, 'google' | 'openrouter'> {
  return value === 'google' || value === 'openrouter'
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
  const savedProvider = isSelectableProvider(prefs.provider)
    ? prefs.provider
    : detectedProvider === 'openrouter' ? 'openrouter' : 'google'

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
  renderRoutingChain()

  if (typeof extraPrefs.customModel === 'string') {
    customModelInput.value = extraPrefs.customModel
  }

  updateKeyValidationUI(apiKeyInput.value, savedProvider)
  updateEnhancementCount(extraPrefs.totalEnhancements ?? 0)

  if (savedProvider === 'openrouter') {
    void loadOpenRouterModels()
    void updateOpenRouterAccountStatus()
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
    void updateOpenRouterAccountStatus()
  } else {
    openRouterAccountStatus.textContent = ''
    openRouterAccountStatus.className = 'status'
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
  const validation = validateCustomOpenRouterModelId(value)
  customModelStatus.textContent = validation.message
  customModelStatus.className = validation.valid && value ? 'status status--saved' : validation.valid ? 'status' : 'status status--error'
  if (validation.valid && value) draftModelByProvider.openrouter = value
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

  const models = getModelOptions(provider, openRouterLiveModelIds)
  modelSelect.innerHTML = ''

  for (const model of models) {
    const tierLabel = model.curationTier
      ? ` [${model.curationTier.toUpperCase()}]`
      : model.tier === 'free' ? ' [FREE]' : ' [PAID]'
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
    modelHint.textContent = 'Curated free chain'
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

  const selected = getModelOptions(provider, openRouterLiveModelIds).find((model) => model.value === modelSelect.value)
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

async function loadOpenRouterModels(): Promise<void> {
  try {
    const currentValue = modelSelect.value
    openRouterLiveModelIds = await getOpenRouterCatalogWithPinnedFallback()
    if (getSelectedProvider() === 'openrouter') {
      updateModelDropdown('openrouter', currentValue)
    }
    renderRoutingChain()
  } catch (error) {
    console.error({ cause: error }, '[PromptGod] Failed to load OpenRouter models')
  }
}

async function updateOpenRouterAccountStatus(): Promise<void> {
  const stored = await chrome.storage.local.get([OPENROUTER_ACCOUNT_STATUS_KEY])
  const status = stored[OPENROUTER_ACCOUNT_STATUS_KEY] as OpenRouterAccountStatus | undefined

  const view = formatOpenRouterAccountStatus(status)
  openRouterAccountStatus.textContent = view.message
  openRouterAccountStatus.className = view.className
}

function renderRoutingChain(): void {
  visibleChainList.innerHTML = ''
  for (const item of VISIBLE_PROVIDER_CHAIN) {
    const row = document.createElement('li')
    row.textContent = item.label
    visibleChainList.appendChild(row)
  }

  openRouterChainList.innerHTML = ''
  for (const model of getOpenRouterFreeChainOptions(openRouterLiveModelIds)) {
    const row = document.createElement('li')
    const label = document.createElement('span')
    const tier = document.createElement('span')
    label.textContent = model.label
    tier.textContent = model.curationTier ?? 'stable free'
    tier.className = model.curationTier === 'experimental free'
      ? 'chain-tier chain-tier--experimental'
      : 'chain-tier'
    row.append(label, tier)
    openRouterChainList.appendChild(row)
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
