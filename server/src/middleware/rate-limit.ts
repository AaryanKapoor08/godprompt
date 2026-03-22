// IP-based in-memory rate limiter
// Resets on server restart — acceptable for v1

import type { Context, Next } from 'hono'

interface RateLimitEntry {
  count: number
  resetTime: number // epoch ms
}

const store = new Map<string, RateLimitEntry>()

const RATE_LIMIT_PER_HOUR = parseInt(process.env.RATE_LIMIT_PER_HOUR ?? '10', 10)
const WINDOW_MS = 60 * 60 * 1000 // 1 hour

export function checkRateLimit(ip: string): {
  allowed: boolean
  remaining: number
  resetTime: number
} {
  const now = Date.now()
  let entry = store.get(ip)

  // No entry or window expired — start fresh
  if (!entry || entry.resetTime < now) {
    entry = { count: 0, resetTime: now + WINDOW_MS }
    store.set(ip, entry)
  }

  if (entry.count >= RATE_LIMIT_PER_HOUR) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
    }
  }

  entry.count++
  return {
    allowed: true,
    remaining: RATE_LIMIT_PER_HOUR - entry.count,
    resetTime: entry.resetTime,
  }
}

export async function rateLimitMiddleware(c: Context, next: Next): Promise<Response | void> {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? c.req.header('x-real-ip')
    ?? 'unknown'

  const result = checkRateLimit(ip)
  const resetEpochSeconds = Math.ceil(result.resetTime / 1000)

  c.header('X-RateLimit-Remaining', String(result.remaining))
  c.header('X-RateLimit-Reset', String(resetEpochSeconds))

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000)
    c.header('Retry-After', String(retryAfter))

    return c.json(
      { error: 'Rate limit exceeded', retryAfter },
      429
    )
  }

  await next()
}

// For testing — reset the store
export function resetRateLimitStore(): void {
  store.clear()
}
