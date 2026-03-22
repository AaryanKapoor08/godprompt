// PromptPilot content script — injected into ChatGPT, Claude, and Gemini

import type { PlatformAdapter } from './adapters/types'
import { ChatGPTAdapter } from './adapters/chatgpt'

const adapters: PlatformAdapter[] = [
  new ChatGPTAdapter(),
  // Claude and Gemini adapters added in Phases 12-13
]

const adapter = adapters.find((a) => a.matches()) ?? null

if (adapter) {
  const platform = adapter.getPlatform()
  console.info({ platform }, '[PromptPilot] Content script loaded')

  // Wait for platform's React hydration before checking adapter methods
  function runAdapterCheck(attempt: number): void {
    const inputElement = adapter!.getInputElement()
    const sendButton = adapter!.getSendButton()
    const promptText = adapter!.getPromptText()
    const context = adapter!.getConversationContext()

    if (!inputElement && attempt < 5) {
      console.info(
        { attempt, platform },
        '[PromptPilot] Input not ready, retrying...'
      )
      setTimeout(() => runAdapterCheck(attempt + 1), 1000)
      return
    }

    console.info(
      { platform, inputElement, sendButton, promptText, promptLength: promptText.length, context },
      '[PromptPilot] Adapter check'
    )
  }

  setTimeout(() => runAdapterCheck(1), 2000)
} else {
  console.info('[PromptPilot] Content script loaded on unrecognized platform')
}
