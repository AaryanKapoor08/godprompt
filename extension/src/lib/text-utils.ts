export function stripDiffTags(text: string): { cleanText: string; diffLabel: string | null } {
  // Extract the last DIFF tag to use as the label
  const tags = [...text.matchAll(/\[DIFF:\s*([^\]]*)\]/g)]
  const lastTag = tags.length > 0 ? tags[tags.length - 1][1].trim() : null

  // Remove all DIFF tags globally
  const cleanText = text.replace(/\[DIFF:[\s\S]*?\]/g, '')

  return {
    cleanText,
    diffLabel: lastTag || null,
  }
}

export function cleanEnhancedPromptOutput(text: string, sourcePrompt: string): string {
  const normalizedSource = normalizeText(sourcePrompt)
  const preserveMarkdown = requestsLiteralMarkdownFormatting(normalizedSource)
  const withoutDecorativeEmphasis = preserveMarkdown ? text : stripDecorativeMarkdownEmphasis(text)
  return normalizeText(withoutDecorativeEmphasis)
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line
      .replace(/[ \t]+/g, ' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .trimEnd()
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripDecorativeMarkdownEmphasis(text: string): string {
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
