import { describe, expect, it } from 'vitest'
import { shouldUseProgressiveComposerRender } from '../../src/content/ui/trigger-button'

describe('trigger button render policy', () => {
  it('uses final-only composer replacement for non-Gemma Google models', () => {
    expect(shouldUseProgressiveComposerRender('gemini', 'gemini-2.5-flash')).toBe(false)
    expect(shouldUseProgressiveComposerRender('gemini', 'gemini-2.5-flash-lite')).toBe(false)
  })

  it('uses final-only composer replacement for non-Gemma OpenRouter models', () => {
    expect(shouldUseProgressiveComposerRender('chatgpt', 'nvidia/nemotron-3-super-120b-a12b:free')).toBe(false)
    expect(shouldUseProgressiveComposerRender('chatgpt', 'nvidia/nemotron-3-nano-30b-a3b:free')).toBe(false)
    expect(shouldUseProgressiveComposerRender('claude', 'nvidia/nemotron-3-super-120b-a12b:free')).toBe(false)
  })

  it('uses final-only replacement for Gemma to avoid progressive append duplication', () => {
    expect(shouldUseProgressiveComposerRender('gemini', 'gemma-3-27b-it')).toBe(false)
    expect(shouldUseProgressiveComposerRender('chatgpt', 'models/gemma-3-27b-it')).toBe(false)
    expect(shouldUseProgressiveComposerRender('perplexity', 'gemma-3-27b-it')).toBe(false)
  })

  it('keeps Perplexity final-only because its adapter rejects incremental append', () => {
    expect(shouldUseProgressiveComposerRender('perplexity', 'gemini-2.5-flash')).toBe(false)
    expect(shouldUseProgressiveComposerRender('perplexity', 'nvidia/nemotron-3-super-120b-a12b:free')).toBe(false)
  })

  it('defaults to final-only replacement when the selected model is unknown', () => {
    expect(shouldUseProgressiveComposerRender('gemini', undefined)).toBe(false)
  })
})
