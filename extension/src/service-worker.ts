// PromptGod service worker — background script
// Handles message routing between content scripts and LLM APIs
// Uses chrome.runtime.connect (ports) for streaming, NOT sendMessage

import type { ContentMessage, ServiceWorkerMessage } from './lib/types'
import { buildGemmaMetaPromptWithIntensity } from './lib/gemma-legacy/llm-branch'
import {
  buildUserMessage,
  callAnthropicAPI,
  callGoogleAPI,
  callOpenAIAPI,
  callOpenRouterCompletionAPI,
  callOpenRouterAPI,
  parseAnthropicStream,
  parseOpenAIStream,
} from './lib/llm-client'
import {
  shouldRetryOpenRouterSameModel,
  shouldRetryWithOpenRouterFallback,
} from './lib/openrouter-retry'
import { RequestSupervisor } from './background/supervisor'
import { translateError } from './lib/error-translator'
import { runPromptGodContextMenuHandler } from './content/context-menu-handler'
import {
  buildContextUserMessage,
  buildGemmaSelectedTextMetaPrompt,
  cleanContextEnhancementOutput,
} from './lib/gemma-legacy/text-branch'
import { buildConservativeFallback } from './lib/rewrite-core/fallback'
import { repairRewrite } from './lib/rewrite-core/repair'
import type { RewriteProvider } from './lib/rewrite-core/types'
import { buildLlmBranchSpec } from './lib/rewrite-llm-branch/spec-builder'
import { buildLlmRetryUserMessage } from './lib/rewrite-llm-branch/retry'
import { validateLlmBranchRewrite } from './lib/rewrite-llm-branch/validator'
import { buildTextBranchSpec } from './lib/rewrite-text-branch/spec-builder'
import { repairTextBranchRewrite } from './lib/rewrite-text-branch/repair'
import { buildTextRetryUserMessage, shouldRetryTextBranch } from './lib/rewrite-text-branch/retry'
import { validateTextBranchRewrite } from './lib/rewrite-text-branch/validator'
import { GOOGLE_PRIMARY_MODEL, isGoogleGemmaModel } from './lib/rewrite-google/models'
import { shouldEscalateGoogleToFallback } from './lib/rewrite-google/retry-policy'
import { inspectOpenRouterAccountStatus, resetOpenRouterAccountStatusSession } from './lib/rewrite-openrouter/account-status'
import { getOpenRouterMaxTokens } from './lib/rewrite-openrouter/budget-policy'
import {
  OPENROUTER_CATALOG_TTL_MS,
  getOpenRouterCatalogWithPinnedFallback,
  refreshOpenRouterCatalog,
} from './lib/rewrite-openrouter/catalog'
import { OPENROUTER_PRIMARY_FREE_MODEL, normalizeOpenRouterModelId } from './lib/rewrite-openrouter/curation'
import {
  OPENROUTER_MODEL_COOLDOWN_MS,
  buildOpenRouterRouteChain,
  computeOpenRouterRateLimitBackoffMs,
  getOpenRouterCooldownRemainingMs,
  isOpenRouterRateLimitError,
  setOpenRouterModelCooldown,
  shouldTryNextOpenRouterModel,
} from './lib/rewrite-openrouter/route-policy'

const STREAM_STALL_TIMEOUT_MS = 45000
const OPENROUTER_FIRST_TOKEN_TIMEOUT_MS = 20000
const REQUEST_SUPERVISOR_TIMEOUT_MS = 65000
export const CONTEXT_MENU_ID = 'promptgod-context-enhance'
export const CONTEXT_MENU_TITLE = 'Run Text Branch'
export const CONTEXT_SELECTION_MAX_CHARS = 10000
const CONTEXT_PORT_NAME = 'context-enhance'

export type ContextSelectionValidation =
  | { ok: true; selectedText: string }
  | { ok: false; code: 'SELECTION_TOO_SHORT' | 'SELECTION_TOO_LONG'; message: string }

export type ContextEnhanceBootstrapRequest =
  | {
    requestId: string
    status: 'ready'
    selectedText: string
    requestedAt: number
  }
  | {
    requestId: string
    status: 'error'
    code: 'SELECTION_TOO_SHORT' | 'SELECTION_TOO_LONG'
    message: string
    requestedAt: number
  }

function isGoogleGemmaModelId(model: string | undefined): boolean {
  return isGoogleGemmaModel(model)
}

function mapRewriteProvider(provider: string | undefined): RewriteProvider {
  if (provider === 'openrouter') return 'OpenRouter'
  if (provider === 'openai') return 'OpenAI'
  if (provider === 'anthropic') return 'Anthropic'
  return 'Google'
}

type StreamProgress = {
  sentAnyToken: boolean
}

type ProviderFailureChainEntry = {
  branch: 'LLM' | 'Text'
  provider: 'Google' | 'Gemma' | 'OpenRouter'
  model: string
  stage: 'primary' | 'fallback' | 'final-chain'
  failure: string
}

// Retryable HTTP status codes (pre-first-token only)
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503])
const RETRY_DELAY_MS = 1000

const supervisor = new RequestSupervisor({
  timeoutMs: REQUEST_SUPERVISOR_TIMEOUT_MS,
  onTimeout: (port) => {
    sendMessage(port, { type: 'SETTLEMENT', status: 'ERROR', message: 'Request timed out while waiting for provider response.' })
    try {
      port.disconnect()
    } catch {
      // no-op
    }
  },
})

console.info('[PromptGod] Service worker started')

// --- Settings cache ---
// Avoids hitting chrome.storage.local.get on every enhance request.
// Invalidated via chrome.storage.onChanged listener.
let cachedSettings: {
  apiKey?: string
  provider?: string
  model?: string
  includeConversationContext?: boolean
  providerApiKeys?: Record<string, string>
} | null = null

