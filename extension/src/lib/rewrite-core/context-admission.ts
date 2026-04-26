export type ContextAdmissionInput = {
  sourceText: string
  recentContext?: string
  maxChars?: number
}

const DEFAULT_MAX_RECENT_CONTEXT_CHARS = 2000

const explicitContextReferencePatterns: RegExp[] = [
  /\b(?:above|previous|earlier|prior|last)\s+(?:message|reply|answer|response|context|conversation|prompt|notes?|files?|docs?|documents?)\b/i,
  /\b(?:based on|using|use|from|given)\s+(?:the\s+)?(?:above|previous|earlier|prior|last)\b/i,
  /\b(?:continue|same as before|as before|like before|from before)\b/i,
  /\b(?:this|the)\s+(?:conversation|thread|chat|context)\b/i,
  /\b(?:use|using|based on)\s+(?:the\s+)?(?:context|thread|conversation|chat)\b/i,
  /\b(?:attached|uploaded|provided|previous)\s+(?:files?|docs?|documents?|screenshots?|notes?|logs?)\b/i,
  /\b(?:these|those)\s+(?:files?|docs?|documents?|screenshots?|notes?|logs?|messages?)\b/i,
]

export function shouldAdmitRecentContext(sourceText: string): boolean {
  return explicitContextReferencePatterns.some((pattern) => pattern.test(sourceText))
}

export function admitRecentContext(input: ContextAdmissionInput): string | undefined {
  const recentContext = input.recentContext?.trim()
  if (!recentContext || !shouldAdmitRecentContext(input.sourceText)) {
    return undefined
  }

  const maxChars = input.maxChars ?? DEFAULT_MAX_RECENT_CONTEXT_CHARS
  return recentContext.length > maxChars ? recentContext.slice(0, maxChars).trim() : recentContext
}
