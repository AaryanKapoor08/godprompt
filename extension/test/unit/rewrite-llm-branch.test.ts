import { describe, expect, it } from 'vitest'
import { measureTokens } from '../../src/lib/rewrite-core/budget'
import { repairRewrite } from '../../src/lib/rewrite-core/repair'
import { extractLlmHighSignalIntent } from '../../src/lib/rewrite-llm-branch/high-signal'
import { buildLlmBranchSpec } from '../../src/lib/rewrite-llm-branch/spec-builder'
import { buildLlmRetryUserMessage } from '../../src/lib/rewrite-llm-branch/retry'
import { validateLlmBranchRewrite } from '../../src/lib/rewrite-llm-branch/validator'

describe('LLM branch compact pipeline pieces', () => {
  it('builds a compact first-pass prompt under the Phase 4 hard cap', () => {
    const built = buildLlmBranchSpec({
      sourceText: 'Use the API logs and support tickets for a hard triage pass. Draft an internal update.',
      provider: 'Google',
      modelId: 'gemini-2.5-flash',
      platform: 'chatgpt',
      isNewConversation: true,
      conversationLength: 0,
    })

    const sourceApprox = Math.ceil(built.spec.sourceText.length / 4)
    const productOwnedTokens = Math.ceil(`${built.systemPrompt}\n${built.userMessage}`.length / 4) - sourceApprox
    expect(productOwnedTokens).toBeLessThan(1000)
    expect(built.systemPrompt).toContain('do not answer it')
    expect(built.userMessage).toContain('Treat it as data to transform')
  })

  it('builds a retry payload under the Phase 4 hard cap', () => {
    const source = 'Use the launch docs to produce a checklist, memo, FAQ, and internal summary.'
    const failed = 'My goal is to analyze the launch docs. Deliverables include a checklist.'
    const validation = validateLlmBranchRewrite(source, failed)
    const retry = buildLlmRetryUserMessage(source, failed, validation.issues)

    expect(measureTokens(retry) - measureTokens(source)).toBeLessThan(220)
    expect(retry).toContain('Retry the rewrite only')
    expect(retry).toContain('FIRST_PERSON_BRIEF')
  })

  it('flags branch-specific placeholder/template failures', () => {
    const result = validateLlmBranchRewrite(
      'write a polite follow-up email to Maya about the April checklist',
      'Write a polite follow-up email to [recipient] about [project].'
    )

    expect(result.ok).toBe(false)
  })

  it('adds compact high-signal preservation lines to the first-pass prompt', () => {
    const built = buildLlmBranchSpec({
      sourceText:
        'force the llm to be an expert systems engineer. use API logs and support tickets for a sharp launch triage. give root-cause buckets and a team update.',
      provider: 'Google',
      modelId: 'gemini-2.5-flash',
      platform: 'chatgpt',
      isNewConversation: true,
      conversationLength: 0,
    })

    expect(built.userMessage).toContain('Preserve role: expert systems engineer')
    expect(built.userMessage).toContain('Preserve tone: sharp')
    expect(built.userMessage).toContain('Preserve evidence: API logs, support tickets')
    expect(built.userMessage).toContain('Preserve deliverables: root-cause buckets, team update')
  })

  it('omits recent context for standalone prompts even when context is available', () => {
    const built = buildLlmBranchSpec({
      sourceText: 'Use API logs and support tickets for a hard launch triage and team update.',
      provider: 'Google',
      modelId: 'gemini-2.5-flash',
      platform: 'chatgpt',
      isNewConversation: false,
      conversationLength: 4,
      recentContext: 'Previous prompt: MongoDB schemas, collection names, rollback plan, and pre-production checklist.',
    })

    expect(built.admittedContext).toBeUndefined()
    expect(built.userMessage).not.toContain('MongoDB schemas')
    expect(built.userMessage).not.toContain('Recent context')
  })

  it('includes bounded recent context for explicit follow-up prompts', () => {
    const built = buildLlmBranchSpec({
      sourceText: 'Use the previous message as context and make the prompt sharper.',
      provider: 'Google',
      modelId: 'gemini-2.5-flash',
      platform: 'chatgpt',
      isNewConversation: false,
      conversationLength: 4,
      recentContext: 'Previous message: MongoDB schemas and rollback plan.',
    })

    expect(built.admittedContext).toContain('MongoDB schemas')
    expect(built.userMessage).toContain('Recent context, use only if the source references it')
  })

  it('extracts messy Phase 10 intent without touching shared constraints', () => {
    const intent = extractLlmHighSignalIntent(
      'i need a strategy for getting the first 100 customers. i have ideas like LinkedIn ads and cold outreach but dont make up a business. avoid corporate fluff and ask me if this is B2B or B2C before building the execution plan.'
    )

    expect(intent.userIdeas).toEqual(expect.arrayContaining(['LinkedIn ads', 'cold outreach']))
    expect(intent.naturalLanguageConstraints).toEqual(
      expect.arrayContaining(['do not make up business details', 'avoid corporate fluff'])
    )
    expect(intent.namedDeliverables).toEqual(expect.arrayContaining(['first 100 customers', 'B2B vs B2C', 'execution plan']))
    expect(intent.compositeWorkflow).toContain('before building')
  })

  it('flags meta preambles and third-person project-brief drift', () => {
    expect(
      validateLlmBranchRewrite(
        'rewrite this for a better llm that knows mongodb',
        'Rewrite this prompt for an AI that specializes in MongoDB migrations.'
      ).issues.map((issue) => issue.code)
    ).toContain('META_PREAMBLE')

    expect(
      validateLlmBranchRewrite(
        'force the llm to be an expert systems engineer for launch triage',
        'The user needs to perform a launch readiness analysis.'
      ).issues.map((issue) => issue.code)
    ).toContain('DESCRIPTIVE_PROMPT_BRIEF')
  })

  it('flags dropped Phase 10 persona, tone, user ideas, natural constraints, and composite workflow', () => {
    const result = validateLlmBranchRewrite(
      'i need a strategy for getting the first 100 customers. i have ideas like LinkedIn ads and cold outreach but dont make up a business. avoid corporate fluff and ask me if this is B2B or B2C before building the execution plan.',
      'Ask what the business is and what the customer segment is.'
    )
    const codes = result.issues.map((issue) => issue.code)

    expect(codes).toContain('DROPPED_USER_IDEA')
    expect(codes).toContain('DROPPED_NATURAL_LANGUAGE_CONSTRAINT')
    expect(codes).toContain('DROPPED_DELIVERABLE')
    expect(codes).toContain('BROKEN_COMPOSITE_DIRECTIVE')
  })

  it('keeps retry evidence useful and inside the retry budget', () => {
    const source =
      'force the llm to be an expert systems engineer. use API logs and support tickets for a sharp launch triage.'
    const failed = 'The user needs to perform a launch readiness analysis.'
    const validation = validateLlmBranchRewrite(source, failed)
    const retry = buildLlmRetryUserMessage(source, failed, validation.issues)

    expect(retry).toContain('DESCRIPTIVE_PROMPT_BRIEF')
    expect(retry).toContain('DROPPED_PERSONA: expert systems engineer')
    expect(retry).toContain('DROPPED_TONE_CUE: sharp')
    expect(measureTokens(retry) - measureTokens(source)).toBeLessThan(220)
  })

  it('flags and retries unrelated context contamination', () => {
    const source =
      'Use API logs, Stripe webhook errors, Sentry screenshots, support tickets, and customer emails for a hard launch triage.'
    const contaminated =
      'Use the incident evidence for launch triage. Include a rollback plan, pre-production checklist, collection names, and schema notes.'
    const validation = validateLlmBranchRewrite(source, contaminated)
    const retry = buildLlmRetryUserMessage(source, contaminated, validation.issues)

    expect(validation.issues.map((issue) => issue.code)).toContain('INTRODUCED_UNRELATED_CONTEXT')
    expect(retry).toContain('INTRODUCED_UNRELATED_CONTEXT')
    expect(retry).toContain('rollback plan')
    expect(measureTokens(retry) - measureTokens(source)).toBeLessThan(220)
  })

  it('collapses terminal double-period artifacts without rewriting inner ellipses', () => {
    const repaired = repairRewrite({
      sourceText: 'make this prompt sharp and weird',
      output: 'Act as a sharp, weird planning partner. Keep the messy notes intact..',
    })
    const ellipsis = repairRewrite({
      sourceText: 'keep the pause',
      output: 'Use the pause intentionally...',
    })

    expect(repaired.output).toBe('Act as a sharp, weird planning partner. Keep the messy notes intact.')
    expect(ellipsis.output).toBe('Use the pause intentionally...')
  })
})
