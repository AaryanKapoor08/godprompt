import { extractConstraints } from '../rewrite-core/constraints'
import { validateRewrite } from '../rewrite-core/validate'
import type { ValidationResult } from '../rewrite-core/types'

export function validateTextBranchRewrite(sourceText: string, output: string): ValidationResult {
  const result = validateRewrite({
    branch: 'Text',
    sourceText,
    output,
    constraints: extractConstraints(sourceText),
  })

  const issues = [...result.issues]

  if (/\b(?:Original|Selected|Source|Input)\s+text\s*:/i.test(output)) {
    issues.push({
      code: 'ANSWERED_INSTEAD_OF_REWRITING',
      message: 'Output contains a source echo block.',
      severity: 'error',
    })
  }

  if (/\[(?:recipient|project|date|topic|context|details)\]|\{\{?.+?\}?\}|<(?:recipient|project|date|topic|context|details)>/i.test(output)) {
    issues.push({
      code: 'DROPPED_DELIVERABLE',
      message: 'Output contains placeholder/template text.',
      severity: 'error',
    })
  }

  return {
    ok: issues.length === 0,
    issues,
  }
}

