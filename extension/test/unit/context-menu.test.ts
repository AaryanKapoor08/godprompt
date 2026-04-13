import { describe, expect, it } from 'vitest'
import {
  CONTEXT_SELECTION_MAX_CHARS,
  buildContextInjectionTarget,
  createContextEnhanceRequest,
  validateContextSelection,
} from '../../src/service-worker'
import { cleanContextEnhancementOutput } from '../../src/lib/context-enhance-prompt'

describe('context menu selected-text guards', () => {
  it('rejects missing, empty, and too-short selections', () => {
    expect(validateContextSelection(undefined)).toEqual({
      ok: false,
      code: 'SELECTION_TOO_SHORT',
      message: 'Select a little more text to enhance.',
    })
    expect(validateContextSelection('  fix resume  ')).toEqual({
      ok: false,
      code: 'SELECTION_TOO_SHORT',
      message: 'Select a little more text to enhance.',
    })
  })

  it('rejects selections above the max length without keeping selected text', () => {
    const result = validateContextSelection('x'.repeat(CONTEXT_SELECTION_MAX_CHARS + 1))

    expect(result).toEqual({
      ok: false,
      code: 'SELECTION_TOO_LONG',
      message: 'Selection is too long. Try a shorter passage.',
    })
    expect(result).not.toHaveProperty('selectedText')
  })

  it('trims valid selected text before handoff', () => {
    expect(validateContextSelection('  improve my resume bullets  ')).toEqual({
      ok: true,
      selectedText: 'improve my resume bullets',
    })
  })
})

describe('context menu request handoff', () => {
  it('creates ready requests for valid selected text', () => {
    const request = createContextEnhanceRequest(
      { ok: true, selectedText: 'improve my resume bullets' },
      'request-1',
      123
    )

    expect(request).toEqual({
      requestId: 'request-1',
      status: 'ready',
      selectedText: 'improve my resume bullets',
      requestedAt: 123,
    })
  })

  it('creates error requests without selected text', () => {
    const request = createContextEnhanceRequest(
      {
        ok: false,
        code: 'SELECTION_TOO_SHORT',
        message: 'Select a little more text to enhance.',
      },
      'request-2',
      456
    )

    expect(request).toEqual({
      requestId: 'request-2',
      status: 'error',
      code: 'SELECTION_TOO_SHORT',
      message: 'Select a little more text to enhance.',
      requestedAt: 456,
    })
    expect(request).not.toHaveProperty('selectedText')
  })

  it('targets the selected frame when Chrome provides a frame id', () => {
    expect(buildContextInjectionTarget(10, 3)).toEqual({
      tabId: 10,
      frameIds: [3],
    })
  })

  it('targets the tab when no frame id is available', () => {
    expect(buildContextInjectionTarget(10)).toEqual({ tabId: 10 })
  })
})

describe('context enhancement output cleanup', () => {
  it('strips diff tags and normalizes whitespace before returning a result', () => {
    const result = cleanContextEnhancementOutput(
      'Improve my resume bullets .\n[DIFF: clearer objective]',
      'improve resume'
    )

    expect(result).toBe('Improve my resume bullets.')
  })

  it('removes no-change markers from otherwise usable output', () => {
    const result = cleanContextEnhancementOutput(
      '[NO_CHANGE] Review this code for bugs.\n[DIFF: no changes needed]',
      'Review this code for bugs.'
    )

    expect(result).toBe('Review this code for bugs.')
  })

  it('falls back to the original selection when no-change output has no body', () => {
    const result = cleanContextEnhancementOutput('[NO_CHANGE]\n[DIFF: no changes needed]', '  keep this prompt  ')

    expect(result).toBe('Keep this prompt')
  })

  it('removes model-generated original text dumps from selected-text results', () => {
    const result = cleanContextEnhancementOutput(
      `Rewrite the project update into a more professional communication.

Original text:
"Hi everyone, the project is moving forward. fix this project plan and make it sound more professional"`,
      'Hi everyone, the project is moving forward. fix this project plan and make it sound more professional'
    )

    expect(result).toBe('Rewrite the project update into a more professional communication.')
  })

  it('replaces template-placeholder outputs with a placeholder-free conservative rewrite', () => {
    const result = cleanContextEnhancementOutput(
      'Write a polite status-check email to [recipient] about [project] by [date].',
      'hello there, i wanted to status check thanks alot, checked'
    )

    expect(result).toBe('Hello there, I wanted to check in on the status. Thanks a lot, checked')
    expect(result).not.toContain('[recipient]')
    expect(result).not.toContain('[project]')
    expect(result).not.toContain('[date]')
    expect(result).not.toMatch(/\?/)
  })

  it('treats brace and angle placeholders as invalid context output', () => {
    const braceResult = cleanContextEnhancementOutput(
      'Draft a follow-up using {{details}} and {context}.',
      'follow up with them'
    )
    const angleResult = cleanContextEnhancementOutput(
      'Draft a follow-up for <recipient> about <topic>.',
      'follow up with them'
    )

    expect(braceResult).toBe('Follow up with them')
    expect(braceResult).not.toContain('{{details}}')
    expect(braceResult).not.toContain('{context}')
    expect(angleResult).toBe('Follow up with them')
    expect(angleResult).not.toContain('<recipient>')
    expect(angleResult).not.toContain('<topic>')
  })

  it('replaces clarifying-question outputs with a no-question conservative rewrite', () => {
    const result = cleanContextEnhancementOutput(
      'Who is the recipient, and what project should I mention?',
      'hello there, i wanted to status check'
    )

    expect(result).toBe('Hello there, I wanted to check in on the status')
    expect(result).not.toMatch(/\?/)
  })
})
