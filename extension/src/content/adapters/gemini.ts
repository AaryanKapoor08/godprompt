// Gemini platform adapter
// Gemini uses a rich text contenteditable div with its own input handling

import type { PlatformAdapter, ConversationContext } from './types'
import { replaceText } from '../dom-utils'

export class GeminiAdapter implements PlatformAdapter {
  matches(): boolean {
    const host = window.location.hostname
    return host === 'gemini.google.com' || host === 'aistudio.google.com'
  }

  getInputElement(): HTMLElement | null {
    // Gemini uses a rich-input contenteditable div
    return (
      document.querySelector<HTMLElement>('rich-textarea .ql-editor') ??
      document.querySelector<HTMLElement>('.ql-editor[contenteditable="true"]') ??
      document.querySelector<HTMLElement>('[contenteditable="true"][aria-label*="message"]') ??
      document.querySelector<HTMLElement>('[contenteditable="true"][aria-label*="prompt"]') ??
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
  }

  getSendButton(): HTMLElement | null {
    // Gemini's send button has aria-label "Send message"
    return (
      document.querySelector<HTMLElement>('button[aria-label="Send message"]') ??
      document.querySelector<HTMLElement>('button.send-button') ??
      document.querySelector<HTMLElement>('[data-mat-icon-name="send"]')?.closest('button') ??
      document.querySelector<HTMLElement>('button[aria-label*="send" i]')
    )
  }

  getPlatform(): 'gemini' {
    return 'gemini'
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
}
