// PromptPilot service worker — background script
// Handles message routing between content scripts and LLM APIs
// Uses chrome.runtime.connect (ports) for streaming, NOT sendMessage

import type { ContentMessage, ServiceWorkerMessage } from './lib/types'

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
    // Phase 4: Mock streaming — sends 3 tokens at 200ms intervals, then DONE
    // Replaced with real LLM call in Phase 5
    const mockTokens = ['Enhanced: ', msg.rawPrompt, ' (improved)']

    for (const token of mockTokens) {
      await delay(200)
      sendMessage(port, { type: 'TOKEN', text: token })
    }

    await delay(200)
    sendMessage(port, { type: 'DONE' })
    port.disconnect()
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
