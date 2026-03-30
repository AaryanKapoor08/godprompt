// LLM client — handles API calls with SSE streaming
// Supports Anthropic, OpenAI, and OpenRouter providers
// All LLM calls go through the service worker, never from content scripts

import type { ConversationContext } from '../content/adapters/types'

export type Provider = 'anthropic' | 'openai' | 'openrouter'

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

            // OpenAI SSE format: choices[0].delta.content
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              yield content
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

// Make a streaming request to the Anthropic API
export async function callAnthropicAPI(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  model: string = 'claude-haiku-4-5-20251001'
): Promise<Response> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
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
      stream: true,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage },
      ],
    }),
  })

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
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  })

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
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://promptgod.dev',
      'X-Title': 'PromptGod',
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(`[LLMClient] OpenRouter API returned ${response.status}: ${errorBody}`, {
      cause: new Error(errorBody),
    })
  }

  return response
}
