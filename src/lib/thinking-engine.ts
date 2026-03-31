/**
 * Chain of Thought + Critical Thinking Engine
 *
 * Forces structured reasoning on every LLM response via <think> blocks.
 * The thinking is parsed out and displayed in the collapsible ThinkingProcessPanel.
 */

const COMPLEXITY_KEYWORDS_HIGH = [
  'compare', 'analyze', 'evaluate', 'explain why', 'trade-off', 'pros and cons',
  'design', 'architect', 'strategy', 'recommend', 'should i', 'best approach',
  'debug', 'troubleshoot', 'investigate', 'root cause', 'difference between',
  'how does', 'implement', 'optimize', 'security', 'performance', 'refactor',
  'plan', 'estimate', 'forecast', 'budget', 'invest',
  'automate', 'set up', 'configure', 'install and configure', 'migrate', 'deploy', 'workflow', 'pipeline',
]

const COMPLEXITY_KEYWORDS_LOW = [
  'hello', 'hi', 'hey', 'thanks', 'thank you', 'bye', 'goodbye',
  'what time', 'weather', 'define', 'what is', 'who is',
  'play', 'stop', 'pause', 'next', 'previous', 'volume',
  'open', 'close', 'click', 'type', 'press', 'scroll', 'minimize', 'maximize', 'focus', 'switch to',
]

export type ThinkingDepth = 'quick' | 'standard' | 'deep'

/**
 * Heuristic complexity classifier. Determines how deeply Jarvis should think
 * based on query length, keywords, and structural signals.
 */
export function classifyComplexity(query: string): ThinkingDepth {
  const lower = query.toLowerCase().trim()
  const wordCount = lower.split(/\s+/).length

  if (wordCount <= 4 && COMPLEXITY_KEYWORDS_LOW.some(k => lower.startsWith(k))) {
    return 'quick'
  }

  if (lower.endsWith('?') && wordCount <= 6) {
    const isDeep = COMPLEXITY_KEYWORDS_HIGH.some(k => lower.includes(k))
    return isDeep ? 'standard' : 'quick'
  }

  const highMatches = COMPLEXITY_KEYWORDS_HIGH.filter(k => lower.includes(k)).length
  if (highMatches >= 2 || wordCount > 40) return 'deep'
  if (highMatches >= 1 || wordCount > 15) return 'standard'

  return 'quick'
}

function getDepthInstruction(depth: ThinkingDepth): string {
  switch (depth) {
    case 'quick':
      return `For this simple query, keep your thinking brief (1-2 sentences).`
    case 'standard':
      return `Think through this systematically using the structured steps.`
    case 'deep':
      return `This requires deep analysis. Be thorough in every reasoning step. Consider multiple angles, edge cases, and potential pitfalls.`
  }
}

/**
 * Returns the Chain of Thought + Critical Thinking system prompt block.
 * Instructs the LLM to wrap all reasoning inside <think>...</think> tags.
 */
export function getThinkingPrompt(depth?: ThinkingDepth): string {
  const depthNote = depth ? `\n${getDepthInstruction(depth)}` : ''

  return `
[CHAIN OF THOUGHT — MANDATORY]
You MUST wrap your internal reasoning inside <think>...</think> tags BEFORE your answer.
The user sees the thinking in a collapsible panel, so be genuine and thorough.
NEVER include <think> tags in your spoken/written answer — only before it.${depthNote}

Structure your thinking using these steps (adapt depth to query complexity):

STEP 1 — UNDERSTAND: What is the user actually asking? Restate the core question.
STEP 2 — DECOMPOSE: Break into sub-problems if the query is complex. For simple queries, skip this.
STEP 3 — EVIDENCE: What do I know? What sources/tools/context support this? What's missing?
STEP 4 — CRITICAL ANALYSIS: Check assumptions. Consider alternative interpretations. Identify potential biases. Are there counterarguments?
STEP 5 — SYNTHESIZE: Combine findings into a clear, coherent answer plan.
STEP 6 — CONFIDENCE: Rate confidence (HIGH / MEDIUM / LOW). Note what could be wrong.

After </think>, write your answer directly. The answer should NOT reference the thinking steps.

Example format:
<think>
UNDERSTAND: The user wants to know X.
EVIDENCE: Based on the search results, Y is supported by sources [1] and [3].
CRITICAL ANALYSIS: Source [2] contradicts this — it claims Z instead. The discrepancy might be due to...
CONFIDENCE: MEDIUM — multiple sources agree but the data is from 2023.
</think>

[Your clean answer here, without referencing the thinking]
`
}

/**
 * Lighter thinking prompt for voice mode.
 * Jarvis thinks internally but does NOT speak the thinking aloud.
 */
export function getVoiceThinkingPrompt(): string {
  return `
[INTERNAL REASONING — DO NOT SPEAK]
Before answering, reason through the question internally. Do NOT say your thinking out loud.
Consider: What is being asked? What do I know? Am I confident? Any assumptions to check?
Then give a clear, natural spoken answer.
`
}
