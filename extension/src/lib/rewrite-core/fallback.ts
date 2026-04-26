import { normalizeSourceText } from './normalize'

export type ConservativeFallbackInput = {
  sourceText: string
}

export function buildConservativeFallback(input: ConservativeFallbackInput): string {
  const normalized = normalizeSourceText(input.sourceText).text
  const cleaned = normalized
    .replace(/\[DIFF:[\s\S]*?\]/gi, '')
    .replace(/\[NO_CHANGE\]/gi, '')
    .replace(/\[\s*[A-Za-z][A-Za-z0-9 _/-]{1,60}\s*\]/g, '')
    .replace(/\{\{?\s*[A-Za-z][A-Za-z0-9 _/-]{1,60}\s*\}?\}/g, '')
    .replace(/<\s*(?:recipient|project|date|topic|context|details|name|company|role|goal|audience|deadline|subject)[^>]{0,40}>/gi, '')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim()

  return cleaned || 'Rewrite the source text clearly while preserving its original intent.'
}

