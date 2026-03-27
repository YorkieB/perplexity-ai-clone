/**
 * Hardened assembly of the main Jarvis system prompt: ordered XML sections, optional validation,
 * and optional versioning via {@link promptRegistry}.
 */

import { promptRegistry } from './promptRegistry'
import { assertValidPrompt, validatePrompt } from './promptValidator'

const LOG = '[PromptAssembler]'

/** Registry name for auto-snapshots produced when {@link AssemblerOptions.useRegistry} is true. */
export const ASSEMBLED_PROMPT_REGISTRY_NAME = 'jarvis_assembled_system'

/** Options for {@link assembleSystemPrompt}. */
export interface AssemblerOptions {
  basePrompt: string
  ragContext?: string
  intentRoute: string
  availableTools: string[]
  /** Model id for changelog metadata when registering (optional). */
  model?: string
  /** When true (default), run {@link validatePrompt} on the assembled string. */
  validate?: boolean
  /**
   * When true (default), persist a new registry version if the prompt is valid, not a duplicate
   * of an existing version with {@link ASSEMBLED_PROMPT_REGISTRY_NAME}, and Node registry I/O is available.
   * Callers that assemble once per request with changing RAG should pass `false` to avoid registry churn.
   */
  useRegistry?: boolean
}

/**
 * Wraps the caller-provided identity / persona text in the canonical `<identity>` section.
 */
export function _buildIdentitySection(basePrompt: string): string {
  return `<identity>
${basePrompt.trim()}
</identity>`
}

/**
 * Non-negotiable behavioural rules for tool use and shared-context handling.
 */
export function _buildCriticalRulesSection(): string {
  return `<critical_rules>
1. ALWAYS check the current conversation before deciding to use any tool.
2. If the user references "this", "the above", "what I gave you", "what I shared", 
   or similar phrases — locate the referenced content in the session or retrieved 
   context and act on it directly. NEVER search externally for something already provided.
3. If the user gives an instruction that begins with an action verb (recode, rewrite, 
   fix, improve, analyse, refactor, update, rework, use, modify, summarize, generate, 
   make, change, add, remove) — it is an instruction on shared content, NOT a search query.
4. If you are genuinely uncertain what the user is referring to, ask ONE targeted 
   clarification question. Do not default to search.
5. Never acknowledge or apologise for prior mistakes mid-task. Correct course and proceed.
</critical_rules>`
}

/**
 * When web search and other tools are appropriate vs forbidden.
 */
export function _buildToolPolicySection(): string {
  return `<tool_use_policy>
Tools are ONLY for information that cannot be derived from this conversation or 
your training knowledge.

Web search IS for: current events, live data, things that change over time 
(prices, news, API changes).

Web search is NOT for:
- Instructions on shared content ("recode this", "use the data from above")
- References to prior messages or shared artefacts
- File contents, analysis results, configs, prompts already visible in this conversation

Before calling any tool, ask internally:
"Can I answer this from what I already know or what is already in this conversation?"
If YES, do not call the tool.
</tool_use_policy>`
}

/**
 * Injects RAG / retrieval payload for the model (placeholder when absent).
 */
export function _buildRetrievedContextSection(ragContext?: string): string {
  const inner = ragContext?.trim() || 'No retrieved context available for this request.'
  return `<retrieved_context>
${inner}
</retrieved_context>`
}

/**
 * Lists tool names for the model and appends intent-specific guidance.
 */
export function _buildAvailableToolsSection(tools: string[], intentRoute: string): string {
  const route = intentRoute.trim()
  if (tools.length === 0) {
    return `<available_tools>
No external tools are available for this task.
This is a ${route} task — execute using the provided context only.
</available_tools>`
  }
  const bullets = tools.map((t) => `- ${t}`).join('\n')
  const intentLines = _getIntentInstructions(route)
  return `<available_tools>
${bullets}

Current task intent: ${route}
${intentLines}
</available_tools>`
}

