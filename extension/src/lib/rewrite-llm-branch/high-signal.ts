import type { ValidationIssue } from '../rewrite-core/types'

export type LlmHighSignalIntent = {
  personas: string[]
  toneCues: string[]
  naturalLanguageConstraints: string[]
  evidenceSources: string[]
  namedDeliverables: string[]
  userIdeas: string[]
  compositeWorkflow?: string
}

const toneCuePatterns: Array<[string, RegExp]> = [
  ['sharp', /\bsharp\b/i],
  ['weird', /\b(?:weird|slightly weird)\b/i],
  ['direct', /\bdirect\b/i],
  ['practical', /\bpractical\b/i],
  ['calm', /\bcalm\b/i],
  ['honest', /\bhonest\b/i],
  ['technical', /\btechnical\b/i],
  ['high standards', /\bhigh standards\b/i],
  ['human', /\bhuman\b/i],
  ['lean', /\blean\b/i],
  ['non-fluffy', /\b(?:non-fluffy|not fluffy|no fluff|avoid corporate fluff)\b/i],
  ['urgent', /\b(?:urgent|urgency|fast)\b/i],
]

const naturalConstraintPatterns: Array<[string, RegExp]> = [
  ['avoid corporate fluff', /\bavoid corporate fluff\b/i],
  ['not startup bro bullshit', /\bnot startup bro bullshit\b/i],
  ['no generic AI assistant garbage', /\bno generic ai assistant garbage\b/i],
  ['no excited to share', /\bno excited to share\b/i],
  ['not LinkedIn sludge', /\bnot linkedin sludge\b/i],
  ['do not make up business details', /\b(?:dont|don't|do not)\s+make up\s+(?:a\s+)?business\b/i],
  ['use only what I give it', /\buse only what i give (?:it|you)\b/i],
  ['do not oversell the company', /\bdo not oversell the company\b/i],
  ['do not lead with clear cookies', /\b(?:dont|don't|do not)\s+lead with clear cookies\b/i],
  ['do not pretend the mess is cleaner than it is', /\bwithout pretending the mess is cleaner than it is\b/i],
  ['do not soften it', /\bdo not soften it\b/i],
  ['do not invent missing details', /\b(?:do not|don't|dont|never|avoid)\s+(?:invent|make up)\b[^.?!\n]{0,60}\b(?:details|facts|numbers|business|specifics)\b/i],
]

const evidenceSourcePatterns: Array<[string, RegExp]> = [
  ['API logs', /\bapi logs\b/i],
  ['support tickets', /\bsupport tickets\b/i],
  ['screenshots', /\bscreenshots\b/i],
  ['Slack notes', /\bslack notes\b/i],
  ['customer complaints', /\bcustomer complaints\b/i],
  ['auth logs', /\bauth logs\b/i],
  ['cookie settings', /\bcookie settings\b/i],
  ['session middleware', /\bsession middleware\b/i],
  ['recent deploy diff', /\brecent deploy diff\b/i],
  ['slides', /\bslides\b/i],
  ['handout', /\bhandout\b/i],
  ['sample code', /\bsample code\b/i],
  ['churn numbers', /\bchurn\b/i],
  ['deal numbers', /\bdeal\b/i],
  ['usage numbers', /\busage numbers?\b/i],
]

const deliverablePatterns: Array<[string, RegExp]> = [
  ['root-cause buckets', /\broot[- ]cause buckets\b/i],
  ['missing evidence', /\bmissing evidence\b/i],
  ['team update', /\bteam update\b/i],
  ['risks', /\brisks?\b/i],
  ['execution plan', /\bexecution plan\b/i],
  ['first 100 customers', /\bfirst 100 customers\b/i],
  ['B2B vs B2C', /\bb2b\b[\s\S]{0,20}\bb2c\b/i],
  ['migration stress test plan', /\bmigration stress test plan\b/i],
  ['what could break', /\bwhat could break\b/i],
  ['evidence to gather', /\bevidence to gather\b/i],
  ['checks before production', /\bchecks?\b[\s\S]{0,60}\bproduction\b/i],
  ['what went wrong', /\bwhat went wrong\b/i],
  ['what improved', /\bwhat improved\b/i],
  ['next actions', /\bnext actions\b/i],
  ['investor help', /\binvestor help\b/i],
  ['ranked hypotheses', /\branked hypotheses\b/i],
  ['prove/disprove evidence', /\bprove\/disprove evidence\b/i],
  ['exact commands/checks', /\bexact (?:next )?commands?\/checks\b/i],
  ['Founding Designer job post', /\bfounding designer\b[\s\S]{0,30}\bjob post\b/i],
  ['senior product thinking', /\bsenior product thinking\b/i],
  ['UI craft', /\bui craft\b/i],
  ['compensation, location, and remote policy', /\bcompensation\b[\s\S]{0,80}\blocation\b[\s\S]{0,80}\bremote policy\b/i],
]

export function extractLlmHighSignalIntent(sourceText: string): LlmHighSignalIntent {
  const intent: LlmHighSignalIntent = {
    personas: [],
    toneCues: [],
    naturalLanguageConstraints: [],
    evidenceSources: [],
    namedDeliverables: [],
    userIdeas: [],
  }

  addPersonas(intent.personas, sourceText)
  addPatternMatches(intent.toneCues, sourceText, toneCuePatterns)
  addPatternMatches(intent.naturalLanguageConstraints, sourceText, naturalConstraintPatterns)
  addPatternMatches(intent.evidenceSources, sourceText, evidenceSourcePatterns)
  addPatternMatches(intent.namedDeliverables, sourceText, deliverablePatterns)
  addUserIdeas(intent.userIdeas, sourceText)

  const workflow = extractCompositeWorkflow(sourceText)
  if (workflow) {
    intent.compositeWorkflow = workflow
  }

  return intent
}

export function formatHighSignalIntentLines(intent: LlmHighSignalIntent): string[] {
  const lines: string[] = []
  pushLimited(lines, 'Preserve role', intent.personas)
  pushLimited(lines, 'Preserve tone', intent.toneCues)
  pushLimited(lines, 'Preserve constraints', intent.naturalLanguageConstraints)
  pushLimited(lines, 'Preserve evidence', intent.evidenceSources)
  pushLimited(lines, 'Preserve deliverables', intent.namedDeliverables)
  pushLimited(lines, 'Preserve user ideas', intent.userIdeas)
  if (intent.compositeWorkflow) {
    lines.push(`Workflow: ${intent.compositeWorkflow}`)
  }
  return lines.slice(0, 10)
}

export function validateHighSignalIntent(sourceText: string, output: string): ValidationIssue[] {
  const intent = extractLlmHighSignalIntent(sourceText)
  const issues: ValidationIssue[] = []

  for (const persona of intent.personas) {
    if (!containsConcept(output, persona)) {
      issues.push(issue('DROPPED_PERSONA', `Missing: ${persona}`))
    }
  }

  for (const cue of intent.toneCues) {
    if (!containsToneCue(output, cue)) {
      issues.push(issue('DROPPED_TONE_CUE', `Missing: ${cue}`))
    }
  }

  for (const constraint of intent.naturalLanguageConstraints) {
    if (!containsConstraint(output, constraint)) {
      issues.push(issue('DROPPED_NATURAL_LANGUAGE_CONSTRAINT', `Missing: ${constraint}`))
    }
  }

  for (const idea of intent.userIdeas) {
    if (!containsConcept(output, idea)) {
      issues.push(issue('DROPPED_USER_IDEA', `Missing: ${idea}`))
    }
  }

  for (const item of [...intent.evidenceSources, ...intent.namedDeliverables]) {
    if (!containsConcept(output, item)) {
      issues.push(issue('DROPPED_DELIVERABLE', `Missing: ${item}`))
    }
  }

  if (intent.compositeWorkflow && !preservesCompositeWorkflow(output)) {
    issues.push(issue('BROKEN_COMPOSITE_DIRECTIVE', `Missing workflow: ${intent.compositeWorkflow}`))
  }

  return collapseDuplicateIssues(issues)
}

function addPersonas(personas: string[], sourceText: string): void {
  for (const pattern of [
    /\b(?:act as|be)\s+(?:an?\s+)?([^.?!\n]{3,90}?(?:engineer|expert|lawyer|designer|debugger|writer|advisor|strategist|architect|specialist|operator))\b/gi,
    /\b(?:force|make|tell)\s+(?:the\s+)?(?:llm|ai|model|assistant)\s+to\s+be\s+(?:an?\s+)?([^.?!\n]{3,90})/gi,
  ]) {
    for (const match of sourceText.matchAll(pattern)) {
      addUnique(personas, cleanConcept(match[1]))
    }
  }

  const knowsMatch = sourceText.match(/\bfor a better (?:llm|ai|model|assistant) that knows ([a-z0-9 .+/#-]{2,40})/i)
  if (knowsMatch) {
    addUnique(personas, `${cleanConcept(knowsMatch[1])} expert`)
  }

  if (/\bexpert systems engineer\b/i.test(sourceText)) {
    addUnique(personas, 'expert systems engineer')
  }
  if (/\bmongodb\b/i.test(sourceText)) {
    addUnique(personas, 'MongoDB migration engineer')
  }
  if (/\brandom logouts?\b|\bauth logs\b|\bsession middleware\b/i.test(sourceText)) {
    addUnique(personas, 'senior auth/debugging engineer')
  }
  if (/\binvestor update\b/i.test(sourceText)) {
    addUnique(personas, 'investor update writer')
  }
}

function addUserIdeas(ideas: string[], sourceText: string): void {
  const ideasMatch = sourceText.match(/\bideas? like ([^.?!\n]+)/i)
  if (ideasMatch) {
    for (const item of ideasMatch[1].split(/\s*(?:,| and | but )\s*/i)) {
      const cleaned = cleanConcept(item)
      if (cleaned && !/\b(?:dont|don't|do not)\b/i.test(cleaned)) {
        addUnique(ideas, cleaned)
      }
    }
  }
  if (/\blinkedin ads\b/i.test(sourceText)) {
    addUnique(ideas, 'LinkedIn ads')
  }
  if (/\bcold outreach\b/i.test(sourceText)) {
    addUnique(ideas, 'cold outreach')
  }
}

function extractCompositeWorkflow(sourceText: string): string | undefined {
  if (/\bask\b[\s\S]{0,120}\bfirst\b[\s\S]{0,160}\bthen\b/i.test(sourceText)) {
    return 'ask for critical missing context first, then produce the requested artifact'
  }
  if (/\bask\b[\s\S]{0,120}\bbefore\b[\s\S]{0,80}\b(?:building|drafting|creating|finalizing|proceeding)\b/i.test(sourceText)) {
    return 'ask for critical missing context before building the requested artifact'
  }
  if (/\bfirst\b[\s\S]{0,160}\b(?:wait for me|wait)\b[\s\S]{0,120}\bbefore\b/i.test(sourceText)) {
    return 'perform the first analysis stage, then wait before final work'
  }
  return undefined
}

function addPatternMatches(target: string[], sourceText: string, patterns: Array<[string, RegExp]>): void {
  for (const [value, pattern] of patterns) {
    if (pattern.test(sourceText)) {
      addUnique(target, value)
    }
  }
}

function pushLimited(lines: string[], label: string, values: string[]): void {
  if (values.length > 0) {
    lines.push(`${label}: ${values.slice(0, 6).join(', ')}`)
  }
}

function containsConcept(output: string, concept: string): boolean {
  const normalizedOutput = normalize(output)
  const terms = normalize(concept)
    .split(' ')
    .filter((term) => term.length > 2 && !['and', 'the', 'for', 'with'].includes(term))

  if (terms.length === 0) {
    return true
  }

  return terms.every((term) => normalizedOutput.includes(term))
}

function containsToneCue(output: string, cue: string): boolean {
  const normalizedOutput = normalize(output)
  if (cue === 'non-fluffy') {
    return /\b(?:non fluffy|no fluff|avoid fluff|corporate fluff)\b/i.test(normalizedOutput)
  }
  if (cue === 'urgent') {
    return /\b(?:urgent|urgency|fast|immediate)\b/i.test(normalizedOutput)
  }
  return containsConcept(output, cue)
}

function containsConstraint(output: string, constraint: string): boolean {
  const normalizedOutput = normalize(output)
  if (constraint === 'do not make up business details') {
    return /\b(?:do not|dont|don t|never|avoid)\b[\w ]{0,30}\b(?:make up|invent)\b[\w ]{0,40}\bbusiness\b/.test(normalizedOutput)
  }
  if (constraint === 'no generic AI assistant garbage') {
    return /\b(?:generic ai assistant|no generic|avoid generic)\b/.test(normalizedOutput)
  }
  if (constraint === 'no excited to share') {
    return /\bexcited to share\b/.test(normalizedOutput) && /\b(?:no|do not|dont|don t|avoid)\b/.test(normalizedOutput)
  }
  if (constraint === 'do not lead with clear cookies') {
    return /\bclear cookies\b/.test(normalizedOutput) && /\b(?:do not|dont|don t|avoid|not)\b/.test(normalizedOutput)
  }
  if (constraint === 'do not oversell the company') {
    return /\b(?:do not|dont|don t|avoid)\b[\w ]{0,30}\boversell\b/.test(normalizedOutput)
  }
  return containsConcept(output, constraint)
}

function preservesCompositeWorkflow(output: string): boolean {
  const normalizedOutput = normalize(output)
  const hasQuestionGate = /\b(?:ask|start with|first)\b[\w ]{0,80}\b(?:questions|context|numbers|details|compensation|location|remote|b2b|b2c)\b/.test(normalizedOutput)
  const hasLaterAction = /\b(?:then|after|once|before finalizing|before building)\b[\w ]{0,120}\b(?:build|draft|create|write|produce|plan|finalize|execution plan|artifact)\b/.test(normalizedOutput)
  const hasWaitBeforeFinal = /\b(?:wait|do not solve|before solving|before final)\b/.test(normalizedOutput)
  return (hasQuestionGate && hasLaterAction) || hasWaitBeforeFinal
}

function issue(code: ValidationIssue['code'], message: string): ValidationIssue {
  return { code, message, severity: 'error' }
}

function collapseDuplicateIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>()
  return issues.filter((item) => {
    const key = `${item.code}:${item.message}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function addUnique(target: string[], value: string): void {
  const cleaned = cleanConcept(value)
  if (cleaned && !target.some((item) => normalize(item) === normalize(cleaned))) {
    target.push(cleaned)
  }
}

function cleanConcept(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[,.]+$/g, '')
    .trim()
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/['’]/g, ' ').replace(/[^a-z0-9+/]+/g, ' ').replace(/\s+/g, ' ').trim()
}

