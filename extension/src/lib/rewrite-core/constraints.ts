import { detectSourceMode } from './normalize'
import type { ConstraintKind, ConstraintSet, ExtractedConstraint } from './types'

type ConstraintPattern = {
  kind: ConstraintKind
  value: string
  pattern: RegExp
}

const constraintPatterns: ConstraintPattern[] = [
  { kind: 'plain-text-only', value: 'plain text only', pattern: /\bplain text only\b/i },
  { kind: 'no-markdown', value: 'no markdown', pattern: /\b(?:no|without|do not use|don't use)\s+markdown\b/i },
  { kind: 'no-bold', value: 'no bold', pattern: /\b(?:no|without|do not use|don't use)\s+(?:bold|bold labels|bolding)\b/i },
  { kind: 'ask-questions-first', value: 'ask questions first', pattern: /\b(?:ask|start with)\s+(?:me\s+)?(?:up to\s+)?\d?\s*(?:concise\s+)?clarifying questions?\s+first\b/i },
  { kind: 'ask-questions-first', value: 'ask questions before proceeding', pattern: /\bask\s+(?:clarifying\s+)?questions?\s+before\s+(?:proceeding|answering|the final|continuing)\b/i },
  { kind: 'no-questions', value: 'do not ask clarifying questions', pattern: /\b(?:do not|don't|never)\s+ask\s+clarifying questions?\b/i },
  { kind: 'do-not-solve-yet', value: 'do not solve yet', pattern: /\b(?:do not|don't|never)\s+solve\b[^.?!\n]{0,40}\b(?:yet|now)\b/i },
  { kind: 'keep-tasks-separate', value: 'keep tasks separate', pattern: /\b(?:keep|leave)\s+(?:the\s+)?(?:tasks|sections|steps)\s+separate\b/i },
  { kind: 'preserve-deliverables', value: 'preserve deliverables', pattern: /\b(?:deliverables?|provide|include|produce|return)(?:\s+(?:include|the following))?\s*(?::|\d)/i },
  { kind: 'word-limit', value: 'word limit', pattern: /\b(?:under|within|no more than|at most|max(?:imum)?(?: of)?|limit(?:ed)? to)\s+\d+\s+words?\b/i },
  { kind: 'count-limit', value: 'count limit', pattern: /\b(?:exactly|only|up to|at most|no more than)\s+\d+\s+(?:questions?|bullets?|sections?|steps?|paragraphs?|items?)\b/i },
  { kind: 'no-invention', value: 'do not invent details', pattern: /\b(?:do not|don't|never|avoid)\s+invent(?:ing)?\s+(?:missing\s+)?(?:details|facts|numbers|names|dates|causes|information)\b/i },
  { kind: 'no-invention', value: 'state missing evidence', pattern: /\b(?:if|when)\s+(?:evidence|information|context)\s+is\s+missing\b/i },
  { kind: 'staged-workflow', value: 'staged workflow', pattern: /\bfirst\b[\s\S]{0,160}\b(?:then|after that|finally|wait for me)\b/i },
  { kind: 'no-placeholders', value: 'no placeholders', pattern: /\b(?:no|never use|without|do not use|don't use)\s+(?:placeholders?|templates?|fill-in-the-blank)\b/i },
]

export function extractConstraints(sourceText: string): ConstraintSet {
  const constraints: ExtractedConstraint[] = []
  const seen = new Set<string>()

  for (const item of constraintPatterns) {
    for (const match of sourceText.matchAll(toGlobalPattern(item.pattern))) {
      if (match.index === undefined || !match[0]) {
        continue
      }

      const key = `${item.kind}:${item.value}:${match.index}`
      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      constraints.push({
        kind: item.kind,
        value: item.value,
        span: {
          start: match.index,
          end: match.index + match[0].length,
          text: match[0],
        },
      })
    }
  }

  return {
    sourceMode: detectSourceMode(sourceText),
    constraints,
    preserveTokens: extractPreserveTokens(sourceText),
  }
}

function toGlobalPattern(pattern: RegExp): RegExp {
  const flags = new Set(pattern.flags.split(''))
  flags.add('g')
  return new RegExp(pattern.source, Array.from(flags).join(''))
}

const commonCapitalizedWords = new Set([
  'A',
  'An',
  'And',
  'Do',
  'First',
  'If',
  'I',
  'The',
  'Then',
  'When',
  'Constraints',
])

const salientIndicators = /\b(?:small|limited|ops time|operational time|near-real-time|near real time|optional|mandatory|required|slow|growing|accurate|accuracy|cannot be wrong|customer-facing|customer facing)\b/i
const knownTechnologyTokens = /\b(?:postgres|clickhouse|bigquery|mongodb)\b/gi

function extractPreserveTokens(sourceText: string): string[] {
  const tokens: string[] = []
  const seen = new Set<string>()

  const addToken = (token: string) => {
    const cleaned = token.trim().replace(/\s+/g, ' ')
    const key = cleaned.toLowerCase()
    if (cleaned.length < 2 || seen.has(key)) {
      return
    }
    seen.add(key)
    tokens.push(cleaned)
  }

  for (const match of sourceText.matchAll(/\b[A-Z][A-Za-z0-9]*(?:[A-Z][A-Za-z0-9]+)?\b/g)) {
    if (match.index === undefined || !match[0]) {
      continue
    }
    if (commonCapitalizedWords.has(match[0]) || isSentenceStart(sourceText, match.index)) {
      continue
    }
    addToken(match[0])
  }

  for (const match of sourceText.matchAll(knownTechnologyTokens)) {
    if (match[0]) {
      addToken(match[0])
    }
  }

  for (const clause of extractClauses(sourceText)) {
    const cleaned = cleanSalientClause(clause)
    if (salientIndicators.test(cleaned)) {
      addToken(cleaned)
    }
  }

  return tokens
}

function isSentenceStart(text: string, index: number): boolean {
  const before = text.slice(0, index).trimEnd()
  return before.length === 0 || /[.?!]\s*$/.test(before)
}

const constraintListAnchors = [
  /\b(?:constraints?|hard constraints?|requirements?|hard requirements?)\s*:\s*([^.?!\n]+)/gi,
  /\bkeep\s+([^.?!\n]+?)\s+in\s+mind\b/gi,
]

function extractConstraintListSegments(sourceText: string): string[] {
  const segments: string[] = []
  for (const pattern of constraintListAnchors) {
    for (const match of sourceText.matchAll(pattern)) {
      if (match[1]) {
        segments.push(match[1])
      }
    }
  }
  return segments
}

function extractClauses(sourceText: string): string[] {
  return extractConstraintListSegments(sourceText).flatMap((segment) =>
    segment.split(/[,\n;]+/).flatMap((part) => part.split(/\s+\band\b\s+/i))
  )
}

function cleanSalientClause(clause: string): string {
  return clause
    .replace(/^(?:and|or|but)\s+/i, '')
    .replace(/[.?!]+$/g, '')
    .trim()
}
