// Platform adapter interface — each supported platform implements this
// Using an interface so adapter classes can `implements PlatformAdapter`

export type Platform = 'chatgpt' | 'claude' | 'gemini'

export interface ConversationContext {
  isNewConversation: boolean
  conversationLength: number
}

export interface PlatformAdapter {
  matches(): boolean
  getInputElement(): HTMLElement | null
  getPromptText(): string
  setPromptText(text: string): void
  getSendButton(): HTMLElement | null
  getPlatform(): Platform
  getConversationContext(): ConversationContext
}
