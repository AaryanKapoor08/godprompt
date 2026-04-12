// Undo button — floating button that appears after enhancement to restore the original prompt

import type { PlatformAdapter } from '../adapters/types'

let undoButton: HTMLElement | null = null
let inputListener: (() => void) | null = null
let inputListenerElement: HTMLElement | null = null
let sendObserver: MutationObserver | null = null

/**
 * Show the undo button near the input field.
 * Clicking it restores the original prompt via adapter.setPromptText().
 * Persistent until user edits or sends — no auto-dismiss timer.
 */
export function showUndoButton(
  adapter: PlatformAdapter,
  originalPrompt: string,
  onUndo?: () => void,
  diffLabel?: string
): void {
  // Remove any existing undo button first
  removeUndoButton()

  const inputElement = adapter.getInputElement()
  if (!inputElement) {
    return
  }

  // Create the undo button
  const button = document.createElement('button')
  button.id = 'promptgod-undo'
  button.type = 'button'
  button.className = 'promptgod-undo-btn'
  button.title = 'Undo enhancement'
  button.setAttribute('aria-label', 'Undo enhancement')

  const diffHtml = diffLabel
    ? `<span class="promptgod-undo-diff">Added: ${diffLabel}</span>`
    : ''

  button.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
    </svg>
    <span>Undo</span>
    ${diffHtml}
  `

  // Click handler: restore original prompt
  button.addEventListener('click', () => {
    try {
      onUndo?.()
      adapter.setPromptText(originalPrompt)
      console.info('[PromptGod] Original prompt restored via undo')
    } catch (error) {
      console.error({ cause: error }, '[PromptGod] Failed to restore original prompt')
    }
    removeUndoButton()
  })

  // Position near the input field — insert after the composer area.
  // Perplexity and Gemini clip children outside parts of their composers, so
  // keep undo fixed to the viewport there instead of nesting it in editor DOM.
  if (adapter.getPlatform() === 'perplexity' || adapter.getPlatform() === 'gemini') {
    positionFixedUndoButton(button, inputElement, adapter.getSendButton(), adapter.getPlatform())
    document.body.appendChild(button)
  } else {
    const composer = inputElement.closest('form') ?? inputElement.parentElement?.parentElement
    if (composer) {
      composer.style.position = composer.style.position || 'relative'
      composer.appendChild(button)
    } else {
      // Fallback: append to body as fixed-position element
      document.body.appendChild(button)
    }
  }

  undoButton = button

  // Animate in
  requestAnimationFrame(() => {
    button.classList.add('promptgod-undo-btn--visible')
  })

  // No auto-dismiss timer — persistent until user edits or sends

  // Dismiss when user manually edits the enhanced prompt
  inputListener = () => {
    if (undoButton) {
      removeUndoButton()
    }
  }
  inputElement.addEventListener('keydown', inputListener)
  inputListenerElement = inputElement

  // Dismiss when user sends the message (observe send button click or DOM change)
  observeSendAction(adapter)
}

/**
 * Remove the undo button and clean up all listeners/timers.
 */
export function removeUndoButton(): void {
  if (undoButton) {
    undoButton.classList.remove('promptgod-undo-btn--visible')
    // Remove after fade-out transition
    const btn = undoButton
    setTimeout(() => btn.remove(), 200)
    undoButton = null
  }

  if (inputListener) {
    inputListenerElement?.removeEventListener('keydown', inputListener)
    inputListener = null
    inputListenerElement = null
  }

  if (sendObserver) {
    sendObserver.disconnect()
    sendObserver = null
  }
}

function positionFixedUndoButton(
  button: HTMLElement,
  inputElement: HTMLElement,
  sendButton: HTMLElement | null,
  platform: ReturnType<PlatformAdapter['getPlatform']>
): void {
  const composer = getSharedVisibleAncestor(inputElement, sendButton) ?? inputElement
  const rect = composer.getBoundingClientRect()
  const right = Math.max(12, window.innerWidth - rect.right + 8)
  const top = Math.max(12, rect.bottom + 8)
  const maxTop = Math.max(12, window.innerHeight - 44)

  button.style.position = 'fixed'
  button.style.top = `${Math.min(top, maxTop)}px`
  button.style.right = `${right}px`
  button.style.bottom = 'auto'
}

function getSharedVisibleAncestor(inputElement: HTMLElement, sendButton: HTMLElement | null): HTMLElement | null {
  if (!sendButton) {
    return inputElement.closest<HTMLElement>('form') ?? inputElement.parentElement
  }

  let current: HTMLElement | null = inputElement
  while (current && current !== document.body) {
    if (current.contains(sendButton) && isVisibleBox(current)) {
      return current
    }
    current = current.parentElement
  }

  return inputElement.closest<HTMLElement>('form') ?? inputElement.parentElement
}

function isVisibleBox(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

/**
 * Watch for the user sending the message.
 * When the conversation gains a new turn, dismiss the undo button.
 */
function observeSendAction(adapter: PlatformAdapter): void {
  const sendButton = adapter.getSendButton()

  // Listen for send button click
  if (sendButton) {
    const onSendClick = () => {
      removeUndoButton()
      sendButton.removeEventListener('click', onSendClick)
    }
    sendButton.addEventListener('click', onSendClick)
  }

  // Also observe DOM for new conversation turns (covers keyboard send via Enter)
  sendObserver = new MutationObserver(() => {
    // If the input field is now empty, user likely sent the message
    const currentText = adapter.getPromptText()
    if (currentText.trim() === '') {
      removeUndoButton()
    }
  })

  const chatContainer = document.querySelector('main') ?? document.body
  sendObserver.observe(chatContainer, {
    childList: true,
    subtree: true,
  })
}
