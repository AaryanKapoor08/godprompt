import { assertBudget, type BudgetKind } from '../rewrite-core/budget'

const GOOGLE_BUDGET_CAPS: Record<BudgetKind, number> = {
  'llm-first': 1000,
  'llm-retry': 220,
  'text-first': 400,
  'text-retry': 140,
}

export function assertGooglePromptBudget(kind: BudgetKind, tokens: number): void {
  assertBudget({
    kind,
    tokens,
    hardCap: GOOGLE_BUDGET_CAPS[kind],
  })
}
