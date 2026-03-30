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
