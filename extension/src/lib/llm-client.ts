// LLM client — handles API calls with SSE streaming
// Supports Anthropic, OpenAI, and OpenRouter providers
// All LLM calls go through the service worker, never from content scripts

import type { ConversationContext } from '../content/adapters/types'

export type Provider = 'anthropic' | 'openai' | 'openrouter'
const REWRITE_TEMPERATURE = 0.4
const REQUEST_TIMEOUT_MS = {
  anthropic: 60000,
  openai: 60000,
  openrouter: 25000,
} as const

interface OpenRouterNonStreamResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`[LLMClient] Request timed out after ${timeoutMs}ms`, {
        cause: error,
      })
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export function validateApiKey(key: string): { valid: boolean; provider: Provider | null } {
  const trimmed = key.trim()

  if (trimmed.startsWith('sk-ant-')) {
    return { valid: true, provider: 'anthropic' }
  }

  if (trimmed.startsWith('sk-or-')) {
    return { valid: true, provider: 'openrouter' }
  }

  if (trimmed.startsWith('sk-')) {
    return { valid: true, provider: 'openai' }
  }

  return { valid: false, provider: null }
}

export function buildUserMessage(
  rawPrompt: string,
  platform: string,
  context: ConversationContext
): string {
  const contextLine = context.isNewConversation
    ? 'New conversation'
    : `Ongoing conversation, message #${context.conversationLength + 1}`

  return `Rewrite the following prompt. Output ONLY the rewritten prompt, nothing else.

Platform: ${platform}
Context: ${contextLine}

PROMPT TO REWRITE:
"""
${rawPrompt}
"""`
}

// Parse Anthropic SSE stream and yield text chunks
export async function* parseAnthropicStream(
  response: Response
): AsyncGenerator<string, void, unknown> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('[LLMClient] Response body is null', { cause: new Error('No readable stream') })
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
            return
          }

          try {
            const parsed = JSON.parse(data)

            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              yield parsed.delta.text
            }
          } catch {
            // Skip non-JSON data lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// Parse OpenAI-compatible SSE stream (used by OpenAI and OpenRouter)
export async function* parseOpenAIStream(
  response: Response
): AsyncGenerator<string, void, unknown> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('[LLMClient] Response body is null', { cause: new Error('No readable stream') })
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let eventDataLines: string[] = []

  type ParseResult =
    | { kind: 'token'; value: string }
    | { kind: 'done' }
    | { kind: 'parsed-noop' }
    | { kind: 'invalid' }

  function flushEventData(): string | null {
    if (eventDataLines.length === 0) {
      return null
    }

    const data = eventDataLines.join('\n').trim()
    eventDataLines = []
    return data.length > 0 ? data : null
  }

  function parseDataPayload(data: string): ParseResult {
    if (data === '[DONE]') {
      return { kind: 'done' }
    }

    try {
      const parsed = JSON.parse(data)

      if (parsed?.error?.message) {
        throw new Error(`[LLMClient] OpenAI-compatible stream error: ${parsed.error.message}`)
      }

      // OpenAI SSE format: choices[0].delta.content
      const content = parsed.choices?.[0]?.delta?.content
      if (content) {
        return { kind: 'token', value: content }
      }

      return { kind: 'parsed-noop' }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('[LLMClient] OpenAI-compatible stream error:')) {
        throw error
      }

      return { kind: 'invalid' }
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const normalizedLine = line.endsWith('\r') ? line.slice(0, -1) : line

        if (normalizedLine === '') {
          const data = flushEventData()
          if (!data) {
            continue
          }

          const parsed = parseDataPayload(data)
          if (parsed.kind === 'token') {
            yield parsed.value
          } else if (parsed.kind === 'done') {
            return
          }

          continue
        }

        if (normalizedLine.startsWith('data:')) {
          const dataPart = normalizedLine.slice(5).trimStart()
          eventDataLines.push(dataPart)

          // Fast path for line-delimited streams that do not emit blank separators.
          const immediate = eventDataLines.join('\n').trim()
          if (!immediate) {
            continue
          }

          const parsed = parseDataPayload(immediate)
          if (parsed.kind === 'token') {
            yield parsed.value
            eventDataLines = []
          } else if (parsed.kind === 'done') {
            return
          } else if (parsed.kind === 'parsed-noop') {
            eventDataLines = []
          }
        }
      }
    }

    const trailingData = flushEventData()
    if (trailingData) {
      const parsed = parseDataPayload(trailingData)
      if (parsed.kind === 'token') {
        yield parsed.value
      } else if (parsed.kind === 'done') {
        return
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// Make a streaming request to the Anthropic API
export async function callAnthropicAPI(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  model: string = 'claude-haiku-4-5-20251001'
): Promise<Response> {
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Required for calling Anthropic API from browser context (service worker)
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      temperature: REWRITE_TEMPERATURE,
      stream: true,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage },
      ],
    }),
  }, REQUEST_TIMEOUT_MS.anthropic)

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(`[LLMClient] Anthropic API returned ${response.status}: ${errorBody}`, {
      cause: new Error(errorBody),
    })
  }

  return response
}

// Make a streaming request to the OpenAI API
export async function callOpenAIAPI(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  model: string = 'gpt-4o-mini'
): Promise<Response> {
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: REWRITE_TEMPERATURE,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  }, REQUEST_TIMEOUT_MS.openai)

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(`[LLMClient] OpenAI API returned ${response.status}: ${errorBody}`, {
      cause: new Error(errorBody),
    })
  }

  return response
}

// Make a streaming request to OpenRouter (OpenAI-compatible format)
export async function callOpenRouterAPI(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  model: string = 'nvidia/nemotron-3-nano-30b-a3b:free'
): Promise<Response> {
  const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://promptgod.dev',
      'X-Title': 'PromptGod',
    },
    body: JSON.stringify({
      model,
      temperature: REWRITE_TEMPERATURE,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  }, REQUEST_TIMEOUT_MS.openrouter)

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(`[LLMClient] OpenRouter API returned ${response.status}: ${errorBody}`, {
      cause: new Error(errorBody),
    })
  }

  return response
}

// Make a non-streaming request to OpenRouter as a reliability fallback
export async function callOpenRouterAPIOnce(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  model: string = 'nvidia/nemotron-3-nano-30b-a3b:free'
): Promise<string> {
  const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://promptgod.dev',
      'X-Title': 'PromptGod',
    },
    body: JSON.stringify({
      model,
      temperature: REWRITE_TEMPERATURE,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  }, REQUEST_TIMEOUT_MS.openrouter)

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(`[LLMClient] OpenRouter API (non-stream) returned ${response.status}: ${errorBody}`, {
      cause: new Error(errorBody),
    })
  }

  const parsed = await response.json() as OpenRouterNonStreamResponse
  const content = parsed.choices?.[0]?.message?.content

  if (typeof content === 'string') {
    const trimmed = content.trim()
    if (trimmed.length > 0) {
      return trimmed
    }
  }

  if (Array.isArray(content)) {
    const text = content
      .filter((item) => item?.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text?.trim() ?? '')
      .filter((item) => item.length > 0)
      .join('\n')

    if (text.length > 0) {
      return text
    }
  }

  throw new Error('[LLMClient] OpenRouter non-stream response did not contain text output')
}
