// POST /api/enhance — proxies prompt to Anthropic API, returns SSE stream

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { validateMiddleware } from '../middleware/validate'
import { rateLimitMiddleware } from '../middleware/rate-limit'
import { streamAnthropicResponse } from '../llm/anthropic'
import type { EnhanceRequestBody } from '../middleware/validate'

const enhance = new Hono()

enhance.post(
  '/',
  validateMiddleware,
  rateLimitMiddleware,
  async (c) => {
    const req = c.get('enhanceRequest') as EnhanceRequestBody

    console.info(
      { platform: req.platform, promptLength: req.prompt.length, context: req.context },
      '[PromptPilot] Enhance request'
    )

    let anthropicResponse: Response

    try {
      anthropicResponse = await streamAnthropicResponse(
        req.prompt,
        req.platform,
        req.context ?? { isNewConversation: true, conversationLength: 0 }
      )
    } catch (error) {
      console.error('[PromptPilot] Anthropic API error', error)

      const isUnreachable = error instanceof TypeError
        || (error instanceof Error && error.message.includes('fetch'))

      if (isUnreachable) {
        return c.json({ error: 'Service unavailable' }, 503)
      }

      return c.json({ error: 'Enhancement failed' }, 500)
    }

    return streamSSE(c, async (stream) => {
      const reader = anthropicResponse.body?.getReader()
      if (!reader) {
        await stream.writeSSE({ data: JSON.stringify({ type: 'error', text: 'No response body' }) })
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()

              if (data === '[DONE]') {
                await stream.writeSSE({ data: JSON.stringify({ type: 'done', text: '' }) })
                return
              }

              try {
                const parsed = JSON.parse(data)

                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  await stream.writeSSE({
                    data: JSON.stringify({ type: 'token', text: parsed.delta.text }),
                  })
                }
              } catch {
                // Skip non-JSON data lines (e.g., event: lines)
              }
            }
          }
        }

        // Stream ended without [DONE] — send done anyway
        await stream.writeSSE({ data: JSON.stringify({ type: 'done', text: '' }) })
      } finally {
        reader.releaseLock()
      }
    })
  }
)

export { enhance }
