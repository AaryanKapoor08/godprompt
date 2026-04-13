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
  if (!selection) {
    element.replaceChildren()
    return
  }

  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
  const deleted = typeof document.execCommand === 'function'
    ? document.execCommand('delete', false)
    : false

  if (!deleted) {
    element.replaceChildren()
  }
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
  const success = typeof document.execCommand === 'function'
    ? document.execCommand('insertText', false, text)
    : false
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
    const beforeText = element.textContent ?? ''
    const eventInit: InputEventInit = {
      inputType: 'insertText',
      data: text,
      bubbles: true,
      cancelable: true,
      composed: true,
    }

    if (typeof DataTransfer !== 'undefined') {
      const dataTransfer = new DataTransfer()
      dataTransfer.setData('text/plain', text)
      eventInit.dataTransfer = dataTransfer
    }

    const event = typeof InputEvent !== 'undefined'
      ? new InputEvent('input', eventInit)
      : new Event('input', eventInit)

    element.dispatchEvent(event)
    if (text === '' || (element.textContent ?? '') !== beforeText) {
      return true
    }

    if (!insertTextIntoDomSelection(element, text)) {
      return false
    }

    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    return true
  } catch (error) {
    console.error({ cause: error }, '[PromptGod] InputEvent fallback failed')
    return false
  }
}

function insertTextIntoDomSelection(element: HTMLElement, text: string): boolean {
  const selection = window.getSelection()
  if (selection?.rangeCount && selectionBelongsToElement(element, selection)) {
    const range = selection.getRangeAt(0)
    range.deleteContents()

    const textNode = document.createTextNode(text)
    range.insertNode(textNode)
    range.setStartAfter(textNode)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    return true
  }

  element.textContent = `${element.textContent ?? ''}${text}`
  return true
}

function selectionBelongsToElement(element: HTMLElement, selection: Selection): boolean {
  const anchor = selection.anchorNode
  return !anchor || anchor === element || element.contains(anchor)
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
