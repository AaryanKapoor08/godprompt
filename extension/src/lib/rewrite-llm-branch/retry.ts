import { assertBudget } from '../rewrite-core/budget'
import type { ValidationIssue } from '../rewrite-core/types'

const issueSeverityOrder = [
  'INTRODUCED_UNRELATED_CONTEXT',
  'META_PREAMBLE',
  'DESCRIPTIVE_PROMPT_BRIEF',
  'ANSWERED_INSTEAD_OF_REWRITING',
  'BROKEN_COMPOSITE_DIRECTIVE',
  'DROPPED_PERSONA',
  'DROPPED_NATURAL_LANGUAGE_CONSTRAINT',
  'DROPPED_USER_IDEA',
  'DROPPED_TONE_CUE',
  'DROPPED_DELIVERABLE',
  'FIRST_PERSON_BRIEF',
  'MERGED_SEPARATE_TASKS',
  'ASKED_FORBIDDEN_QUESTION',
  'DECORATIVE_MARKDOWN',
]

export function buildLlmRetryUserMessage(sourceText: string, failedOutput: string, issues: ValidationIssue[]): string {
  const topIssues = [...issues]
    .sort((left, right) => severityRank(left.code) - severityRank(right.code))
    .slice(0, 3)
  const issueText = topIssues
    .map((issue) => `${issue.code}${extractFailureEvidence(failedOutput, issue)}`)
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

function severityRank(code: string): number {
  const index = issueSeverityOrder.indexOf(code)
  return index === -1 ? issueSeverityOrder.length : index
}

function extractFailureEvidence(output: string, issue: ValidationIssue): string {
  const missingMatch = issue.message.match(/(?:Missing|Missing workflow):\s*([^.;]+)/i)
  if (missingMatch) {
    return `: ${missingMatch[1].trim().slice(0, 30)}`
  }

  const substring = extractFailingSubstring(output, issue.code)
  return substring ? `: ${substring}` : ''
}

function extractFailingSubstring(output: string, code: string): string {
  const patterns: Record<string, RegExp> = {
    META_PREAMBLE: /^(?:rewrite this (?:prompt )?for|here (?:is|s) (?:a|the) rewritten|this prompt is for|the rewritten prompt should).{0,30}/i,
    DESCRIPTIVE_PROMPT_BRIEF: /^(?:the user needs to|the goal is to|to (?:develop|create|build|write|draft|debug)\b|this task involves|debug the user'?s application).{0,30}/i,
    ANSWERED_INSTEAD_OF_REWRITING: /^(?:summary|analysis|findings|root causes?|recommendations?|the complaints suggest|based on the evidence|the most likely).{0,30}/i,
    FIRST_PERSON_BRIEF: /\b(?:my goal is|here'?s what i need you to do|deliverables include)\b.{0,30}/i,
    MERGED_SEPARATE_TASKS: /\b(?:first|then|after that|finally|separate|distinct|stage|step)\b.{0,30}/i,
    ASKED_FORBIDDEN_QUESTION: /\b(?:who is the recipient|what is the project|please provide|please share|can you provide|could you provide|tell me more)\b.{0,30}/i,
    DECORATIVE_MARKDOWN: /(?:\*\*[^*\n]{1,30}\*\*|```|<instruction>)/i,
    INTRODUCED_UNRELATED_CONTEXT: /\b(?:mongodb|schemas?|collection names?|migration steps?|rollback plan|safe rollback|pre[- ]production checklist|script (?:outlines?|shapes?)|stripe webhook|sentry|support tickets|customer emails|root[- ]cause paths?|what not to (?:say|communicate) to customers|compensation|remote policy|candidate profile|job post)\b.{0,30}/i,
  }
  const match = output.match(patterns[code])
  return match ? match[0].slice(0, 30) : ''
}

function estimateRetryProductOwnedTokens(message: string, sourceText: string): number {
  return Math.max(0, Math.ceil(message.length / 4) - Math.ceil(sourceText.length / 4))
}
