import { describe, it, expect } from 'vitest'
import { shouldSkipEnhancement } from '../../src/lib/smart-skip'

describe('shouldSkipEnhancement', () => {
  it('returns true for empty string', () => {
    expect(shouldSkipEnhancement('')).toBe(true)
  })

  it('returns true for whitespace only', () => {
    expect(shouldSkipEnhancement('   ')).toBe(true)
  })

  it('returns true for single word', () => {
    expect(shouldSkipEnhancement('hi')).toBe(true)
  })

  it('returns true for two words', () => {
    expect(shouldSkipEnhancement('hello world')).toBe(true)
  })

  it('returns false for three words', () => {
    expect(shouldSkipEnhancement('help me code')).toBe(false)
  })

  it('returns false for a full sentence', () => {
    expect(shouldSkipEnhancement('write a python script to parse JSON')).toBe(false)
  })

  it('trims leading and trailing whitespace', () => {
    expect(shouldSkipEnhancement('  hi  ')).toBe(true)
  })

  it('handles tabs and newlines in whitespace', () => {
    expect(shouldSkipEnhancement('\t\n')).toBe(true)
  })

  it('returns true for "thanks"', () => {
    expect(shouldSkipEnhancement('thanks')).toBe(true)
  })
})
