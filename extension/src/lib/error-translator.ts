export interface ErrorMapping {
  code: string
  message: string
}

const ERROR_MAP: Record<string, ErrorMapping> = {
  '401': {
    code: 'INVALID_API_KEY',
    message: 'The API key was rejected. Check the key, confirm the provider, and save the settings again.',
  },
  '403': {
    code: 'PERMISSION_DENIED',
    message: 'This account does not have permission to use that model or API.',
  },
  '429': {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Rate limit exceeded. Wait a moment, then retry or switch to another model.',
  },
  '500': {
    code: 'SERVER_ERROR',
    message: 'The provider is having server problems right now. Please try again shortly.',
  },
  '503': {
    code: 'SERVICE_UNAVAILABLE',
    message: 'The provider is temporarily unavailable. Please try again shortly.',
  },
  'NO_TOKENS': {
    code: 'INSUFFICIENT_FUNDS',
    message: 'Your account has no credits or tokens left. Add credits or switch to a free model.',
  },
  'MODEL_NOT_FOUND': {
    code: 'INVALID_MODEL',
    message: 'The selected model was not found. Pick another model in settings and save again.',
  },
}

export function translateError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message
    const lowerMessage = message.toLowerCase()

    if (/returned 400/i.test(message) && /credit|billing|paid|balance|insufficient|no tokens/i.test(message)) {
      return 'This model needs paid credits on the provider account. Pick a free model or add credits.'
    }

    if (/returned 400|returned 404/i.test(message) && /model|not found|does not exist/i.test(message)) {
      return ERROR_MAP.MODEL_NOT_FOUND.message
    }

    if (/returned 400/i.test(message) && /invalid|malformed|unsupported|request/i.test(message)) {
      return 'The provider rejected the request format for that model. Switch models and try again.'
    }

    // Check for HTTP status codes in the message
    const statusMatch = message.match(/returned (\d{3})/)
    if (statusMatch) {
      const status = statusMatch[1]
      return ERROR_MAP[status]?.message || message
    }

    // Check for specific error keywords
    for (const [key, mapping] of Object.entries(ERROR_MAP)) {
      if (lowerMessage.includes(key.toLowerCase())) {
        return mapping.message
      }
    }
  }

  return 'An unexpected error occurred. Please check your connection and API settings.'
}
