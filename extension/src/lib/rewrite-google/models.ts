export const GOOGLE_PRIMARY_MODEL = 'gemini-2.5-flash'
export const GOOGLE_FLASH_LITE_MODEL = 'gemini-2.5-flash-lite'

export const GOOGLE_NON_GEMMA_MODELS = [
  GOOGLE_PRIMARY_MODEL,
  GOOGLE_FLASH_LITE_MODEL,
] as const

export type GoogleNonGemmaModel = typeof GOOGLE_NON_GEMMA_MODELS[number]

export function normalizeGoogleModelName(model: string | undefined): string {
  const trimmed = model?.trim() ?? ''
  if (!trimmed) return GOOGLE_PRIMARY_MODEL
  return trimmed.startsWith('models/') ? trimmed.slice('models/'.length) : trimmed
}

export function isGoogleGemmaModel(model: string | undefined): boolean {
  return normalizeGoogleModelName(model).toLowerCase().startsWith('gemma-')
}

export function isSupportedGoogleNonGemmaModel(model: string | undefined): model is GoogleNonGemmaModel {
  const normalized = normalizeGoogleModelName(model)
  return GOOGLE_NON_GEMMA_MODELS.includes(normalized as GoogleNonGemmaModel)
}

export function resolveGoogleFirstPassModel(model: string | undefined): string {
  const normalized = normalizeGoogleModelName(model)
  return normalized || GOOGLE_PRIMARY_MODEL
}
