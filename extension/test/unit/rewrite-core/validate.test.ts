import { describe, expect, it } from 'vitest'
import { extractConstraints } from '../../../src/lib/rewrite-core/constraints'
import { validateRewrite } from '../../../src/lib/rewrite-core/validate'

function issueCodesFor(sourceText: string, output: string, branch: 'LLM' | 'Text' = 'LLM'): string[] {
  return validateRewrite({
    branch,
    sourceText,
    output,
    constraints: extractConstraints(sourceText),
  }).issues.map((issue) => issue.code)
}

describe('rewrite-core validate', () => {
  it('emits DECORATIVE_MARKDOWN', () => {
    expect(issueCodesFor('make a launch triage prompt', '**Launch Triage Task**')).toContain('DECORATIVE_MARKDOWN')
  })

  it('emits FIRST_PERSON_BRIEF', () => {
    expect(issueCodesFor('use the logs for triage', 'My goal is to perform a serious triage of this issue.')).toContain('FIRST_PERSON_BRIEF')
  })

  it('emits ASKED_FORBIDDEN_QUESTION', () => {
    expect(issueCodesFor('Never ask clarifying questions. Rewrite this message.', 'Who is the recipient?', 'Text')).toContain('ASKED_FORBIDDEN_QUESTION')
  })

  it('emits ANSWERED_INSTEAD_OF_REWRITING', () => {
    expect(issueCodesFor(
      'analyze complaints and draft an internal update',
      'The complaints suggest three root causes and two urgent fixes.'
    )).toContain('ANSWERED_INSTEAD_OF_REWRITING')
  })

  it('emits DROPPED_DELIVERABLE', () => {
    expect(issueCodesFor(
      'Provide a launch checklist, internal memo, FAQ, and summary.',
      'Create a launch checklist and internal memo.'
    )).toContain('DROPPED_DELIVERABLE')
  })

  it('emits MERGED_SEPARATE_TASKS', () => {
    expect(issueCodesFor(
      'First summarize the notes. Then draft an email. Keep tasks separate.',
      'Summarize the notes and draft an email.'
    )).toContain('MERGED_SEPARATE_TASKS')
  })

  it('emits INTRODUCED_UNRELATED_CONTEXT for foreign concept families absent from source and admitted context', () => {
    expect(issueCodesFor(
      'Use API logs, Stripe webhook errors, Sentry screenshots, support tickets, and customer emails for a hard launch triage.',
      'Use the API logs and support tickets for launch triage. Include a rollback plan, pre-production checklist, collection names, and schema notes.'
    )).toContain('INTRODUCED_UNRELATED_CONTEXT')

    expect(issueCodesFor(
      'Assess a production MongoDB migration. Gather collection names, sample documents, target schema, indexes, write traffic, rollback limits, downtime tolerance, and count verification.',
      'Assess the MongoDB migration. Include support tickets, customer emails, root-cause paths, and what not to say to customers.'
    )).toContain('INTRODUCED_UNRELATED_CONTEXT')
  })

  it('allows foreign-family terms when admitted context explicitly contains them', () => {
    const result = validateRewrite({
      branch: 'LLM',
      sourceText: 'Use the previous message as context and produce the next prompt.',
      admittedContext: 'Previous message covered MongoDB schemas, collection names, and rollback plan.',
      output: 'Use the previous MongoDB schema, collection names, and rollback plan to produce the next prompt.',
      constraints: extractConstraints('Use the previous message as context and produce the next prompt.'),
    })

    expect(result.issues.map((issue) => issue.code)).not.toContain('INTRODUCED_UNRELATED_CONTEXT')
  })

  it('accepts a simple valid rewrite', () => {
    expect(validateRewrite({
      branch: 'LLM',
      sourceText: 'compare AWS and Google Cloud and give me a table and recommendation',
      output: 'Compare AWS and Google Cloud. Focus on pricing, deployment complexity, managed database options, and scalability. Present the result as a table with a short recommendation.',
    })).toEqual({
      ok: true,
      issues: [],
    })
  })
})
