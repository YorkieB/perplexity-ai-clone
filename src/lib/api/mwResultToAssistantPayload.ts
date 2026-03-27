/**
 * Maps {@link MWOrchestratorResult} to a stable assistant JSON shape for HTTP / UI consumers.
 *
 * @module lib/api/mwResultToAssistantPayload
 */

import {
  type MWOrchestratorResult,
  isMwOrchestratorClarificationRequired,
} from '@/agents/managerWorkerOrchestrator'
import type { PreTaskEstimate } from '@/reasoning/confidenceTypes'

export type AssistantChatMetadata =
  | {
      type: 'clarification_required'
      preTaskEstimate: PreTaskEstimate | null
    }
  | { type: 'success' }

export interface AssistantChatPayload {
  role: 'assistant'
  content: string
  metadata: AssistantChatMetadata
}

/**
 * Builds the assistant message body for chat APIs. {@link MWOrchestratorResult.response}
 * is the user-visible text (clarification question or worker output).
 */
export function mwResultToAssistantPayload(result: MWOrchestratorResult): AssistantChatPayload {
  if (isMwOrchestratorClarificationRequired(result)) {
    return {
      role: 'assistant',
      content: result.question,
      metadata: {
        type: 'clarification_required',
        preTaskEstimate: result.preTaskEstimate ?? null,
      },
    }
  }

  return {
    role: 'assistant',
    content: result.response,
    metadata: { type: 'success' },
  }
}
