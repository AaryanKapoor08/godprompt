// DOM utilities for synthetic text insertion across platform editors
// ChatGPT uses ProseMirror — textContent alone won't trigger state update,
// must dispatch InputEvent or use execCommand

/**
 * Clear all content from a contenteditable element.
 * Selects all content and deletes it via execCommand to trigger
 * the editor's internal state update.
 */
export function clearContentEditable(element: HTMLElement): void {
  element.focus()
  const selection = window.getSelection()
  if (!selection) return

  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
  document.execCommand('delete', false)
}

/**
 * Insert text into a contenteditable element using execCommand.
 * Falls back to InputEvent with DataTransfer if execCommand fails.
 *
 * Returns true if text was inserted successfully.
 */
export function insertText(element: HTMLElement, text: string): boolean {
  element.focus()

  // Primary strategy: execCommand('insertText')
  // Deprecated but still works and reliably triggers ProseMirror state updates
  const success = document.execCommand('insertText', false, text)
  if (success) {
    return true
  }

  // Fallback: InputEvent with DataTransfer
  // Used when execCommand is removed in future Chrome versions
  return insertTextViaInputEvent(element, text)
}

/**
 * Fallback text insertion using InputEvent with DataTransfer.
 * Creates a synthetic input event that mimics real user typing.
 */
export function insertTextViaInputEvent(element: HTMLElement, text: string): boolean {
  try {
    const dataTransfer = new DataTransfer()
    dataTransfer.setData('text/plain', text)

    const event = new InputEvent('input', {
      inputType: 'insertText',
      data: text,
      dataTransfer,
      bubbles: true,
      cancelable: true,
      composed: true,
    })

    element.dispatchEvent(event)
    return true
  } catch (error) {
    console.error({ cause: error }, '[PromptGod] InputEvent fallback failed')
    return false
  }
}

/**
 * Append text to a contenteditable element at the current cursor position.
 * Moves cursor to end first, then inserts. No clearing — pure append.
 */
export function appendText(element: HTMLElement, text: string): boolean {
  element.focus()

  // Move cursor to end so we always append
  const selection = window.getSelection()
  if (selection) {
    selection.selectAllChildren(element)
    selection.collapseToEnd()
  }

  return insertText(element, text)
}

/**
 * Replace all text in a contenteditable element.
 * Clears existing content, then inserts the new text.
 * Dispatches a bubbling input event to notify the platform.
 */
export function replaceText(element: HTMLElement, text: string): boolean {
  clearContentEditable(element)
  const success = insertText(element, text)

  if (success) {
    // Dispatch a generic input event to ensure platform picks up the change
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }

  return success
}