async function getSettings(): Promise<{
  apiKey?: string
  provider?: string
  model?: string
  includeConversationContext?: boolean
  providerApiKeys?: Record<string, string>
}> {
  if (!cachedSettings) {
    const storedSettings = await chrome.storage.local.get(['apiKey', 'provider', 'model', 'includeConversationContext', 'providerApiKeys']) as typeof cachedSettings
    const provider = storedSettings?.provider
    const providerApiKeys = storedSettings?.providerApiKeys
    const resolvedApiKey = provider && providerApiKeys ? providerApiKeys[provider] ?? storedSettings?.apiKey : storedSettings?.apiKey

    cachedSettings = {
      apiKey: resolvedApiKey,
      provider,
      model: storedSettings?.model,
      includeConversationContext: storedSettings?.includeConversationContext,
      providerApiKeys,
    }
  }

  return {
    apiKey: cachedSettings.apiKey,
    provider: cachedSettings.provider,
    model: cachedSettings.model,
    includeConversationContext: cachedSettings.includeConversationContext,
    providerApiKeys: cachedSettings.providerApiKeys,
  }
}

async function buildOpenRouterModelChain(requestedModel: string): Promise<string[]> {
  const liveModelIds = await getOpenRouterCatalogWithPinnedFallback()
  return buildOpenRouterRouteChain(requestedModel, liveModelIds)
}

export function validateContextSelection(selectionText: string | undefined): ContextSelectionValidation {
  const selectedText = (selectionText ?? '').trim()

  if (selectedText.length > CONTEXT_SELECTION_MAX_CHARS) {
    return {
      ok: false,
      code: 'SELECTION_TOO_LONG',
      message: 'Selection is too long. Try a shorter passage.',
    }
  }

  if (shouldSkipContextSelection(selectedText)) {
    return {
      ok: false,
      code: 'SELECTION_TOO_SHORT',
      message: 'Select a little more text to enhance.',
    }
  }

  return { ok: true, selectedText }
}

function shouldSkipContextSelection(selectionText: string): boolean {
  const words = selectionText.trim().split(/\s+/)
  return words.length < 3 || words[0] === ''
}

export function createContextEnhanceRequest(
  validation: ContextSelectionValidation,
  requestId: string = crypto.randomUUID(),
  requestedAt: number = Date.now()
): ContextEnhanceBootstrapRequest {
  if (!validation.ok) {
    return {
      requestId,
      status: 'error',
      code: validation.code,
      message: validation.message,
      requestedAt,
    }
  }

  return {
    requestId,
    status: 'ready',
    selectedText: validation.selectedText,
    requestedAt,
  }
}

export function buildContextInjectionTarget(tabId: number, frameId?: number): chrome.scripting.InjectionTarget {
  const target: chrome.scripting.InjectionTarget = { tabId }

  if (typeof frameId === 'number' && frameId >= 0) {
    target.frameIds = [frameId]
  }

  return target
}

export function registerContextMenu(): void {
  if (!chrome.contextMenus?.create) return

  chrome.contextMenus.remove(CONTEXT_MENU_ID, () => {
    void chrome.runtime.lastError
    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_ID,
        title: CONTEXT_MENU_TITLE,
        contexts: ['selection'],
      },
      () => {
        const error = chrome.runtime.lastError
        if (error && !/duplicate id/i.test(error.message ?? '')) {
          console.info({ cause: error.message }, '[PromptGod] Could not register context menu')
        }
      }
    )
  })
}

export async function handleContextMenuClick(
  info: Pick<chrome.contextMenus.OnClickData, 'menuItemId' | 'selectionText' | 'frameId'>,
  tab?: chrome.tabs.Tab
): Promise<void> {
  if (info.menuItemId !== CONTEXT_MENU_ID) return

  const tabId = tab?.id
  if (typeof tabId !== 'number') {
    console.info('[PromptGod] Context enhance skipped because the clicked tab has no id')
    return
  }

  const validation = validateContextSelection(info.selectionText)
  const request = createContextEnhanceRequest(validation)

  try {
    await injectContextEnhanceRequest(tabId, info.frameId, request)
  } catch (error) {
    console.info(
      {
        cause: error instanceof Error ? error.message : String(error),
        tabId,
        frameId: info.frameId,
      },
      '[PromptGod] Could not inject text branch request'
    )
  }
}

async function injectContextEnhanceRequest(
  tabId: number,
  frameId: number | undefined,
  request: ContextEnhanceBootstrapRequest
): Promise<void> {
  if (!chrome.scripting?.executeScript) return

  await chrome.scripting.executeScript({
    target: buildContextInjectionTarget(tabId, frameId),
    func: runPromptGodContextMenuHandler,
    args: [request],
  })
}

export function initServiceWorker() {
  chrome.storage.onChanged.addListener(() => {
    cachedSettings = null
    resetOpenRouterAccountStatusSession()
  })

  registerContextMenu()
  chrome.runtime.onInstalled?.addListener(() => {
    registerContextMenu()
    void refreshOpenRouterCatalog().catch((error) => {
      console.info({ cause: error }, '[PromptGod] OpenRouter catalog refresh failed on install')
    })
  })
  chrome.runtime.onStartup?.addListener(() => {
    registerContextMenu()
    void refreshOpenRouterCatalog().catch((error) => {
      console.info({ cause: error }, '[PromptGod] OpenRouter catalog refresh failed on startup')
    })
  })
  chrome.contextMenus?.onClicked?.addListener((info, tab) => {
    void handleContextMenuClick(info, tab)
  })

  setInterval(() => {
    void refreshOpenRouterCatalog().catch((error) => {
      console.info({ cause: error }, '[PromptGod] OpenRouter catalog background refresh failed')
    })
  }, OPENROUTER_CATALOG_TTL_MS)

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'PING') {
      sendResponse({ type: 'PONG' })
    }
    return false
  })

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'enhance' && port.name !== CONTEXT_PORT_NAME) {
      return
    }

    console.info({ portName: port.name }, '[PromptGod] Port connected')

    const abortController = new AbortController()
    port.onDisconnect.addListener(() => {
      abortController.abort()
    })

    port.onMessage.addListener((msg: ContentMessage) => {
      if (port.name === 'enhance' && msg.type === 'ENHANCE') {
        handleEnhance(port, msg, abortController.signal)
      } else if (port.name === CONTEXT_PORT_NAME && msg.type === 'CONTEXT_ENHANCE') {
        handleContextEnhance(port, msg, abortController.signal)
      }
    })
  })
}

