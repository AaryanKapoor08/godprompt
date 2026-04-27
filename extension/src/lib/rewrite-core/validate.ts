import type { ConstraintSet, ValidationIssue, ValidationIssueCode, ValidationResult, RewriteBranch } from './types'

const ENABLE_LLM_PRESERVE_TOKEN_VALIDATION = false

export type ValidateRewriteInput = {
  branch: RewriteBranch
  sourceText: string
  output: string
  constraints?: ConstraintSet
}

export function validateRewrite(input: ValidateRewriteInput): ValidationResult {
  const issues: ValidationIssue[] = []
  const output = input.output.trim()

  addIf(issues, detectsDecorativeMarkdown(output), 'DECORATIVE_MARKDOWN', 'Output contains decorative markdown.')
  addIf(issues, detectsFirstPersonBrief(output), 'FIRST_PERSON_BRIEF', 'Output uses first-person prompt-brief framing.')
  addIf(
    issues,
    asksForbiddenQuestion(output, input.branch, input.constraints),
    'ASKED_FORBIDDEN_QUESTION',
    'Output asks a question that is forbidden for this branch or constraint set.'
  )
  addIf(
    issues,
    answersInsteadOfRewriting(input.sourceText, output),
    'ANSWERED_INSTEAD_OF_REWRITING',
    'Output appears to answer or execute the source instead of rewriting it.'
  )
  addIf(
    issues,
    input.branch === 'LLM' && isUnchangedRewrite(input.sourceText, output),
    'UNCHANGED_REWRITE',
    'Output is unchanged from the source prompt.'
  )
  addIf(
    issues,
    dropsDeliverable(input.sourceText, output),
    'DROPPED_DELIVERABLE',
    'Output dropped an explicit deliverable from the source.'
  )
  if (ENABLE_LLM_PRESERVE_TOKEN_VALIDATION && input.branch === 'LLM') {
    issues.push(...droppedPreserveTokenIssues(output, input.constraints))
  }
  addIf(
    issues,
    mergesSeparateTasks(input.sourceText, output),
    'MERGED_SEPARATE_TASKS',
    'Output appears to merge a staged or separated workflow.'
  )

  return {
    ok: issues.length === 0,
    issues,
  }
}

function addIf(issues: ValidationIssue[], condition: boolean, code: ValidationIssueCode, message: string): void {
  if (condition) {
    issues.push({ code, message, severity: 'error' })
  }
}

