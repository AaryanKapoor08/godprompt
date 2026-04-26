import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { callOpenRouterCompletionAPI } from '../../src/lib/llm-client'
import { measureTokens } from '../../src/lib/rewrite-core/budget'
import { repairRewrite } from '../../src/lib/rewrite-core/repair'
import type { ValidationIssue } from '../../src/lib/rewrite-core/types'
import { buildLlmBranchSpec } from '../../src/lib/rewrite-llm-branch/spec-builder'
import { buildLlmRetryUserMessage } from '../../src/lib/rewrite-llm-branch/retry'
import { validateLlmBranchRewrite } from '../../src/lib/rewrite-llm-branch/validator'
import { OPENROUTER_PRIMARY_FREE_MODEL } from '../../src/lib/rewrite-openrouter/curation'
import { repairTextBranchRewrite } from '../../src/lib/rewrite-text-branch/repair'
import { buildTextRetryUserMessage, shouldRetryTextBranch } from '../../src/lib/rewrite-text-branch/retry'
import { buildTextBranchSpec } from '../../src/lib/rewrite-text-branch/spec-builder'
import { validateTextBranchRewrite } from '../../src/lib/rewrite-text-branch/validator'

type RegressionEntry = {
  id: string
  branch: 'LLM' | 'Text'
  source: string
  severity: 'regression-must-not-recur' | 'quality-target'
}

type EvalRow = {
  id: string
  branch: RegressionEntry['branch']
  severity: RegressionEntry['severity']
  passed: boolean
  issues: string[]
}

const entriesDir = fileURLToPath(new URL('./entries/', import.meta.url))
const reportPath = resolve(fileURLToPath(new URL('../../../codex/openrouter-primary-eval.md', import.meta.url)))
const maxTokens = 256
const minRequestSpacingMs = 4500
const apiKey = process.env.OPENROUTER_API_KEY?.trim()
let lastRequestAt = 0

function loadEntries(): RegressionEntry[] {
  return readdirSync(entriesDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .map((fileName) => {
      const raw = readFileSync(join(entriesDir, fileName), 'utf8')
      const parsed = JSON.parse(raw) as RegressionEntry
      expect(parsed.id).toBe(basename(fileName, '.json'))
      return parsed
    })
}

function corpusVersion(entries: RegressionEntry[]): string {
  const hash = createHash('sha256')
  for (const entry of entries) {
    hash.update(`${entry.id}\n${entry.branch}\n${entry.severity}\n${entry.source}\n`)
  }
  return `entries-${entries.length}-sha256-${hash.digest('hex').slice(0, 12)}`
}

async function evaluateEntry(entry: RegressionEntry): Promise<EvalRow> {
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required for live OpenRouter primary eval')
  }

  return entry.branch === 'LLM'
    ? await evaluateLlmEntry(apiKey, entry)
    : await evaluateTextEntry(apiKey, entry)
}

async function evaluateLlmEntry(key: string, entry: RegressionEntry): Promise<EvalRow> {
  const built = buildLlmBranchSpec({
    sourceText: entry.source,
    provider: 'OpenRouter',
    modelId: OPENROUTER_PRIMARY_FREE_MODEL,
    platform: 'chatgpt',
    isNewConversation: true,
    conversationLength: 0,
  })
  const firstOutput = await callPrimaryModel(
    key,
    built.systemPrompt,
    built.userMessage
  )
  const first = finalizeLlm(entry.source, firstOutput)
  if (first.ok) return buildRow(entry, true, [])

  const retryMessage = buildLlmRetryUserMessage(entry.source, firstOutput, first.issues)
  const retryOutput = await callPrimaryModel(
    key,
    built.systemPrompt,
    retryMessage
  )
  const retry = finalizeLlm(entry.source, retryOutput)
  return buildRow(entry, retry.ok, retry.issues)
}

async function evaluateTextEntry(key: string, entry: RegressionEntry): Promise<EvalRow> {
  const built = buildTextBranchSpec({
    sourceText: entry.source,
    provider: 'OpenRouter',
    modelId: OPENROUTER_PRIMARY_FREE_MODEL,
  })
  const firstOutput = await callPrimaryModel(
    key,
    built.systemPrompt,
    built.userMessage
  )
  const first = finalizeText(entry.source, firstOutput)
  if (first.ok) return buildRow(entry, true, [])
  if (!shouldRetryTextBranch(first.issues)) return buildRow(entry, false, first.issues)

  const retryMessage = buildTextRetryUserMessage(entry.source, first.issues)
  const retryOutput = await callPrimaryModel(
    key,
    built.systemPrompt,
    retryMessage
  )
  const retry = finalizeText(entry.source, retryOutput)
  return buildRow(entry, retry.ok, retry.issues)
}

