export type OpenRouterAccountBucket = '50/day' | '1000/day' | 'unknown'

export type OpenRouterAccountStatus = {
  bucket: OpenRouterAccountBucket
  limit: number | null
  usage: number | null
  remaining: number | null
  paused: boolean
  checkedAt: number
  resetAtMs?: number | null
}

export const OPENROUTER_ACCOUNT_STATUS_KEY = 'openrouterAccountStatus'

let sessionStatus: OpenRouterAccountStatus | null = null

export function resetOpenRouterAccountStatusSession(): void {
  sessionStatus = null
}

export function getSessionOpenRouterAccountStatus(): OpenRouterAccountStatus | null {
  return sessionStatus
}

export function markOpenRouterDailyCapReached(
  resetAtMs: number | null = null,
  now: number = Date.now()
): OpenRouterAccountStatus {
  const previous = sessionStatus
  const limit = previous?.limit ?? 50
  const usage = previous?.usage ?? limit
  const next: OpenRouterAccountStatus = {
    bucket: previous?.bucket && previous.bucket !== 'unknown' ? previous.bucket : '50/day',
    limit,
    usage,
    remaining: 0,
    paused: true,
    checkedAt: now,
    resetAtMs,
  }
  sessionStatus = next

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    void chrome.storage.local.set({ [OPENROUTER_ACCOUNT_STATUS_KEY]: next })
  }

  return next
}

export async function inspectOpenRouterAccountStatus(
  apiKey: string,
  fetchFn: typeof fetch = fetch,
  now: number = Date.now()
): Promise<OpenRouterAccountStatus> {
  if (sessionStatus) return sessionStatus

  const response = await fetchFn('https://openrouter.ai/api/v1/key', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`[OpenRouterAccount] key request returned ${response.status}`)
  }

  const payload = await response.json().catch(() => null) as {
    data?: {
      limit?: number | null
      usage?: number | null
    }
  } | null

  const limit = typeof payload?.data?.limit === 'number' ? payload.data.limit : null
  const usage = typeof payload?.data?.usage === 'number' ? payload.data.usage : null
  const remaining = limit !== null && usage !== null ? Math.max(0, limit - usage) : null
  const bucket = limit === null ? 'unknown' : limit > 50 ? '1000/day' : '50/day'

  sessionStatus = {
    bucket,
    limit,
    usage,
    remaining,
    paused: remaining === 0,
    checkedAt: now,
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [OPENROUTER_ACCOUNT_STATUS_KEY]: sessionStatus })
  }

  return sessionStatus
}
