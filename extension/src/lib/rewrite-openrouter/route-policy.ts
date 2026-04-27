import { buildCuratedOpenRouterChain, normalizeOpenRouterModelId } from './curation'

export const OPENROUTER_MODEL_COOLDOWN_MS = 5 * 60 * 1000
export const OPENROUTER_RATE_LIMIT_BASE_DELAY_MS = 1500
export const OPENROUTER_RATE_LIMIT_MAX_DELAY_MS = 10000

const openRouterModelCooldownUntil = new Map<string, number>()

export function resetOpenRouterCooldowns(): void {
  openRouterModelCooldownUntil.clear()
}

export function getOpenRouterCooldownRemainingMs(model: string, now: number = Date.now()): number {
  const until = openRouterModelCooldownUntil.get(normalizeOpenRouterModelId(model))
  if (!until) return 0
  const remaining = until - now
  return remaining > 0 ? remaining : 0
}

export function setOpenRouterModelCooldown(model: string, cooldownMs: number = OPENROUTER_MODEL_COOLDOWN_MS): void {
  const normalized = normalizeOpenRouterModelId(model)
  const until = Date.now() + cooldownMs
  const current = openRouterModelCooldownUntil.get(normalized) ?? 0
  if (until > current) {
    openRouterModelCooldownUntil.set(normalized, until)
  }
}

export function orderOpenRouterChainByCooldown(models: string[], now: number = Date.now()): string[] {
  const ready = models.filter((model) => getOpenRouterCooldownRemainingMs(model, now) <= 0)
  const cooling = models.filter((model) => getOpenRouterCooldownRemainingMs(model, now) > 0)
  return [...ready, ...cooling]
}

export function buildOpenRouterRouteChain(requestedModel?: string, liveModelIds?: string[]): string[] {
  return orderOpenRouterChainByCooldown(buildCuratedOpenRouterChain(requestedModel, liveModelIds))
}

export function isOpenRouterRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (/rate limit|429/i.test(error.message)) return true
  return extractHttpStatus(error) === 429
}

export function isOpenRouterDailyCapError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /free-models-per-day/i.test(error.message)
}

export function parseOpenRouterDailyCapResetMs(error: unknown): number | null {
  if (!(error instanceof Error)) return null
  const match = error.message.match(/"X-RateLimit-Reset"\s*:\s*"?(\d{10,16})"?/i)
  if (!match) return null
  const value = Number.parseInt(match[1], 10)
  return Number.isFinite(value) && value > 0 ? value : null
}

export function parseRetryAfterMs(error: unknown): number | null {
  if (!(error instanceof Error)) return null
  const match = error.message.match(/retry-after\s*(\d+)/i)
  if (!match) return null
  const seconds = Number.parseInt(match[1], 10)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return seconds * 1000
}

export function computeOpenRouterRateLimitBackoffMs(error: unknown, rateLimitAttempt: number): number {
  const retryAfterMs = parseRetryAfterMs(error)
  if (retryAfterMs !== null) {
    return Math.min(Math.max(retryAfterMs, OPENROUTER_RATE_LIMIT_BASE_DELAY_MS), OPENROUTER_RATE_LIMIT_MAX_DELAY_MS)
  }

  const exponential = OPENROUTER_RATE_LIMIT_BASE_DELAY_MS * (2 ** Math.max(0, rateLimitAttempt - 1))
  return Math.min(exponential, OPENROUTER_RATE_LIMIT_MAX_DELAY_MS)
}

export function shouldTryNextOpenRouterModel(sentAnyToken: boolean, error: unknown): boolean {
  if (sentAnyToken || !(error instanceof Error)) return false
  if (/401|unauthorized|invalid api key|authentication/i.test(error.message)) return false

  const status = extractHttpStatus(error)
  if (status !== null && status >= 400 && status < 500 && status !== 429 && status !== 400 && status !== 404) {
    return false
  }

  return true
}

function extractHttpStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null
  const match = error.message.match(/returned (\d{3})/i)
  return match ? Number.parseInt(match[1], 10) : null
}
