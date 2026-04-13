import { afterEach, describe, expect, it, vi } from 'vitest'
import { insertTextViaInputEvent, replaceText } from '../../src/content/dom-utils'

class FakeEvent {
  readonly type: string

  constructor(type: string) {
    this.type = type
  }
}

class FakeInputEvent extends FakeEvent {
  readonly data: string | null
  readonly inputType: string

  constructor(type: string, init?: InputEventInit) {
    super(type)
    this.data = init?.data ?? null
    this.inputType = init?.inputType ?? ''
  }
}

function installDomGlobals(options: { execCommand?: () => boolean } = {}) {
  const selection = {
    rangeCount: 0,
    removeAllRanges: vi.fn(),
    addRange: vi.fn(),
  }

  vi.stubGlobal('Event', FakeEvent)
  vi.stubGlobal('InputEvent', FakeInputEvent)
  vi.stubGlobal('window', {
    getSelection: vi.fn(() => selection),
  })
  vi.stubGlobal('document', {
    createRange: vi.fn(() => ({
      selectNodeContents: vi.fn(),
    })),
    execCommand: vi.fn(options.execCommand ?? (() => false)),
  })
}

function makeEditable(initialText = '') {
  const element = {
    textContent: initialText,
    focus: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    contains: vi.fn(() => false),
    replaceChildren: vi.fn(function replaceChildren(this: { textContent: string }) {
      this.textContent = ''
    }),
  }

  return element as unknown as HTMLElement & {
    dispatchEvent: ReturnType<typeof vi.fn>
    replaceChildren: ReturnType<typeof vi.fn>
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('dom-utils text insertion fallback', () => {
  it('mutates the editable text when synthetic input events are ignored', () => {
    installDomGlobals()
    const element = makeEditable()

    expect(insertTextViaInputEvent(element, 'Enhanced prompt')).toBe(true)

    expect(element.textContent).toBe('Enhanced prompt')
    expect(element.dispatchEvent).toHaveBeenCalled()
  })

  it('does not append duplicate text when an editor handles the input event itself', () => {
    installDomGlobals()
    const element = makeEditable()
    element.dispatchEvent.mockImplementation((event: Event) => {
      if (event.type === 'input') {
        element.textContent = 'Handled by editor'
      }
      return true
    })

    expect(insertTextViaInputEvent(element, 'Handled by editor')).toBe(true)

    expect(element.textContent).toBe('Handled by editor')
  })

  it('replaces stale content when execCommand delete and insert both fail', () => {
    installDomGlobals({ execCommand: () => false })
    const element = makeEditable('old prompt')

    expect(replaceText(element, 'new prompt')).toBe(true)

    expect(element.textContent).toBe('new prompt')
    expect(element.replaceChildren).toHaveBeenCalled()
  })
})