if (typeof chrome !== 'undefined') {
  initServiceWorker()
}

export async function handleEnhance(

  port: chrome.runtime.Port,
  msg: ContentMessage & { type: 'ENHANCE' },
  signal: AbortSignal
): Promise<void> {
  console.info(
    { platform: msg.platform, promptLength: msg.rawPrompt.length, context: msg.context },
    '[PromptGod] Received ENHANCE request'
  )

  supervisor.start(port)

  try {
    sendMessage(port, { type: 'START' })

    const { apiKey, provider, model, providerApiKeys } = await getSettings()

    if (!apiKey) {
      sendMessage(port, {
        type: 'ERROR',
        message: 'No API key set. Open PromptGod settings to add your key.',
        code: 'NO_API_KEY',
      })
      port.disconnect()
      return
    }

    // BYOK mode — direct API call
    const promptWordCount = msg.rawPrompt.trim().split(/\s+/).length
    const isFrozenGemmaPath = provider === 'google' && isGoogleGemmaModelId(model)

    if (!isFrozenGemmaPath) {
      const finalText = await runLlmBranchWithProviderFallback({
        apiKey,
        providerApiKeys,
        provider,
        model,
        platform: msg.platform,
        rawPrompt: msg.rawPrompt,
        promptWordCount,
        context: msg.context,
        recentContext: msg.recentContext,
        signal,
      })

      sendMessage(port, { type: 'TOKEN', text: finalText })
      sendMessage(port, { type: 'DONE' })
      sendMessage(port, { type: 'SETTLEMENT', status: 'DONE' })
      disconnectPortSoon(port)
      incrementCounter('totalEnhancements', msg.platform)
      console.info('[PromptGod] Enhancement complete')
      return
    }

    const systemPrompt = buildGemmaMetaPromptWithIntensity(
      msg.platform,
      msg.context.isNewConversation,
      msg.context.conversationLength,
      promptWordCount,
      msg.recentContext
    )

    const userMessage = buildUserMessage(msg.rawPrompt, msg.platform, msg.context, msg.recentContext)

    console.info(
      { platform: msg.platform, provider, model },
      '[PromptGod] Calling LLM API (BYOK)'
    )

    // Route to the correct provider, passing the selected model
    if (provider === 'openrouter') {
      const requestedModel = normalizeOpenRouterModelId((model ?? '').trim() || OPENROUTER_PRIMARY_FREE_MODEL)
      const modelsToTry = await buildOpenRouterModelChain(requestedModel)

      let sentAnyToken = false
      let openRouterSucceeded = false
      let lastError: unknown = null
      let rateLimitAttempt = 0

      outer:
      for (let modelIndex = 0; modelIndex < modelsToTry.length; modelIndex++) {
        const currentModel = modelsToTry[modelIndex]
        let sameModelRetriesRemaining = 1

        while (true) {
          const attemptProgress: StreamProgress = { sentAnyToken: false }
          const cooldownRemaining = getOpenRouterCooldownRemainingMs(currentModel)
          if (cooldownRemaining > 0) {
            await delay(Math.min(cooldownRemaining, 1500))
            break
          }

          const maxTokens = getOpenRouterMaxTokens(currentModel, promptWordCount)

          try {
            await streamOpenRouter(
              port,
              apiKey,
              systemPrompt,
              userMessage,
              currentModel,
              maxTokens,
              signal,
              attemptProgress
            )
            openRouterSucceeded = true
            break outer
          } catch (error) {
            lastError = error
            sentAnyToken = attemptProgress.sentAnyToken || sentAnyToken

            if (isOpenRouterRateLimitError(error)) {
              rateLimitAttempt++
              const backoffMs = computeOpenRouterRateLimitBackoffMs(error, rateLimitAttempt)
              setOpenRouterModelCooldown(currentModel, Math.max(OPENROUTER_MODEL_COOLDOWN_MS, backoffMs))
              console.info({ currentModel, backoffMs }, '[PromptGod] OpenRouter rate limited, cooling model and backing off')
              await delay(backoffMs)
            }

            // Never retry after tokens were already streamed: avoids duplicated prompt output.
            if (sentAnyToken) {
              break outer
            }

            if (
              sameModelRetriesRemaining > 0
              && shouldRetryOpenRouterSameModel(attemptProgress.sentAnyToken, error)
            ) {
              sameModelRetriesRemaining--
              console.info({ currentModel }, '[PromptGod] Retrying OpenRouter on same model')
              continue
            }

            const hasFallbackModel = modelIndex < modelsToTry.length - 1
            if (
              hasFallbackModel
              && shouldRetryWithOpenRouterFallback(currentModel, attemptProgress.sentAnyToken, error)
            ) {
              const fallbackModel = modelsToTry[modelIndex + 1]
              console.info({ currentModel, fallback: fallbackModel }, '[PromptGod] Retrying with fallback model')
              break
            }

            break outer
          }
        }
      }

      if (!openRouterSucceeded) {
        throw lastError ?? new Error('[ServiceWorker] OpenRouter request failed')
      }
    } else if (provider === 'anthropic') {
      const response = await callWithRetry(
        () => callAnthropicAPI(apiKey, systemPrompt, userMessage, model),
        signal
      )
      for await (const text of withStallTimeout(parseAnthropicStream(response), STREAM_STALL_TIMEOUT_MS)) {
        sendMessage(port, { type: 'TOKEN', text })
      }
    } else if (provider === 'openai') {
      const response = await callWithRetry(
        () => callOpenAIAPI(apiKey, systemPrompt, userMessage, model),
        signal
      )
      for await (const text of withStallTimeout(parseOpenAIStream(response), STREAM_STALL_TIMEOUT_MS)) {
        sendMessage(port, { type: 'TOKEN', text })
      }
    } else if (provider === 'google') {
      const responseText = await callGoogleAPI(
        apiKey,
        systemPrompt,
        userMessage,
        model ?? GOOGLE_PRIMARY_MODEL,
        512
      )
      sendMessage(port, { type: 'TOKEN', text: responseText })
    } else {
      sendMessage(port, {
        type: 'ERROR',
        message: `Unsupported provider: ${provider}. Use an Anthropic, OpenAI, Google, or OpenRouter key.`,
        code: 'UNSUPPORTED_PROVIDER',
      })
      disconnectPortSoon(port)
      return
    }

    sendMessage(port, { type: 'DONE' })
    sendMessage(port, { type: 'SETTLEMENT', status: 'DONE' })
    disconnectPortSoon(port)

    // Increment usage counters
    incrementCounter('totalEnhancements', msg.platform)

    console.info('[PromptGod] Enhancement complete')
  } catch (error) {
    if (signal.aborted) {
      console.info('[PromptGod] Enhancement aborted — port disconnected')
      return
    }

    // Increment error counter
    incrementCounter('errorCount')

    console.error('[PromptGod] Enhancement failed', error)
    const errorMessage = formatErrorMessage(error)
    sendMessage(port, {
      type: 'ERROR',
      message: errorMessage,
    })
    sendMessage(port, { type: 'SETTLEMENT', status: 'ERROR', message: errorMessage })
    disconnectPortSoon(port)
  } finally {
    supervisor.stop(port)
  }
}

