import { describe, expect, it } from 'vitest'
import { admitRecentContext, shouldAdmitRecentContext } from '../../../src/lib/rewrite-core/context-admission'

describe('rewrite-core context admission', () => {
  it('omits recent context for standalone prompts', () => {
    const source =
      'Use API logs and support tickets for a hard launch incident triage. Separate facts from guesses and draft a team update.'
    const recentContext =
      'Previous prompt: assess a MongoDB migration with schemas, collection names, rollback plan, and pre-production checklist.'

    expect(shouldAdmitRecentContext(source)).toBe(false)
    expect(admitRecentContext({ sourceText: source, recentContext })).toBeUndefined()
  })

  it('admits bounded recent context when the source explicitly references prior context', () => {
    const source = 'Use the previous message as context and turn this into a concise follow-up prompt.'
    const recentContext = 'A'.repeat(2100)

    const admitted = admitRecentContext({ sourceText: source, recentContext, maxChars: 100 })

    expect(admitted).toHaveLength(100)
    expect(shouldAdmitRecentContext(source)).toBe(true)
  })
})
