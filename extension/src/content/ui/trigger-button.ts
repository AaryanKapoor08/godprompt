// Trigger button — injected next to the send button on supported platforms

import type { PlatformAdapter } from '../adapters/types'
import type { EnhanceMessage, ServiceWorkerMessage } from '../../lib/types'
import { shouldSkipEnhancement } from '../../lib/smart-skip'
import { clearContentEditable } from '../dom-utils'
import { showToast } from './toast'
import { showUndoButton, removeUndoButton } from './undo-button'

let isEnhancing = false
let injectedButton: HTMLButtonElement | null = null

function isExtensionContextInvalidated(error: unknown): boolean {
  return error instanceof Error && /extension context invalidated/i.test(error.message)
}

function hasRuntimeContext(): boolean {
  try {
    return Boolean(chrome?.runtime?.id && chrome?.runtime?.connect)
  } catch {
    return false
  }
}

export function injectTriggerButton(adapter: PlatformAdapter): void {
  // Don't double-inject
  if (injectedButton && document.body.contains(injectedButton)) {
    return
  }

  const sendButton = adapter.getSendButton()
  if (!sendButton) {
    console.info('[PromptGod] Send button not found, cannot inject trigger button')
    return
  }

  const button = document.createElement('button')
  button.id = 'promptpilot-trigger'
  button.type = 'button'
  button.className = 'promptpilot-trigger-btn'
  button.title = 'Enhance prompt'
  button.setAttribute('aria-label', 'Enhance prompt')

  // Brand icon loaded via chrome.runtime.getURL (requires web_accessible_resources)
  const iconUrl = chrome.runtime.getURL('assets/icon-48.png')
  button.innerHTML = `
    <img class="promptpilot-trigger-icon" src="${iconUrl}" alt="PromptGod" />
    <svg class="promptpilot-trigger-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-dashoffset="0"/>
    </svg>
  `

  button.addEventListener('click', () => handleEnhanceClick(adapter))

  // Platform-specific insertion
  const platform = adapter.getPlatform()
  if (platform === 'claude') {
    button.classList.add('promptpilot-trigger-btn--claude')
    const input = adapter.getInputElement()
    const composer = input?.closest('fieldset') ?? input?.closest('form') ?? input?.parentElement?.parentElement?.parentElement

    const buttons = Array.from(composer?.querySelectorAll('button') ?? [])
    const modelButton = buttons.find((btn) => {
      const text = btn.textContent?.trim() ?? ''
      return text.includes('Sonnet') || text.includes('Haiku') || text.includes('Opus')
    }) as HTMLElement | undefined

    if (modelButton) {
      let container = modelButton.parentElement
      while (container && container !== composer && !container.contains(sendButton)) {
        container = container.parentElement
      }
      if (container) {
        let directChild: HTMLElement | null = modelButton
        while (directChild && directChild.parentElement !== container) {
          directChild = directChild.parentElement
        }
        if (directChild) {
          container.insertBefore(button, directChild)
        } else {
          sendButton.parentElement?.insertBefore(button, sendButton)
        }
      } else {
        sendButton.parentElement?.insertBefore(button, sendButton)
      }
    } else {
      sendButton.parentElement?.insertBefore(button, sendButton)
    }
  } else if (platform === 'gemini') {
    button.classList.add('promptpilot-trigger-btn--gemini')
    const input = adapter.getInputElement()
    const composer = input?.closest('form, [class*="input-area"], [class*="composer"]')
      ?? input?.parentElement?.parentElement?.parentElement

    const allEls = Array.from(composer?.querySelectorAll('*') ?? [])
    const fastEl = allEls.find((el) => {
      const text = (el as HTMLElement).textContent?.trim() ?? ''
      return (text === 'Fast' || text === '1.5 Flash' || text === 'Flash' || text === '2.0 Flash')
        && el.children.length === 0
    }) as HTMLElement | undefined

    if (fastEl) {
      const fastButton = fastEl.closest('button, [role="button"]') as HTMLElement ?? fastEl.parentElement as HTMLElement
      let container = fastButton?.parentElement
      while (container && container !== composer && !container.contains(sendButton)) {
        container = container.parentElement
      }
      if (container) {
        let directChild: HTMLElement | null = fastButton
        while (directChild && directChild.parentElement !== container) {
          directChild = directChild.parentElement
        }
        if (directChild) {
          container.insertBefore(button, directChild)
        } else {
          sendButton.parentElement?.insertBefore(button, sendButton)
        }
      } else {
        sendButton.parentElement?.insertBefore(button, sendButton)
      }
    } else {
      sendButton.parentElement?.insertBefore(button, sendButton)
    }
  } else if (platform === 'perplexity') {
    button.classList.add('promptpilot-trigger-btn--perplexity')
    const input = adapter.getInputElement()
    const composer = input?.closest('form, [class*="input"], [class*="composer"]')
      ?? input?.parentElement?.parentElement?.parentElement

    const searchRoot = composer ?? document.body
    const allEls = Array.from(searchRoot.querySelectorAll('*'))
    const modelEl = allEls.find((el) => {
      const text = (el as HTMLElement).textContent?.trim() ?? ''
      return (
        el.children.length === 0 &&
        (text === 'Model' ||
          text.includes('Sonnet') ||
          text.includes('Haiku') ||
          text.includes('Opus') ||
          text.includes('GPT') ||
          text.includes('Sonar') ||
          text.includes('o1') ||
          text.includes('o3'))
      )
    }) as HTMLElement | undefined

    if (modelEl) {
      const modelButton = (modelEl.closest('button, [role="button"]') as HTMLElement)
        ?? (modelEl.parentElement as HTMLElement)
      let container = modelButton?.parentElement
      while (container && !container.contains(sendButton)) {
        container = container.parentElement
      }
      if (container) {
        let directChild: HTMLElement | null = modelButton
        while (directChild && directChild.parentElement !== container) {
          directChild = directChild.parentElement
        }
        if (directChild) {
          container.insertBefore(button, directChild)
        } else {
          sendButton.parentElement?.insertBefore(button, sendButton)
        }
      } else {
        sendButton.parentElement?.insertBefore(button, sendButton)
      }
    } else {
      sendButton.parentElement?.insertBefore(button, sendButton)
    }
  } else if (platform === 'chatgpt') {
    button.classList.add('promptpilot-trigger-btn--chatgpt')
    // Absolute-position the button inside the form so it stays fixed at the bottom
    // regardless of ChatGPT's internal DOM nesting or text area growth.
    const input = adapter.getInputElement()
    const form = input?.closest('form')
    if (form) {
      // Ensure the form is a positioning context
      const formPosition = getComputedStyle(form).position
      if (formPosition === 'static') {
        form.style.position = 'relative'
      }
      form.appendChild(button)
    } else {
      sendButton.parentElement?.insertBefore(button, sendButton)
    }
  } else {
    sendButton.parentElement?.insertBefore(button, sendButton)
  }

  injectedButton = button
  console.info({ platform: adapter.getPlatform() }, '[PromptGod] Trigger button injected')
}

