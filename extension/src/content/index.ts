// PromptPilot content script — injected into ChatGPT, Claude, and Gemini

import type { PlatformAdapter } from './adapters/types'
import { ChatGPTAdapter } from './adapters/chatgpt'
import { ClaudeAdapter } from './adapters/claude'
import { GeminiAdapter } from './adapters/gemini'
import { injectTriggerButton, observeComposer, registerShortcut } from './ui/trigger-button'

const adapters: PlatformAdapter[] = [
  new ChatGPTAdapter(),
  new ClaudeAdapter(),
  new GeminiAdapter(),
]

const adapter = adapters.find((a) => a.matches()) ?? null

if (adapter) {
  const platform = adapter.getPlatform()
  console.info({ platform }, '[PromptPilot] Content script loaded')

  // Wait for platform's hydration before injecting UI
  function waitForInputAndInject(attempt: number): void {
    const inputElement = adapter!.getInputElement()

    if (!inputElement && attempt < 10) {
      console.info(
        { attempt, platform },
        '[PromptPilot] Input not ready, retrying...'
      )
      setTimeout(() => waitForInputAndInject(attempt + 1), 500)
      return
    }

    if (!inputElement) {
      console.info({ platform }, '[PromptPilot] Input element not found after retries')
      return
    }

    injectTriggerButton(adapter!)
    observeComposer(adapter!)
    registerShortcut(adapter!)
  }

  setTimeout(() => waitForInputAndInject(1), 500)
} else {
  console.info('[PromptPilot] Content script loaded on unrecognized platform')
}
