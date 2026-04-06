import { describe, expect, it } from 'vitest'
import { mergeStreamChunk } from '../../src/lib/stream-merge'

describe('mergeStreamChunk', () => {
  it('appends regular delta chunks', () => {
    const merged = mergeStreamChunk('Hello', ' world')
    expect(merged).toBe('Hello world')
  })

  it('accepts cumulative snapshot chunks', () => {
    const merged = mergeStreamChunk('Hello', 'Hello world')
    expect(merged).toBe('Hello world')
  })

  it('ignores replayed prefix chunks', () => {
    const merged = mergeStreamChunk('Hello world', 'Hello')
    expect(merged).toBe('Hello world')
  })

  it('reconciles overlap without duplicating text', () => {
    const merged = mergeStreamChunk('managed database', 'database options')
    expect(merged).toBe('managed database options')
  })

  it('falls back to plain append when no overlap exists', () => {
    const merged = mergeStreamChunk('Alpha', 'Beta')
    expect(merged).toBe('AlphaBeta')
  })
})
