// PromptPilot service worker — background script
// Handles message routing between content scripts and LLM APIs
// Uses chrome.runtime.connect (ports) for streaming, NOT sendMessage

import type { ContentMessage, ServiceWorkerMessage } from './lib/types'
import type { Provider } from './lib/llm-client'
import { buildMetaPrompt } from './lib/meta-prompt'
import {
  buildUserMessage,
  callAnthropicAPI,
  callOpenAIAPI,
  callOpenRouterAPI,
  parseAnthropicStream,
  parseOpenAIStream,
} from './lib/llm-client'
import { BACKEND_URL } from './config'

console.info('[PromptPilot] Service worker started')

// Port listener must be registered at top level — not inside async
// so the service worker wakes up correctly on connect
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'enhance') {
    return
  }

  console.info('[PromptPilot] Port connected')

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
    '[PromptPilot] Received ENHANCE request'
  )

  try {
    // Read settings from storage on each request — never cache
    const { apiKey, provider, model, mode } = await chrome.storage.local.get(
      ['apiKey', 'provider', 'model', 'mode']
    ) as {
      apiKey?: string
      provider?: Provider
      model?: string
      mode?: 'free' | 'byok'
    }

    // Free tier mode — route through backend proxy
    if (mode === 'free' || !apiKey) {
      await handleFreeTier(port, msg)
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
      '[PromptPilot] Calling LLM API (BYOK)'
    )

    // Route to the correct provider, passing the selected model
    if (provider === 'openrouter') {
      const response = await callOpenRouterAPI(apiKey, systemPrompt, userMessage, model)
      for await (const text of parseOpenAIStream(response)) {
        sendMessage(port, { type: 'TOKEN', text })
      }
    } else if (provider === 'anthropic') {
      const response = await callAnthropicAPI(apiKey, systemPrompt, userMessage, model)
      for await (const text of parseAnthropicStream(response)) {
        sendMessage(port, { type: 'TOKEN', text })
      }
    } else if (provider === 'openai') {
      const response = await callOpenAIAPI(apiKey, systemPrompt, userMessage, model)
      for await (const text of parseOpenAIStream(response)) {
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

    console.info('[PromptPilot] Enhancement complete (BYOK)')
  } catch (error) {
    console.error('[PromptPilot] Enhancement failed', error)
    sendMessage(port, {
      type: 'ERROR',
      message: error instanceof Error ? error.message : 'Enhancement failed',
    })
    port.disconnect()
  }
}

async function handleFreeTier(
  port: chrome.runtime.Port,
  msg: ContentMessage & { type: 'ENHANCE' }
): Promise<void> {
  console.info(
    { platform: msg.platform },
    '[PromptPilot] Routing through backend (free tier)'
  )

  // Check offline state before making request
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    sendMessage(port, {
      type: 'ERROR',
      message: 'No connection — check your internet and try again.',
      code: 'OFFLINE',
    })
    port.disconnect()
    return
  }

  let response: Response

  try {
    response = await fetch(`${BACKEND_URL}/api/enhance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: msg.rawPrompt,
        platform: msg.platform,
        context: msg.context,
      }),
    })
  } catch (error) {
    console.error('[PromptPilot] Backend request failed', error)
    sendMessage(port, {
      type: 'ERROR',
      message: 'Could not reach the PromptPilot server. Try again later.',
      code: 'NETWORK_ERROR',
    })
    port.disconnect()
    return
  }

  // Sync rate limit headers from backend response
  const rateLimitRemaining = parseInt(response.headers.get('X-RateLimit-Remaining') ?? '', 10)
  const rateLimitReset = parseInt(response.headers.get('X-RateLimit-Reset') ?? '', 10)

  if (!isNaN(rateLimitRemaining) && !isNaN(rateLimitReset)) {
    await chrome.storage.local.set({
      usageCount: 10 - rateLimitRemaining,
      usageResetTime: rateLimitReset * 1000, // Convert epoch seconds to ms
      rateLimitMax: 10,
    })
  }

  // Handle rate limit (429)
  if (response.status === 429) {
    sendMessage(port, {
      type: 'ERROR',
      message: 'Free tier limit reached. Add your API key in settings for unlimited use.',
      code: 'RATE_LIMITED',
    })
    port.disconnect()
    return
  }

  // Handle other errors
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: 'Enhancement failed' }))
    sendMessage(port, {
      type: 'ERROR',
      message: errorBody.error ?? 'Enhancement failed',
      code: 'API_ERROR',
    })
    port.disconnect()
    return
  }

  // Parse backend SSE stream — format: data: {"type": "token", "text": "..."}
  const reader = response.body?.getReader()
  if (!reader) {
    sendMessage(port, {
      type: 'ERROR',
      message: 'No response body from server',
      code: 'NO_BODY',
    })
    port.disconnect()
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('data: ') || line.startsWith('data:')) {
          const data = line.slice(line.indexOf(':') + 1).trim()

          try {
            const parsed = JSON.parse(data)

            if (parsed.type === 'token' && parsed.text) {
              sendMessage(port, { type: 'TOKEN', text: parsed.text })
            } else if (parsed.type === 'done') {
              sendMessage(port, {
                type: 'DONE',
                rateLimitRemaining: !isNaN(rateLimitRemaining) ? rateLimitRemaining : undefined,
                rateLimitReset: !isNaN(rateLimitReset) ? rateLimitReset : undefined,
              })
              port.disconnect()
              console.info('[PromptPilot] Enhancement complete (free tier)')
              return
            }
          } catch {
            // Skip non-JSON data lines
          }
        }
      }
    }

    // Stream ended without explicit done — send DONE anyway
    sendMessage(port, {
      type: 'DONE',
      rateLimitRemaining: !isNaN(rateLimitRemaining) ? rateLimitRemaining : undefined,
      rateLimitReset: !isNaN(rateLimitReset) ? rateLimitReset : undefined,
    })
    port.disconnect()
    console.info('[PromptPilot] Enhancement complete (free tier)')
  } finally {
    reader.releaseLock()
  }
}

function sendMessage(port: chrome.runtime.Port, msg: ServiceWorkerMessage): void {
  try {
    port.postMessage(msg)
  } catch (error) {
    // Port may have been disconnected by the content script
    console.info({ cause: error }, '[PromptPilot] Could not send message — port disconnected')
  }
}