async function callPrimaryModel(key: string, systemPrompt: string, userMessage: string): Promise<string> {
  await throttleOpenRouterRequest()

  try {
    return await callOpenRouterCompletionAPI(
      key,
      systemPrompt,
      userMessage,
      OPENROUTER_PRIMARY_FREE_MODEL,
      maxTokens
    )
  } catch (error) {
    if (!isOpenRouterMinuteRateLimit(error)) {
      throw error
    }

    await delay(65000)
    await throttleOpenRouterRequest()
    return await callOpenRouterCompletionAPI(
      key,
      systemPrompt,
      userMessage,
      OPENROUTER_PRIMARY_FREE_MODEL,
      maxTokens
    )
  }
}

async function throttleOpenRouterRequest(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt
  if (elapsed < minRequestSpacingMs) {
    await delay(minRequestSpacingMs - elapsed)
  }
  lastRequestAt = Date.now()
}

function isOpenRouterMinuteRateLimit(error: unknown): boolean {
  return error instanceof Error && /free-models-per-min/i.test(error.message)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function finalizeLlm(sourceText: string, output: string): { ok: boolean; issues: ValidationIssue[] } {
  const repaired = normalizeNoChangeOutput(repairRewrite({ sourceText, output }).output, sourceText)
  return validateLlmBranchRewrite(sourceText, repaired)
}

function finalizeText(sourceText: string, output: string): { ok: boolean; issues: ValidationIssue[] } {
  const repaired = normalizeNoChangeOutput(repairTextBranchRewrite(sourceText, output), sourceText)
  return validateTextBranchRewrite(sourceText, repaired)
}

function normalizeNoChangeOutput(output: string, sourceText: string): string {
  const withoutDiff = output.replace(/\[DIFF:[\s\S]*?\]/gi, '').trim()
  if (/^\[NO_CHANGE\]\b/i.test(withoutDiff)) {
    const body = withoutDiff.replace(/^\[NO_CHANGE\]\s*/i, '').trim()
    return body || sourceText.trim()
  }
  return withoutDiff
}

function buildRow(entry: RegressionEntry, passed: boolean, issues: ValidationIssue[]): EvalRow {
  return {
    id: entry.id,
    branch: entry.branch,
    severity: entry.severity,
    passed,
    issues: issues.map((issue) => issue.code),
  }
}

function rate(rows: EvalRow[], severity: RegressionEntry['severity']): number {
  const scoped = rows.filter((row) => row.severity === severity)
  if (scoped.length === 0) return 1
  return scoped.filter((row) => row.passed).length / scoped.length
}

function writeReport(entries: RegressionEntry[], rows: EvalRow[]): void {
  const regressionRate = rate(rows, 'regression-must-not-recur')
  const qualityRate = rate(rows, 'quality-target')
  const failed = rows.filter((row) => !row.passed)
  const now = new Date().toISOString()

  writeFileSync(reportPath, `# OpenRouter Primary Eval Gate

- Date: ${now}
- Model: ${OPENROUTER_PRIMARY_FREE_MODEL}
- Corpus version: ${corpusVersion(entries)}
- Corpus entries: ${entries.length}
- Max output tokens per call: ${maxTokens}
- Minimum request spacing: ${minRequestSpacingMs}ms
- Product-owned prompt token check:
  - LLM first pass system prompt: ${measureTokens(buildLlmBranchSpec({
    sourceText: 'placeholder eval source',
    provider: 'OpenRouter',
    modelId: OPENROUTER_PRIMARY_FREE_MODEL,
    platform: 'chatgpt',
    isNewConversation: true,
    conversationLength: 0,
  }).systemPrompt)}
  - Text first pass system prompt: ${measureTokens(buildTextBranchSpec({
    sourceText: 'placeholder eval source',
    provider: 'OpenRouter',
    modelId: OPENROUTER_PRIMARY_FREE_MODEL,
  }).systemPrompt)}
- Regression-must-not-recur pass rate: ${Math.round(regressionRate * 100)}%
- Quality-target pass rate: ${Math.round(qualityRate * 100)}%
- Gate result: ${regressionRate === 1 && qualityRate >= 0.85 ? 'PASS' : 'FAIL'}

Failed entries:
${failed.length === 0 ? '- None' : failed.map((row) => `- ${row.id} (${row.branch}, ${row.severity}): ${row.issues.join(', ')}`).join('\n')}
`)
}

describe.skipIf(!apiKey)('OpenRouter Primary Eval Gate', () => {
  it('runs the locked corpus against the current primary free model', async () => {
    const entries = loadEntries()
    const rows: EvalRow[] = []

    for (const entry of entries) {
      rows.push(await evaluateEntry(entry))
    }

    writeReport(entries, rows)

    expect(rate(rows, 'regression-must-not-recur')).toBe(1)
    expect(rate(rows, 'quality-target')).toBeGreaterThanOrEqual(0.85)
  }, 480000)
})
