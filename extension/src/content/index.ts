// PromptGod content script — injected into ChatGPT, Claude, Gemini, and Perplexity

import type { PlatformAdapter } from './adapters/types'
import { ChatGPTAdapter } from './adapters/chatgpt'
import { ClaudeAdapter } from './adapters/claude'
import { GeminiAdapter } from './adapters/gemini'
import { PerplexityAdapter } from './adapters/perplexity'
import { injectTriggerButton, observeComposer, registerShortcut, showFirstRunTooltip } from './ui/trigger-button'
import { showToast } from './ui/toast'

const adapters: PlatformAdapter[] = [
  new ChatGPTAdapter(),
  new ClaudeAdapter(),
  new GeminiAdapter(),
  new PerplexityAdapter(),
]

const adapter = adapters.find((a) => a.matches()) ?? null

if (adapter) {
  const platform = adapter.getPlatform()
  console.info({ platform }, '[PromptGod] Content script loaded')

  // Wait for platform's hydration before injecting UI
  function waitForInputAndInject(attempt: number): void {
    const inputElement = adapter!.getInputElement()

    if (!inputElement && attempt < 20) {
      console.info(
        { attempt, platform },
        '[PromptGod] Input not ready, retrying...'
      )
      setTimeout(() => waitForInputAndInject(attempt + 1), 500)
      return
    }

    if (!inputElement) {
      console.info({ platform }, '[PromptGod] Input element not found after retries')
      if (attempt >= 20) {
        showToast({
          message: 'PromptGod may need an update — could not find the input field',
          variant: 'warning',
          duration: 8000,
        })
      }
      return
    }

    injectTriggerButton(adapter!)
    observeComposer(adapter!)
    registerShortcut(adapter!)
    showFirstRunTooltip()
  }

  setTimeout(() => waitForInputAndInject(1), 500)
} else {
  console.info('[PromptGod] Content script loaded on unrecognized platform')
}
