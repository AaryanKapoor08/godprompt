// PromptPilot service worker — background script
// Handles message routing between content scripts and LLM APIs
// Uses chrome.runtime.connect (ports) for streaming, NOT sendMessage

import type { ContentMessage, ServiceWorkerMessage } from './lib/types'
import type { Provider } from './lib/llm-client'
import { buildMetaPrompt } from './lib/meta-prompt'
import {
  buildUserMessage,
  callAnthropicAPI,
  callOpenRouterAPI,
  parseAnthropicStream,
  parseOpenAIStream,
} from './lib/llm-client'

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
    // Read API key and provider from storage — never cache it
    const { apiKey, provider } = await chrome.storage.local.get(['apiKey', 'provider']) as {
      apiKey?: string
      provider?: Provider
    }

    if (!apiKey) {
      sendMessage(port, {
        type: 'ERROR',
        message: 'No API key set. Click the PromptPilot icon to add your API key.',
        code: 'NO_API_KEY',
      })
      port.disconnect()
      return
    }

    // Build the meta-prompt with platform and conversation context
    const systemPrompt = buildMetaPrompt(
      msg.platform,
      msg.context.isNewConversation,
      msg.context.conversationLength
    )

    const userMessage = buildUserMessage(msg.rawPrompt, msg.platform, msg.context)

    console.info(
      { platform: msg.platform, provider },
      '[PromptPilot] Calling LLM API'
    )

    // Route to the correct provider
    if (provider === 'openrouter') {
      const response = await callOpenRouterAPI(apiKey, systemPrompt, userMessage)
      for await (const text of parseOpenAIStream(response)) {
        sendMessage(port, { type: 'TOKEN', text })
      }
    } else if (provider === 'anthropic') {
      const response = await callAnthropicAPI(apiKey, systemPrompt, userMessage)
      for await (const text of parseAnthropicStream(response)) {
        sendMessage(port, { type: 'TOKEN', text })
      }
    } else {
      sendMessage(port, {
        type: 'ERROR',
        message: `Unsupported provider: ${provider}. Use an Anthropic or OpenRouter key.`,
        code: 'UNSUPPORTED_PROVIDER',
      })
      port.disconnect()
      return
    }

    sendMessage(port, { type: 'DONE' })
    port.disconnect()

    console.info('[PromptPilot] Enhancement complete')
  } catch (error) {
    console.error('[PromptPilot] Enhancement failed', error)
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
    // Port may have been disconnected by the content script
    console.info({ cause: error }, '[PromptPilot] Could not send message — port disconnected')
  }
}
