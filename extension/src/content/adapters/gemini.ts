// Gemini platform adapter
// Gemini uses a rich text contenteditable div with its own input handling

import type { PlatformAdapter, ConversationContext } from './types'
import { clearContentEditable, insertText, replaceText } from '../dom-utils'

export class GeminiAdapter implements PlatformAdapter {
  matches(): boolean {
    const host = window.location.hostname
    return host === 'gemini.google.com' || host === 'aistudio.google.com'
  }

  getInputElement(): HTMLElement | null {
    // Gemini uses a rich-textarea custom element containing a contenteditable p or div
    return (
      document.querySelector<HTMLElement>('rich-textarea [contenteditable="true"]') ??
      document.querySelector<HTMLElement>('rich-textarea p[contenteditable]') ??
      document.querySelector<HTMLElement>('.ql-editor[contenteditable="true"]') ??
      document.querySelector<HTMLElement>('[contenteditable="true"][aria-label*="message" i]') ??
      document.querySelector<HTMLElement>('[contenteditable="true"][aria-label*="prompt" i]') ??
      document.querySelector<HTMLElement>('[contenteditable="true"][aria-multiline="true"]') ??
      document.querySelector<HTMLElement>('div[contenteditable="true"]')
    )
  }

  getPromptText(): string {
    const input = this.getInputElement()
    if (!input) {
      return ''
    }
    return input.textContent?.trim() ?? ''
  }

  setPromptText(text: string): void {
    const input = this.getInputElement()
    if (!input) {
      throw new Error('[GeminiAdapter] Input element not found during text replacement')
    }

    const success = replaceText(input, text)
    if (!success) {
      throw new Error('[GeminiAdapter] Failed to insert text into input element')
    }

    // Notify the rich-textarea web component wrapper so Gemini syncs internal state
    this.notifyRichTextarea(input)
  }

  /** Dispatch input event on the rich-textarea wrapper so Gemini's web component syncs. */
  private notifyRichTextarea(inner: HTMLElement): void {
    const wrapper = inner.closest('rich-textarea')
    if (wrapper) {
      wrapper.dispatchEvent(new Event('input', { bubbles: true }))
      wrapper.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

  getSendButton(): HTMLElement | null {
    // Gemini's send button — try many selectors for resilience
    return (
      document.querySelector<HTMLElement>('button[aria-label="Send message"]') ??
      document.querySelector<HTMLElement>('button[aria-label="Send Message"]') ??
      document.querySelector<HTMLElement>('button[aria-label*="send" i]') ??
      document.querySelector<HTMLElement>('button.send-button') ??
      document.querySelector<HTMLElement>('[data-mat-icon-name="send"]')?.closest('button') ??
      document.querySelector<HTMLElement>('mat-icon[data-mat-icon-name="send"]')?.closest('button') ??
      // Last resort: find a button near the input element
      this.getInputElement()?.closest('form, [role="form"], [class*="input"]')?.querySelector('button:last-of-type') ??
      null
    )
  }

  getPlatform(): 'gemini' {
    return 'gemini'
  }

  // Debug helper — call from console: adapter.debugSelectors()
  debugSelectors(): void {
    console.info('[GeminiAdapter] input:', this.getInputElement())
    console.info('[GeminiAdapter] sendButton:', this.getSendButton())
    console.info('[GeminiAdapter] all contenteditable:', document.querySelectorAll('[contenteditable]'))
    console.info('[GeminiAdapter] all buttons:', document.querySelectorAll('button'))
  }

  clearInput(): void {
    const input = this.getInputElement()
    if (!input) return
    clearContentEditable(input)
    this.notifyRichTextarea(input)
  }

  appendChunk(text: string): boolean {
    const input = this.getInputElement()
    if (!input) return false
    input.focus()
    const ok = document.execCommand('insertText', false, text) || insertText(input, text)
    if (ok) this.notifyRichTextarea(input)
    return ok
  }

  getConversationContext(): ConversationContext {
    // Gemini renders conversation turns as model-response and user-query elements
    const turns = document.querySelectorAll(
      'model-response, user-query, [class*="conversation-turn"], [data-turn-index]'
    )

    const conversationLength = turns.length

    return {
      isNewConversation: conversationLength === 0,
      conversationLength,
    }
  }

  getRecentMessages(maxTokens: number): string {
    const turns = Array.from(document.querySelectorAll(
      'model-response, user-query, [class*="conversation-turn"], [data-turn-index]'
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
