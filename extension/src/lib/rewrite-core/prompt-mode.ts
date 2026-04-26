export type PromptBuildMode = 'production' | 'debug'

declare const __PROMPTGOD_PROMPT_MODE__: PromptBuildMode | undefined

export function resolvePromptBuildMode(value?: string): PromptBuildMode {
  return value === 'debug' ? 'debug' : 'production'
}

export const PROMPT_BUILD_MODE: PromptBuildMode = resolvePromptBuildMode(
  typeof __PROMPTGOD_PROMPT_MODE__ === 'string'
    ? __PROMPTGOD_PROMPT_MODE__
    : undefined
)

export function selectPromptContent(
  mode: PromptBuildMode,
  productionContent: string,
  debugOnlyContent: string
): string {
  return mode === 'debug'
    ? `${productionContent}${debugOnlyContent}`
    : productionContent
}

export function withDebugPromptContent(productionContent: string, debugOnlyContent: string): string {
  return selectPromptContent(PROMPT_BUILD_MODE, productionContent, debugOnlyContent)
}

