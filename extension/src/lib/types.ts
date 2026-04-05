// Shared message types for content script ↔ service worker port communication

import type { Platform, ConversationContext } from '../content/adapters/types'

// Content script → Service worker
export interface EnhanceMessage {
  type: 'ENHANCE'
  rawPrompt: string
  platform: Platform
  context: ConversationContext
  recentContext?: string
}

// Service worker → Content script
export interface StartMessage {
  type: 'START'
}

export interface TokenMessage {
  type: 'TOKEN'
  text: string
}

export interface DoneMessage {
  type: 'DONE'
  rateLimitRemaining?: number
  rateLimitReset?: number
}

export interface ErrorMessage {
  type: 'ERROR'
  message: string
  code?: string
}

// Union of all messages the service worker can send back
export type ServiceWorkerMessage = StartMessage | TokenMessage | DoneMessage | ErrorMessage

// Union of all messages the content script can send
export type ContentMessage = EnhanceMessage
