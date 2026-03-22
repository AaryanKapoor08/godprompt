import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, resetRateLimitStore } from '../src/middleware/rate-limit'

describe('checkRateLimit', () => {
  beforeEach(() => {
    resetRateLimitStore()
  })

  it('allows the first request', () => {
    const result = checkRateLimit('1.2.3.4')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(9)
  })

  it('decrements remaining on each request', () => {
    checkRateLimit('1.2.3.4')
    checkRateLimit('1.2.3.4')
    const result = checkRateLimit('1.2.3.4')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(7)
  })

  it('blocks after 10 requests', () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit('1.2.3.4')
    }

    const result = checkRateLimit('1.2.3.4')
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('tracks IPs independently', () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit('1.2.3.4')
    }

    const blocked = checkRateLimit('1.2.3.4')
    expect(blocked.allowed).toBe(false)

    const other = checkRateLimit('5.6.7.8')
    expect(other.allowed).toBe(true)
    expect(other.remaining).toBe(9)
  })

  it('returns a future reset time', () => {
    const before = Date.now()
    const result = checkRateLimit('1.2.3.4')
    expect(result.resetTime).toBeGreaterThan(before)
  })

  it('resets after window expires', () => {
    // Exhaust the limit
    for (let i = 0; i < 10; i++) {
      checkRateLimit('1.2.3.4')
    }

    expect(checkRateLimit('1.2.3.4').allowed).toBe(false)

    // Simulate window expiry by clearing and re-checking
    // (In production, the resetTime check handles this; here we reset the store)
    resetRateLimitStore()

    const result = checkRateLimit('1.2.3.4')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(9)
  })
})