type LlmBranchPipelineRequest = {
  apiKey: string
  provider?: string
  providerApiKeys?: Record<string, string>
  model?: string
  platform: string
  rawPrompt: string
  promptWordCount: number
  context: {
    isNewConversation: boolean
    conversationLength: number
  }
  recentContext?: string
  signal: AbortSignal
  escalateOnValidationFailure?: boolean
}

class RewriteValidationFailure extends Error {
  constructor(readonly branch: 'LLM' | 'Text') {
    super(`[ServiceWorker] ${branch} branch rewrite failed validation after targeted retry`)
    this.name = 'RewriteValidationFailure'
  }
}

async function runLlmBranchWithProviderFallback(request: LlmBranchPipelineRequest): Promise<string> {
  if (request.provider !== 'google') {
    return await runLlmBranchPipeline(request)
  }

  const failureChain: ProviderFailureChainEntry[] = []

  try {
    return await runLlmBranchPipeline({
      ...request,
      model: request.model ?? GOOGLE_PRIMARY_MODEL,
      escalateOnValidationFailure: true,
    })
  } catch (error) {
    failureChain.push(buildFailureChainEntry('LLM', 'Google', request.model ?? GOOGLE_PRIMARY_MODEL, 'primary', error))
    if (!(error instanceof RewriteValidationFailure) && !shouldEscalateGoogleToFallback(error)) {
      throw error
    }
    console.info({ cause: error }, '[PromptGod] Escalating Google LLM branch request to frozen Gemma fallback')
  }

  try {
    const systemPrompt = buildGemmaMetaPromptWithIntensity(
      request.platform,
      request.context.isNewConversation,
      request.context.conversationLength,
      request.promptWordCount,
      request.recentContext
    )
    const userMessage = buildUserMessage(request.rawPrompt, request.platform, request.context, request.recentContext)
    return await collectContextEnhancementText({
      apiKey: request.apiKey,
      provider: 'google',
      model: 'gemma-3-27b-it',
      systemPrompt,
      userMessage,
      promptWordCount: request.promptWordCount,
      signal: request.signal,
    })
  } catch (error) {
    failureChain.push(buildFailureChainEntry('LLM', 'Gemma', 'gemma-3-27b-it', 'fallback', error))
    if (!shouldEscalateGoogleToFallback(error)) {
      throw error
    }
    console.info({ cause: error }, '[PromptGod] Escalating LLM branch request from Gemma to OpenRouter chain')
  }

  const openRouterKey = request.providerApiKeys?.openrouter
  if (!openRouterKey) {
    failureChain.push({
      branch: 'LLM',
      provider: 'OpenRouter',
      model: OPENROUTER_PRIMARY_FREE_MODEL,
      stage: 'final-chain',
      failure: 'no OpenRouter key saved for final fallback',
    })
    throw buildAllProvidersFailedError('LLM', failureChain)
  }

  try {
    return await runLlmBranchPipeline({
      ...request,
      apiKey: openRouterKey,
      provider: 'openrouter',
      model: OPENROUTER_PRIMARY_FREE_MODEL,
      escalateOnValidationFailure: true,
    })
  } catch (error) {
    failureChain.push(buildFailureChainEntry('LLM', 'OpenRouter', OPENROUTER_PRIMARY_FREE_MODEL, 'final-chain', error))
    throw buildAllProvidersFailedError('LLM', failureChain)
  }
}

