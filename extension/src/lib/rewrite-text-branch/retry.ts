import { assertBudget } from '../rewrite-core/budget'
import type { ValidationIssue } from '../rewrite-core/types'

export function shouldRetryTextBranch(issues: ValidationIssue[]): boolean {
  return issues.some((issue) =>
    issue.code === 'ANSWERED_INSTEAD_OF_REWRITING' ||
    issue.code === 'ASKED_FORBIDDEN_QUESTION' ||
    issue.code === 'FIRST_PERSON_BRIEF'
  )
}

export function buildTextRetryUserMessage(sourceText: string, issues: ValidationIssue[]): string {
  const issueText = issues.slice(0, 2).map((issue) => issue.code).join('; ')
  const anchor = sourceText.length > 180 ? `${sourceText.slice(0, 180)}...` : sourceText
  const retryMessage = `Retry Text branch rewrite only. Fix: ${issueText}. No questions, source echo, duplicate summary, or answering.
Source anchor:
"""
${anchor}
"""`

  assertBudget({
    kind: 'text-retry',
    tokens: Math.max(0, Math.ceil(retryMessage.length / 4) - Math.ceil(anchor.length / 4)),
    hardCap: 140,
  })

  return retryMessage
}

