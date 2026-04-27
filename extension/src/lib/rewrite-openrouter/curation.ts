export type OpenRouterCurationTier = 'stable free' | 'experimental free'

export type CuratedOpenRouterModel = {
  id: string
  label: string
  tier: OpenRouterCurationTier
}

export const OPENROUTER_CURATED_FREE_MODELS: CuratedOpenRouterModel[] = [
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super 120B', tier: 'stable free' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'Nemotron 3 Nano 30B', tier: 'experimental free' },
]

export const OPENROUTER_PRIMARY_FREE_MODEL = OPENROUTER_CURATED_FREE_MODELS[0].id
export const OPENROUTER_EXCLUDED_FREE_MODELS = new Set([
  'openrouter/free',
  'inclusionai/ling-2.6-flash:free',
  'inclusionai/ling-2.6-1t:free',
  'openai/gpt-oss-20b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
])

export function normalizeOpenRouterModelId(modelId: string | undefined): string {
  const trimmed = modelId?.trim() ?? ''
  if (trimmed === 'nvidia/nemotron-nano-30b-a3b:free') {
    return 'nvidia/nemotron-3-nano-30b-a3b:free'
  }
  return trimmed
}

export function isExcludedOpenRouterModel(modelId: string | undefined): boolean {
  const normalized = normalizeOpenRouterModelId(modelId).toLowerCase()
  return OPENROUTER_EXCLUDED_FREE_MODELS.has(normalized)
}

export function isCuratedOpenRouterModel(modelId: string | undefined): boolean {
  const normalized = normalizeOpenRouterModelId(modelId)
  return OPENROUTER_CURATED_FREE_MODELS.some((model) => model.id === normalized)
}

export function buildCuratedOpenRouterChain(
  requestedModel?: string,
  liveModelIds?: string[]
): string[] {
  const liveSet = Array.isArray(liveModelIds) && liveModelIds.length > 0
    ? new Set(liveModelIds.map((id) => normalizeOpenRouterModelId(id)))
    : null
  const candidates = [
    normalizeOpenRouterModelId(requestedModel),
    ...OPENROUTER_CURATED_FREE_MODELS.map((model) => model.id),
  ]
  const deduped: string[] = []

  for (const candidate of candidates) {
    if (!candidate || isExcludedOpenRouterModel(candidate)) continue
    if (candidate.endsWith(':free') && !isCuratedOpenRouterModel(candidate)) continue
    if (liveSet && candidate.endsWith(':free') && !liveSet.has(candidate)) continue
    if (!deduped.includes(candidate)) deduped.push(candidate)
  }

  if (deduped.length === 0) {
    return [OPENROUTER_PRIMARY_FREE_MODEL]
  }

  return deduped
}
