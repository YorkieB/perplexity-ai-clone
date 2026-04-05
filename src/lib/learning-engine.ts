/**
 * Self-Learning Engine
 *
 * Silently analyzes every conversation exchange to extract:
 * - Preferences (communication style, formatting, tool choices)
 * - Corrections (mistakes to never repeat)
 * - Patterns (routines, frequent queries, workflows)
 * - Knowledge (useful facts worth remembering)
 * - Tool outcomes (success/failure tracking)
 *
 * All learning happens asynchronously after the response is delivered.
 */

import { callLlm } from './llm'
import { getPreferredChatModel } from './chat-preferences'

// ── Types ───────────────────────────────────────────────────────────────────

interface LearnedPreference {
  domain: string
  key: string
  value: string
}

interface LearnedCorrection {
  category: string
  mistake: string
  correction: string
}

interface LearnedPattern {
  pattern_type: string
  description: string
  metadata?: Record<string, unknown>
}

interface LearnedKnowledge {
  topic: string
  content: string
  source: string
}

interface AnalysisResult {
  preferences: LearnedPreference[]
  corrections: LearnedCorrection[]
  patterns: LearnedPattern[]
  knowledge: LearnedKnowledge[]
}

interface ToolOutcome {
  tool_name: string
  query_type?: string
  success: boolean
  execution_time_ms?: number
  error_message?: string
}

// ── Analysis prompt ─────────────────────────────────────────────────────────

const ANALYSIS_PROMPT = `You are a silent learning system that analyzes conversations to extract useful patterns.

Given a user message and assistant response, extract ANY of the following (return empty arrays if nothing applies):

1. PREFERENCES — Things the user implicitly or explicitly prefers:
   - communication style (formal/casual, verbose/concise)
   - formatting (bullet points, code blocks, tables)
   - topic interests
   - tool preferences
   - behavioral preferences ("don't do X", "always do Y")

2. CORRECTIONS — If the user corrected the assistant:
   - What was wrong (the mistake)
   - What was wanted (the correction)
   - Category: factual, preference, tool_choice, behavior, format

3. PATTERNS — Behavioral patterns observed:
   - routine: regular activities or time-based behaviors
   - workflow: sequences of actions the user commonly does
   - frequent_query: types of questions asked repeatedly

4. KNOWLEDGE — Useful facts worth remembering:
   - Personal facts about the user
   - Domain knowledge shared by the user
   - Preferences expressed as knowledge

Respond in JSON only. No markdown, no explanation.
{
  "preferences": [{ "domain": "communication|formatting|tools|topics|behavior", "key": "short_key", "value": "description" }],
  "corrections": [{ "category": "factual|preference|tool_choice|behavior|format", "mistake": "what was wrong", "correction": "what was wanted" }],
  "patterns": [{ "pattern_type": "routine|workflow|frequent_query", "description": "brief description" }],
  "knowledge": [{ "topic": "topic", "content": "fact", "source": "conversation" }]
}`

// ── Core functions ──────────────────────────────────────────────────────────

/**
 * Analyze an exchange and extract learnings. Runs asynchronously.
 * Returns the analysis result (also posts to the server to store).
 */
