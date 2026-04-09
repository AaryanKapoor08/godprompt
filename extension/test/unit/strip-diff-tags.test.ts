import { describe, it, expect } from 'vitest'
import { stripDiffTags } from '../../src/lib/text-utils'

describe('stripDiffTags', () => {
  it('removes single tag and extracts label', () => {
    const input = 'Hello [DIFF: improved clarity] world'
    const result = stripDiffTags(input)
    expect(result.cleanText).toBe('Hello  world')
    expect(result.diffLabel).toBe('improved clarity')
  })

  it('removes multiple tags and extracts the last one as label', () => {
    const input = '[DIFF: tag1] Hello [DIFF: tag2] world [DIFF: tag3]'
    const result = stripDiffTags(input)
    expect(result.cleanText).toBe(' Hello  world ')
    expect(result.diffLabel).toBe('tag3')
  })

  it('removes multi-line tags', () => {
    const input = 'Start [DIFF: line 1\nline 2] End'
    const result = stripDiffTags(input)
    expect(result.cleanText).toBe('Start  End')
    expect(result.diffLabel).toBe('line 1\nline 2')
  })

  it('returns original text if no tags are present', () => {
    const input = 'No tags here!'
    const result = stripDiffTags(input)
    expect(result.cleanText).toBe('No tags here!')
    expect(result.diffLabel).toBeNull()
  })

  it('handles empty string', () => {
    const result = stripDiffTags('')
    expect(result.cleanText).toBe('')
    expect(result.diffLabel).toBeNull()
  })
})
