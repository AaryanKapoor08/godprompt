// Request validation for POST /api/enhance

import type { Context, Next } from 'hono'

const VALID_PLATFORMS = ['chatgpt', 'claude', 'gemini', 'perplexity'] as const
const MAX_PROMPT_LENGTH = parseInt(process.env.MAX_PROMPT_LENGTH ?? '10000', 10)

export interface EnhanceRequestBody {
  prompt: string
  platform: 'chatgpt' | 'claude' | 'gemini' | 'perplexity'
  context?: {
    isNewConversation: boolean
    conversationLength: number
  }
}

export function validateEnhanceRequest(body: unknown): {
  valid: boolean
  error?: string
  data?: EnhanceRequestBody
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' }
  }

  const b = body as Record<string, unknown>

  // Validate prompt
  if (!b.prompt || typeof b.prompt !== 'string') {
    return { valid: false, error: 'prompt is required' }
  }

  if (b.prompt.trim().length === 0) {
    return { valid: false, error: 'Prompt is empty' }
  }

  if (b.prompt.length > MAX_PROMPT_LENGTH) {
    return { valid: false, error: `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)` }
  }

  // Validate platform
  if (!b.platform || typeof b.platform !== 'string') {
    return { valid: false, error: 'Invalid platform. Must be chatgpt, claude, gemini, or perplexity' }
  }

  if (!VALID_PLATFORMS.includes(b.platform as typeof VALID_PLATFORMS[number])) {
    return { valid: false, error: 'Invalid platform. Must be chatgpt, claude, gemini, or perplexity' }
  }

  // Context is optional — default if missing
  const context = (b.context && typeof b.context === 'object')
    ? b.context as { isNewConversation: boolean; conversationLength: number }
    : { isNewConversation: true, conversationLength: 0 }

  return {
    valid: true,
    data: {
      prompt: b.prompt as string,
      platform: b.platform as EnhanceRequestBody['platform'],
      context,
    },
  }
}

export async function validateMiddleware(c: Context, next: Next): Promise<Response | void> {
  const contentType = c.req.header('content-type')
  if (!contentType?.includes('application/json')) {
    return c.json({ error: 'Content-Type must be application/json' }, 400)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const result = validateEnhanceRequest(body)

  if (!result.valid) {
    return c.json({ error: result.error }, 400)
  }

  // Attach validated data to context for downstream handlers
  c.set('enhanceRequest', result.data)
  await next()
}
