import { describe, expect, it } from 'vitest'
import { OPENROUTER_CURATED_FREE_MODELS } from '../../src/lib/rewrite-openrouter/curation'
import {
  VISIBLE_PROVIDER_CHAIN,
  formatOpenRouterAccountStatus,
  getModelOptions,
  getOpenRouterFreeChainOptions,
  validateCustomOpenRouterModelId,
} from '../../src/popup/model-options'

describe('popup model options', () => {
  it('renders the visible provider chain in runtime fallback order', () => {
    expect(VISIBLE_PROVIDER_CHAIN.map((item) => item.label)).toEqual([
      'Gemini 2.5 Flash',
      'Gemma',
      'OpenRouter Free Chain',
    ])
  })

  it('renders the OpenRouter free chain in curation order', () => {
    expect(getOpenRouterFreeChainOptions().map((model) => model.value)).toEqual(
      OPENROUTER_CURATED_FREE_MODELS.map((model) => model.id)
    )
  })

  it('keeps the popup OpenRouter options aligned with the live-aware runtime projection', () => {
    const options = getModelOptions('openrouter', [
      'nvidia/nemotron-3-super-120b-a12b:free',
      'openai/gpt-oss-20b:free',
      'openrouter/free',
    ])

    expect(options.map((model) => model.value)).toEqual([
      'nvidia/nemotron-3-super-120b-a12b:free',
      'openai/gpt-oss-20b:free',
      'openai/gpt-4o-mini',
    ])
    expect(options.map((model) => model.value)).not.toContain('openrouter/free')
  })

  it('keeps custom OpenRouter model validation permissive but format-aware', () => {
    expect(validateCustomOpenRouterModelId('').valid).toBe(true)
    expect(validateCustomOpenRouterModelId('bad-model')).toEqual({
      valid: false,
      message: 'Custom model IDs must look like org/model-name.',
    })
    expect(validateCustomOpenRouterModelId('custom/model')).toEqual({
      valid: true,
      message: 'Custom model will be saved for OpenRouter.',
    })
  })

  it('formats OpenRouter account status and cap pause states for the popup', () => {
    expect(formatOpenRouterAccountStatus(undefined)).toEqual({
      message: '',
      className: 'status',
    })
    expect(formatOpenRouterAccountStatus({
      bucket: '50/day',
      limit: 50,
      usage: 50,
      remaining: 0,
      paused: true,
      checkedAt: 1,
    })).toEqual({
      message: 'OpenRouter 50/day cap reached. Routing is paused today.',
      className: 'status status--warning',
    })
    expect(formatOpenRouterAccountStatus({
      bucket: '1000/day',
      limit: 1000,
      usage: 4,
      remaining: 996,
      paused: false,
      checkedAt: 1,
    })).toEqual({
      message: 'OpenRouter bucket: 1000/day, 996 remaining.',
      className: 'status',
    })
  })
})