export async function analyzeExchange(
  userMessage: string,
  assistantResponse: string,
  toolsUsed?: string[],
): Promise<AnalysisResult | null> {
  try {
    const toolContext = toolsUsed?.length
      ? `\nTools used in this exchange: ${toolsUsed.join(', ')}`
      : ''

    const prompt = `${ANALYSIS_PROMPT}

USER MESSAGE:
${userMessage.slice(0, 2000)}

ASSISTANT RESPONSE:
${assistantResponse.slice(0, 2000)}${toolContext}`

    const raw = await callLlm(prompt, getPreferredChatModel('gpt-4o-mini'), true)
    const result = JSON.parse(raw) as AnalysisResult

    if (!result.preferences) result.preferences = []
    if (!result.corrections) result.corrections = []
    if (!result.patterns) result.patterns = []
    if (!result.knowledge) result.knowledge = []

    const hasLearnings =
      result.preferences.length > 0 ||
      result.corrections.length > 0 ||
      result.patterns.length > 0 ||
      result.knowledge.length > 0

    if (!hasLearnings) return null

    await fetch('/api/jarvis-memory/learn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    }).catch(() => { /* non-critical */ })

    return result
  } catch {
    return null
  }
}

/**
 * Fire-and-forget wrapper for analyzeExchange.
 * Never blocks the caller.
 */
export function analyzeExchangeAsync(
  userMessage: string,
  assistantResponse: string,
  toolsUsed?: string[],
): void {
  setTimeout(() => {
    analyzeExchange(userMessage, assistantResponse, toolsUsed).catch(() => {})
  }, 100)
}

/**
 * Fetch the pre-built learned context block from the server.
 * Returns a string to inject into the system prompt (empty if nothing learned yet).
 */
export async function getLearnedContext(): Promise<string> {
  try {
    const res = await fetch('/api/jarvis-memory/learned-context')
    if (!res.ok) return ''
    const data = await res.json() as { context: string }
    return data.context || ''
  } catch {
    return ''
  }
}

/**
 * Track a tool execution outcome.
 */
export async function trackToolOutcome(outcome: ToolOutcome): Promise<void> {
  try {
    await fetch('/api/jarvis-memory/track-tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(outcome),
    })
  } catch { /* non-critical */ }
}

/**
 * Fetch learning statistics (for the learning_stats tool).
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- aggregates five distinct stat categories (stats, preferences, corrections, patterns, knowledge) into one formatted report
export async function getLearningStats(): Promise<string> {
  try {
    const res = await fetch('/api/jarvis-memory/learning-stats')
    if (!res.ok) return 'Learning system not available.'
    const data = await res.json() as {
      stats: Record<string, number>
      preferences: Array<{ domain: string; key: string; value: string }>
      corrections: Array<{ mistake: string; correction: string }>
      patterns: Array<{ description: string; frequency: number }>
      knowledge: Array<{ topic: string; content: string }>
      tool_stats: Array<{ tool_name: string; total_uses: number; success_rate: number }>
    }

    const lines: string[] = [
      '=== JARVIS LEARNING REPORT ===',
      `Preferences learned: ${data.stats.preferences}`,
      `Corrections stored: ${data.stats.corrections}`,
      `Patterns detected: ${data.stats.patterns}`,
      `Tools tracked: ${data.stats.tools_tracked}`,
      `Knowledge items: ${data.stats.knowledge_items}`,
    ]

    if (data.preferences.length > 0) {
      lines.push('\n--- Learned Preferences ---')
      for (const p of data.preferences) {
        lines.push(`[${p.domain}] ${p.key}: ${p.value}`)
      }
    }

    if (data.corrections.length > 0) {
      lines.push('\n--- Corrections (mistakes to avoid) ---')
      for (const c of data.corrections) {
        lines.push(`AVOID: "${c.mistake}" → DO: "${c.correction}"`)
      }
    }

    if (data.patterns.length > 0) {
      lines.push('\n--- Detected Patterns ---')
      for (const p of data.patterns) {
        lines.push(`${p.description} (seen ${p.frequency}x)`)
      }
    }

    if (data.knowledge.length > 0) {
      lines.push('\n--- Learned Knowledge ---')
      for (const k of data.knowledge) {
        lines.push(`[${k.topic}] ${k.content}`)
      }
    }

    if (data.tool_stats.length > 0) {
      lines.push('\n--- Tool Performance ---')
      for (const t of data.tool_stats) {
        lines.push(`${t.tool_name}: ${t.total_uses} uses, ${t.success_rate}% success`)
      }
    }

    return lines.join('\n')
  } catch {
    return 'Unable to retrieve learning statistics.'
  }
}
