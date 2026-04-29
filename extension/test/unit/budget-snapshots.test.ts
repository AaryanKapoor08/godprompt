import { describe, expect, it } from 'vitest'
import { buildGemmaMetaPromptWithIntensity } from '../../src/lib/gemma-legacy/llm-branch'
import { buildGemmaSelectedTextMetaPrompt } from '../../src/lib/gemma-legacy/text-branch'
import { assertBudget, BudgetExceededError, measureTokens } from '../../src/lib/rewrite-core/budget'
import {
  PROMPT_BUILD_MODE,
  resolvePromptBuildMode,
  selectPromptContent,
} from '../../src/lib/rewrite-core/prompt-mode'
import { buildLlmBranchSpec } from '../../src/lib/rewrite-llm-branch/spec-builder'
import { buildTextBranchSpec } from '../../src/lib/rewrite-text-branch/spec-builder'

describe('token budget seam', () => {
  it('measures tokens deterministically', () => {
    const text = 'Use the API logs, support tickets, and screenshots.\n\nReturn plain text only.'

    expect(measureTokens(text)).toBe(measureTokens(text))
    expect(measureTokens('')).toBe(0)
  })

  it('throws a structured error when a hard cap is exceeded', () => {
    expect(() => assertBudget({ kind: 'llm-first', tokens: 1001, hardCap: 1000 })).toThrow(BudgetExceededError)

    try {
      assertBudget({ kind: 'llm-first', tokens: 1001, hardCap: 1000 })
    } catch (error) {
      expect(error).toMatchObject({
        kind: 'llm-first',
        tokens: 1001,
        hardCap: 1000,
      })
    }
  })

  it('returns a warning when tokens are outside the advisory target range', () => {
    expect(assertBudget({
      kind: 'text-first',
      tokens: 410,
      hardCap: 500,
      target: { min: 280, max: 360 },
    })).toEqual({
      ok: true,
      warning: {
        kind: 'text-first',
        tokens: 410,
        target: { min: 280, max: 360 },
      },
    })
  })

  it('records the current production prompt token baseline', () => {
    const llmSpec = buildLlmBranchSpec({
      sourceText: 'Use the API logs and support tickets for a hard triage pass. Draft an internal update.',
      provider: 'Google',
      modelId: 'gemini-2.5-flash',
      platform: 'chatgpt',
      isNewConversation: true,
      conversationLength: 0,
    })
    const textSpec = buildTextBranchSpec({
      sourceText: 'look at support complaints and figure out whats bug vs confusing ux and make internal update',
      provider: 'Google',
      modelId: 'gemini-2.5-flash',
    })
    const baseline = {
      llmFirst: measureTokens(llmSpec.systemPrompt),
      textFirst: measureTokens(textSpec.systemPrompt),
      gemmaLlm: measureTokens(buildGemmaMetaPromptWithIntensity('chatgpt', true, 0, 20)),
      gemmaText: measureTokens(buildGemmaSelectedTextMetaPrompt(20)),
    }

    expect(baseline.llmFirst).toBeGreaterThan(0)
    expect(baseline.textFirst).toBeGreaterThan(0)
    expect(baseline.gemmaLlm).toBeGreaterThan(0)
    expect(baseline.gemmaText).toBeGreaterThan(0)
    expect(baseline).toMatchInlineSnapshot(`
      {
        "gemmaLlm": 246,
        "gemmaText": 867,
        "llmFirst": 171,
        "textFirst": 233,
      }
    `)
  })
})

describe('prompt build mode', () => {
  it('defaults to production unless debug is explicitly selected', () => {
    expect(resolvePromptBuildMode(undefined)).toBe('production')
    expect(resolvePromptBuildMode('production')).toBe('production')
    expect(resolvePromptBuildMode('anything-else')).toBe('production')
    expect(resolvePromptBuildMode('debug')).toBe('debug')
  })

  it('excludes debug-only prompt content in production mode', () => {
    expect(selectPromptContent('production', 'core contract', '\nDEBUG EXAMPLE')).toBe('core contract')
    expect(selectPromptContent('debug', 'core contract', '\nDEBUG EXAMPLE')).toBe('core contract\nDEBUG EXAMPLE')
    expect(PROMPT_BUILD_MODE).toBe('production')
  })
})
