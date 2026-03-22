// Anthropic API client with SSE streaming for the backend proxy

import { buildMetaPrompt } from '../meta-prompt'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_API_KEY) {
  throw new Error('[Config] ANTHROPIC_API_KEY is required')
}

export async function streamAnthropicResponse(
  prompt: string,
  platform: string,
  context: { isNewConversation: boolean; conversationLength: number }
): Promise<Response> {
  const systemPrompt = buildMetaPrompt(platform, context.isNewConversation, context.conversationLength)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      stream: true,
      system: systemPrompt,
      messages: [
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(`[Anthropic] API returned ${response.status}: ${errorBody}`, {
      cause: new Error(errorBody),
    })
  }

  return response
}
