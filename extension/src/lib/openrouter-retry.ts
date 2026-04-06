export const OPENROUTER_FALLBACK_MODEL = 'nvidia/nemotron-3-nano-30b-a3b:free'

function isAuthLikeError(message: string): boolean {
  return /401|unauthorized|invalid api key|authentication/i.test(message)
}

function getReturnedStatus(message: string): number | null {
  const match = message.match(/returned (\d{3})/i)
  if (!match) return null
  return Number.parseInt(match[1], 10)
}

function isTransientOpenRouterError(message: string): boolean {
  return /timed out|stalled|ended before emitting tokens|failed to fetch|network|overloaded|temporarily unavailable|rate limit|429|5\d\d/i.test(message)
}

function shouldRetryOpenRouterWithFallback(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  // Invalid key/auth errors won't be fixed by changing model.
  if (isAuthLikeError(error.message)) {
    return false
  }

  // Non-rate-limit 4xx is usually a hard request issue.
  const status = getReturnedStatus(error.message)
  if (status !== null && status >= 400 && status < 500 && status !== 429) {
    return false
  }

  return true
}

export function shouldRetryOpenRouterSameModel(
  sentAnyToken: boolean,
  error: unknown
): boolean {
  if (sentAnyToken || !(error instanceof Error)) {
    return false
  }

  if (isAuthLikeError(error.message)) {
    return false
  }

  const status = getReturnedStatus(error.message)
  if (status !== null && status >= 400 && status < 500 && status !== 429) {
    return false
  }

  return isTransientOpenRouterError(error.message)
}

export function shouldRetryWithOpenRouterFallback(
  requestedModel: string,
  sentAnyToken: boolean,
  error: unknown
): boolean {
  if (requestedModel === OPENROUTER_FALLBACK_MODEL) {
    return false
  }

  // Retrying after partial output would duplicate text in the composer.
  if (sentAnyToken) {
    return false
  }

  return shouldRetryOpenRouterWithFallback(error)
}
