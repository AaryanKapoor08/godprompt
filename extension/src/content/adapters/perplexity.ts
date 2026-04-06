// Perplexity platform adapter
// Perplexity uses a textarea or contenteditable div for input

import type { PlatformAdapter, ConversationContext } from './types'
import { clearContentEditable, insertText, replaceText } from '../dom-utils'

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
      this.setTextareaValue(input, text)
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

  /**
   * Set textarea value bypassing React's controlled input.
   * React tracks textarea values via an internal _valueTracker. If the tracker's
   * cached value matches the new value, React silently ignores the input event
   * and re-renders the old state. We reset the tracker so React sees the change.
   */
  private setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype, 'value'
    )?.set
    if (nativeSetter) {
      nativeSetter.call(textarea, value)
    } else {
      textarea.value = value
    }

    // Reset React's internal value tracker so it recognizes this as a real change.
    const tracker = (textarea as Record<string, unknown>)._valueTracker as
      { setValue: (v: string) => void } | undefined
    if (tracker) {
      tracker.setValue(value === '' ? '__promptgod_clear__' : '')
    }

    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }

  clearInput(): void {
    const input = this.getInputElement()
    if (!input) return
    if (input instanceof HTMLTextAreaElement) {
      this.setTextareaValue(input, '')
    } else {
      clearContentEditable(input)
    }
  }

  appendChunk(text: string): boolean {
    const input = this.getInputElement()
    if (!input) return false

    if (input instanceof HTMLTextAreaElement) {
      // Return false to force the render loop into full-replace mode.
      // React controlled textareas fight incremental appends — React re-renders
      // between frames and resets the value. Full-replace via setPromptText
      // (which uses setTextareaValue with _valueTracker reset) is the only
      // approach that sticks.
      return false
    }

    // contenteditable path
    input.focus()
    return document.execCommand('insertText', false, text) || insertText(input, text)
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

  getRecentMessages(maxTokens: number): string {
    const turns = Array.from(document.querySelectorAll(
      '[class*="answer"], [class*="result"], [data-testid*="answer"]'
    ))
    if (turns.length === 0) return ''

    const recent = turns.slice(-2)
    let text = ''
    for (const turn of recent) {
      const content = turn.textContent?.trim() ?? ''
      text += content + '\n'
      if (text.length > maxTokens * 4) break
    }
    return text.slice(0, maxTokens * 4).trim()
  }
}
