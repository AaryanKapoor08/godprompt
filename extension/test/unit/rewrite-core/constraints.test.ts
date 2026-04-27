import { describe, expect, it } from 'vitest'
import { extractConstraints } from '../../../src/lib/rewrite-core/constraints'

const analyticsDecisionPrompt = `I need help with a technical decision, but do not jump straight into a confident recommendation.
First analyze the uploaded architecture note, rough diagram, two slow query examples, and CSV sample, then wait for me.
When I say continue, compare Postgres, ClickHouse, and BigQuery for this analytics workload.
Constraints: small team, limited operational time, near-real-time dashboards desirable but not mandatory, current queries are slow, data volume is growing, and customer-facing reports must be accurate.
Do not bring in MongoDB or prior conversation context. Do not invent details.`

const manualPrompt3 = `i need help with a technical decision but i dont want the llm to jump straight into a confident recommendation before reading the materials. i am going to upload a short architecture note, a rough diagram, two slow query examples, and a csv sample. the problem is deciding whether to keep our analytics workload on postgres, move parts to clickhouse, or use bigquery, but there are annoying constraints: small team, not much ops time, near-real-time dashboards would be nice but not mandatory, current queries are slow, data volume is growing, and we have some customer-facing reports that cannot be wrong. first analyze only the uploaded material and tell me what kind of workload this actually looks like. wait for me before giving the final recommendation. when i say continue, compare postgres, clickhouse, and bigquery using latency, correctness risk, migration effort, cost surprises, operational burden, and rollback plan. dont bring in mongodb or random previous context from another conversation. dont answer with a generic database comparison. keep separate sections for what we know, what is missing, what to test, and the recommendation criteria. if there is not enough info, say exactly what is missing instead of making stuff up.`

function kindsFor(source: string): string[] {
  return extractConstraints(source).constraints.map((constraint) => constraint.kind)
}

describe('rewrite-core constraints', () => {
  it('extracts high-confidence hard constraints with source spans', () => {
    const result = extractConstraints(
      'Plain text only, no markdown, no bold labels. Ask 3 clarifying questions first. Do not solve yet. Keep tasks separate. Provide: checklist, memo, FAQ. Keep it under 150 words. Do not invent numbers or dates. First analyze the files, then wait for me. Never use placeholders.'
    )

    expect(result.constraints.map((constraint) => constraint.kind)).toEqual(expect.arrayContaining([
      'plain-text-only',
      'no-markdown',
      'no-bold',
      'ask-questions-first',
      'do-not-solve-yet',
      'keep-tasks-separate',
      'preserve-deliverables',
      'word-limit',
      'no-invention',
      'staged-workflow',
      'no-placeholders',
    ]))
    expect(result.constraints[0].span.text.length).toBeGreaterThan(0)
  })

  it('extracts count limits and no-question constraints', () => {
    expect(kindsFor('Never ask clarifying questions. Return exactly 3 bullets.')).toEqual(expect.arrayContaining([
      'no-questions',
      'count-limit',
    ]))
  })

  it('must-not-emit fuzzy constraints from weak wording', () => {
    expect(extractConstraints('make it clean and nice, maybe shorter if needed').constraints).toEqual([])
    expect(extractConstraints('questions might help but only if you think so').constraints).toEqual([])
    expect(extractConstraints('bold move by the team and markdown prices in the report').constraints).toEqual([])
  })

  it('extracts proper-noun and salient operational preserve tokens from analytics prompts', () => {
    const result = extractConstraints(analyticsDecisionPrompt)

    expect(result.constraints.map((constraint) => constraint.kind)).toEqual(expect.arrayContaining([
      'no-invention',
      'staged-workflow',
    ]))
    expect(result.preserveTokens).toEqual(expect.arrayContaining([
      'Postgres',
      'ClickHouse',
      'BigQuery',
      'MongoDB',
      'small team',
      'limited operational time',
      'near-real-time dashboards desirable but not mandatory',
      'current queries are slow',
      'data volume is growing',
      'customer-facing reports must be accurate',
    ]))
  })

  it('extracts preserve tokens from the lower-case manual Prompt 3 wording', () => {
    expect(extractConstraints(manualPrompt3).preserveTokens).toEqual(expect.arrayContaining([
      'postgres',
      'clickhouse',
      'bigquery',
      'mongodb',
      'small team',
      'not much ops time',
      'near-real-time dashboards would be nice but not mandatory',
      'current queries are slow',
      'data volume is growing',
      'we have some customer-facing reports that cannot be wrong',
    ]))
  })

  it('does not emit clause preserve tokens from incidental phrases without a constraint anchor', () => {
    const prompt1 = 'i have API logs, stripe events, screenshots from users, support tickets, slack messages from sales, and a small csv export from the admin panel.'
    const tokens = extractConstraints(prompt1).preserveTokens
    expect(tokens.some((token) => /csv export|admin panel|small csv/i.test(token))).toBe(false)
    expect(tokens.some((token) => /\bsmall\b/i.test(token))).toBe(false)
  })

  it('still extracts proper nouns and known tech names when no constraint anchor is present', () => {
    const tokens = extractConstraints('i have API logs, stripe events, and a CSV sample from Postgres.').preserveTokens
    expect(tokens).toEqual(expect.arrayContaining(['API', 'CSV', 'Postgres']))
  })

  it('does not emit clause preserve tokens for incidental "slow/growing/required" usage', () => {
    const tokens = extractConstraints('we have a slow build and a growing list of required fields to clean up.').preserveTokens
    expect(tokens).toEqual([])
  })
})
