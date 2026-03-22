// Trigger button — injected next to the send button on ChatGPT

import type { PlatformAdapter } from '../adapters/types'
import type { EnhanceMessage, ServiceWorkerMessage } from '../../lib/types'
import { shouldSkipEnhancement } from '../../lib/smart-skip'
import { showToast } from './toast'
import { showUndoButton, removeUndoButton } from './undo-button'

let isEnhancing = false
let activePort: chrome.runtime.Port | null = null
let injectedButton: HTMLElement | null = null

export function injectTriggerButton(adapter: PlatformAdapter): void {
  // Don't double-inject
  if (injectedButton && document.body.contains(injectedButton)) {
    return
  }

  const sendButton = adapter.getSendButton()
  if (!sendButton) {
    console.info('[PromptPilot] Send button not found, cannot inject trigger button')
    return
  }

  const button = document.createElement('button')
  button.id = 'promptpilot-trigger'
  button.type = 'button'
  button.className = 'promptpilot-trigger-btn'
  button.title = 'Enhance prompt'
  button.setAttribute('aria-label', 'Enhance prompt')

  // Sparkle icon SVG
  button.innerHTML = `
    <svg class="promptpilot-trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/>
    </svg>
    <svg class="promptpilot-trigger-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-dashoffset="0"/>
    </svg>
  `

  button.addEventListener('click', () => handleEnhanceClick(adapter))

  // Platform-specific insertion:
  // ChatGPT: insert before send button (left of it in the button row)
  // Claude: position absolutely in the composer, above the send button area
  const platform = adapter.getPlatform()
  if (platform === 'claude') {
    button.classList.add('promptpilot-trigger-btn--claude')
    // Find the composer container and append the button with absolute positioning
    const input = adapter.getInputElement()
    const composer = input?.closest('fieldset') ?? input?.closest('form') ?? input?.parentElement?.parentElement?.parentElement
    if (composer) {
      // Ensure the composer is a positioning context
      const computedStyle = window.getComputedStyle(composer)
      if (computedStyle.position === 'static') {
        (composer as HTMLElement).style.position = 'relative'
      }
      composer.appendChild(button)
    } else {
      sendButton.parentElement?.insertBefore(button, sendButton)
    }
  } else {
    sendButton.parentElement?.insertBefore(button, sendButton)
  }
  injectedButton = button

  console.info({ platform: adapter.getPlatform() }, '[PromptPilot] Trigger button injected')
}

function handleEnhanceClick(adapter: PlatformAdapter): void {
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
    '[PromptPilot] Enhance triggered'
  )

  // Cache original prompt for undo — must happen before any DOM modification
  const originalPrompt = promptText

  // Remove any existing undo button from a previous enhancement
  removeUndoButton()

  // Set loading state
  setLoading(true)

  // Guard against stale content script after extension reload
  if (!chrome?.runtime?.connect) {
    showToast({ message: 'Extension was updated — please refresh the page', variant: 'warning' })
    setLoading(false)
    return
  }

  // Open port to service worker for streaming
  const port = chrome.runtime.connect({ name: 'enhance' })
  activePort = port

  // Send ENHANCE message
  const message: EnhanceMessage = {
    type: 'ENHANCE',
    rawPrompt: promptText,
    platform,
    context,
  }
  port.postMessage(message)

  // Accumulate streamed tokens for DOM replacement
  let accumulatedText = ''
  let firstToken = true

  // Listen for TOKEN, DONE, ERROR from service worker
  port.onMessage.addListener((msg: ServiceWorkerMessage) => {
    if (msg.type === 'TOKEN') {
      accumulatedText += msg.text

      try {
        adapter.setPromptText(accumulatedText)
      } catch (error) {
        console.error({ cause: error }, '[PromptPilot] Failed to update input field')
        showToast({ message: 'Input field disappeared during enhancement', variant: 'error' })
        port.disconnect()
        // Show undo with whatever text was accumulated so far
        showUndoButton(adapter, originalPrompt)
        cleanupPort()
        return
      }

      if (firstToken) {
        console.info('[PromptPilot] Streaming started — first token received')
        firstToken = false
      }
    } else if (msg.type === 'DONE') {
      console.info(
        { enhancedLength: accumulatedText.length, rateLimitRemaining: msg.rateLimitRemaining },
        '[PromptPilot] Enhancement complete'
      )
      showUndoButton(adapter, originalPrompt)
      cleanupPort()
    } else if (msg.type === 'ERROR') {
      console.error({ message: msg.message, code: msg.code }, '[PromptPilot] Enhancement error')
      showToast({ message: msg.message, variant: 'error' })
      // If we already streamed partial text, show undo so user can restore
      if (accumulatedText.length > 0) {
        showUndoButton(adapter, originalPrompt)
      }
      cleanupPort()
    }
  })

  // Handle unexpected disconnection
  port.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError
    if (error) {
      console.error({ cause: error }, '[PromptPilot] Port disconnected with error')
      showToast({ message: 'Connection to service worker lost', variant: 'error' })
    }
    // If streaming was interrupted, show undo so user can restore original
    if (accumulatedText.length > 0) {
      showUndoButton(adapter, originalPrompt)
    }
    cleanupPort()
  })
}

function cleanupPort(): void {
  activePort = null
  setLoading(false)
}

function setLoading(loading: boolean): void {
  isEnhancing = loading
  if (injectedButton) {
    injectedButton.classList.toggle('promptpilot-trigger-btn--loading', loading)
    injectedButton.disabled = loading
  }
}

// Re-inject button when ChatGPT re-renders the composer (SPA navigation)
export function observeComposer(adapter: PlatformAdapter): void {
  const observer = new MutationObserver(() => {
    // Check if our button was removed from the DOM
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
