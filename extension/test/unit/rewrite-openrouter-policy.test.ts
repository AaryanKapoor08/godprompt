import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OPENROUTER_CURATED_FREE_MODELS,
  buildCuratedOpenRouterChain,
  isExcludedOpenRouterModel,
} from '../../src/lib/rewrite-openrouter/curation'
import {
  OPENROUTER_MODEL_COOLDOWN_MS,
  getOpenRouterCooldownRemainingMs,
  resetOpenRouterCooldowns,
  setOpenRouterModelCooldown,
  shouldTryNextOpenRouterModel,
} from '../../src/lib/rewrite-openrouter/route-policy'
import {
  OPENROUTER_CATALOG_CACHE_KEY,
  filterOpenRouterFreeTextModels,
  getOpenRouterCatalogWithPinnedFallback,
  refreshOpenRouterCatalog,
} from '../../src/lib/rewrite-openrouter/catalog'
import { getOpenRouterMaxTokens } from '../../src/lib/rewrite-openrouter/budget-policy'

describe('rewrite-openrouter policy modules', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    resetOpenRouterCooldowns()
  })

  it('keeps the curated free chain in product order', () => {
    expect(OPENROUTER_CURATED_FREE_MODELS.map((model) => model.id)).toEqual([
      'nvidia/nemotron-3-super-120b-a12b:free',
      'nvidia/nemotron-3-nano-30b-a3b:free',
    ])
  })

  it('never includes openrouter/free or excluded free models in the chain', () => {
    expect(isExcludedOpenRouterModel('openrouter/free')).toBe(true)
    expect(isExcludedOpenRouterModel('inclusionai/ling-2.6-flash:free')).toBe(true)
    expect(isExcludedOpenRouterModel('openai/gpt-oss-20b:free')).toBe(true)
    expect(isExcludedOpenRouterModel('meta-llama/llama-3.3-70b-instruct:free')).toBe(true)

    const chain = buildCuratedOpenRouterChain('openrouter/free')
    expect(chain).not.toContain('openrouter/free')
    expect(chain).not.toContain('inclusionai/ling-2.6-flash:free')
    expect(chain).not.toContain('openai/gpt-oss-20b:free')
    expect(chain).not.toContain('meta-llama/llama-3.3-70b-instruct:free')
  })

  it('demotes disappeared live models by filtering them from the runtime projection', () => {
    const chain = buildCuratedOpenRouterChain('nvidia/nemotron-3-super-120b-a12b:free', [
      'nvidia/nemotron-3-nano-30b-a3b:free',
    ])

    expect(chain).toEqual([
      'nvidia/nemotron-3-nano-30b-a3b:free',
    ])
  })

  it('tracks a five-minute per-model cooldown in memory', () => {
    resetOpenRouterCooldowns()
    setOpenRouterModelCooldown('openai/gpt-oss-20b:free')

    const remaining = getOpenRouterCooldownRemainingMs('openai/gpt-oss-20b:free')
    expect(remaining).toBeGreaterThan(0)
    expect(remaining).toBeLessThanOrEqual(OPENROUTER_MODEL_COOLDOWN_MS)
  })

  it('does not switch models after partial output begins', () => {
    expect(shouldTryNextOpenRouterModel(true, new Error('API returned 500'))).toBe(false)
    expect(shouldTryNextOpenRouterModel(false, new Error('API returned 500'))).toBe(true)
    expect(shouldTryNextOpenRouterModel(false, new Error('API returned 401'))).toBe(false)
  })

  it('filters the live catalog to text-capable free models', () => {
    expect(filterOpenRouterFreeTextModels([
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', architecture: { modality: 'text->text' } },
      { id: 'paid/model', architecture: { modality: 'text->text' } },
      { id: 'image/model:free', architecture: { input_modalities: ['image'] } },
    ])).toEqual(['nvidia/nemotron-3-super-120b-a12b:free'])
  })

  it('caches live catalog refreshes and uses pinned fallback when fetch fails', async () => {
    const set = vi.fn()
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set,
        },
      },
    })

    const fetchSuccess = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      data: [
        { id: 'nvidia/nemotron-3-super-120b-a12b:free', architecture: { modality: 'text->text' } },
      ],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSuccess)

    await expect(refreshOpenRouterCatalog(123)).resolves.toEqual(['nvidia/nemotron-3-super-120b-a12b:free'])
    expect(set).toHaveBeenCalledWith({
      [OPENROUTER_CATALOG_CACHE_KEY]: {
        models: ['nvidia/nemotron-3-super-120b-a12b:free'],
        timestamp: 123,
        catalogVersion: 1,
      },
    })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    await expect(getOpenRouterCatalogWithPinnedFallback()).resolves.toEqual(
      OPENROUTER_CURATED_FREE_MODELS.map((model) => model.id)
    )
    expect(fetchSuccess).toHaveBeenCalledTimes(1)
  })

  it('keeps free-model output caps conservative', () => {
    expect(getOpenRouterMaxTokens('nvidia/nemotron-3-super-120b-a12b:free', 20)).toBe(256)
    expect(getOpenRouterMaxTokens('nvidia/nemotron-3-super-120b-a12b:free', 80)).toBe(320)
    expect(getOpenRouterMaxTokens('nvidia/nemotron-3-super-120b-a12b:free', 180)).toBe(384)
    expect(getOpenRouterMaxTokens('openai/gpt-4o-mini', 180)).toBe(512)
  })
})