async function handleEnhanceClick(adapter: PlatformAdapter): Promise<void> {
  // Double-click guard
  if (isEnhancing) {
    return
  }

  const promptText = adapter.getPromptText()

  // Smart skip check
  if (shouldSkipEnhancement(promptText)) {
    showToast({ message: 'Prompt too short to enhance', variant: 'info' })
    return
  }

  const platform = adapter.getPlatform()
  const context = adapter.getConversationContext()
  console.info(
    { platform, promptText, promptLength: promptText.length, context },
    '[PromptGod] Enhance triggered'
  )

  // Cache original prompt for undo — must happen before any DOM modification
  const originalPrompt = promptText

  // Remove any existing undo button from a previous enhancement
  removeUndoButton()

  // Set loading state
  setLoading(true)

  // Guard against stale content script after extension reload
  if (!hasRuntimeContext()) {
    showToast({ message: 'Extension was updated — please refresh the page', variant: 'warning' })
    setLoading(false)
    return
  }

  // Wake up the service worker with a ping before opening the port.
  // Chrome MV3 service workers go idle and onConnect alone doesn't reliably wake them.
  try {
    await chrome.runtime.sendMessage({ type: 'PING' })
  } catch (error) {
    if (isExtensionContextInvalidated(error) || !hasRuntimeContext()) {
      showToast({ message: 'Extension was updated — please refresh the page', variant: 'warning' })
      setLoading(false)
      return
    }

    // Service worker might not have a sendMessage listener yet — that's fine,
    // the ping itself wakes it up. Ignore errors.
  }

  // Open port to service worker for streaming
  let port: chrome.runtime.Port
  try {
    port = chrome.runtime.connect({ name: 'enhance' })
  } catch (error) {
    if (isExtensionContextInvalidated(error) || !hasRuntimeContext()) {
      showToast({ message: 'Extension was updated — please refresh the page', variant: 'warning' })
    } else {
      console.error({ cause: error }, '[PromptGod] Failed to open port to service worker')
      showToast({ message: 'Could not reach extension service worker', variant: 'error' })
    }
    setLoading(false)
    return
  }

  // Send ENHANCE message
  const message: EnhanceMessage = {
    type: 'ENHANCE',
    rawPrompt: promptText,
    platform,
    context,
  }
  try {
    port.postMessage(message)
  } catch (error) {
    if (isExtensionContextInvalidated(error) || !hasRuntimeContext()) {
      showToast({ message: 'Extension was updated — please refresh the page', variant: 'warning' })
    } else {
      console.error({ cause: error }, '[PromptGod] Failed to send ENHANCE message')
      showToast({ message: 'Failed to start enhancement', variant: 'error' })
    }
    try {
      port.disconnect()
    } catch {
      // no-op
    }
    setLoading(false)
    return
  }

  // Progressive rendering: tokens feed into a buffer, a rendering loop
  // drips one word per frame — smooth real-time typing.
  // Field is NOT cleared until the first token arrives, so the user's
  // original prompt stays visible during the API wait.
  let accumulatedText = ''
  let renderedIndex = 0
  let fieldCleared = false
  let renderFrameId: number | null = null
  let streamDone = false
  let settled = false
  let acknowledged = false
  let undoShown = false

  const ackTimeout = window.setTimeout(() => {
    if (settled) {
      return
    }

    showToast({
      message: 'Service worker did not respond. Refresh the page and try again.',
      variant: 'error',
    })
    try {
      port.disconnect()
    } catch {
      // no-op
    }
  }, 10000)

  let progressTimeout: number | null = window.setTimeout(() => {
    if (settled) {
      return
    }

    showToast({
      message: 'Enhancement timed out. Try again with a shorter prompt.',
      variant: 'error',
    })
    try {
      port.disconnect()
    } catch {
      // no-op
    }
  }, 45000)

  function resetProgressTimeout(): void {
    if (progressTimeout !== null) {
      window.clearTimeout(progressTimeout)
    }
    progressTimeout = window.setTimeout(() => {
      if (settled) {
        return
      }

      showToast({
        message: 'Enhancement timed out. Try again with a shorter prompt.',
        variant: 'error',
      })
      try {
        port.disconnect()
      } catch {
        // no-op
      }
    }, 45000)
  }

  function settle(): void {
    if (settled) {
      return
    }
    settled = true
    if (renderFrameId !== null) {
      cancelAnimationFrame(renderFrameId)
      renderFrameId = null
    }
    window.clearTimeout(ackTimeout)
    if (progressTimeout !== null) {
      window.clearTimeout(progressTimeout)
      progressTimeout = null
    }
    cleanupPort()
  }

  /** Rendering loop — drips one word per frame from accumulatedText into the DOM.
   *  At ~60fps this gives smooth word-by-word typing, ~150 words in ~2.5s. */
  function renderLoop(): void {
    if (settled) return

    const pending = accumulatedText.length - renderedIndex
    if (pending <= 0) {
      if (streamDone) {
        // All text rendered and stream is done — final sync and settle
        try {
          adapter.setPromptText(accumulatedText)
        } catch {
          // best-effort
        }
        console.info(
          { enhancedLength: accumulatedText.length },
          '[PromptGod] Enhancement complete'
        )
        ensureUndoButton()
        settle()
        return
      }
      // Buffer empty, wait for more tokens
      renderFrameId = requestAnimationFrame(renderLoop)
      return
    }

    // Clear field on first render — user's prompt stays visible until tokens arrive
    if (!fieldCleared) {
      try {
        const input = adapter.getInputElement()
        if (!input) throw new Error('Input element not found')
        clearContentEditable(input)
        input.focus()
        fieldCleared = true
      } catch (error) {
        console.error({ cause: error }, '[PromptGod] Failed to clear input field')
        showToast({ message: 'Input field disappeared during enhancement', variant: 'error' })
        try { port.disconnect() } catch { /* no-op */ }
        ensureUndoButton()
        settle()
        return
      }
    }

    // Find next word boundary: advance past current word + trailing whitespace
    let end = renderedIndex
    while (end < accumulatedText.length && accumulatedText[end] !== ' ' && accumulatedText[end] !== '\n') {
      end++
    }
    while (end < accumulatedText.length && (accumulatedText[end] === ' ' || accumulatedText[end] === '\n')) {
      end++
    }

    const slice = accumulatedText.slice(renderedIndex, end)
    if (slice.length === 0) {
      renderFrameId = requestAnimationFrame(renderLoop)
      return
    }

    try {
      const input = adapter.getInputElement()
      if (!input) throw new Error('Input element not found')
      // Lightweight insert — cursor is already at end from previous insert.
      document.execCommand('insertText', false, slice)
      renderedIndex = end
    } catch (error) {
      console.error({ cause: error }, '[PromptGod] Failed to update input field')
      showToast({ message: 'Input field disappeared during enhancement', variant: 'error' })
      try { port.disconnect() } catch { /* no-op */ }
      ensureUndoButton()
      settle()
      return
    }

    ensureUndoButton()
    renderFrameId = requestAnimationFrame(renderLoop)
  }

  function ensureUndoButton(): void {
    if (undoShown) {
      return
    }

    showUndoButton(adapter, originalPrompt, () => {
      settle()
      try {
        port.disconnect()
      } catch {
        // no-op
      }
    })
    undoShown = true
  }

  // Listen for TOKEN, DONE, ERROR from service worker
  port.onMessage.addListener((msg: ServiceWorkerMessage) => {
    if (!acknowledged) {
      acknowledged = true
      window.clearTimeout(ackTimeout)
    }
    resetProgressTimeout()

    if (msg.type === 'START') {
      console.info('[PromptGod] Service worker acknowledged request')
    } else if (msg.type === 'TOKEN') {
      accumulatedText += msg.text

      // Start the render loop on first token — clears field and starts typing
      if (renderFrameId === null && !settled) {
        renderFrameId = requestAnimationFrame(renderLoop)
      }
    } else if (msg.type === 'DONE') {
      if (progressTimeout !== null) {
        window.clearTimeout(progressTimeout)
        progressTimeout = null
      }
      // Signal the render loop to flush remaining text and settle
      streamDone = true
    } else if (msg.type === 'ERROR') {
      console.error({ message: msg.message, code: msg.code }, '[PromptGod] Enhancement error')
      showToast({ message: msg.message, variant: 'error' })
      // Flush any pending text so partial result is visible
      if (accumulatedText.length > 0 && renderedIndex < accumulatedText.length) {
        try {
          adapter.setPromptText(accumulatedText)
        } catch { /* best-effort */ }
      }
      if (accumulatedText.length > 0) {
        ensureUndoButton()
      }
      settle()
    }
  })

  // Handle unexpected disconnection
  port.onDisconnect.addListener(() => {
    if (settled) {
      return
    }

    const error = chrome.runtime.lastError
    if (error) {
      const errorMessage = error.message ?? ''
      const invalidated = /extension context invalidated/i.test(errorMessage)
      if (invalidated || !hasRuntimeContext()) {
        showToast({ message: 'Extension was updated — please refresh the page', variant: 'warning' })
      } else {
        console.error({ cause: error }, '[PromptGod] Port disconnected with error')
        showToast({ message: 'Connection to service worker lost', variant: 'error' })
      }
    }
    // Flush any pending text so partial result is visible
    if (accumulatedText.length > 0 && renderedIndex < accumulatedText.length) {
      try {
        adapter.setPromptText(accumulatedText)
      } catch { /* best-effort */ }
    }
    if (accumulatedText.length > 0) {
      ensureUndoButton()
    }
    settle()
  })
}

function cleanupPort(): void {
  setLoading(false)
}

function setLoading(loading: boolean): void {
  isEnhancing = loading
  if (injectedButton) {
    injectedButton.classList.toggle('promptpilot-trigger-btn--loading', loading)
    injectedButton.disabled = loading
  }
}

// Re-inject button when platform re-renders the composer (SPA navigation)
export function observeComposer(adapter: PlatformAdapter): void {
  const observer = new MutationObserver(() => {
    if (!injectedButton || !document.body.contains(injectedButton)) {
      injectedButton = null
      injectTriggerButton(adapter)
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

// Keyboard shortcut: Ctrl+Shift+E
export function registerShortcut(adapter: PlatformAdapter): void {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'E') {
      e.preventDefault()
      handleEnhanceClick(adapter)
    }
  })
}
