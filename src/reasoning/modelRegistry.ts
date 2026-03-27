/**
 * Canonical OpenAI model metadata, pricing, and routing guardrails for Jarvis.
 *
 * @module reasoning/modelRegistry
 */

/**
 * Coarse capability / cost bucket for model selection.
 */
export type ModelTier =
  | 'nano'
  | 'standard'
  | 'reasoning'
  | 'premium'

/**
 * Static description of one deployable model (ids, costs, limits, traits).
 */
export interface ModelSpec {
  /** OpenAI API model id. */
  id: string
  tier: ModelTier
  /** USD per million input tokens. */
  inputCostPerMToken: number
  /** USD per million output tokens. */
  outputCostPerMToken: number
  /** Maximum context length in tokens. */
  contextWindow: number
  /** Maximum completion tokens. */
  maxOutput: number
  supportsStructuredOutput: boolean
  supportsVision: boolean
  /** Typical round-trip latency for a medium prompt (heuristic). */
  averageLatencyMs: number
  /** Reasoning depth hint where applicable (e.g. o-series). */
  reasoningEffort?: 'low' | 'medium' | 'high'
  strengths: string[]
  weaknesses: string[]
}

/**
 * Full catalog keyed by {@link ModelTier}.
 */
export const MODEL_REGISTRY: Record<ModelTier, ModelSpec> = {
  nano: {
    id: 'gpt-4o-mini',
    tier: 'nano',
    inputCostPerMToken: 0.15,
    outputCostPerMToken: 0.6,
    contextWindow: 128_000,
    maxOutput: 16_384,
    supportsStructuredOutput: true,
    supportsVision: true,
    averageLatencyMs: 800,
    strengths: [
      'Very fast response',
      'Extremely cost-efficient',
      'Good for classification and simple generation',
      'Structured output reliable',
    ],
    weaknesses: [
      'Struggles with multi-step complex reasoning',
      'Weaker at intricate debugging',
      'Less reliable on ambiguous requirements',
    ],
  },

  standard: {
    id: 'gpt-4o',
    tier: 'standard',
    inputCostPerMToken: 2.5,
    outputCostPerMToken: 10.0,
    contextWindow: 128_000,
    maxOutput: 16_384,
    supportsStructuredOutput: true,
    supportsVision: true,
    averageLatencyMs: 2000,
    strengths: [
      'Strong general coding and reasoning',
      'Reliable instruction following',
      'Good context utilisation',
      'Consistent quality across task types',
    ],
    weaknesses: [
      'Not optimised for extended chain-of-thought',
      'Higher cost than nano for simple tasks',
    ],
  },

  reasoning: {
    id: 'o3-mini',
    tier: 'reasoning',
    inputCostPerMToken: 1.1,
    outputCostPerMToken: 4.4,
    contextWindow: 200_000,
    maxOutput: 65_536,
    supportsStructuredOutput: true,
    supportsVision: false,
    averageLatencyMs: 5000,
    reasoningEffort: 'medium',
    strengths: [
      'Strong STEM and algorithmic reasoning',
      'Excellent at multi-step logic',
      'Self-corrects during reasoning',
      'Larger context window (200K)',
      'Cost-efficient vs o3 for most hard tasks',
    ],
    weaknesses: [
      'Slower than gpt-4o',
      'No vision support',
      'Can over-reason simple tasks',
      'Less creative than gpt-4o',
    ],
  },

  premium: {
    id: 'o3',
    tier: 'premium',
    inputCostPerMToken: 10.0,
    outputCostPerMToken: 40.0,
    contextWindow: 200_000,
    maxOutput: 100_000,
    supportsStructuredOutput: true,
    supportsVision: true,
    averageLatencyMs: 15_000,
    reasoningEffort: 'high',
    strengths: [
      'Best-in-class reasoning and problem solving',
      'Handles extremely complex multi-constraint tasks',
      'Highest reliability on hard debugging',
      'Strong architectural decision making',
    ],
    weaknesses: [
      'Very expensive — 267x cost vs nano on output',
      'Slow response times',
      'Overkill for most tasks',
    ],
  },
}

/**
 * Resolves the {@link ModelSpec} for a tier.
 */
export function getModelSpec(tier: ModelTier): ModelSpec {
  return MODEL_REGISTRY[tier]
}

/**
 * Rough USD cost from token estimates and tier pricing (input + output).
 */
export function estimateCost(
  tier: ModelTier,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
): number {
  const spec = MODEL_REGISTRY[tier]
  return (
    (spec.inputCostPerMToken * estimatedInputTokens) / 1_000_000 +
    (spec.outputCostPerMToken * estimatedOutputTokens) / 1_000_000
  )
}

/**
 * Intent overrides, session caps, and complexity cutoffs for tier routing.
 */
export const ROUTING_RULES = {
  ALWAYS_NANO: ['conversational', 'clarification_needed'] as string[],
  ALWAYS_STANDARD: ['knowledge_lookup', 'image_task'] as string[],
  NEVER_PREMIUM: ['conversational', 'clarification_needed'] as string[],

  MAX_PREMIUM_CALLS_PER_SESSION: 3,
  MAX_REASONING_CALLS_PER_SESSION: 10,

  NANO_MAX_COMPLEXITY: 0.25,
  STANDARD_MAX_COMPLEXITY: 0.6,
  REASONING_MAX_COMPLEXITY: 0.8,
} as const
