declare global {
  interface Window {
    __promptgodPerplexityBridgeInstalled?: boolean
  }
}

type LexicalEditorLike = {
  parseEditorState: (state: string) => unknown
  setEditorState: (state: unknown) => void
}

type PromptGodPerplexitySetTextDetail = {
  requestId: string
  text: string
}

const SET_TEXT_EVENT = 'promptgod:perplexity:set-text'
const WRITE_RESULT_ATTR = 'data-promptgod-write-result'
const WRITE_REQUEST_ATTR = 'data-promptgod-write-request'

if (!window.__promptgodPerplexityBridgeInstalled) {
  window.__promptgodPerplexityBridgeInstalled = true

  document.addEventListener(SET_TEXT_EVENT, (event) => {
    const customEvent = event as CustomEvent<string>
    const detail = parseSetTextDetail(customEvent.detail)
    if (!detail || typeof detail.requestId !== 'string' || typeof detail.text !== 'string') {
      return
    }

    const target = event.target instanceof HTMLElement ? event.target : null
    const editorElement = findPerplexityEditor(target)
    if (!editorElement) {
      markWriteResult(target, detail.requestId, 'missing-editor')
      return
    }

    const editor = getLexicalEditor(editorElement)
    if (!editor) {
      markWriteResult(editorElement, detail.requestId, 'missing-lexical-editor')
      return
    }

    try {
      const editorState = editor.parseEditorState(JSON.stringify(buildPlainTextEditorState(detail.text)))
      editor.setEditorState(editorState)
      editorElement.focus()
      editorElement.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      markWriteResult(editorElement, detail.requestId, 'ok')
    } catch {
      markWriteResult(editorElement, detail.requestId, 'write-failed')
    }
  }, true)
}

function parseSetTextDetail(value: unknown): PromptGodPerplexitySetTextDetail | null {
  if (typeof value !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(value) as Partial<PromptGodPerplexitySetTextDetail>
    if (typeof parsed.requestId === 'string' && typeof parsed.text === 'string') {
      return {
        requestId: parsed.requestId,
        text: parsed.text,
      }
    }
  } catch {
    // Ignore malformed bridge events from the page or other extensions.
  }

  return null
}

function findPerplexityEditor(target: HTMLElement | null): HTMLElement | null {
  const fromTarget = target?.closest<HTMLElement>('[data-lexical-editor][role="textbox"]')
  if (fromTarget) {
    return fromTarget
  }

  return document.querySelector<HTMLElement>('[data-lexical-editor][role="textbox"]')
}

function getLexicalEditor(element: HTMLElement): LexicalEditorLike | null {
  const editor = (element as unknown as { __lexicalEditor?: Partial<LexicalEditorLike> }).__lexicalEditor
  if (
    editor &&
    typeof editor.parseEditorState === 'function' &&
    typeof editor.setEditorState === 'function'
  ) {
    return editor as LexicalEditorLike
  }

  return null
}

function buildPlainTextEditorState(text: string): unknown {
  const lines = text.split('\n')
  const children = lines.map((line) => ({
    children: line.length > 0
      ? [{
        detail: 0,
        format: 0,
        mode: 'normal',
        style: '',
        text: line,
        type: 'text',
        version: 1,
      }]
      : [],
    direction: null,
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
    type: 'paragraph',
    version: 1,
  }))

  return {
    root: {
      children,
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }
}

function markWriteResult(element: HTMLElement | null, requestId: string, result: string): void {
  const target = element ?? document.documentElement
  target.setAttribute(WRITE_REQUEST_ATTR, requestId)
  target.setAttribute(WRITE_RESULT_ATTR, result)
}

export {}