async function runLlmBranchPipeline({
  apiKey,
  provider,
  model,
  platform,
  rawPrompt,
  promptWordCount,
  context,
  recentContext,
  signal,
  escalateOnValidationFailure = false,
}: LlmBranchPipelineRequest): Promise<string> {
  const built = buildLlmBranchSpec({
    sourceText: rawPrompt,
    provider: mapRewriteProvider(provider),
    modelId: model ?? '',
    platform,
    isNewConversation: context.isNewConversation,
    conversationLength: context.conversationLength,
    recentContext,
  })

  const firstOutput = await collectContextEnhancementText({
    apiKey,
    provider,
    model,
    systemPrompt: built.systemPrompt,
    userMessage: built.userMessage,
    promptWordCount,
    signal,
  })
  const firstFinal = finalizeLlmBranchCandidate(rawPrompt, firstOutput)
  if (firstFinal.validation.ok) {
    return firstFinal.text
  }

  const retryUserMessage = buildLlmRetryUserMessage(rawPrompt, firstOutput, firstFinal.validation.issues)
  const retryOutput = await collectContextEnhancementText({
    apiKey,
    provider,
    model,
    systemPrompt: built.systemPrompt,
    userMessage: retryUserMessage,
    promptWordCount,
    signal,
  })
  const retryFinal = finalizeLlmBranchCandidate(rawPrompt, retryOutput)
  if (retryFinal.validation.ok) {
    return retryFinal.text
  }

  if (escalateOnValidationFailure) {
    throw new RewriteValidationFailure('LLM')
  }

  return buildConservativeFallback({ sourceText: rawPrompt })
}

function finalizeLlmBranchCandidate(sourceText: string, output: string): {
  text: string
  validation: ReturnType<typeof validateLlmBranchRewrite>
} {
  const repaired = repairRewrite({ sourceText, output }).output
  const text = normalizeNoChangeOutput(repaired, sourceText)
  return {
    text,
    validation: validateLlmBranchRewrite(sourceText, text),
  }
}

type TextBranchPipelineRequest = {
  apiKey: string
  provider?: string
  providerApiKeys?: Record<string, string>
  model?: string
  selectedText: string
  promptWordCount: number
  signal: AbortSignal
  escalateOnValidationFailure?: boolean
}

async function runTextBranchWithProviderFallback(request: TextBranchPipelineRequest): Promise<string> {
  if (request.provider !== 'google') {
    return await runTextBranchPipeline(request)
  }

  const failureChain: ProviderFailureChainEntry[] = []

  try {
    return await runTextBranchPipeline({
      ...request,
      model: request.model ?? GOOGLE_PRIMARY_MODEL,
      escalateOnValidationFailure: true,
    })
  } catch (error) {
    failureChain.push(buildFailureChainEntry('Text', 'Google', request.model ?? GOOGLE_PRIMARY_MODEL, 'primary', error))
    if (!(error instanceof RewriteValidationFailure) && !shouldEscalateGoogleToFallback(error)) {
      throw error
    }
    console.info({ cause: error }, '[PromptGod] Escalating Google Text branch request to frozen Gemma fallback')
  }

  try {
    return cleanContextEnhancementOutput(
      await collectContextEnhancementText({
        apiKey: request.apiKey,
        provider: 'google',
        model: 'gemma-3-27b-it',
        systemPrompt: buildGemmaSelectedTextMetaPrompt(request.promptWordCount),
        userMessage: buildContextUserMessage(request.selectedText),
        promptWordCount: request.promptWordCount,
        signal: request.signal,
      }),
      request.selectedText
    )
  } catch (error) {
    failureChain.push(buildFailureChainEntry('Text', 'Gemma', 'gemma-3-27b-it', 'fallback', error))
    if (!shouldEscalateGoogleToFallback(error)) {
      throw error
    }
    console.info({ cause: error }, '[PromptGod] Escalating Text branch request from Gemma to OpenRouter chain')
  }

  const openRouterKey = request.providerApiKeys?.openrouter
  if (!openRouterKey) {
    failureChain.push({
      branch: 'Text',
      provider: 'OpenRouter',
      model: OPENROUTER_PRIMARY_FREE_MODEL,
      stage: 'final-chain',
      failure: 'no OpenRouter key saved for final fallback',
    })
    throw buildAllProvidersFailedError('Text', failureChain)
  }

  try {
    return await runTextBranchPipeline({
      ...request,
      apiKey: openRouterKey,
      provider: 'openrouter',
      model: OPENROUTER_PRIMARY_FREE_MODEL,
      escalateOnValidationFailure: true,
    })
  } catch (error) {
    failureChain.push(buildFailureChainEntry('Text', 'OpenRouter', OPENROUTER_PRIMARY_FREE_MODEL, 'final-chain', error))
    throw buildAllProvidersFailedError('Text', failureChain)
  }
}

function buildFailureChainEntry(
  branch: 'LLM' | 'Text',
  provider: ProviderFailureChainEntry['provider'],
  model: string,
  stage: ProviderFailureChainEntry['stage'],
  error: unknown
): ProviderFailureChainEntry {
  return {
    branch,
    provider,
    model,
    stage,
    failure: summarizeProviderFailure(error),
  }
}

