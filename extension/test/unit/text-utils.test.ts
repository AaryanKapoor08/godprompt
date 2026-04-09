import { describe, it, expect } from 'vitest'
import { normalizeText } from '../../src/lib/text-utils'

describe('TextNormalization', () => {
  it('should normalize multiple spaces to one', () => {
    expect(normalizeText('Hello    World')).toBe('Hello World')
  })

  it('should remove space before punctuation', () => {
    expect(normalizeText('Hello world .')).toBe('Hello world.')
    expect(normalizeText('Hello , world')).toBe('Hello, world')
  })

  it('should trim leading and trailing whitespace', () => {
    expect(normalizeText('  Hello World  ')).toBe('Hello World')
  })

  it('should handle mixed issues', () => {
    expect(normalizeText('  Hello   world  .  ')).toBe('Hello world.')
  })

  it('should preserve intentional line breaks', () => {
    expect(normalizeText('Line 1\n\nLine   2')).toBe('Line 1\n\nLine 2')
  })
})
