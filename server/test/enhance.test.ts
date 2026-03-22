// Integration test for POST /api/enhance
// Tests the full middleware stack: validation → rate limiting → response

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { app } from '../src/index'
import { resetRateLimitStore } from '../src/middleware/rate-limit'

// Mock the Anthropic API module to avoid real API calls
vi.mock('../src/llm/anthropic', () => ({
  streamAnthropicResponse: vi.fn().mockImplementation(async () => {
    // Return a mock SSE stream
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Enhanced"}}\n\n'
        ))
        controller.enqueue(encoder.encode(
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" prompt"}}\n\n'
        ))
        controller.enqueue(encoder.encode(
          'data: {"type":"message_stop"}\n\n'
        ))
        controller.close()
      },
    })

    return new Response(stream)
  }),
}))

function makeRequest(body: unknown, headers?: Record<string, string>) {
  return app.request('/api/enhance', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/enhance', () => {
  beforeEach(() => {
    resetRateLimitStore()
  })

  it('returns SSE stream for valid request', async () => {
    const res = await makeRequest({
      prompt: 'help me write a python script',
      platform: 'chatgpt',
    })

    expect(res.status).toBe(200)

    const text = await res.text()
    expect(text).toContain('"type":"token"')
    expect(text).toContain('"text":"Enhanced"')
  })

  it('returns 400 for missing prompt', async () => {
    const res = await makeRequest({ platform: 'chatgpt' })
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error).toBe('prompt is required')
  })

  it('returns 400 for invalid platform', async () => {
    const res = await makeRequest({ prompt: 'hello', platform: 'bard' })
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error).toContain('Invalid platform')
  })

  it('returns 400 for prompt exceeding 10000 characters', async () => {
    const res = await makeRequest({
      prompt: 'a'.repeat(15000),
      platform: 'chatgpt',
    })
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error).toContain('Prompt too long')
  })

  it('includes rate limit headers on success', async () => {
    const res = await makeRequest({
      prompt: 'help me write a python script',
      platform: 'chatgpt',
    })

    expect(res.headers.get('X-RateLimit-Remaining')).toBeDefined()
    expect(res.headers.get('X-RateLimit-Reset')).toBeDefined()
  })

  it('returns 429 after 10 requests from same IP', async () => {
    // Exhaust rate limit
    for (let i = 0; i < 10; i++) {
      await makeRequest({
        prompt: 'help me write a python script',
        platform: 'chatgpt',
      })
    }

    // 11th request should be rate limited
    const res = await makeRequest({
      prompt: 'help me write a python script',
      platform: 'chatgpt',
    })

    expect(res.status).toBe(429)

    const body = await res.json()
    expect(body.error).toBe('Rate limit exceeded')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0')
  })

  it('returns 400 for non-JSON content type', async () => {
    const res = await app.request('/api/enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hello',
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Content-Type')
  })
})

describe('GET /health', () => {
  it('returns ok status', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.status).toBe('ok')
  })
})