function summarizeProviderFailure(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function buildAllProvidersFailedError(branch: 'LLM' | 'Text', failureChain: ProviderFailureChainEntry[]): Error {
  console.error(
    { branch, failureChain },
    `[PromptGod] All providers failed for ${branch} branch`
  )

  const chainSummary = failureChain
    .map((entry) => `${entry.provider}/${entry.model}: ${entry.failure}`)
    .join(' | ')

  return new Error(`All providers failed for ${branch} branch. Failure chain: ${chainSummary}`)
}

async function runTextBranchPipeline({
  apiKey,
  provider,
  model,
  selectedText,
  promptWordCount,
  signal,
  escalateOnValidationFailure = false,
}: TextBranchPipelineRequest): Promise<string> {
  const built = buildTextBranchSpec({
    sourceText: selectedText,
    provider: mapRewriteProvider(provider),
    modelId: model ?? '',
  })

  const firstOutput = await collectContextEnhancementText({
    apiKey,
    provider,
    model,
    systemPrompt: built.systemPrompt,
    userMessage: built.userMessage,
    promptWordCount,
    signal,
  })
  const firstFinal = finalizeTextBranchCandidate(selectedText, firstOutput)
  if (firstFinal.validation.ok) {
    return firstFinal.text
  }

  if (shouldRetryTextBranch(firstFinal.validation.issues)) {
    const retryUserMessage = buildTextRetryUserMessage(selectedText, firstFinal.validation.issues)
    const retryOutput = await collectContextEnhancementText({
      apiKey,
      provider,
      model,
      systemPrompt: built.systemPrompt,
      userMessage: retryUserMessage,
      promptWordCount,
      signal,
    })
    const retryFinal = finalizeTextBranchCandidate(selectedText, retryOutput)
    if (retryFinal.validation.ok) {
      return retryFinal.text
    }
  }

  if (escalateOnValidationFailure) {
    throw new RewriteValidationFailure('Text')
  }

  return buildConservativeFallback({ sourceText: selectedText })
}

function finalizeTextBranchCandidate(sourceText: string, output: string): {
  text: string
  validation: ReturnType<typeof validateTextBranchRewrite>
} {
  const text = normalizeNoChangeOutput(repairTextBranchRewrite(sourceText, output), sourceText)
  return {
    text,
    validation: validateTextBranchRewrite(sourceText, text),
  }
}

function normalizeNoChangeOutput(output: string, sourceText: string): string {
  const withoutDiff = output.replace(/\[DIFF:[\s\S]*?\]/gi, '').trim()
  if (/^\[NO_CHANGE\]\b/i.test(withoutDiff)) {
    const body = withoutDiff.replace(/^\[NO_CHANGE\]\s*/i, '').trim()
    return body || sourceText.trim()
  }
  return withoutDiff
}

export async function handleContextEnhance(
  port: chrome.runtime.Port,
  msg: ContentMessage & { type: 'CONTEXT_ENHANCE' },
  signal: AbortSignal
): Promise<void> {
  console.info(
    { requestId: msg.requestId, selectionLength: msg.selectedText.length },
    '[PromptGod] Received text branch request'
  )

  supervisor.start(port)

  try {
    sendMessage(port, { type: 'START' })

    const validation = validateContextSelection(msg.selectedText)
    if (!validation.ok) {
      sendMessage(port, {
        type: 'ERROR',
        message: validation.message,
        code: validation.code,
      })
      sendMessage(port, { type: 'SETTLEMENT', status: 'ERROR', message: validation.message })
      disconnectPortSoon(port)
      return
    }

    const { apiKey, provider, model, providerApiKeys } = await getSettings()

    if (!apiKey) {
      const message = 'Set your API key in PromptGod settings.'
      sendMessage(port, {
        type: 'ERROR',
        message,
        code: 'NO_API_KEY',
      })
      sendMessage(port, { type: 'SETTLEMENT', status: 'ERROR', message })
      disconnectPortSoon(port)
      return
    }

    const selectedText = validation.selectedText
    const promptWordCount = selectedText.trim().split(/\s+/).length
    const isFrozenGemmaPath = provider === 'google' && isGoogleGemmaModelId(model)
    const systemPrompt = isFrozenGemmaPath
      ? buildGemmaSelectedTextMetaPrompt(promptWordCount)
      : ''
    const userMessage = isFrozenGemmaPath
      ? buildContextUserMessage(selectedText)
      : ''

    console.info(
      { requestId: msg.requestId, provider, model, selectionLength: selectedText.length },
      '[PromptGod] Calling LLM API for text branch'
    )

    const cleanText = isFrozenGemmaPath
      ? cleanContextEnhancementOutput(
        await collectContextEnhancementText({
          apiKey,
          provider,
          model,
          systemPrompt,
          userMessage,
          promptWordCount,
          signal,
        }),
        selectedText
      )
      : await runTextBranchWithProviderFallback({
        apiKey,
        providerApiKeys,
        provider,
        model,
        selectedText,
        promptWordCount,
        signal,
      })
    if (!cleanText) {
      throw new Error('[ServiceWorker] Context enhancement returned no text output')
    }

    sendMessage(port, {
      type: 'RESULT',
      requestId: msg.requestId,
      text: cleanText,
    })
    sendMessage(port, { type: 'DONE' })
    sendMessage(port, { type: 'SETTLEMENT', status: 'DONE' })
    disconnectPortSoon(port)

    incrementCounter('totalEnhancements', 'context')

    console.info(
      { requestId: msg.requestId, resultLength: cleanText.length },
      '[PromptGod] Text branch complete'
    )
  } catch (error) {
    if (signal.aborted) {
      console.info({ requestId: msg.requestId }, '[PromptGod] Text branch aborted — port disconnected')
      return
    }

    incrementCounter('errorCount')

    console.error({ requestId: msg.requestId, cause: error }, '[PromptGod] Text branch failed')
    const errorMessage = formatErrorMessage(error)
    sendMessage(port, {
      type: 'ERROR',
      message: errorMessage,
    })
    sendMessage(port, { type: 'SETTLEMENT', status: 'ERROR', message: errorMessage })
    disconnectPortSoon(port)
  } finally {
    supervisor.stop(port)
  }
}

type ContextProviderRequest = {
  apiKey: string
  provider?: string
  model?: string
  systemPrompt: string
  userMessage: string
  promptWordCount: number
  signal: AbortSignal
}

async function collectContextEnhancementText({
  apiKey,
  provider,
  model,
  systemPrompt,
  userMessage,
  promptWordCount,
  signal,
}: ContextProviderRequest): Promise<string> {
  if (provider === 'openrouter') {
    return await collectOpenRouterCompletionText(apiKey, systemPrompt, userMessage, model, promptWordCount, signal)
  }

  if (provider === 'anthropic') {
    const response = await callWithRetry(
      () => callAnthropicAPI(apiKey, systemPrompt, userMessage, model),
      signal
    )
    return await collectStreamText(parseAnthropicStream(response), signal)
  }

  if (provider === 'openai') {
    const response = await callWithRetry(
      () => callOpenAIAPI(apiKey, systemPrompt, userMessage, model),
      signal
    )
    return await collectStreamText(parseOpenAIStream(response), signal)
  }

  if (provider === 'google') {
    return await callGoogleAPI(
      apiKey,
      systemPrompt,
      userMessage,
      model ?? GOOGLE_PRIMARY_MODEL,
      512
    )
  }

  throw new Error(`Unsupported provider: ${provider}. Use an Anthropic, OpenAI, Google, or OpenRouter key.`)
}

async function collectOpenRouterCompletionText(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  model: string | undefined,
  promptWordCount: number,
  signal: AbortSignal
): Promise<string> {
  const accountStatus = await inspectOpenRouterAccountStatus(apiKey).catch((error) => {
    console.info({ cause: error }, '[PromptGod] Could not inspect OpenRouter account status')
    return null
  })
  if (accountStatus?.paused) {
    throw new Error('[ServiceWorker] OpenRouter daily limit reached; routing paused for today')
  }

  const requestedModel = normalizeOpenRouterModelId((model ?? '').trim() || OPENROUTER_PRIMARY_FREE_MODEL)
  const modelsToTry = await buildOpenRouterModelChain(requestedModel)

  let lastError: unknown = null
  let rateLimitAttempt = 0

  for (let modelIndex = 0; modelIndex < modelsToTry.length; modelIndex++) {
    if (signal.aborted) {
      throw new Error('[ServiceWorker] Context enhancement aborted')
    }

    const currentModel = modelsToTry[modelIndex]
    const cooldownRemaining = getOpenRouterCooldownRemainingMs(currentModel)
    if (cooldownRemaining > 0) {
      await delay(Math.min(cooldownRemaining, 1500))
      if (signal.aborted) {
        throw new Error('[ServiceWorker] Context enhancement aborted')
      }
    }

    const maxTokens = getOpenRouterMaxTokens(currentModel, promptWordCount)

    try {
      return await callWithRetry(
        () => callOpenRouterCompletionAPI(apiKey, systemPrompt, userMessage, currentModel, maxTokens),
        signal
      )
    } catch (error) {
      lastError = error

      if (isOpenRouterRateLimitError(error)) {
        rateLimitAttempt++
        const backoffMs = computeOpenRouterRateLimitBackoffMs(error, rateLimitAttempt)
        setOpenRouterModelCooldown(currentModel, Math.max(OPENROUTER_MODEL_COOLDOWN_MS, backoffMs))
        console.info({ currentModel, backoffMs }, '[PromptGod] OpenRouter context request rate limited')
        await delay(backoffMs)
      }

      const hasFallbackModel = modelIndex < modelsToTry.length - 1
      if (hasFallbackModel && shouldTryNextOpenRouterModel(false, error)) {
        const fallbackModel = modelsToTry[modelIndex + 1]
        console.info({ currentModel, fallback: fallbackModel }, '[PromptGod] Retrying context request with fallback model')
        continue
      }

      break
    }
  }

  throw new Error(
    `[ServiceWorker] OpenRouter curated chain exhausted (${modelsToTry.join(' -> ')}): ${
      lastError instanceof Error ? lastError.message : 'no provider responded'
    }`
  )
}

async function collectStreamText(source: AsyncGenerator<string, void, unknown>, signal: AbortSignal): Promise<string> {
  const chunks: string[] = []

  for await (const text of withStallTimeout(source, STREAM_STALL_TIMEOUT_MS)) {
    if (signal.aborted) {
      throw new Error('[ServiceWorker] Context enhancement aborted')
    }
    chunks.push(text)
  }

  return chunks.join('')
}

async function incrementCounter(key: 'totalEnhancements' | 'errorCount', platform?: string): Promise<void> {
  try {
    const data = await chrome.storage.local.get([key, 'enhancementsByPlatform'])
    const current = (data[key] as number) ?? 0
    const updates: Record<string, unknown> = { [key]: current + 1 }

    if (platform && key === 'totalEnhancements') {
      const byPlatform = (data.enhancementsByPlatform as Record<string, number>) ?? {}
      byPlatform[platform] = (byPlatform[platform] ?? 0) + 1
      updates.enhancementsByPlatform = byPlatform
    }

    await chrome.storage.local.set(updates)
  } catch {
    // Non-critical — don't break the enhancement flow
  }
}

function formatErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Enhancement failed'
  const genericTranslated = 'Something went wrong while enhancing the prompt. Check your API key, model choice, and connection, then try again.'
  const legacyGenericTranslated = 'An unexpected error occurred. Please check your connection and API settings.'

  // Detect network-level blocks (Brave Shields, privacy extensions, etc.)
  if (error instanceof TypeError && /failed to fetch|network/i.test(error.message)) {
    return 'API request blocked — if you\'re using Brave or a privacy browser, allow requests from extensions in your shield/privacy settings'
  }

  if (/OpenRouter completion returned no text output|OpenRouter curated chain exhausted|ended before emitting tokens|timed out while waiting for tokens|stream stalled/i.test(error.message)) {
    return 'The OpenRouter free chain did not return usable text. Retry once, or switch to a saved custom model.'
  }

  if (/All providers failed/i.test(error.message)) {
    return 'No provider returned a usable rewrite. Retry once, or save an OpenRouter key/custom model and try again.'
  }

  if (/Google API returned unusable output|Google API returned no text output/i.test(error.message)) {
    return 'Google returned a partial or blocked rewrite. Retry once, or switch to Gemini 2.5 Flash.'
  }

  if (/Google API overall request budget exceeded|Request timed out after/i.test(error.message)) {
    return 'The provider took too long to return a rewrite. Please retry once, or switch to a faster model.'
  }

  if (/returned 400/i.test(error.message) && /credit|billing|paid|balance|insufficient|no tokens/i.test(error.message)) {
    return 'This model needs paid credits on the provider account. Pick a free model or add credits, then try again.'
  }

  if (/returned 400|returned 404/i.test(error.message) && /model|not found|does not exist/i.test(error.message)) {
    return 'The selected model is unavailable. Pick another model in PromptGod settings and save it again.'
  }

  if (/returned 400/i.test(error.message) && /invalid|malformed|unsupported|request/i.test(error.message)) {
    return 'The provider rejected the request format for that model. Switch to another model and try again.'
  }

  if (/returned 401|unauthorized|invalid api key|authentication/i.test(error.message)) {
    return 'The API key was rejected. Check the key, confirm you selected the right provider, and save again.'
  }

  if (/returned 403|permission|forbidden|access denied/i.test(error.message)) {
    return 'This account does not have access to the selected model. Choose another model or check the provider account permissions.'
  }

  if (/returned 429|rate limit|resource exhausted|quota/i.test(error.message)) {
    return 'The provider rate-limited the request. Wait a moment, then retry or switch to a less busy model.'
  }

  const translated = translateError(error)
  if (translated && translated !== genericTranslated && translated !== legacyGenericTranslated) {
    return translated
  }

  if (!/^\[(LLMClient|ServiceWorker)\]/.test(error.message) && !/[{}[\]]/.test(error.message)) {
    return error.message
  }

  return genericTranslated
}