function detectsDecorativeMarkdown(text: string): boolean {
  return /(?:^|\s)(?:\*\*[^*\n]+\*\*|__[^_\n]+__|```|<instruction>|<\/instruction>|<task>|<\/task>)/i.test(text)
}

function detectsFirstPersonBrief(text: string): boolean {
  return /^(?:my goal is|my primary need is|here'?s what i need you to do|this prompt should|i am providing|i'm providing|i’m providing)\b/i.test(text.trim())
}

function asksForbiddenQuestion(text: string, branch: RewriteBranch, constraints?: ConstraintSet): boolean {
  const forbidsQuestions = branch === 'Text' ||
    constraints?.constraints.some((constraint) => constraint.kind === 'no-questions') === true

  if (!forbidsQuestions) {
    return false
  }

  return /\?\s*$|\b(?:who is the recipient|what is the project|please provide|please share|can you provide|could you provide|tell me more)\b/i.test(text)
}

function answersInsteadOfRewriting(sourceText: string, output: string): boolean {
  if (!looksLikePromptInstruction(sourceText)) {
    return false
  }

  return /^(?:summary|analysis|findings|root causes?|recommendations?|the complaints suggest|based on the evidence|the most likely)\b/i.test(output.trim())
}

function dropsDeliverable(sourceText: string, output: string): boolean {
  const deliverables = extractDeliverables(sourceText)
  if (deliverables.length === 0) {
    return false
  }

  const normalizedOutput = normalizeForCompare(output)
  return deliverables.some((deliverable) => !normalizedOutput.includes(deliverable))
}

function isUnchangedRewrite(sourceText: string, output: string): boolean {
  const normalizedSource = normalizeForCompare(sourceText)
  const normalizedOutput = normalizeForCompare(output)
  return normalizedSource.length > 80 && normalizedSource === normalizedOutput
}

function droppedPreserveTokenIssues(output: string, constraints?: ConstraintSet): ValidationIssue[] {
  const preserveTokens = constraints?.preserveTokens ?? []
  if (preserveTokens.length === 0) {
    return []
  }

  return preserveTokens
    .filter((token) => !preserveTokenSurvives(token, output))
    .map((token) => ({
      code: 'DROPPED_PRESERVE_TOKEN' as const,
      message: `Output dropped preserved source detail: ${token}`,
      severity: 'error' as const,
      span: {
        start: -1,
        end: -1,
        text: token,
      },
    }))
}

function preserveTokenSurvives(token: string, output: string): boolean {
  const normalizedOutput = normalizeForCompare(output)
  const normalizedToken = normalizeForCompare(token)
  if (!normalizedToken) {
    return true
  }
  if (normalizedOutput.includes(normalizedToken)) {
    return true
  }

  const outputTerms = new Set(significantTerms(output))
  const tokenTerms = significantTerms(token)
  return tokenTerms.length > 0 && tokenTerms.every((term) => outputTerms.has(term))
}

function mergesSeparateTasks(sourceText: string, output: string): boolean {
  const sourceHasSeparation = /\bfirst\b[\s\S]{0,160}\b(?:then|after that|finally)\b/i.test(sourceText) ||
    /\bkeep\b[^.?!\n]{0,50}\b(?:separate|distinct)\b/i.test(sourceText)

  if (!sourceHasSeparation) {
    return false
  }

  return !/\b(?:first|then|after that|finally|separate|distinct|stage|step)\b/i.test(output)
}

function looksLikePromptInstruction(text: string): boolean {
  const taskVerbMatches = text.match(/\b(?:analyze|identify|draft|write|create|explain|compare|summarize|review|improve|fix|rewrite|generate|categorize|prioritize|provide|organize|outline|build|plan|prepare|extract|separate|classify|refine|polish|clean|turn|transform|use|read|tell|look|sort)\b/gi)?.length ?? 0
  return taskVerbMatches >= 2 || /\b(?:prompt|ai|use these|do not|help me|i need|i want you to)\b/i.test(text)
}

function extractDeliverables(text: string): string[] {
  const normalized = normalizeForCompare(text)
  const deliverables = new Set<string>()
  const patterns: Array<[string, RegExp]> = [
    ['checklist', /\bchecklist\b/],
    ['memo', /\bmemo\b/],
    ['faq', /\bfaq\b/],
    ['summary', /\bsummary\b/],
    ['update', /\bupdate\b/],
    ['email', /\bemail\b/],
    ['table', /\btable\b/],
    ['recommendation', /\brecommendation\b/],
    ['questions', /\bquestions?\b/],
  ]

  for (const [deliverable, pattern] of patterns) {
    if (pattern.test(normalized)) {
      deliverables.add(deliverable)
    }
  }

  return Array.from(deliverables)
}

function normalizeForCompare(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

const stopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'be',
  'but',
  'for',
  'have',
  'in',
  'is',
  'keep',
  'mind',
  'much',
  'must',
  'not',
  'of',
  'on',
  'or',
  'some',
  'the',
  'two',
  'to',
  'with',
])

function significantTerms(text: string): string[] {
  return normalizeForCompare(text)
    .split(/\s+/)
    .filter((word) => word.length > 1 && !stopWords.has(word))
    .map(canonicalTerm)
}

function canonicalTerm(word: string): string {
  if (word === 'accuracy' || word === 'accurate' || word === 'correctness' || word === 'correct' || word === 'wrong') {
    return 'accur'
  }
  if (word === 'ops' || word === 'operational') {
    return 'oper'
  }
  if (word === 'low') {
    return 'limited'
  }
  if (word === 'desirable' || word === 'mandatory' || word === 'optional') {
    return 'optionality'
  }
  if (word === 'queries') {
    return 'query'
  }
  if (word === 'dashboards') {
    return 'dashboard'
  }
  if (word === 'reports') {
    return 'report'
  }
  if (word === 'growing') {
    return 'grow'
  }
  return word
}
