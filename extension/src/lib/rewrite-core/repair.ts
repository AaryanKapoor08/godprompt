import { buildConservativeFallback } from './fallback'
import { normalizeSourceText } from './normalize'
import type { RepairOperation, RepairResult } from './types'

export type RepairRewriteInput = {
  sourceText: string
  output: string
  divergenceThreshold?: number
}

export function repairRewrite(input: RepairRewriteInput): RepairResult {
  const operations: RepairOperation[] = []
  const original = input.output
  let repaired = normalizeSourceText(original).text

  const withoutWrappers = stripDecorativeWrappers(repaired)
  if (withoutWrappers !== repaired) {
    operations.push({ class: 'cosmetic', description: 'stripped decorative wrappers' })
    repaired = withoutWrappers
  }

  const withoutMarkdownEmphasis = stripDecorativeMarkdownEmphasis(repaired, input.sourceText)
  if (withoutMarkdownEmphasis !== repaired) {
    operations.push({ class: 'cosmetic', description: 'stripped decorative markdown emphasis' })
    repaired = withoutMarkdownEmphasis
  }

  const withoutSourceEcho = stripSourceEcho(repaired)
  if (withoutSourceEcho !== repaired) {
    operations.push({ class: 'structural', description: 'removed source echo block' })
    repaired = withoutSourceEcho
  }

  const withoutBrief = stripLeadingFirstPersonBrief(repaired)
  if (withoutBrief !== repaired) {
    operations.push({ class: 'structural', description: 'removed leading first-person brief framing' })
    repaired = withoutBrief
  }

  const withoutDuplicateTail = removeDuplicateTrailingParagraph(repaired)
  if (withoutDuplicateTail !== repaired) {
    operations.push({ class: 'structural', description: 'removed duplicate trailing summary' })
    repaired = withoutDuplicateTail
  }

  const withNoPlaceholderConstraint = restoreNoPlaceholderConstraint(repaired, input.sourceText)
  if (withNoPlaceholderConstraint !== repaired) {
    operations.push({ class: 'substantive', description: 'restored no-placeholder constraint from source' })
    repaired = withNoPlaceholderConstraint
  }

  const threshold = input.divergenceThreshold ?? 0.75
  if (operations.length > 0 && normalizedEditDistance(original, repaired) > threshold) {
    return {
      output: buildConservativeFallback({ sourceText: input.sourceText }),
      changed: true,
      usedFallback: true,
      operations: [
        ...operations,
        { class: 'substantive', description: 'used conservative fallback after divergence threshold' },
      ],
    }
  }

  return {
    output: repaired,
    changed: repaired !== original,
    usedFallback: false,
    operations,
  }
}

function stripDecorativeWrappers(text: string): string {
  return text
    .replace(/^\s*(?:here(?:'s| is) the rewritten prompt:|rewritten prompt:|enhanced prompt:)\s*/i, '')
    .replace(/\[DIFF:[\s\S]*?\]/gi, '')
    .trim()
}

function stripDecorativeMarkdownEmphasis(text: string, sourceText: string): string {
  if (requestsLiteralMarkdownFormatting(sourceText)) {
    return text
  }

  return text
    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '$1')
    .replace(/__(?=\S)([^_\n]*?\S)__/g, '$1')
}

function requestsLiteralMarkdownFormatting(text: string): boolean {
  return /\b(?:markdown|gfm|github-flavored markdown|markdown table|markdown headings?|md table)\b/i.test(text)
    || /```/.test(text)
    || /^\s*#{1,6}\s/m.test(text)
    || /\*\*[^*\n]+\*\*/.test(text)
}

function stripSourceEcho(text: string): string {
  return text
    .replace(/\n{1,}(?:Original|Selected|Source|Input)\s+text\s*:\s*(?:"|“|```)?[\s\S]*$/i, '')
    .trim()
}

function stripLeadingFirstPersonBrief(text: string): string {
  const paragraphs = text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
  if (paragraphs.length < 2 || !/^(?:i am providing|i'm providing|i’m providing|my goal is|my primary need is)\b/i.test(paragraphs[0])) {
    return text
  }

  return paragraphs.slice(1).join('\n\n')
}

function removeDuplicateTrailingParagraph(text: string): string {
  const paragraphs = text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
  if (paragraphs.length < 2) {
    return text
  }

  const tail = paragraphs[paragraphs.length - 1]
  const body = paragraphs.slice(0, -1).join('\n\n')
  const tailTerms = significantTerms(tail)
  const bodyTerms = significantTerms(body)

  if (tailTerms.length < 5) {
    return text
  }

  const overlap = tailTerms.filter((term) => bodyTerms.includes(term)).length / tailTerms.length
  return overlap >= 0.8 ? body : text
}

function restoreNoPlaceholderConstraint(output: string, sourceText: string): string {
  if (!/\b(?:no|never use|without|do not use|don't use)\s+(?:placeholders?|templates?|fill-in-the-blank)\b/i.test(sourceText)) {
    return output
  }

  if (/\b(?:no|never use|without|do not use|don't use)\s+(?:placeholders?|templates?|fill-in-the-blank)\b/i.test(output)) {
    return output
  }

  const trimmed = output.trim()
  const separator = /[.!?]$/.test(trimmed) ? ' ' : '. '
  return `${trimmed}${separator}Do not use placeholders.`
}

function significantTerms(text: string): string[] {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'only', 'then', 'they', 'them', 'what'])
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 3 && !stopWords.has(term))
}

function normalizedEditDistance(left: string, right: string): number {
  const maxLength = Math.max(left.length, right.length)
  if (maxLength === 0) {
    return 0
  }

  return levenshtein(left, right) / maxLength
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  const current = Array.from({ length: right.length + 1 }, () => 0)

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      )
    }
    previous.splice(0, previous.length, ...current)
  }

  return previous[right.length]
}
