export type RewriteBranch = 'LLM' | 'Text'

export type RewriteProvider = 'Google' | 'OpenRouter' | 'OpenAI' | 'Anthropic'

export type SourceMode = 'prompt' | 'message' | 'note' | 'mixed task list'

export type ConstraintKind =
  | 'plain-text-only'
  | 'no-markdown'
  | 'no-bold'
  | 'ask-questions-first'
  | 'no-questions'
  | 'do-not-solve-yet'
  | 'keep-tasks-separate'
  | 'preserve-deliverables'
  | 'word-limit'
  | 'count-limit'
  | 'no-invention'
  | 'staged-workflow'
  | 'no-placeholders'

export type TextSpan = {
  start: number
  end: number
  text: string
}

export type ExtractedConstraint = {
  kind: ConstraintKind
  value: string
  span: TextSpan
}

export type ConstraintSet = {
  sourceMode: SourceMode
  constraints: ExtractedConstraint[]
  preserveTokens: string[]
}

export type RewriteRequest = {
  branch: RewriteBranch
  provider: RewriteProvider
  sourceText: string
  modelId: string
  conversationContext?: {
    isNewConversation: boolean
    conversationLength: number
  }
  recentContext?: string
}

export type RewriteSpec = {
  branch: RewriteBranch
  provider: RewriteProvider
  modelId: string
  sourceText: string
  sourceMode: SourceMode
  instructions: string
  constraints: ExtractedConstraint[]
}

export type ValidationIssueCode =
  | 'DROPPED_DELIVERABLE'
  | 'DROPPED_PRESERVE_TOKEN'
  | 'ASKED_FORBIDDEN_QUESTION'
  | 'DECORATIVE_MARKDOWN'
  | 'FIRST_PERSON_BRIEF'
  | 'MERGED_SEPARATE_TASKS'
  | 'ANSWERED_INSTEAD_OF_REWRITING'
  | 'UNCHANGED_REWRITE'

export type ValidationIssue = {
  code: ValidationIssueCode
  message: string
  severity: 'error' | 'warning'
  span?: TextSpan
}

export type ValidationResult = {
  ok: boolean
  issues: ValidationIssue[]
}

export type RepairClass = 'cosmetic' | 'structural' | 'substantive'

export type RepairOperation = {
  class: RepairClass
  description: string
}

export type RepairResult = {
  output: string
  changed: boolean
  usedFallback: boolean
  operations: RepairOperation[]
}
