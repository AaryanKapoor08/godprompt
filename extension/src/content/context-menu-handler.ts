type ContextEnhanceBootstrapRequest =
  | {
    requestId: string
    status: 'ready'
    selectedText: string
    requestedAt: number
  }
  | {
    requestId: string
    status: 'error'
    code: 'SELECTION_TOO_SHORT' | 'SELECTION_TOO_LONG'
    message: string
    requestedAt: number
  }

type PromptGodContextMessage =
  | { type: 'START' }
  | { type: 'RESULT'; requestId?: string; text: string }
  | { type: 'DONE' }
  | { type: 'ERROR'; message: string; code?: string }
  | { type: 'SETTLEMENT'; status: 'DONE' | 'ERROR'; message?: string }

type PromptGodContextGlobals = typeof globalThis & {
  __promptgodContextEnhanceRequest?: ContextEnhanceBootstrapRequest
  __promptgodContextOverlayCleanup?: () => void
}

export function runPromptGodContextMenuHandler(request: ContextEnhanceBootstrapRequest): void {
  const globals = globalThis as PromptGodContextGlobals
  globals.__promptgodContextOverlayCleanup?.()

  const requestId = request.requestId
  const requestedAt = request.requestedAt
  const initialErrorMessage = request.status === 'error' ? request.message : null
  let selectedTextForRequest = request.status === 'ready' ? request.selectedText : ''

  globals.__promptgodContextEnhanceRequest = initialErrorMessage
    ? request
    : {
      requestId,
      requestedAt,
      status: 'ready',
      selectedText: '',
    }

  const existingOverlay = document.querySelector('.promptgod-context-overlay')
  existingOverlay?.remove()

  let port: chrome.runtime.Port | null = null
  let timeoutId: number | null = null
  let copyResetTimeoutId: number | null = null
  let cleanedUp = false
  let settled = false
  let hasResult = false
  let enhancedText = ''

  const overlay = document.createElement('div')
  overlay.className = 'promptgod-context-overlay'
  const shadow = overlay.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = `
    :host {
      all: initial;
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #0f172a;
      letter-spacing: 0;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      letter-spacing: 0;
    }

    .promptgod-context-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.08);
    }

    .promptgod-context-shell {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 16px;
      pointer-events: none;
    }

    .promptgod-context-panel {
      width: min(620px, calc(100vw - 32px));
      max-height: min(70vh, calc(100vh - 32px));
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      overflow: hidden;
      pointer-events: auto;
      background: #ffffff;
      color: #0f172a;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
      animation: promptgod-context-enter 180ms ease-out both;
      outline: none;
    }

    .promptgod-context-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      border-bottom: 1px solid #e2e8f0;
      background: #ffffff;
    }

    .promptgod-context-mark {
      width: 28px;
      height: 28px;
      display: inline-grid;
      place-items: center;
      flex: 0 0 auto;
      border-radius: 7px;
      background: #6366f1;
      color: #ffffff;
      font: 700 12px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .promptgod-context-title-wrap {
      min-width: 0;
      display: grid;
      gap: 2px;
    }

    .promptgod-context-title {
      margin: 0;
      color: #0f172a;
      font: 700 14px/1.25 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow-wrap: anywhere;
    }

    .promptgod-context-status {
      margin: 0;
      color: #64748b;
      font: 500 12px/1.25 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow-wrap: anywhere;
    }

    .promptgod-context-body {
      min-height: 150px;
      overflow: hidden;
      background: #f8fafc;
    }

    .promptgod-context-state {
      min-height: 150px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 18px 16px;
      color: #64748b;
      font: 500 14px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow-wrap: anywhere;
    }

    .promptgod-context-result {
      display: none;
      max-height: calc(70vh - 132px);
      min-height: 150px;
      margin: 0;
      padding: 16px;
      overflow: auto;
      color: #0f172a;
      background: #f8fafc;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font: 500 14px/1.55 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      user-select: text;
    }

    .promptgod-context-spinner {
      width: 18px;
      height: 18px;
      flex: 0 0 auto;
      border: 2px solid #e2e8f0;
      border-top-color: #6366f1;
      border-radius: 999px;
      animation: promptgod-context-spin 800ms linear infinite;
    }

    .promptgod-context-footer {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid #e2e8f0;
      background: #ffffff;
    }

    .promptgod-context-button {
      appearance: none;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #ffffff;
      color: #0f172a;
      cursor: pointer;
      font: 700 13px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      min-height: 34px;
      padding: 9px 13px;
    }

    .promptgod-context-button:hover {
      background: #f8fafc;
    }

    .promptgod-context-button:focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 2px;
    }

    .promptgod-context-button-primary {
      border-color: #6366f1;
      background: #6366f1;
      color: #ffffff;
    }

    .promptgod-context-button-primary:hover {
      border-color: #4f46e5;
      background: #4f46e5;
    }

    .promptgod-context-button-copied,
    .promptgod-context-button-copied:hover {
      border-color: #16a34a;
      background: #16a34a;
      color: #ffffff;
    }

    @keyframes promptgod-context-enter {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes promptgod-context-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-color-scheme: dark) {
      :host {
        color: #fafaf9;
      }

      .promptgod-context-backdrop {
        background: rgba(0, 0, 0, 0.45);
      }

      .promptgod-context-panel,
      .promptgod-context-header,
      .promptgod-context-footer {
        background: #0c0a09;
        color: #fafaf9;
        border-color: #292524;
      }

      .promptgod-context-body,
      .promptgod-context-result {
        background: #1c1917;
        color: #fafaf9;
      }

      .promptgod-context-title {
        color: #fafaf9;
      }

      .promptgod-context-status,
      .promptgod-context-state {
        color: #a8a29e;
      }

      .promptgod-context-spinner {
        border-color: #292524;
        border-top-color: #818cf8;
      }

      .promptgod-context-mark {
        background: #818cf8;
        color: #0c0a09;
      }

      .promptgod-context-button {
        border-color: #292524;
        background: #1c1917;
        color: #fafaf9;
      }

      .promptgod-context-button:hover {
        background: #292524;
      }

      .promptgod-context-button-primary {
        border-color: #818cf8;
        background: #818cf8;
        color: #0c0a09;
      }

      .promptgod-context-button-primary:hover {
        border-color: #6366f1;
        background: #6366f1;
        color: #ffffff;
      }

      .promptgod-context-button-copied,
      .promptgod-context-button-copied:hover {
        border-color: #22c55e;
        background: #22c55e;
        color: #0c0a09;
      }
    }
  `

  const backdrop = document.createElement('div')
  backdrop.className = 'promptgod-context-backdrop'

  const shell = document.createElement('div')
  shell.className = 'promptgod-context-shell'

  const panel = document.createElement('section')
  panel.className = 'promptgod-context-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-labelledby', 'promptgod-context-title')
  panel.tabIndex = -1

  const header = document.createElement('header')
  header.className = 'promptgod-context-header'

  const mark = document.createElement('div')
  mark.className = 'promptgod-context-mark'
  mark.textContent = 'PG'
  mark.setAttribute('aria-hidden', 'true')

  const titleWrap = document.createElement('div')
  titleWrap.className = 'promptgod-context-title-wrap'

  const title = document.createElement('h2')
  title.id = 'promptgod-context-title'
  title.className = 'promptgod-context-title'
  title.textContent = 'PromptGod'

  const status = document.createElement('p')
  status.className = 'promptgod-context-status'

  titleWrap.append(title, status)
  header.append(mark, titleWrap)

  const body = document.createElement('div')
  body.className = 'promptgod-context-body'

  const state = document.createElement('div')
  state.className = 'promptgod-context-state'

  const spinner = document.createElement('span')
  spinner.className = 'promptgod-context-spinner'
  spinner.setAttribute('aria-hidden', 'true')

  const stateText = document.createElement('span')

  const result = document.createElement('pre')
  result.className = 'promptgod-context-result'

  state.append(spinner, stateText)
  body.append(state, result)

  const footer = document.createElement('footer')
  footer.className = 'promptgod-context-footer'

  const copyButton = document.createElement('button')
  copyButton.type = 'button'
  copyButton.className = 'promptgod-context-button promptgod-context-button-primary'
  copyButton.textContent = 'Copy'

  const dismissButton = document.createElement('button')
  dismissButton.type = 'button'
  dismissButton.className = 'promptgod-context-button'
  dismissButton.textContent = 'Dismiss'

  footer.append(copyButton, dismissButton)
  panel.append(header, body, footer)
  shell.append(panel)
  shadow.append(style, backdrop, shell)

  document.documentElement.append(overlay)

  function renderLoading(message = 'Running text branch...'): void {
    status.textContent = 'Running text branch'
    state.style.display = 'flex'
    spinner.style.display = 'inline-block'
    stateText.textContent = message
    result.style.display = 'none'
    result.textContent = ''
    copyButton.style.display = 'none'
  }

  function renderError(message: string): void {
    status.textContent = 'Could not enhance'
    state.style.display = 'flex'
    spinner.style.display = 'none'
    stateText.textContent = message
    result.style.display = 'none'
    result.textContent = ''
    copyButton.style.display = 'none'
  }

  function renderSuccess(text: string): void {
    status.textContent = 'Text branch result'
    state.style.display = 'none'
    spinner.style.display = 'none'
    stateText.textContent = ''
    result.style.display = 'block'
    result.textContent = text
    copyButton.style.display = ''
  }

  function settlePort(): void {
    settled = true
    clearGlobalRequest()
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
      timeoutId = null
    }

    const activePort = port
    port = null
    try {
      activePort?.disconnect()
    } catch {
      // no-op
    }
  }

  function clearGlobalRequest(): void {
    if (globals.__promptgodContextEnhanceRequest?.requestId === requestId) {
      delete globals.__promptgodContextEnhanceRequest
    }
  }

  function cleanup(): void {
    if (cleanedUp) return
    cleanedUp = true
    settlePort()
    if (copyResetTimeoutId !== null) {
      window.clearTimeout(copyResetTimeoutId)
      copyResetTimeoutId = null
    }
    window.removeEventListener('keydown', onKeyDown, true)
    overlay.remove()
    clearGlobalRequest()

    if (globals.__promptgodContextOverlayCleanup === cleanup) {
      delete globals.__promptgodContextOverlayCleanup
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      cleanup()
    }
  }

  async function copyText(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch {
      // Fall back to execCommand below.
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '0'
    document.body.append(textarea)
    textarea.focus()
    textarea.select()

    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      textarea.remove()
    }
  }

  function startRequest(): void {
    if (initialErrorMessage) {
      renderError(initialErrorMessage)
      clearGlobalRequest()
      return
    }

    renderLoading()

    timeoutId = window.setTimeout(() => {
      if (hasResult || settled) return
      renderError('Could not enhance this selection. Try again.')
      settlePort()
    }, 90000)

    try {
      port = chrome.runtime.connect({ name: 'context-enhance' })
    } catch {
      renderError('Could not reach PromptGod. Refresh the page and try again.')
      settlePort()
      return
    }

    port.onMessage.addListener((message: PromptGodContextMessage) => {
      if (message.type === 'START') {
        renderLoading()
        return
      }

      if (message.type === 'RESULT') {
        if (message.requestId && message.requestId !== requestId) {
          return
        }
        hasResult = true
        enhancedText = message.text
        renderSuccess(enhancedText)
        settlePort()
        return
      }

      if (message.type === 'ERROR') {
        if (!hasResult) {
          renderError(message.message || 'Could not enhance this selection. Try again.')
        }
        settlePort()
        return
      }

      if (message.type === 'SETTLEMENT') {
        if (message.status === 'ERROR' && !hasResult) {
          renderError(message.message || 'Could not enhance this selection. Try again.')
          settlePort()
          return
        }

        if (message.status === 'DONE' && !hasResult) {
          renderError('Could not enhance this selection. Try again.')
          settlePort()
        }
      }
    })

    port.onDisconnect.addListener(() => {
      if (!settled && !hasResult) {
        renderError('Connection to PromptGod was lost. Try again.')
      }
      settlePort()
    })

    try {
      const selectedText = selectedTextForRequest
      selectedTextForRequest = ''
      clearGlobalRequest()
      port.postMessage({
        type: 'CONTEXT_ENHANCE',
        requestId,
        selectedText,
      })
    } catch {
      renderError('Could not start enhancement. Try again.')
      settlePort()
    }
  }

  copyButton.addEventListener('click', () => {
    if (!enhancedText) return

    void copyText(enhancedText).then((copied) => {
      if (!copied) {
        status.textContent = 'Copy failed'
        copyButton.textContent = 'Copy'
        copyButton.classList.remove('promptgod-context-button-copied')
        return
      }

      copyButton.textContent = 'Copied'
      copyButton.classList.add('promptgod-context-button-copied')
      if (copyResetTimeoutId !== null) {
        window.clearTimeout(copyResetTimeoutId)
      }
      copyResetTimeoutId = window.setTimeout(() => {
        copyButton.textContent = 'Copy'
        copyButton.classList.remove('promptgod-context-button-copied')
        copyResetTimeoutId = null
      }, 1500)
    })
  })

  dismissButton.addEventListener('click', cleanup)
  backdrop.addEventListener('click', cleanup)
  window.addEventListener('keydown', onKeyDown, true)
  globals.__promptgodContextOverlayCleanup = cleanup

  renderLoading()
  startRequest()
  window.setTimeout(() => panel.focus(), 0)
}
