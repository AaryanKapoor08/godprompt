// PromptGod service worker — background script
// Handles message routing between content scripts and LLM APIs
// Uses chrome.runtime.connect (ports) for streaming, NOT sendMessage

import type { ContentMessage, ServiceWorkerMessage } from './lib/types'
import { buildMetaPrompt } from './lib/meta-prompt'
import {
  buildUserMessage,
  callAnthropicAPI,
  callOpenAIAPI,
  callOpenRouterAPI,
  parseAnthropicStream,
  parseOpenAIStream,
} from './lib/llm-client'

const STREAM_STALL_TIMEOUT_MS = 60000
const OPENROUTER_FIRST_TOKEN_TIMEOUT_MS = 15000
const OPENROUTER_FALLBACK_MODEL = 'nvidia/nemotron-3-nano-30b-a3b:free'

console.info('[PromptGod] Service worker started')

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

  port.onMessage.addListener((msg: ContentMessage) => {
    if (msg.type === 'ENHANCE') {
      handleEnhance(port, msg)
    }
  })
})

async function handleEnhance(
  port: chrome.runtime.Port,
  msg: ContentMessage & { type: 'ENHANCE' }
): Promise<void> {
  console.info(
    { platform: msg.platform, promptLength: msg.rawPrompt.length, context: msg.context },
    '[PromptGod] Received ENHANCE request'
  )

  try {
    sendMessage(port, { type: 'START' })

    // Read settings from storage on each request — never cache
    const { apiKey, provider, model } = await chrome.storage.local.get(
      ['apiKey', 'provider', 'model']
    ) as {
      apiKey?: string
      provider?: string
      model?: string
    }

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
    const systemPrompt = buildMetaPrompt(
      msg.platform,
      msg.context.isNewConversation,
      msg.context.conversationLength
    )

    const userMessage = buildUserMessage(msg.rawPrompt, msg.platform, msg.context)

    console.info(
      { platform: msg.platform, provider, model },
      '[PromptGod] Calling LLM API (BYOK)'
    )

    // Route to the correct provider, passing the selected model
    if (provider === 'openrouter') {
      const requestedModel = model ?? OPENROUTER_FALLBACK_MODEL

      try {
        await streamOpenRouter(port, apiKey, systemPrompt, userMessage, requestedModel)
      } catch (error) {
        const isFallbackCandidate =
          requestedModel !== OPENROUTER_FALLBACK_MODEL && shouldRetryOpenRouterWithFallback(error)

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
          OPENROUTER_FALLBACK_MODEL
        )
      }
    } else if (provider === 'anthropic') {
      const response = await callAnthropicAPI(apiKey, systemPrompt, userMessage, model)
      for await (const text of withStallTimeout(parseAnthropicStream(response), STREAM_STALL_TIMEOUT_MS)) {
        sendMessage(port, { type: 'TOKEN', text })
      }
    } else if (provider === 'openai') {
      const response = await callOpenAIAPI(apiKey, systemPrompt, userMessage, model)
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

    console.info('[PromptGod] Enhancement complete')
  } catch (error) {
    console.error('[PromptGod] Enhancement failed', error)
    sendMessage(port, {
      type: 'ERROR',
      message: error instanceof Error ? error.message : 'Enhancement failed',
    })
    port.disconnect()
  }
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
  model: string
): Promise<void> {
  const response = await callOpenRouterAPI(apiKey, systemPrompt, userMessage, model)
  const stream = parseOpenAIStream(response)

  try {
    const first = await nextWithTimeout(stream, OPENROUTER_FIRST_TOKEN_TIMEOUT_MS)
    if (first.done) {
      throw new Error('[ServiceWorker] OpenRouter stream ended before emitting tokens')
    }

    sendMessage(port, { type: 'TOKEN', text: first.value })

    while (true) {
      const next = await nextWithTimeout(stream, STREAM_STALL_TIMEOUT_MS)
      if (next.done) {
        break
      }
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

function shouldRetryOpenRouterWithFallback(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  // Invalid key/auth errors won't be fixed by changing model.
  if (/401|unauthorized|invalid api key|authentication/i.test(error.message)) {
    return false
  }

  return true
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
