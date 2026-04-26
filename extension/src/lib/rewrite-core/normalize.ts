import type { SourceMode } from './types'

const invisibleChars = /[\u200b\u200c\u200d\ufeff]/g

export type NormalizedSource = {
  text: string
  sourceMode: SourceMode
}

export function normalizeSourceText(sourceText: string): NormalizedSource {
  const text = sourceText
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(invisibleChars, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    text,
    sourceMode: detectSourceMode(text),
  }
}

export function detectSourceMode(text: string): SourceMode {
  const normalized = text.trim()
  if (!normalized) {
    return 'note'
  }

  const taskVerbMatches = normalized.match(/\b(?:analyze|identify|draft|write|create|explain|compare|summarize|review|improve|fix|rewrite|generate|categorize|prioritize|provide|organize|outline|build|plan|prepare|extract|separate|classify|refine|polish|clean|turn|transform|use|read|tell|look|sort)\b/gi)?.length ?? 0
  const hasListMarkers = /(?:^|\n)\s*(?:[-*]|\d+[.)])\s+\S/.test(normalized)
  const hasSequencing = /\b(?:first|then|after that|finally|before|do not solve yet|wait for me)\b/i.test(normalized)
  const hasMessageSignal = /\b(?:hi|hello|hey|thanks|regards|best,|quick update|following up)\b/i.test(normalized)
  const hasPromptSignal = /\b(?:prompt|ai|chatgpt|claude|gemini|use the|do not|please|help me|i need|i want you to|can you|could you)\b/i.test(normalized)

  if (hasListMarkers && (hasSequencing || taskVerbMatches >= 3)) {
    return 'mixed task list'
  }

  if (hasMessageSignal && taskVerbMatches <= 1 && !hasPromptSignal) {
    return 'message'
  }

  if (taskVerbMatches >= 2 || hasPromptSignal) {
    return 'prompt'
  }

  return 'note'
}