/**
 * Intent-specific lines appended inside `<available_tools>` (single source of truth for orchestrator routing).
 */
export function _getIntentInstructions(intentRoute: string): string {
  const route = intentRoute.trim()
  if (route === 'code_instruction') {
    return `You are working on code or a technical artefact already shared in this conversation.
Complete the requested modification fully. Return the complete updated implementation, not partial snippets.
Do not search externally — all necessary content is in the retrieved context or conversation.`
  }
  if (route === 'knowledge_lookup') {
    return `Answer the question using retrieved context if provided, then your training knowledge.
Only use web search if the information is time-sensitive (current events, live data, prices).`
  }
  if (route === 'clarification_needed') {
    return `The user is referring to content already shared in this conversation.
Locate it in the retrieved context or conversation history and act on it.
If genuinely not found, ask: 'Could you re-share [specific thing]? I want to make sure I have the latest version.'`
  }
  if (route === 'conversational') {
    return `Respond naturally and concisely. No tools needed.`
  }
  if (route === 'voice_synthesis' || route === 'voice_task') {
    return `Focus on voice, audio, TTS, and synthesis configuration already discussed. Prefer in-conversation artefacts over unrelated history.`
  }
  return `Complete the task using available context and tools as appropriate.`
}

function maybeRegisterAssembledPrompt(
  prompt: string,
  validationValid: boolean,
  useRegistry: boolean,
  model: string | undefined,
): void {
  if (!useRegistry || !validationValid) {
    return
  }
  try {
    const history = promptRegistry.getVersionHistory()
    const duplicate = history.some(
      (v) => v.name === ASSEMBLED_PROMPT_REGISTRY_NAME && v.prompt === prompt,
    )
    if (duplicate) {
      return
    }
    const meta = model !== undefined && model.trim().length > 0 ? `model=${model.trim()}` : 'model=unspecified'
    const changelog = `Auto-snapshot ${new Date().toISOString()} (${meta})`
    promptRegistry.register(ASSEMBLED_PROMPT_REGISTRY_NAME, prompt, changelog, 'auto-generated')
  } catch (err) {
    console.warn(`${LOG} Registry register skipped:`, err)
  }
}

/**
 * Builds the five-section Jarvis system prompt in fixed order, optionally validates it,
 * and optionally records a new registry version when the text is new and valid.
 */
export function assembleSystemPrompt(options: AssemblerOptions): string {
  const validate = options.validate !== false
  const useRegistry = options.useRegistry !== false

  const identitySection = _buildIdentitySection(options.basePrompt)
  const criticalRulesSection = _buildCriticalRulesSection()
  const toolPolicySection = _buildToolPolicySection()
  const retrievedContextSection = _buildRetrievedContextSection(options.ragContext)
  const availableToolsSection = _buildAvailableToolsSection(
    options.availableTools,
    options.intentRoute,
  )

  const prompt = [
    identitySection,
    criticalRulesSection,
    toolPolicySection,
    retrievedContextSection,
    availableToolsSection,
  ].join('\n\n')

  let validationValid = true
  if (validate) {
    const validation = validatePrompt(prompt)
    validationValid = validation.valid
    if (!validation.valid) {
      console.error(`${LOG} Generated invalid prompt:`, validation.errors)
    }
    if (validation.warnings.length > 0) {
      console.warn(`${LOG} Prompt warnings:`, validation.warnings)
    }
  }

  maybeRegisterAssembledPrompt(prompt, validationValid, useRegistry, options.model)

  return prompt
}

/**
 * Validates the currently active prompt stored in {@link promptRegistry} (development / CI helper).
 */
export function validateCurrentPrompt(): void {
  const active = promptRegistry.getActivePrompt()
  if (active === null) {
    console.warn(`${LOG} No active prompt in registry; skip validation`)
    return
  }
  try {
    assertValidPrompt(active)
    console.info(`${LOG} Active registry prompt passed validation`)
  } catch (err) {
    console.error(`${LOG} Active registry prompt failed validation`, err)
  }
}
