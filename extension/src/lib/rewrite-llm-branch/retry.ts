import { assertBudget } from '../rewrite-core/budget'
import type { ValidationIssue } from '../rewrite-core/types'

const issueSeverityOrder = [
  'ANSWERED_INSTEAD_OF_REWRITING',
  'DROPPED_DELIVERABLE',
  'FIRST_PERSON_BRIEF',
  'MERGED_SEPARATE_TASKS',
  'ASKED_FORBIDDEN_QUESTION',
  'DECORATIVE_MARKDOWN',
]

export function buildLlmRetryUserMessage(sourceText: string, failedOutput: string, issues: ValidationIssue[]): string {
  const topIssues = [...issues]
    .sort((left, right) => issueSeverityOrder.indexOf(left.code) - issueSeverityOrder.indexOf(right.code))
    .slice(0, 3)
  const issueText = topIssues
    .map((issue) => `${issue.code}${extractFailingSubstring(failedOutput, issue.code)}`)
    .join('; ')

  const retryMessage = `Retry the rewrite only. Fix these validator failures: ${issueText}. Preserve the source constraints and output only the corrected prompt.
Source:
"""
${sourceText}
"""`

  assertBudget({
    kind: 'llm-retry',
    tokens: estimateRetryProductOwnedTokens(retryMessage, sourceText),
    hardCap: 220,
  })

  return retryMessage
}

function extractFailingSubstring(output: string, code: string): string {
  const patterns: Record<string, RegExp> = {
    FIRST_PERSON_BRIEF: /\b(?:my goal is|here'?s what i need you to do|deliverables include)\b.{0,30}/i,
    DECORATIVE_MARKDOWN: /(?:\*\*[^*\n]{1,30}\*\*|```|<instruction>)/i,
  }
  const match = output.match(patterns[code])
  return match ? ` (${match[0].slice(0, 30)})` : ''
}

function estimateRetryProductOwnedTokens(message: string, sourceText: string): number {
  return Math.max(0, Math.ceil(message.length / 4) - Math.ceil(sourceText.length / 4))
}