/** Single retry with 1s backoff for 429/500/503. No retry on 401/403/422. */
async function callWithRetry(
  callFn: () => Promise<Response>,
  signal: AbortSignal
): Promise<Response> {
  try {
    return await callFn()
  } catch (error) {
    if (signal.aborted) throw error

    const status = extractHttpStatus(error)
    if (status !== null && RETRYABLE_STATUS_CODES.has(status)) {
      console.info({ status }, '[PromptGod] Retrying after transient error')
      await delay(RETRY_DELAY_MS)
      if (signal.aborted) throw error
      return await callFn()
    }

    throw error
  }
}

function extractHttpStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null
  const match = error.message.match(/returned (\d{3})/)
  return match ? parseInt(match[1], 10) : null
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function disconnectPortSoon(port: chrome.runtime.Port, delayMs: number = 50): void {
  setTimeout(() => {
    try {
      port.disconnect()
    } catch {
      // no-op
    }
  }, delayMs)
}

export function sendMessage(port: chrome.runtime.Port, msg: ServiceWorkerMessage): void {
  try {
    supervisor.touch(port)
    port.postMessage(msg)
  } catch (error) {
    console.info({ cause: error }, '[PromptGod] Could not send message — port disconnected')
  }
}

async function streamOpenRouter(
  port: chrome.runtime.Port,
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  model: string,
  maxTokens: number,
  signal: AbortSignal,
  progress: StreamProgress
): Promise<void> {
  const response = await callWithRetry(
    () => callOpenRouterAPI(apiKey, systemPrompt, userMessage, model, maxTokens),
    signal
  )
  const stream = parseOpenAIStream(response)

  try {
    const first = await nextWithTimeout(stream, OPENROUTER_FIRST_TOKEN_TIMEOUT_MS)
    if (first.done) {
      throw new Error('[ServiceWorker] OpenRouter stream ended before emitting tokens')
    }

    progress.sentAnyToken = true
    sendMessage(port, { type: 'TOKEN', text: first.value })

    while (true) {
      const next = await nextWithTimeout(stream, STREAM_STALL_TIMEOUT_MS)
      if (next.done) {
        // Gemma free models sometimes end without a formal 'done' if the connection drops,
        // but nextWithTimeout will handle the stall. 
        break
      }
      progress.sentAnyToken = true
      sendMessage(port, { type: 'TOKEN', text: next.value })
    }
  } catch (error) {
    if (!progress.sentAnyToken && shouldFallbackToOpenRouterCompletion(error)) {
      const text = await callOpenRouterCompletionAPI(apiKey, systemPrompt, userMessage, model, maxTokens)
      progress.sentAnyToken = true
      sendMessage(port, { type: 'TOKEN', text })
      return
    }

    if (isTimeoutLike(error)) {
      throw new Error('[ServiceWorker] OpenRouter stream timed out while waiting for tokens', {
        cause: error,
      })
    }
    throw error
  }
}

function isTimeoutLike(error: unknown): boolean {
  return error instanceof Error
    && (/timed out/i.test(error.message) || /stalled/i.test(error.message))
}

function shouldFallbackToOpenRouterCompletion(error: unknown): boolean {
  return error instanceof Error
    && (/ended before emitting tokens/i.test(error.message) || /timed out/i.test(error.message) || /stalled/i.test(error.message))
}

async function* withStallTimeout<T>(
  source: AsyncGenerator<T>,
  timeoutMs: number
): AsyncGenerator<T, void, unknown> {
  while (true) {
    const result = await nextWithTimeout(source, timeoutMs)
    if (result.done) {
      return
    }
    yield result.value
  }
}

async function nextWithTimeout<T>(
  source: AsyncGenerator<T>,
  timeoutMs: number
): Promise<IteratorResult<T, void>> {
  return await new Promise<IteratorResult<T, void>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`[ServiceWorker] Stream stalled for ${timeoutMs}ms`))
    }, timeoutMs)

    source.next()
      .then((result) => {
        clearTimeout(timeout)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timeout)
        reject(error)
      })
  })
}
