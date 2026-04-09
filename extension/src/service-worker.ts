// PromptGod service worker — background script
// Handles message routing between content scripts and LLM APIs
// Uses chrome.runtime.connect (ports) for streaming, NOT sendMessage

import type { ContentMessage, ServiceWorkerMessage } from './lib/types'
import { buildGemmaMetaPromptWithIntensity, buildMetaPromptWithIntensity } from './lib/meta-prompt'
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
  OPENROUTER_FALLBACK_MODEL,
  shouldRetryOpenRouterSameModel,
  shouldRetryWithOpenRouterFallback,
} from './lib/openrouter-retry'
import { RequestSupervisor } from './background/supervisor'
import { translateError } from './lib/error-translator'

const STREAM_STALL_TIMEOUT_MS = 45000
const OPENROUTER_FIRST_TOKEN_TIMEOUT_MS = 20000
const REQUEST_SUPERVISOR_TIMEOUT_MS = 65000
const OPENROUTER_MODEL_COOLDOWN_MS = 2 * 60 * 1000
const OPENROUTER_RATE_LIMIT_BASE_DELAY_MS = 1500
const OPENROUTER_RATE_LIMIT_MAX_DELAY_MS = 10000

const OPENROUTER_FALLBACK_MODELS = [
  OPENROUTER_FALLBACK_MODEL,
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'google/gemma-3-27b-it:free',
]

const openRouterModelCooldownUntil = new Map<string, number>()

function isGoogleGemmaModelId(model: string | undefined): boolean {
  return typeof model === 'string' && model.trim().toLowerCase().startsWith('gemma-')
}

function normalizeOpenRouterModelId(modelId: string): string {
  if (modelId === 'nvidia/nemotron-nano-30b-a3b:free') {
    return 'nvidia/nemotron-3-nano-30b-a3b:free'
  }
  return modelId
}

function isOpenRouterRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (/rate limit|429/i.test(error.message)) return true
  return extractHttpStatus(error) === 429
}

function parseRetryAfterMs(error: unknown): number | null {
  if (!(error instanceof Error)) return null
  const match = error.message.match(/retry-after\s*(\d+)/i)
  if (!match) return null
  const seconds = Number.parseInt(match[1], 10)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return seconds * 1000
}

function getOpenRouterCooldownRemainingMs(model: string): number {
  const until = openRouterModelCooldownUntil.get(model)
  if (!until) return 0
  const remaining = until - Date.now()
  return remaining > 0 ? remaining : 0
}

function setOpenRouterModelCooldown(model: string, cooldownMs: number): void {
  const until = Date.now() + cooldownMs
  const current = openRouterModelCooldownUntil.get(model) ?? 0
  if (until > current) {
    openRouterModelCooldownUntil.set(model, until)
  }
}

function computeRateLimitBackoffMs(error: unknown, rateLimitAttempt: number): number {
  const retryAfterMs = parseRetryAfterMs(error)
  if (retryAfterMs !== null) {
    return Math.min(Math.max(retryAfterMs, OPENROUTER_RATE_LIMIT_BASE_DELAY_MS), OPENROUTER_RATE_LIMIT_MAX_DELAY_MS)
  }

  const exponential = OPENROUTER_RATE_LIMIT_BASE_DELAY_MS * (2 ** Math.max(0, rateLimitAttempt - 1))
  return Math.min(exponential, OPENROUTER_RATE_LIMIT_MAX_DELAY_MS)
}

function getOpenRouterMaxTokens(model: string, promptWordCount: number): number {
  const isFree = model.includes(':free')
  if (!isFree) {
    return 512
  }

  if (promptWordCount <= 40) return 256
  if (promptWordCount <= 120) return 320
  return 384
}

type StreamProgress = {
  sentAnyToken: boolean
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

async function getSettings(): Promise<{ apiKey?: string; provider?: string; model?: string; includeConversationContext?: boolean }> {
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
  }
}

function buildOpenRouterModelChain(requestedModel: string): string[] {
  const models = [requestedModel, ...OPENROUTER_FALLBACK_MODELS]
  const deduped: string[] = []

  for (const model of models) {
    const normalized = model.trim()
    if (!normalized) continue
    if (!deduped.includes(normalized)) {
      deduped.push(normalized)
    }
  }

  const now = Date.now()
  const ready = deduped.filter((model) => (openRouterModelCooldownUntil.get(model) ?? 0) <= now)
  const cooling = deduped.filter((model) => (openRouterModelCooldownUntil.get(model) ?? 0) > now)

  return [...ready, ...cooling]
}

export function initServiceWorker() {
  chrome.storage.onChanged.addListener(() => {
    cachedSettings = null
  })

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'PING') {
      sendResponse({ type: 'PONG' })
    }
    return false
  })

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'enhance') {
      return
    }

    console.info('[PromptGod] Port connected')

    const abortController = new AbortController()
    port.onDisconnect.addListener(() => {
      abortController.abort()
    })

    port.onMessage.addListener((msg: ContentMessage) => {
      if (msg.type === 'ENHANCE') {
        handleEnhance(port, msg, abortController.signal)
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

    const { apiKey, provider, model } = await getSettings()

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
    const systemPrompt = provider === 'google' && isGoogleGemmaModelId(model)
      ? buildGemmaMetaPromptWithIntensity(
        msg.platform,
        msg.context.isNewConversation,
        msg.context.conversationLength,
        promptWordCount,
        msg.recentContext
      )
      : buildMetaPromptWithIntensity(
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
      const requestedModel = normalizeOpenRouterModelId((model ?? '').trim() || OPENROUTER_FALLBACK_MODEL)
      const modelsToTry = buildOpenRouterModelChain(requestedModel)

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
              const backoffMs = computeRateLimitBackoffMs(error, rateLimitAttempt)
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
        model ?? 'gemini-2.5-flash',
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

  if (/OpenRouter completion returned no text output|ended before emitting tokens|timed out while waiting for tokens|stream stalled/i.test(error.message)) {
    return 'That OpenRouter model did not return usable text. Retry once, or switch to another free model like `openai/gpt-oss-20b:free` or `meta-llama/llama-3.3-70b-instruct:free`.'
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
