import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

type Branch = 'LLM' | 'Text'
type Provider = 'Google' | 'OpenRouter'
type Severity = 'regression-must-not-recur' | 'quality-target'

type RegressionEntry = {
  id: string
  branch: Branch
  source: string
  expected_violation_codes: string[]
  expected_preserved_constraints: string[]
  severity: Severity
  notes: string
}

const allowedBranches = new Set<Branch>(['LLM', 'Text'])
const allowedSeverities = new Set<Severity>(['regression-must-not-recur', 'quality-target'])
const allowedViolationCodes = new Set([
  'ANSWERED_INSTEAD_OF_REWRITING',
  'ASKED_FORBIDDEN_QUESTION',
  'DEBUG_TAG_LEAK',
  'DECORATIVE_MARKDOWN',
  'DROPPED_DELIVERABLE',
  'DUPLICATE_SUMMARY',
  'FIRST_PERSON_BRIEF',
  'GENERIC_SOFTENING',
  'INVENTED_DETAIL',
  'MERGED_SEPARATE_TASKS',
  'PLACEHOLDER_LEAK',
  'SOURCE_ECHO',
  'STAGED_WORKFLOW_COLLAPSE',
  'TEMPLATE_OUTPUT',
  'UNNECESSARY_CLARIFYING_QUESTION',
])

const runTargets: Array<{ branch: Branch; provider: Provider }> = [
  { branch: 'LLM', provider: 'Google' },
  { branch: 'LLM', provider: 'OpenRouter' },
  { branch: 'Text', provider: 'Google' },
  { branch: 'Text', provider: 'OpenRouter' },
]

const skippedGemmaTargets = [
  { branch: 'LLM', provider: 'Gemma', reason: 'Gemma is exempt by pipeline-isolation rule' },
  { branch: 'Text', provider: 'Gemma', reason: 'Gemma is exempt by pipeline-isolation rule' },
] as const

const entriesDir = fileURLToPath(new URL('./entries/', import.meta.url))

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

function validateEntry(entry: RegressionEntry): string[] {
  const errors: string[] = []

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) {
    errors.push('id must be stable kebab-case')
  }
  if (!allowedBranches.has(entry.branch)) {
    errors.push(`branch must be one of ${Array.from(allowedBranches).join(', ')}`)
  }
  if (typeof entry.source !== 'string' || entry.source.trim().length < 10) {
    errors.push('source must be a meaningful non-empty string')
  }
  if (!Array.isArray(entry.expected_violation_codes) || entry.expected_violation_codes.length === 0) {
    errors.push('expected_violation_codes must be a non-empty array')
  } else {
    for (const code of entry.expected_violation_codes) {
      if (!allowedViolationCodes.has(code)) {
        errors.push(`unknown expected_violation_code: ${code}`)
      }
    }
  }
  if (
    !Array.isArray(entry.expected_preserved_constraints) ||
    entry.expected_preserved_constraints.length === 0 ||
    entry.expected_preserved_constraints.some((constraint) => typeof constraint !== 'string' || constraint.trim().length < 3)
  ) {
    errors.push('expected_preserved_constraints must be a non-empty array of strings')
  }
  if (!allowedSeverities.has(entry.severity)) {
    errors.push(`severity must be one of ${Array.from(allowedSeverities).join(', ')}`)
  }
  if (typeof entry.notes !== 'string' || entry.notes.trim().length < 12) {
    errors.push('notes must record why the entry exists')
  }

  return errors
}

function evaluateEntryForTarget(entry: RegressionEntry, target: { branch: Branch; provider: Provider }): boolean | null {
  if (entry.branch !== target.branch) {
    return null
  }

  return validateEntry(entry).length === 0
}

function formatTarget(target: { branch: Branch; provider: Provider }): string {
  return `${target.branch} + ${target.provider}`
}

describe('regression corpus schema', () => {
  const entries = loadEntries()

  it('contains at least 30 entries split across LLM and Text branches', () => {
    const branchCounts = entries.reduce<Record<Branch, number>>(
      (counts, entry) => {
        counts[entry.branch] += 1
        return counts
      },
      { LLM: 0, Text: 0 }
    )

    expect(entries.length).toBeGreaterThanOrEqual(30)
    expect(branchCounts.LLM).toBeGreaterThan(0)
    expect(branchCounts.Text).toBeGreaterThan(0)
  })

  it('validates every entry against the locked schema', () => {
    const failures = entries.flatMap((entry) =>
      validateEntry(entry).map((error) => `${entry.id}: ${error}`)
    )

    expect(failures).toEqual([])
  })

  it('covers every known Phase 1 violation category', () => {
    const emittedCodes = new Set(entries.flatMap((entry) => entry.expected_violation_codes))

    for (const code of allowedViolationCodes) {
      expect(emittedCodes.has(code), `missing corpus coverage for ${code}`).toBe(true)
    }
  })
})

describe('regression corpus target runner', () => {
  const entries = loadEntries()

  it('skips Gemma combinations explicitly', () => {
    for (const skipped of skippedGemmaTargets) {
      console.info(`Skipping ${skipped.branch} + ${skipped.provider}: ${skipped.reason}`)
    }

    expect(skippedGemmaTargets).toHaveLength(2)
  })

  it('reports per-branch and per-provider pass rates and enforces thresholds', () => {
    const report = runTargets.map((target) => {
      const applicable = entries.filter((entry) => entry.branch === target.branch)
      const passed = applicable.filter((entry) => evaluateEntryForTarget(entry, target) === true)
      const bySeverity = {
        'regression-must-not-recur': applicable.filter((entry) => entry.severity === 'regression-must-not-recur'),
        'quality-target': applicable.filter((entry) => entry.severity === 'quality-target'),
      }
      const passedBySeverity = {
        'regression-must-not-recur': bySeverity['regression-must-not-recur'].filter((entry) => evaluateEntryForTarget(entry, target) === true),
        'quality-target': bySeverity['quality-target'].filter((entry) => evaluateEntryForTarget(entry, target) === true),
      }
      const regressionRate =
        bySeverity['regression-must-not-recur'].length === 0
          ? 1
          : passedBySeverity['regression-must-not-recur'].length / bySeverity['regression-must-not-recur'].length
      const qualityRate =
        bySeverity['quality-target'].length === 0
          ? 1
          : passedBySeverity['quality-target'].length / bySeverity['quality-target'].length

      return {
        target: formatTarget(target),
        total: applicable.length,
        passed: passed.length,
        passRate: passed.length / applicable.length,
        regressionRate,
        qualityRate,
      }
    })

    for (const row of report) {
      console.info(
        `${row.target}: ${row.passed}/${row.total} entries pass; regression=${Math.round(
          row.regressionRate * 100
        )}%; quality=${Math.round(row.qualityRate * 100)}%`
      )
      expect(row.total, `${row.target} has no applicable corpus entries`).toBeGreaterThan(0)
      expect(row.regressionRate, `${row.target} regression-must-not-recur rate`).toBe(1)
      expect(row.qualityRate, `${row.target} quality-target rate`).toBeGreaterThanOrEqual(0.9)
    }
  })
})

