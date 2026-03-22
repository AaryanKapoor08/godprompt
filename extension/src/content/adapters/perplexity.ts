// Perplexity platform adapter
// Perplexity uses a textarea or contenteditable div for input

import type { PlatformAdapter, ConversationContext } from './types'
import { replaceText } from '../dom-utils'

export class PerplexityAdapter implements PlatformAdapter {
  matches(): boolean {
    return window.location.hostname === 'www.perplexity.ai' ||
      window.location.hostname === 'perplexity.ai'
  }

  getInputElement(): HTMLElement | null {
    // Perplexity uses a textarea or contenteditable div
    return (
      document.querySelector<HTMLElement>('textarea[placeholder*="Ask"]') ??
      document.querySelector<HTMLElement>('textarea[aria-label*="Ask"]') ??
      document.querySelector<HTMLElement>('[contenteditable="true"][aria-label*="Ask"]') ??
      document.querySelector<HTMLElement>('[contenteditable="true"][data-lexical-editor]') ??
      document.querySelector<HTMLElement>('div[contenteditable="true"]')
    )
  }

  getPromptText(): string {
    const input = this.getInputElement()
    if (!input) return ''

    // textarea uses .value, contenteditable uses .textContent
    if (input instanceof HTMLTextAreaElement) {
      return input.value.trim()
    }
    return input.textContent?.trim() ?? ''
  }

  setPromptText(text: string): void {
    const input = this.getInputElement()
    if (!input) {
      throw new Error('[PerplexityAdapter] Input element not found during text replacement')
    }

    // Perplexity may use a textarea — handle both cases
    if (input instanceof HTMLTextAreaElement) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )?.set
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, text)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      } else {
        input.value = text
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      return
    }

    // contenteditable — use shared replaceText
    const success = replaceText(input, text)
    if (!success) {
      throw new Error('[PerplexityAdapter] Failed to insert text into input element')
    }
  }

  getSendButton(): HTMLElement | null {
    // Try aria-label and type selectors first
    const byLabel = (
      document.querySelector<HTMLElement>('button[aria-label="Submit"]') ??
      document.querySelector<HTMLElement>('button[aria-label="Send"]') ??
      document.querySelector<HTMLElement>('button[aria-label="Search"]') ??
      document.querySelector<HTMLElement>('button[type="submit"]') ??
      document.querySelector<HTMLElement>('button[aria-label*="submit" i]') ??
      document.querySelector<HTMLElement>('button[aria-label*="send" i]') ??
      document.querySelector<HTMLElement>('button[aria-label*="search" i]')
    )
    if (byLabel) return byLabel

    // Fallback: walk up from the textarea to find the nearest container with buttons
    const input = this.getInputElement()
    if (input) {
      // Walk up to 6 levels to find a container with buttons
      let container: HTMLElement | null = input
      for (let i = 0; i < 6; i++) {
        container = container?.parentElement ?? null
        if (!container) break
        const buttons = Array.from(container.querySelectorAll<HTMLElement>('button'))
        // We want the last button in the container (typically the submit/voice button on the right)
        if (buttons.length > 0) return buttons[buttons.length - 1]
      }
    }
    return null
  }

  getPlatform(): 'perplexity' {
    return 'perplexity'
  }

  getConversationContext(): ConversationContext {
    // Perplexity renders each answer as a separate block
    const turns = document.querySelectorAll(
      '[class*="answer"], [class*="result"], [data-testid*="answer"]'
    )

    const conversationLength = turns.length

    return {
      isNewConversation: conversationLength === 0,
      conversationLength,
    }
  }
}
