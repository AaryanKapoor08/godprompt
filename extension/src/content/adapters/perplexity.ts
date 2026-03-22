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
    return (
      document.querySelector<HTMLElement>('button[aria-label="Submit"]') ??
      document.querySelector<HTMLElement>('button[aria-label="Send"]') ??
      document.querySelector<HTMLElement>('button[type="submit"]') ??
      document.querySelector<HTMLElement>('button[aria-label*="submit" i]') ??
      document.querySelector<HTMLElement>('button[aria-label*="send" i]')
    )
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
