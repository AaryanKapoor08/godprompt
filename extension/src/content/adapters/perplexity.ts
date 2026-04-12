// Perplexity platform adapter
// Perplexity uses a textarea or contenteditable div for input

import type { PlatformAdapter, ConversationContext } from './types'

const SET_TEXT_EVENT = 'promptgod:perplexity:set-text'
const WRITE_RESULT_ATTR = 'data-promptgod-write-result'
const WRITE_REQUEST_ATTR = 'data-promptgod-write-request'

export class PerplexityAdapter implements PlatformAdapter {
  private lastFocusedInput: HTMLElement | null = null

  constructor() {
    document.addEventListener('focusin', (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return

      const input = this.findEditableAncestor(target)
      if (input && this.isInputCandidate(input)) {
        this.lastFocusedInput = input
      }
    }, true)
  }

  matches(): boolean {
    return window.location.hostname === 'www.perplexity.ai' ||
      window.location.hostname === 'perplexity.ai'
  }

  getInputElement(): HTMLElement | null {
    if (this.lastFocusedInput && this.isInputCandidate(this.lastFocusedInput)) {
      return this.lastFocusedInput
    }

    if (document.activeElement instanceof HTMLElement) {
      const activeInput = this.findEditableAncestor(document.activeElement)
      if (activeInput && this.isInputCandidate(activeInput)) {
        this.lastFocusedInput = activeInput
        return activeInput
      }
    }

    return this.getInputElements()[0] ?? null
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

    input.focus()
    if (input instanceof HTMLTextAreaElement) {
      this.setTextareaValue(input, text)
      return
    }

    if (!this.replaceContentEditableValue(input, text)) {
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
      this.replaceContentEditableValue(input, '')
    }
  }

  appendChunk(text: string): boolean {
    void text
    // Perplexity's editors frequently duplicate or preserve stale content when
    // text is appended incrementally. Force the render loop into full-replace mode.
    return false
  }

  private replaceContentEditableValue(element: HTMLElement, text: string): boolean {
    try {
      if (this.replaceViaMainWorldLexicalBridge(element, text)) {
        return true
      }

      if (this.replaceViaNativeInsertion(element, text)) {
        return true
      }

      return !this.isLexicalEditor(element) && this.forcePlainContentEditableValue(element, text)
    } catch (error) {
      console.error({ cause: error }, '[PromptGod] Failed to replace Perplexity contenteditable value')
      return false
    }
  }

  private replaceViaMainWorldLexicalBridge(element: HTMLElement, text: string): boolean {
    if (!this.isLexicalEditor(element)) {
      return false
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    element.removeAttribute(WRITE_REQUEST_ATTR)
    element.removeAttribute(WRITE_RESULT_ATTR)

    element.dispatchEvent(new CustomEvent(SET_TEXT_EVENT, {
      bubbles: true,
      composed: true,
      detail: JSON.stringify({ requestId, text }),
    }))

    return element.getAttribute(WRITE_REQUEST_ATTR) === requestId &&
      element.getAttribute(WRITE_RESULT_ATTR) === 'ok'
  }

  private replaceViaNativeInsertion(element: HTMLElement, text: string): boolean {
    element.focus()
    this.selectEditorContents(element)

    // One native edit transaction lets Perplexity/Lexical replace the selected
    // text in its own state. Splitting this into delete + insert can leave stale
    // editor state behind and produce duplicate or reverted prompts.
    const inserted = document.execCommand('insertText', false, text)
    if (!inserted) {
      return false
    }

    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    return this.contentMatches(element, text)
  }

  private forcePlainContentEditableValue(element: HTMLElement, text: string): boolean {
    element.focus()
    this.selectEditorContents(element)
    element.replaceChildren()
    element.textContent = text
    this.moveCursorToEnd(element)
    this.notifyEditorChanged(element)
    return this.contentMatches(element, text)
  }

  private selectEditorContents(element: HTMLElement): void {
    const selection = window.getSelection()
    if (!selection) return

    const range = document.createRange()
    range.selectNodeContents(element)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  private notifyEditorChanged(element: HTMLElement): void {
    // Do not include replacement text in synthetic events here. Perplexity's
    // controlled editor can interpret data-carrying InputEvents as additional
    // insertions, duplicating the prompt.
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  private contentMatches(element: HTMLElement, text: string): boolean {
    return this.normalizeEditorText(element.textContent ?? '') === this.normalizeEditorText(text)
  }

  private normalizeEditorText(text: string): string {
    return text.replace(/\u00a0/g, ' ').trim()
  }

  private getInputElements(): HTMLElement[] {
    const selectors = [
      '[contenteditable="true"][data-lexical-editor]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"][aria-label*="Ask" i]',
      '[contenteditable="true"][aria-label*="Search" i]',
      'textarea[placeholder*="Ask" i]',
      'textarea[aria-label*="Ask" i]',
      'div[contenteditable="true"]',
    ]

    const seen = new Set<HTMLElement>()
    const inputs: HTMLElement[] = []

    for (const selector of selectors) {
      const matches = Array.from(document.querySelectorAll<HTMLElement>(selector))
      for (const match of matches) {
        if (seen.has(match)) continue
        if (!this.isInputCandidate(match)) continue
        seen.add(match)
        inputs.push(match)
      }
    }

    return inputs.sort((a, b) => this.getInputPriority(b) - this.getInputPriority(a))
  }

  private findEditableAncestor(element: HTMLElement): HTMLElement | null {
    return element.closest<HTMLElement>('textarea, [contenteditable="true"]')
  }

  private isInputCandidate(element: HTMLElement): boolean {
    if (element instanceof HTMLTextAreaElement && (element.disabled || element.readOnly)) {
      return false
    }

    if (!(element instanceof HTMLTextAreaElement) && element.getAttribute('contenteditable') !== 'true') {
      return false
    }

    if (element.closest('[hidden], [aria-hidden="true"]')) {
      return false
    }

    return this.isVisible(element) || element === this.lastFocusedInput || element.contains(document.activeElement)
  }

  private isVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false

    const style = window.getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden'
  }

  private isLexicalEditor(element: HTMLElement): boolean {
    return element.matches('[data-lexical-editor]') || Boolean(element.querySelector('[data-lexical-text]'))
  }

  private getElementText(element: HTMLElement): string {
    return element instanceof HTMLTextAreaElement ? element.value : element.textContent ?? ''
  }

  private moveCursorToEnd(element: HTMLElement): void {
    const selection = window.getSelection()
    if (!selection) return

    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  private getInputPriority(element: HTMLElement): number {
    let score = 0

    if (element === this.lastFocusedInput) {
      score += 500
    }

    if (element.contains(document.activeElement) || document.activeElement === element) {
      score += 300
    }

    if (this.isVisible(element)) {
      score += 150
    }

    if (element instanceof HTMLTextAreaElement) {
      score += 20
    }

    if (element.matches('[data-lexical-editor]')) {
      score += 80
    }

    if (element.getAttribute('role') === 'textbox') {
      score += 60
    }

    const accessibleText = `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('placeholder') ?? ''}`
    if (/\b(ask|search|follow[-\s]?up)\b/i.test(accessibleText)) {
      score += 70
    }

    if (element.closest('form, [class*="composer"], [class*="input"]')) {
      score += 40
    }

    if (element.getAttribute('contenteditable') === 'true') {
      score += 30
    }

    if (this.getElementText(element).trim().length > 0) {
      score += 10
    }

    return score
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
