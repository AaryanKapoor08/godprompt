import { describe, expect, it } from 'vitest'
import { extractConstraints } from '../../../src/lib/rewrite-core/constraints'

function kindsFor(source: string): string[] {
  return extractConstraints(source).constraints.map((constraint) => constraint.kind)
}

describe('rewrite-core constraints', () => {
  it('extracts high-confidence hard constraints with source spans', () => {
    const result = extractConstraints(
      'Plain text only, no markdown, no bold labels. Ask 3 clarifying questions first. Do not solve yet. Keep tasks separate. Provide: checklist, memo, FAQ. Keep it under 150 words. Do not invent numbers or dates. First analyze the files, then wait for me. Never use placeholders.'
    )

    expect(result.constraints.map((constraint) => constraint.kind)).toEqual(expect.arrayContaining([
      'plain-text-only',
      'no-markdown',
      'no-bold',
      'ask-questions-first',
      'do-not-solve-yet',
      'keep-tasks-separate',
      'preserve-deliverables',
      'word-limit',
      'no-invention',
      'staged-workflow',
      'no-placeholders',
    ]))
    expect(result.constraints[0].span.text.length).toBeGreaterThan(0)
  })

  it('extracts count limits and no-question constraints', () => {
    expect(kindsFor('Never ask clarifying questions. Return exactly 3 bullets.')).toEqual(expect.arrayContaining([
      'no-questions',
      'count-limit',
    ]))
  })

  it('must-not-emit fuzzy constraints from weak wording', () => {
    expect(extractConstraints('make it clean and nice, maybe shorter if needed').constraints).toEqual([])
    expect(extractConstraints('questions might help but only if you think so').constraints).toEqual([])
    expect(extractConstraints('bold move by the team and markdown prices in the report').constraints).toEqual([])
  })
})

