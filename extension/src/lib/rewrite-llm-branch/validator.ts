import { extractConstraints } from '../rewrite-core/constraints'
import { validateRewrite } from '../rewrite-core/validate'
import type { ValidationResult } from '../rewrite-core/types'
import { validateHighSignalIntent } from './high-signal'

export function validateLlmBranchRewrite(sourceText: string, output: string, admittedContext?: string): ValidationResult {
  const result = validateRewrite({
    branch: 'LLM',
    sourceText,
    output,
    constraints: extractConstraints(sourceText),
    admittedContext,
  })

  const issues = [...result.issues]

  if (detectsMetaPreamble(output)) {
    issues.push({
      code: 'META_PREAMBLE',
      message: 'Output starts with a rewrite-routing preamble instead of the rewritten prompt.',
      severity: 'error',
    })
  }

  if (detectsDescriptivePromptBrief(output)) {
    issues.push({
      code: 'DESCRIPTIVE_PROMPT_BRIEF',
      message: 'Output starts as a third-person project brief instead of a direct next-AI prompt.',
      severity: 'error',
    })
  }

  if (/\[(?:industry|goal|budget|recipient|project|date|topic|context|details)\]|\{\{?.+?\}?\}|<(?:recipient|project|date|topic|context|details)>/i.test(output)) {
    issues.push({
      code: 'DROPPED_DELIVERABLE',
      message: 'Output contains placeholder/template text.',
      severity: 'error',
    })
  }

  issues.push(...validateHighSignalIntent(sourceText, output))

  return {
    ok: issues.length === 0,
    issues,
  }
}

function detectsMetaPreamble(output: string): boolean {
  return /^(?:rewrite this (?:prompt )?for|here (?:is|s) (?:a|the) rewritten|this prompt is for|the rewritten prompt should)\b/i.test(output.trim())
}

function detectsDescriptivePromptBrief(output: string): boolean {
  return /^(?:the user needs to|the goal is to|to (?:develop|create|build|write|draft|debug)\b|this task involves|debug the user'?s application)\b/i.test(output.trim())
}
