import type { PlatformAdapter, ConversationContext } from './types'
import { clearContentEditable, insertText, replaceText } from '../dom-utils'

export class ChatGPTAdapter implements PlatformAdapter {
  matches(): boolean {
    const host = window.location.hostname
    return host === 'chatgpt.com' || host === 'chat.openai.com'
  }

  getInputElement(): HTMLElement | null {
    // ChatGPT has a hidden fallback <textarea> AND a visible contenteditable <div>
    // The div with id="prompt-textarea" is the real ProseMirror editor
    // Also try contenteditable within the composer as a fallback
    return (
      document.querySelector<HTMLElement>('div#prompt-textarea') ??
      document.querySelector<HTMLElement>('[contenteditable="true"][id="prompt-textarea"]') ??
      document.querySelector<HTMLElement>('.ProseMirror[contenteditable="true"]')
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
      throw new Error('[ChatGPTAdapter] Input element not found during text replacement')
    }

    const success = replaceText(input, text)
    if (!success) {
      throw new Error('[ChatGPTAdapter] Failed to insert text into input element')
    }
  }

  getSendButton(): HTMLElement | null {
    // ChatGPT uses a single dual-purpose button that shows voice icon when empty
    // and morphs into the send (arrow-up) button when text is present.
    // It is always the last button inside the composer form.
    const textarea = this.getInputElement()
    const composer = textarea?.closest('form') ?? textarea?.parentElement?.parentElement?.parentElement
    const buttons = composer?.querySelectorAll<HTMLElement>('button')
    if (buttons && buttons.length > 0) {
      return buttons[buttons.length - 1]
    }
    return document.querySelector<HTMLElement>('button.composer-submit-button-color')
  }

  getPlatform(): 'chatgpt' {
    return 'chatgpt'
  }

  getConversationContext(): ConversationContext {
    // ChatGPT renders each message turn as an article element with data-testid="conversation-turn-*"
    const messages = document.querySelectorAll('[data-testid^="conversation-turn-"]')
    const conversationLength = messages.length

    return {
      isNewConversation: conversationLength === 0,
      conversationLength,
    }
  }

  clearInput(): void {
    const input = this.getInputElement()
    if (!input) return
    clearContentEditable(input)
  }

  appendChunk(text: string): boolean {
    const input = this.getInputElement()
    if (!input) return false
    input.focus()
    return document.execCommand('insertText', false, text) || insertText(input, text)
  }

  getRecentMessages(maxTokens: number): string {
    const turns = Array.from(document.querySelectorAll('[data-testid^="conversation-turn-"]'))
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
