export type BudgetKind = 'llm-first' | 'llm-retry' | 'text-first' | 'text-retry'

export type BudgetAssertion = {
  kind: BudgetKind
  tokens: number
  hardCap: number
  target?: {
    min: number
    max: number
  }
}

export type BudgetWarning = {
  kind: BudgetKind
  tokens: number
  target: {
    min: number
    max: number
  }
}

export class BudgetExceededError extends Error {
  readonly kind: BudgetKind
  readonly tokens: number
  readonly hardCap: number

  constructor(assertion: Pick<BudgetAssertion, 'kind' | 'tokens' | 'hardCap'>) {
    super(`Prompt budget exceeded for ${assertion.kind}: ${assertion.tokens}/${assertion.hardCap} tokens`)
    this.name = 'BudgetExceededError'
    this.kind = assertion.kind
    this.tokens = assertion.tokens
    this.hardCap = assertion.hardCap
  }
}

export type BudgetAssertionResult = {
  ok: true
  warning?: BudgetWarning
}

export function measureTokens(text: string): number {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim()

  if (!normalized) {
    return 0
  }

  const tokenLikeParts = normalized.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu) ?? []
  let count = 0

  for (const part of tokenLikeParts) {
    if (/^[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*$/u.test(part)) {
      count += Math.max(1, Math.ceil(part.length / 8))
    } else {
      count += 1
    }
  }

  const paragraphBreaks = normalized.match(/\n{2,}/g)?.length ?? 0
  return count + paragraphBreaks
}

export function assertBudget(assertion: BudgetAssertion): BudgetAssertionResult {
  if (assertion.tokens > assertion.hardCap) {
    throw new BudgetExceededError(assertion)
  }

  if (
    assertion.target &&
    (assertion.tokens < assertion.target.min || assertion.tokens > assertion.target.max)
  ) {
    return {
      ok: true,
      warning: {
        kind: assertion.kind,
        tokens: assertion.tokens,
        target: assertion.target,
      },
    }
  }

  return { ok: true }
}

