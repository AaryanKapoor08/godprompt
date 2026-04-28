import type { Provider } from '../lib/provider-policy'
import type { OpenRouterAccountStatus } from '../lib/rewrite-openrouter/account-status'
import {
  OPENROUTER_CURATED_FREE_MODELS,
  buildCuratedOpenRouterChain,
  isExcludedOpenRouterModel,
  type OpenRouterCurationTier,
} from '../lib/rewrite-openrouter/curation'

export interface ModelOption {
  label: string
  value: string
  cost: string
  tier: 'free' | 'paid'
  curationTier?: OpenRouterCurationTier
}

export interface VisibleChainItem {
  label: string
  value: string
}

export interface CustomModelValidation {
  valid: boolean
  message: string
}

export interface AccountStatusView {
  message: string
  className: string
}

const PROVIDER_MODEL_OPTIONS: Record<Exclude<Provider, 'openrouter'>, ModelOption[]> = {
  anthropic: [
    { label: 'Claude Haiku 3.5', value: 'claude-3-5-haiku-20241022', cost: 'Low cost', tier: 'paid' },
    { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514', cost: 'Higher quality, higher cost', tier: 'paid' },
  ],
  openai: [
    { label: 'GPT-4o-mini', value: 'gpt-4o-mini', cost: '~$0.001/enhance', tier: 'paid' },
    { label: 'GPT-4o', value: 'gpt-4o', cost: '~$0.01/enhance', tier: 'paid' },
  ],
  google: [
    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash', cost: 'Free tier available', tier: 'free' },
    { label: 'Gemma 3 27B IT', value: 'gemma-3-27b-it', cost: 'Free tier available', tier: 'free' },
    { label: 'Gemini 2.5 Flash Lite', value: 'gemini-2.5-flash-lite', cost: 'Manual option, free tier available', tier: 'free' },
  ],
}

export const VISIBLE_PROVIDER_CHAIN: VisibleChainItem[] = [
  { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
  { label: 'Gemma', value: 'gemma-3-27b-it' },
  { label: 'OpenRouter Free Chain', value: 'openrouter-free-chain' },
]

export const RECOMMENDED_GOOGLE_MODELS: VisibleChainItem[] = [
  { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
  { label: 'Gemma 3 27B IT', value: 'gemma-3-27b-it' },
  { label: 'Gemini 2.5 Flash Lite', value: 'gemini-2.5-flash-lite' },
]

export function getOpenRouterFreeChainOptions(liveModelIds?: string[]): ModelOption[] {
  const curatedById = new Map(OPENROUTER_CURATED_FREE_MODELS.map((model) => [model.id, model]))
  return buildCuratedOpenRouterChain(undefined, liveModelIds)
    .filter((modelId) => !isExcludedOpenRouterModel(modelId))
    .map((modelId) => {
      const curated = curatedById.get(modelId)
      return {
        label: curated?.label ?? modelId,
        value: modelId,
        cost: curated?.tier ?? 'stable free',
        tier: 'free' as const,
        curationTier: curated?.tier ?? 'stable free',
      }
    })
}

export function getModelOptions(provider: Provider, openRouterLiveModelIds?: string[]): ModelOption[] {
  if (provider === 'openrouter') {
    return [
      ...getOpenRouterFreeChainOptions(openRouterLiveModelIds),
      { label: 'GPT-4o-mini', value: 'openai/gpt-4o-mini', cost: '~$0.001/enhance', tier: 'paid' },
    ]
  }

  return PROVIDER_MODEL_OPTIONS[provider]
}

export function validateCustomOpenRouterModelId(value: string): CustomModelValidation {
  const trimmed = value.trim()
  if (!trimmed) return { valid: true, message: '' }
  if (!trimmed.includes('/')) {
    return { valid: false, message: 'Custom model IDs must look like org/model-name.' }
  }
  return { valid: true, message: 'Custom model will be saved for OpenRouter.' }
}

export function formatOpenRouterAccountStatus(status: OpenRouterAccountStatus | undefined): AccountStatusView {
  if (!status) return { message: '', className: 'status' }

  if (status.paused) {
    return {
      message: `OpenRouter ${status.bucket} cap reached. Routing is paused today.`,
      className: 'status status--warning',
    }
  }

  const remaining = status.remaining === null ? '' : `, ${status.remaining} remaining`
  const className = status.remaining !== null && status.remaining <= 5
    ? 'status status--warning'
    : 'status'

  return {
    message: `OpenRouter bucket: ${status.bucket}${remaining}.`,
    className,
  }
}
