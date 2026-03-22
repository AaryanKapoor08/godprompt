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
    // On Claude, the bottom bar has: [+ button] ... [model selector] [voice] [send]
    // We want to insert just left of the model selector text.
    // Strategy: find the model selector button, then walk up until we find the
    // container that also holds the voice/send buttons (the flex row), and insert there.
    const input = adapter.getInputElement()
    const composer = input?.closest('fieldset') ?? input?.closest('form') ?? input?.parentElement?.parentElement?.parentElement

    // Find the button whose direct text content includes a model name
    const buttons = Array.from(composer?.querySelectorAll('button') ?? [])
    const modelButton = buttons.find((btn) => {
      const text = btn.textContent?.trim() ?? ''
      return text.includes('Sonnet') || text.includes('Haiku') || text.includes('Opus')
    }) as HTMLElement | undefined

    if (modelButton) {
      // Walk up from modelButton to find a container that also contains the send button
      // This ensures we're at the right flex row level
      let container = modelButton.parentElement
      while (container && container !== composer && !container.contains(sendButton)) {
        container = container.parentElement
      }
      // Now find the direct child of this container that contains the model button
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
    // Gemini bottom bar: [+] [Tools] ... [Fast] [send] [mic]
    // Insert left of the "Fast" model/speed selector text
    button.classList.add('promptpilot-trigger-btn--gemini')
    const input = adapter.getInputElement()
    const composer = input?.closest('form, [class*="input-area"], [class*="composer"]')
      ?? input?.parentElement?.parentElement?.parentElement

    // Find the element that contains "Fast" or other model selector text
    const allEls = Array.from(composer?.querySelectorAll('*') ?? [])
    const fastEl = allEls.find((el) => {
      const text = (el as HTMLElement).textContent?.trim() ?? ''
      return (text === 'Fast' || text === '1.5 Flash' || text === 'Flash' || text === '2.0 Flash')
        && el.children.length === 0
    }) as HTMLElement | undefined

    if (fastEl) {
      // Walk up to the clickable button/link
      const fastButton = fastEl.closest('button, [role="button"]') as HTMLElement ?? fastEl.parentElement as HTMLElement
      // Walk up to find the flex row that also contains the send button
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
      // Fallback: insert before send button
      sendButton.parentElement?.insertBefore(button, sendButton)
    }
  } else if (platform === 'perplexity') {
    // Perplexity bottom bar: [+] [Model ▾] [Computer] [mic] [send]
    // Insert left of the "Model" text (same DOM-walking pattern as Claude/Gemini)
    button.classList.add('promptpilot-trigger-btn--perplexity')
    const input = adapter.getInputElement()
    const composer = input?.closest('form, [class*="input"], [class*="composer"]')
      ?? input?.parentElement?.parentElement?.parentElement

    // Search for the model selector — Perplexity shows the active model name (e.g. "Claude Sonnet 4.6")
    // rather than a static "Model" label
    const searchRoot = composer ?? document.body
    const allEls = Array.from(searchRoot.querySelectorAll('*'))
    const modelEl = allEls.find((el) => {
      const text = (el as HTMLElement).textContent?.trim() ?? ''
      // Match model name leaf nodes: Claude variants, GPT variants, Sonar, etc.
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
      // Walk up to the clickable button/link
      const modelButton = (modelEl.closest('button, [role="button"]') as HTMLElement)
        ?? (modelEl.parentElement as HTMLElement)
      // Walk up to find the flex row that also contains the send button
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
