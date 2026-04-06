// PromptGod service worker — background script
// Handles message routing between content scripts and LLM APIs
// Uses chrome.runtime.connect (ports) for streaming, NOT sendMessage

import type { ContentMessage, ServiceWorkerMessage } from './lib/types'
import { buildMetaPromptWithIntensity } from './lib/meta-prompt'
import {
  buildUserMessage,
  callAnthropicAPI,
  callOpenAIAPI,
  callOpenRouterAPI,
  parseAnthropicStream,
  parseOpenAIStream,
} from './lib/llm-client'
import {
  OPENROUTER_FALLBACK_MODEL,
  shouldRetryOpenRouterSameModel,
  shouldRetryWithOpenRouterFallback,
} from './lib/openrouter-retry'

const STREAM_STALL_TIMEOUT_MS = 60000
const OPENROUTER_FIRST_TOKEN_TIMEOUT_MS = 25000

type StreamProgress = {
  sentAnyToken: boolean
}

// Retryable HTTP status codes (pre-first-token only)
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503])
const RETRY_DELAY_MS = 1000

console.info('[PromptGod] Service worker started')

// --- Settings cache ---
// Avoids hitting chrome.storage.local.get on every enhance request.
// Invalidated via chrome.storage.onChanged listener.
let cachedSettings: { apiKey?: string; provider?: string; model?: string; includeConversationContext?: boolean } | null = null

async function getSettings(): Promise<{ apiKey?: string; provider?: string; model?: string; includeConversationContext?: boolean }> {
  if (cachedSettings) return cachedSettings
  cachedSettings = await chrome.storage.local.get(['apiKey', 'provider', 'model', 'includeConversationContext']) as typeof cachedSettings
  return cachedSettings!
}

chrome.storage.onChanged.addListener(() => {
  cachedSettings = null
})

// Ping listener — content script sends a PING via sendMessage to wake up the
// service worker before opening a port. MV3 workers go idle and onConnect alone
// doesn't reliably wake them.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'PING') {
    sendResponse({ type: 'PONG' })
  }
  return false
})

// Port listener must be registered at top level — not inside async
// so the service worker wakes up correctly on connect
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'enhance') {
    return
  }

  console.info('[PromptGod] Port connected')

  // AbortController — cancel in-flight fetch when port disconnects
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

async function handleEnhance(
  port: chrome.runtime.Port,
  msg: ContentMessage & { type: 'ENHANCE' },
  signal: AbortSignal
): Promise<void> {
  console.info(
    { platform: msg.platform, promptLength: msg.rawPrompt.length, context: msg.context },
    '[PromptGod] Received ENHANCE request'
  )

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
    const systemPrompt = buildMetaPromptWithIntensity(
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
      const requestedModel = model ?? OPENROUTER_FALLBACK_MODEL
      const primaryAttempt: StreamProgress = { sentAnyToken: false }

      try {
        await streamOpenRouter(
          port,
          apiKey,
          systemPrompt,
          userMessage,
          requestedModel,
          signal,
          primaryAttempt
        )
      } catch (error) {
        // First, retry once on the same model when the stream fails before
        // emitting any token (common on cold starts right after refresh).
        if (shouldRetryOpenRouterSameModel(primaryAttempt.sentAnyToken, error)) {
          console.info({ requestedModel }, '[PromptGod] Retrying OpenRouter request on same model')

          const sameModelRetryAttempt: StreamProgress = { sentAnyToken: false }

          try {
            await streamOpenRouter(
              port,
              apiKey,
              systemPrompt,
              userMessage,
              requestedModel,
              signal,
              sameModelRetryAttempt
            )
            // Same-model retry succeeded.
            return
          } catch (retryError) {
            const canFallbackAfterRetry = shouldRetryWithOpenRouterFallback(
              requestedModel,
              sameModelRetryAttempt.sentAnyToken,
              retryError
            )

            if (!canFallbackAfterRetry) {
              throw retryError
            }

            console.info(
              { requestedModel, fallbackModel: OPENROUTER_FALLBACK_MODEL },
              '[PromptGod] Same-model retry failed, retrying OpenRouter with fallback model'
            )

            await streamOpenRouter(
              port,
              apiKey,
              systemPrompt,
              userMessage,
              OPENROUTER_FALLBACK_MODEL,
              signal,
              { sentAnyToken: false }
            )

            return
          }
        }

        const isFallbackCandidate = shouldRetryWithOpenRouterFallback(
          requestedModel,
          primaryAttempt.sentAnyToken,
          error
        )

        if (!isFallbackCandidate) {
          throw error
        }

        console.info(
          { requestedModel, fallbackModel: OPENROUTER_FALLBACK_MODEL },
          '[PromptGod] Retrying OpenRouter request with fallback model'
        )

        await streamOpenRouter(
          port,
          apiKey,
          systemPrompt,
          userMessage,
          OPENROUTER_FALLBACK_MODEL,
          signal,
          { sentAnyToken: false }
        )
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
    } else {
      sendMessage(port, {
        type: 'ERROR',
        message: `Unsupported provider: ${provider}. Use an Anthropic, OpenAI, or OpenRouter key.`,
        code: 'UNSUPPORTED_PROVIDER',
      })
      port.disconnect()
      return
    }

    sendMessage(port, { type: 'DONE' })
    port.disconnect()

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
    sendMessage(port, {
      type: 'ERROR',
      message: formatErrorMessage(error),
    })
    port.disconnect()
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

  // Detect network-level blocks (Brave Shields, privacy extensions, etc.)
  if (error instanceof TypeError && /failed to fetch|network/i.test(error.message)) {
    return 'API request blocked — if you\'re using Brave or a privacy browser, allow requests from extensions in your shield/privacy settings'
  }

  return error.message
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

function sendMessage(port: chrome.runtime.Port, msg: ServiceWorkerMessage): void {
  try {
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
  signal: AbortSignal,
  progress: StreamProgress
): Promise<void> {
  const response = await callWithRetry(
    () => callOpenRouterAPI(apiKey, systemPrompt, userMessage, model),
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
        break
      }
      progress.sentAnyToken = true
      sendMessage(port, { type: 'TOKEN', text: next.value })
    }
  } catch (error) {
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
