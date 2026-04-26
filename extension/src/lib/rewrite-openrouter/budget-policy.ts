export function getOpenRouterMaxTokens(model: string, promptWordCount: number): number {
  if (!model.includes(':free')) {
    return 512
  }

  if (promptWordCount <= 40) return 256
  if (promptWordCount <= 120) return 320
  return 384
}
