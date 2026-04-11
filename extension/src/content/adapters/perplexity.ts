// Perplexity platform adapter
// Perplexity uses a textarea or contenteditable div for input

import type { PlatformAdapter, ConversationContext } from './types'

export class PerplexityAdapter implements PlatformAdapter {
  matches(): boolean {
    return window.location.hostname === 'www.perplexity.ai' ||
      window.location.hostname === 'perplexity.ai'
  }

  getInputElement(): HTMLElement | null {
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
    const inputs = this.getInputElements()
    if (inputs.length === 0) return

    for (const input of inputs) {
      if (input instanceof HTMLTextAreaElement) {
        this.setTextareaValue(input, '')
      } else {
        this.replaceContentEditableValue(input, '')
      }
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
      if (this.replaceViaNativeEditing(element, text)) {
        this.scheduleContentStabilization(element, text)
        return true
      }

      if (this.forceContentEditableValue(element, text, true)) {
        return true
      }

      return false
    } catch (error) {
      console.error({ cause: error }, '[PromptGod] Failed to replace Perplexity contenteditable value')
      return false
    }
  }

  private replaceViaNativeEditing(element: HTMLElement, text: string): boolean {
    element.focus()
    this.selectEditorContents(element)
    document.execCommand('delete', false)

    if (!this.contentMatches(element, '')) {
      return false
    }

    const inserted = document.execCommand('insertText', false, text)
    if (!inserted) {
      return false
    }

    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    return this.contentMatches(element, text)
  }

  private forceContentEditableValue(element: HTMLElement, text: string, scheduleStabilization: boolean): boolean {
    element.focus()
    this.selectEditorContents(element)
    element.replaceChildren()
    const nodes = this.createContentNodes(text)
    for (const node of nodes) {
      element.appendChild(node)
    }
    this.moveCursorToEnd(element)
    const wroteExpectedText = this.contentMatches(element, text)

    if (wroteExpectedText && scheduleStabilization) {
      this.scheduleContentStabilization(element, text)
    }

    return wroteExpectedText
  }

  private createContentNodes(text: string): Node[] {
    const lines = text.split('\n')
    const nodes: Node[] = []

    for (const line of lines) {
      const paragraph = document.createElement('p')
      paragraph.dir = 'ltr'

      if (line.length === 0) {
        paragraph.appendChild(document.createElement('br'))
      } else {
        const span = document.createElement('span')
        span.setAttribute('data-lexical-text', 'true')
        span.textContent = line
        paragraph.appendChild(span)
      }

      nodes.push(paragraph)
    }

    return nodes
  }

  private scheduleContentStabilization(element: HTMLElement, text: string): void {
    const stabilize = (notify: boolean) => {
      if (!document.contains(element)) {
        return
      }

      if (notify) {
        this.notifyEditorChanged(element)
      }

      if (!this.contentMatches(element, text)) {
        this.forceContentEditableValue(element, text, false)
      }
    }

    requestAnimationFrame(() => stabilize(true))
    window.setTimeout(() => stabilize(false), 100)
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
      'textarea[placeholder*="Ask"]',
      'textarea[aria-label*="Ask"]',
      '[contenteditable="true"][aria-label*="Ask"]',
      '[contenteditable="true"][data-lexical-editor]',
      'div[contenteditable="true"]',
    ]

    const seen = new Set<HTMLElement>()
    const inputs: HTMLElement[] = []

    for (const selector of selectors) {
      const matches = Array.from(document.querySelectorAll<HTMLElement>(selector))
      for (const match of matches) {
        if (seen.has(match)) continue
        seen.add(match)
        inputs.push(match)
      }
    }

    return inputs.sort((a, b) => this.getInputPriority(b) - this.getInputPriority(a))
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

    const rect = element.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      score += 100
    }

    const style = window.getComputedStyle(element)
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      score += 50
    }

    if (element instanceof HTMLTextAreaElement) {
      score += 20
    }

    if (element.matches('[data-lexical-editor]')) {
      score += 40
    }

    if (element.getAttribute('contenteditable') === 'true') {
      score += 30
    }

    if (element.contains(document.activeElement) || document.activeElement === element) {
      score += 200
    }

    if ((element.textContent ?? '').trim().length > 0) {
      score += 25
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
