// Claude.ai platform adapter
// Claude uses a contenteditable div with ProseMirror-like editing

import type { PlatformAdapter, ConversationContext } from './types'
import { replaceText } from '../dom-utils'

export class ClaudeAdapter implements PlatformAdapter {
  matches(): boolean {
    return window.location.hostname === 'claude.ai'
  }

  getInputElement(): HTMLElement | null {
    // Claude uses a contenteditable div inside the composer
    // Try multiple selectors for resilience against DOM changes
    return (
      document.querySelector<HTMLElement>('[contenteditable="true"].ProseMirror') ??
      document.querySelector<HTMLElement>('div[contenteditable="true"][aria-label]') ??
      document.querySelector<HTMLElement>('fieldset div[contenteditable="true"]') ??
      document.querySelector<HTMLElement>('div.ProseMirror[contenteditable="true"]')
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
      throw new Error('[ClaudeAdapter] Input element not found during text replacement')
    }

    const success = replaceText(input, text)
    if (!success) {
      throw new Error('[ClaudeAdapter] Failed to insert text into input element')
    }
  }

  getSendButton(): HTMLElement | null {
    // Claude's send button is typically the last button in the composer area
    // Look for button with aria-label or within the fieldset/form
    const input = this.getInputElement()
    const composer = input?.closest('fieldset') ?? input?.closest('form') ?? input?.parentElement?.parentElement

    // Try aria-label first for specificity
    const ariaButton = composer?.querySelector<HTMLElement>('button[aria-label="Send Message"]') ??
      composer?.querySelector<HTMLElement>('button[aria-label="Send message"]')
    if (ariaButton) return ariaButton

    // Fallback: last button in the composer area
    const buttons = composer?.querySelectorAll<HTMLElement>('button')
    if (buttons && buttons.length > 0) {
      return buttons[buttons.length - 1]
    }

    // Global fallback — look for send button by known patterns
    return document.querySelector<HTMLElement>('button[aria-label="Send Message"]') ??
      document.querySelector<HTMLElement>('button[aria-label="Send message"]')
  }

  getPlatform(): 'claude' {
    return 'claude'
  }

  getConversationContext(): ConversationContext {
    // Claude renders messages in a scrollable container
    // Each message pair (human + assistant) is a conversation turn
    // Look for message containers with data attributes or role markers
    const humanMessages = document.querySelectorAll('[data-is-streaming]').length > 0
      ? document.querySelectorAll('[data-is-streaming]')
      : document.querySelectorAll('.font-user-message, .font-claude-message, [class*="Message"]')

    // Count unique conversation turns by looking for human message indicators
    const allMessages = document.querySelectorAll(
      '[class*="human"], [class*="assistant"], [data-testid*="message"], .group\\/conversation-turn'
    )

    const conversationLength = allMessages.length || humanMessages.length

    return {
      isNewConversation: conversationLength === 0,
      conversationLength,
    }
  }

  getRecentMessages(maxTokens: number): string {
    const messages = Array.from(document.querySelectorAll(
      '[class*="human"], [class*="assistant"], [data-testid*="message"], .group\\/conversation-turn'
    ))
    if (messages.length === 0) return ''

    const recent = messages.slice(-2)
    let text = ''
    for (const msg of recent) {
      const content = msg.textContent?.trim() ?? ''
      text += content + '\n'
      if (text.length > maxTokens * 4) break
    }
    return text.slice(0, maxTokens * 4).trim()
  }
}
