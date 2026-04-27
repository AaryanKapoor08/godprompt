import { describe, expect, it } from 'vitest'
import { extractConstraints } from '../../../src/lib/rewrite-core/constraints'
import { validateRewrite } from '../../../src/lib/rewrite-core/validate'

const analyticsDecisionPrompt = `I need help with a technical decision, but do not jump straight into a confident recommendation.
First analyze the uploaded architecture note, rough diagram, two slow query examples, and CSV sample, then wait for me.
When I say continue, compare Postgres, ClickHouse, and BigQuery for this analytics workload.
Constraints: small team, limited operational time, near-real-time dashboards desirable but not mandatory, current queries are slow, data volume is growing, and customer-facing reports must be accurate.
Do not bring in MongoDB or prior conversation context. Do not invent details.`

const compressedFlashRewrite = `Use the architecture note, diagram, slow query examples, and CSV sample to characterize the analytics workload. Focus on identifying query patterns, data volume characteristics, and data accuracy requirements. Deliver a structured analysis with separate sections for: observed workload characteristics, missing information needed for a decision, proposed tests to fill the gaps, and the explicit criteria for evaluating Postgres, ClickHouse, and BigQuery. Do not offer a recommendation yet; await further instruction. When prompted to "continue," compare the three options across latency, correctness risk, migration effort, potential cost surprises, operational burden, and rollback feasibility. Confine the comparison to these three options only, avoid irrelevant database technologies, and do not rely on prior conversation history. If critical information is missing, explicitly state what is needed instead of making assumptions.`

const manualPrompt3 = `i need help with a technical decision but i dont want the llm to jump straight into a confident recommendation before reading the materials. i am going to upload a short architecture note, a rough diagram, two slow query examples, and a csv sample. the problem is deciding whether to keep our analytics workload on postgres, move parts to clickhouse, or use bigquery, but there are annoying constraints: small team, not much ops time, near-real-time dashboards would be nice but not mandatory, current queries are slow, data volume is growing, and we have some customer-facing reports that cannot be wrong. first analyze only the uploaded material and tell me what kind of workload this actually looks like. wait for me before giving the final recommendation. when i say continue, compare postgres, clickhouse, and bigquery using latency, correctness risk, migration effort, cost surprises, operational burden, and rollback plan. dont bring in mongodb or random previous context from another conversation. dont answer with a generic database comparison. keep separate sections for what we know, what is missing, what to test, and the recommendation criteria. if there is not enough info, say exactly what is missing instead of making stuff up.`

const compressedLiteRewrite = `Use the architecture note, diagram, slow query examples, and CSV sample to characterize the analytics workload. Focus on identifying query patterns, data volume characteristics, and data accuracy requirements. Deliver a structured analysis with separate sections for: observed workload characteristics, missing information needed for a decision, proposed tests to fill the gaps, and the explicit criteria for evaluating Postgres, ClickHouse, and BigQuery. Do not offer a recommendation yet; wait for further instruction. When prompted to continue, compare the three options based on latency, correctness risk, migration effort, potential cost surprises, operational burden, and rollback feasibility. Avoid generic database comparisons, external information, or assumptions. If information is insufficient, clearly state what is missing instead of speculating.`

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

  it('emits UNCHANGED_REWRITE for long unchanged LLM outputs', () => {
    const source = 'Use the Zendesk thread, Slack notes, customer CSV, export job logs, and permissions screenshot to separate known facts, guesses, next checks, customer update, and internal update for a data export escalation.'

    expect(issueCodesFor(source, source)).toContain('UNCHANGED_REWRITE')
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

  it('allows compressed analytics constraints while preserve-token validation is disabled', () => {
    expect(compressedFlashRewrite).toContain('Postgres')
    expect(compressedFlashRewrite).toContain('ClickHouse')
    expect(compressedFlashRewrite).toContain('BigQuery')
    expect(compressedFlashRewrite).not.toContain('small team')
    expect(compressedFlashRewrite).not.toContain('limited operational time')
    expect(compressedFlashRewrite).not.toContain('near-real-time dashboards')
    expect(compressedFlashRewrite).not.toContain('current queries are slow')
    expect(compressedFlashRewrite).not.toContain('data volume is growing')
    expect(compressedFlashRewrite).not.toContain('customer-facing reports')

    const result = validateRewrite({
      branch: 'LLM',
      sourceText: analyticsDecisionPrompt,
      output: compressedFlashRewrite,
      constraints: extractConstraints(analyticsDecisionPrompt),
    })

    expect(result.ok).toBe(true)
    expect(result.issues.map((issue) => issue.code)).not.toContain('DROPPED_PRESERVE_TOKEN')
  })

  it('accepts an analytics rewrite that keeps the proper nouns explicit', () => {
    expect(validateRewrite({
      branch: 'LLM',
      sourceText: analyticsDecisionPrompt,
      output: `First analyze the architecture note, rough diagram, slow query examples, and CSV sample, then wait for the continue signal before making the recommendation.
When continuing, compare Postgres, ClickHouse, and BigQuery using latency, correctness risk, migration effort, cost surprises, operational burden, and rollback plan.
Keep MongoDB and prior conversation context out of scope, and call out the small team, limited operational time, optional near-real-time dashboards, slow current queries, growing data volume, and customer-facing report accuracy constraints.`,
      constraints: extractConstraints(analyticsDecisionPrompt),
    })).toEqual({
      ok: true,
      issues: [],
    })
  })

  it('does not produce false positives for sources without proper nouns', () => {
    expect(validateRewrite({
      branch: 'LLM',
      sourceText: 'Rewrite this planning prompt. Keep it calm, direct, and under 150 words.',
      output: 'Rewrite the planning prompt in a calm, direct voice under 150 words.',
      constraints: extractConstraints('Rewrite this planning prompt. Keep it calm, direct, and under 150 words.'),
    })).toEqual({
      ok: true,
      issues: [],
    })
  })

  it('does not flag paraphrased incidental "small csv export" phrasing without a constraint anchor', () => {
    const source = 'i have API logs, stripe events, and a small csv export from the admin panel.'
    const output = 'Use the API logs, Stripe events, and the admin panel CSV to triage the issue.'
    const result = validateRewrite({
      branch: 'LLM',
      sourceText: source,
      output,
      constraints: extractConstraints(source),
    })
    expect(result.issues.map((issue) => issue.code)).not.toContain('DROPPED_PRESERVE_TOKEN')
  })

  it('allows the observed Flash Lite compression of manual Prompt 3 while preserve-token validation is disabled', () => {
    const result = validateRewrite({
      branch: 'LLM',
      sourceText: manualPrompt3,
      output: compressedLiteRewrite,
      constraints: extractConstraints(manualPrompt3),
    })

    expect(result.ok).toBe(true)
    expect(result.issues.map((issue) => issue.code)).not.toContain('DROPPED_PRESERVE_TOKEN')
  })
})
