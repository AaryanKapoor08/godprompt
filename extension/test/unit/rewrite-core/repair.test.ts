import { describe, expect, it } from 'vitest'
import { repairRewrite } from '../../../src/lib/rewrite-core/repair'

describe('rewrite-core repair', () => {
  it('applies deterministic cosmetic and structural repairs', () => {
    const input = {
      sourceText: 'rewrite this prompt and never use placeholders',
      output: `Here is the rewritten prompt: Analyze the notes and draft a team update.

Analyze the notes and draft a team update.
[DIFF: cleaned wording]`,
    }

    expect(repairRewrite(input)).toEqual(repairRewrite(input))
    expect(repairRewrite(input)).toMatchObject({
      output: 'Analyze the notes and draft a team update. Do not use placeholders.',
      changed: true,
      usedFallback: false,
    })
  })

  it('removes source echo blocks', () => {
    expect(repairRewrite({
      sourceText: 'fix this project update',
      output: 'Rewrite the project update clearly.\n\nOriginal text: fix this project update',
    }).output).toBe('Rewrite the project update clearly.')
  })

  it('uses fallback when repair diverges past threshold', () => {
    const result = repairRewrite({
      sourceText: 'Analyze complaints and draft an internal update.',
      output: 'My goal is to explain everything.\n\nUse the complaint logs to identify likely issues, separate facts from guesses, rank risks, draft an internal update, define owners, and include follow-up checks.',
      divergenceThreshold: 0.1,
    })

    expect(result.usedFallback).toBe(true)
    expect(result.output).toBe('Analyze complaints and draft an internal update.')
  })
})

