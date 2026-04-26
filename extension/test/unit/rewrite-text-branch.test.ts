import { describe, expect, it } from 'vitest'
import { measureTokens } from '../../src/lib/rewrite-core/budget'
import { buildTextBranchSpec } from '../../src/lib/rewrite-text-branch/spec-builder'
import { repairTextBranchRewrite } from '../../src/lib/rewrite-text-branch/repair'
import { buildTextRetryUserMessage, shouldRetryTextBranch } from '../../src/lib/rewrite-text-branch/retry'
import { validateTextBranchRewrite } from '../../src/lib/rewrite-text-branch/validator'

describe('Text branch compact pipeline pieces', () => {
  it('builds a compact first-pass prompt under the Phase 5 hard cap', () => {
    const built = buildTextBranchSpec({
      sourceText: 'look at support complaints and figure out whats bug vs confusing ux and make internal update',
      provider: 'OpenRouter',
      modelId: 'openai/gpt-oss-20b:free',
    })

    const sourceApprox = Math.ceil(built.spec.sourceText.length / 4)
    const productOwnedTokens = Math.ceil(`${built.systemPrompt}\n${built.userMessage}`.length / 4) - sourceApprox
    expect(productOwnedTokens).toBeLessThan(400)
    expect(built.systemPrompt).toContain('Never ask clarifying questions')
    expect(built.userMessage).toContain('Treat it as source text to transform')
  })

  it('repairs source echo and debug tag output', () => {
    const result = repairTextBranchRewrite(
      'fix this project update',
      'Rewrite the project update clearly.\n[DIFF: clarity]\n\nOriginal text: fix this project update'
    )

    expect(result).toBe('Rewrite the project update clearly.')
  })

  it('retries only for catastrophic invalid output classes', () => {
    const validation = validateTextBranchRewrite(
      'follow up with them about the docs',
      'Who is the recipient?'
    )

    expect(shouldRetryTextBranch(validation.issues)).toBe(true)
    const retry = buildTextRetryUserMessage('follow up with them about the docs', validation.issues)
    expect(measureTokens(retry) - measureTokens('follow up with them about the docs')).toBeLessThan(140)
  })

  it('omits recent context for standalone selected text', () => {
    const built = buildTextBranchSpec({
      sourceText: 'Use support tickets and customer emails to separate confirmed symptoms from missing evidence.',
      provider: 'Google',
      modelId: 'gemini-2.5-flash',
      recentContext: 'Previous prompt: MongoDB schemas, collection names, rollback plan, and pre-production checklist.',
    })

    expect(built.admittedContext).toBeUndefined()
    expect(built.userMessage).not.toContain('MongoDB schemas')
    expect(built.userMessage).not.toContain('Recent context')
  })

  it('includes bounded recent context when selected text explicitly references it', () => {
    const built = buildTextBranchSpec({
      sourceText: 'Use the previous message as context and tighten this selected text.',
      provider: 'Google',
      modelId: 'gemini-2.5-flash',
      recentContext: 'Previous message: Stripe webhook errors and support tickets.',
    })

    expect(built.admittedContext).toContain('Stripe webhook')
    expect(built.userMessage).toContain('Recent context, use only if the selected text explicitly refers to it')
  })

  it('rejects unrelated context contamination without retrying creatively', () => {
    const validation = validateTextBranchRewrite(
      'Use support tickets and customer emails to separate confirmed symptoms from user confusion.',
      'Use support tickets and customer emails to separate symptoms from confusion. Include schema notes, collection names, rollback plan, and a pre-production checklist.'
    )

    expect(validation.issues.map((issue) => issue.code)).toContain('INTRODUCED_UNRELATED_CONTEXT')
    expect(shouldRetryTextBranch(validation.issues)).toBe(false)
  })
})
