import { describe, expect, it } from 'vitest'
import { buildConservativeFallback } from '../../../src/lib/rewrite-core/fallback'
import { validateRewrite } from '../../../src/lib/rewrite-core/validate'

describe('rewrite-core fallback', () => {
  it('builds a conservative fallback from source text', () => {
    const output = buildConservativeFallback({
      sourceText: '  Analyze complaints and draft an update. [DIFF: source junk] ',
    })

    expect(output).toBe('Analyze complaints and draft an update.')
    expect(validateRewrite({
      branch: 'LLM',
      sourceText: 'Analyze complaints and draft an update.',
      output,
    }).ok).toBe(true)
  })

  it('returns a safe generic fallback when the source is empty', () => {
    expect(buildConservativeFallback({ sourceText: '' })).toBe('Rewrite the source text clearly while preserving its original intent.')
  })
})

