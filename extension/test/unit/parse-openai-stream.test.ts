import { describe, it, expect } from 'vitest'
import { parseOpenAIStream } from '../../src/lib/llm-client'

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

describe('parseOpenAIStream', () => {
  it('extracts text from choices[0].delta.content', async () => {
    const sse = [
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    const response = createMockSSEResponse(sse)
    const tokens: string[] = []

    for await (const text of parseOpenAIStream(response)) {
      tokens.push(text)
    }

    expect(tokens).toEqual(['Hello', ' world'])
  })

  it('handles empty stream', async () => {
    const response = createMockSSEResponse('')
    const tokens: string[] = []

    for await (const text of parseOpenAIStream(response)) {
      tokens.push(text)
    }

    expect(tokens).toEqual([])
  })

  it('stops on [DONE] signal', async () => {
    const sse = [
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"Before"},"finish_reason":null}]}',
      '',
      'data: [DONE]',
      '',
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"After"},"finish_reason":null}]}',
      '',
    ].join('\n')

    const response = createMockSSEResponse(sse)
    const tokens: string[] = []

    for await (const text of parseOpenAIStream(response)) {
      tokens.push(text)
    }

    expect(tokens).toEqual(['Before'])
  })

  it('skips deltas without content', async () => {
    const sse = [
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"Only this"},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    const response = createMockSSEResponse(sse)
    const tokens: string[] = []

    for await (const text of parseOpenAIStream(response)) {
      tokens.push(text)
    }

    expect(tokens).toEqual(['Only this'])
  })

  it('parses data lines without a space after colon', async () => {
    const sse = [
      'data:{"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}',
      '',
      'data:{"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}',
      '',
      'data:[DONE]',
      '',
    ].join('\n')

    const response = createMockSSEResponse(sse)
    const tokens: string[] = []

    for await (const text of parseOpenAIStream(response)) {
      tokens.push(text)
    }

    expect(tokens).toEqual(['Hello', ' world'])
  })

  it('handles CRLF line endings', async () => {
    const sse = [
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"CR"},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"LF"},"finish_reason":null}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\r\n')

    const response = createMockSSEResponse(sse)
    const tokens: string[] = []

    for await (const text of parseOpenAIStream(response)) {
      tokens.push(text)
    }

    expect(tokens).toEqual(['CR', 'LF'])
  })

  it('parses line-delimited events without blank separators', async () => {
    const sse = [
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"Line"},"finish_reason":null}]}',
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":" by line"},"finish_reason":null}]}',
      'data: [DONE]',
    ].join('\n')

    const response = createMockSSEResponse(sse)
    const tokens: string[] = []

    for await (const text of parseOpenAIStream(response)) {
      tokens.push(text)
    }

    expect(tokens).toEqual(['Line', ' by line'])
  })

  it('throws on streamed error payload', async () => {
    const sse = [
      'data: {"error":{"message":"upstream overloaded"}}',
      '',
    ].join('\n')

    const response = createMockSSEResponse(sse)

    await expect(async () => {
      for await (const text of parseOpenAIStream(response)) {
        void text
      }
    }).rejects.toThrow('[LLMClient] OpenAI-compatible stream error: upstream overloaded')
  })

  it('throws when response body is null', async () => {
    const response = new Response(null)

    await expect(async () => {
      for await (const text of parseOpenAIStream(response)) {
        void text
      }
    }).rejects.toThrow('[LLMClient] Response body is null')
  })
})
