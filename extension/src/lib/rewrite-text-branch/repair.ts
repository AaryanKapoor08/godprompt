import { repairRewrite } from '../rewrite-core/repair'

export function repairTextBranchRewrite(sourceText: string, output: string): string {
  const repaired = repairRewrite({ sourceText, output })
  return stripTextBranchInvalidTails(sourceText, repaired.output)
}

function stripTextBranchInvalidTails(sourceText: string, output: string): string {
  if (/^\[NO_CHANGE\]\b/i.test(output)) {
    return output.replace(/^\[NO_CHANGE\]\s*/i, '').trim() || sourceText.trim()
  }

  return output
    .replace(/\[DIFF:[\s\S]*?\]/gi, '')
    .replace(/\n{1,}(?:Original|Selected|Source|Input)\s+text\s*:\s*[\s\S]*$/i, '')
    .trim()
}

