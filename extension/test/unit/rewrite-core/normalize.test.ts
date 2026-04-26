import { describe, expect, it } from 'vitest'
import { detectSourceMode, normalizeSourceText } from '../../../src/lib/rewrite-core/normalize'

describe('rewrite-core normalize', () => {
  it('normalizes whitespace, quotes, line endings, and invisible characters', () => {
    expect(normalizeSourceText('  “hello”\r\nthere\u200b  \n\n\nnext\u00a0line  ')).toEqual({
      text: '"hello"\nthere\n\nnext line',
      sourceMode: 'message',
    })
  })

  it('detects likely source modes', () => {
    expect(detectSourceMode('hey maya quick update the migration is done thanks')).toBe('message')
    expect(detectSourceMode('analyze these complaints and draft an internal update')).toBe('prompt')
    expect(detectSourceMode('- sort facts\n- identify risks\n- draft update')).toBe('mixed task list')
    expect(detectSourceMode('refund notes from april')).toBe('note')
  })
})
