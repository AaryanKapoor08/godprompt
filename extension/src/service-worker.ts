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

    // Free tier mode — backend proxy (Phase 11)
    if (mode === 'free' || !apiKey) {
      sendMessage(port, {
        type: 'ERROR',
        message: 'Free tier not available yet. Switch to BYOK mode and add your API key.',
        code: 'FREE_TIER_NOT_READY',
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
      { platform: msg.platform, provider, model },
      '[PromptPilot] Calling LLM API'
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
      // OpenAI uses same format as OpenRouter but different endpoint
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
