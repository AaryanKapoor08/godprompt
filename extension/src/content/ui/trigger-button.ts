// Trigger button — injected next to the send button on ChatGPT

import type { PlatformAdapter } from '../adapters/types'
import type { EnhanceMessage, ServiceWorkerMessage } from '../../lib/types'
import { shouldSkipEnhancement } from '../../lib/smart-skip'
import { showToast } from './toast'

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

  // Insert before the send button
  sendButton.parentElement?.insertBefore(button, sendButton)
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

  // Set loading state
  setLoading(true)

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

  // Listen for TOKEN, DONE, ERROR from service worker
  port.onMessage.addListener((msg: ServiceWorkerMessage) => {
    if (msg.type === 'TOKEN') {
      console.info({ text: msg.text }, '[PromptPilot] Received token')
    } else if (msg.type === 'DONE') {
      console.info('[PromptPilot] Enhancement complete')
      cleanupPort()
    } else if (msg.type === 'ERROR') {
      console.error({ message: msg.message, code: msg.code }, '[PromptPilot] Enhancement error')
      showToast({ message: msg.message, variant: 'error' })
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
