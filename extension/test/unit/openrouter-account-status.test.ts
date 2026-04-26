import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  inspectOpenRouterAccountStatus,
  resetOpenRouterAccountStatusSession,
} from '../../src/lib/rewrite-openrouter/account-status'

describe('OpenRouter account status awareness', () => {
  afterEach(() => {
    resetOpenRouterAccountStatusSession()
    vi.restoreAllMocks()
  })

  it('detects the 50/day bucket and pauses routing at the cap', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      data: { limit: 50, usage: 50 },
    }), { status: 200 }))

    const status = await inspectOpenRouterAccountStatus('sk-or-test', fetchMock as unknown as typeof fetch, 123)

    expect(status).toMatchObject({
      bucket: '50/day',
      limit: 50,
      usage: 50,
      remaining: 0,
      paused: true,
      checkedAt: 123,
    })
  })

  it('detects the 1000/day bucket and caches it for the session', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      data: { limit: 1000, usage: 25 },
    }), { status: 200 }))

    const first = await inspectOpenRouterAccountStatus('sk-or-test', fetchMock as unknown as typeof fetch, 123)
    const second = await inspectOpenRouterAccountStatus('sk-or-test', fetchMock as unknown as typeof fetch, 456)

    expect(first.bucket).toBe('1000/day')
    expect(second.checkedAt).toBe(123)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
