import { describe, it, expect } from 'vitest'
import { parseAnthropicStream } from '../../src/lib/llm-client'

// Helper to create a mock Response with a readable stream from SSE text
function createMockSSEResponse(sseText: string): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseText))
      controller.close()
    },
  })

  return new Response(stream)
}

describe('parseAnthropicStream', () => {
  it('extracts text from content_block_delta events', async () => {
    const sse = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_1"}}',
      '',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}',
      '',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n')

    const response = createMockSSEResponse(sse)
    const tokens: string[] = []

    for await (const text of parseAnthropicStream(response)) {
      tokens.push(text)
    }

    expect(tokens).toEqual(['Hello', ' world'])
  })

  it('handles empty stream', async () => {
    const response = createMockSSEResponse('')
    const tokens: string[] = []

    for await (const text of parseAnthropicStream(response)) {
      tokens.push(text)
    }

    expect(tokens).toEqual([])
  })

  it('stops on [DONE] signal', async () => {
    const sse = [
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Before"}}',
      '',
      'data: [DONE]',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"After"}}',
      '',
    ].join('\n')

    const response = createMockSSEResponse(sse)
    const tokens: string[] = []

    for await (const text of parseAnthropicStream(response)) {
      tokens.push(text)
    }

    expect(tokens).toEqual(['Before'])
  })

  it('skips non-delta events', async () => {
    const sse = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_1"}}',
      '',
      'event: ping',
      'data: {"type":"ping"}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Only this"}}',
      '',
    ].join('\n')

    const response = createMockSSEResponse(sse)
    const tokens: string[] = []

    for await (const text of parseAnthropicStream(response)) {
      tokens.push(text)
    }

    expect(tokens).toEqual(['Only this'])
  })

  it('throws when response body is null', async () => {
    const response = new Response(null)

    const tokens: string[] = []
    await expect(async () => {
      for await (const text of parseAnthropicStream(response)) {
        tokens.push(text)
      }
    }).rejects.toThrow('[LLMClient] Response body is null')
  })

  it('handles chunked data split across reads', async () => {
    const chunk1 = 'event: content_block_delta\ndata: {"type":"content_block_del'
    const chunk2 = 'ta","index":0,"delta":{"type":"text_delta","text":"split"}}\n\n'

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(chunk1))
        controller.enqueue(encoder.encode(chunk2))
        controller.close()
      },
    })

    const response = new Response(stream)
    const tokens: string[] = []

    for await (const text of parseAnthropicStream(response)) {
      tokens.push(text)
    }

    expect(tokens).toEqual(['split'])
  })
})
