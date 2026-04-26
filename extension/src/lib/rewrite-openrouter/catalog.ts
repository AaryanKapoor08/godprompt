import { OPENROUTER_CURATED_FREE_MODELS } from './curation'

export const OPENROUTER_CATALOG_CACHE_KEY = 'openrouterModelCache'
export const OPENROUTER_CATALOG_TTL_MS = 24 * 60 * 60 * 1000

export type OpenRouterCatalogCache = {
  models: string[]
  timestamp: number
  catalogVersion: number
}

type OpenRouterModelRecord = {
  id?: string
  architecture?: {
    modality?: string
    input_modalities?: string[]
  }
}

const CATALOG_VERSION = 1

export function filterOpenRouterFreeTextModels(models: OpenRouterModelRecord[]): string[] {
  return models
    .filter((model) => {
      if (typeof model.id !== 'string' || !model.id.endsWith(':free')) return false
      const modality = model.architecture?.modality?.toLowerCase() ?? ''
      const inputs = model.architecture?.input_modalities?.map((input) => input.toLowerCase()) ?? []
      return modality.includes('text') || inputs.length === 0 || inputs.includes('text')
    })
    .map((model) => model.id!)
}

export async function fetchOpenRouterCatalog(fetchFn: typeof fetch = fetch): Promise<string[]> {
  const response = await fetchFn('https://openrouter.ai/api/v1/models')
  if (!response.ok) {
    throw new Error(`[OpenRouterCatalog] models request returned ${response.status}`)
  }

  const data = await response.json() as { data?: OpenRouterModelRecord[] }
  return filterOpenRouterFreeTextModels(data.data ?? [])
}

export async function getCachedOpenRouterCatalog(now: number = Date.now()): Promise<string[] | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null
  const stored = await chrome.storage.local.get([OPENROUTER_CATALOG_CACHE_KEY])
  const cache = stored[OPENROUTER_CATALOG_CACHE_KEY] as OpenRouterCatalogCache | undefined
  if (!cache || cache.catalogVersion !== CATALOG_VERSION) return null
  if (now - cache.timestamp > OPENROUTER_CATALOG_TTL_MS) return null
  return cache.models
}

export async function refreshOpenRouterCatalog(now: number = Date.now()): Promise<string[]> {
  const models = await fetchOpenRouterCatalog()
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({
      [OPENROUTER_CATALOG_CACHE_KEY]: {
        models,
        timestamp: now,
        catalogVersion: CATALOG_VERSION,
      } satisfies OpenRouterCatalogCache,
    })
  }
  return models
}

export async function getOpenRouterCatalogWithPinnedFallback(): Promise<string[]> {
  const cached = await getCachedOpenRouterCatalog()
  if (cached) return cached

  try {
    return await refreshOpenRouterCatalog()
  } catch {
    return OPENROUTER_CURATED_FREE_MODELS.map((model) => model.id)
  }
}
