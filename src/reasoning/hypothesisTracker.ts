/**
 * Maintains an explicit, testable solution hypothesis on the CoT scratchpad and
 * revises it as observations arrive.
 *
 * @module reasoning/hypothesisTracker
 */

import OpenAI from 'openai'

import type { CoTScratchpad, Hypothesis } from './cotScratchpad'
import { scratchpadStore } from './scratchpadStore'

const LOG = '[HypothesisTracker]'

const NEGATION_RE =
  /\b(not|no|never|false|wrong|incorrect|contradict|isn't|aren't|didn't|failed|invalid|unable|cannot|wasn't)\b/i

function stripMarkdownFence(raw: string): string {
  const lines = raw.trim().split('\n')
  if (lines.length < 2) return raw.trim()
  const first = lines[0]?.trim() ?? ''
  const last = lines[lines.length - 1]?.trim() ?? ''
  if (first.startsWith('```') && last === '```') {
    return lines.slice(1, -1).join('\n').trim()
  }
  return raw.trim()
}

function parseJsonObject(raw: string): unknown {
  return JSON.parse(stripMarkdownFence(raw)) as unknown
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

function heuristicAssumptionConflict(assumptionContent: string, observationContent: string): boolean {
  const ol = observationContent.toLowerCase()
  if (!NEGATION_RE.test(ol)) return false
  const words = assumptionContent
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4)
    .slice(0, 12)
  return words.some((w) => ol.includes(w))
}

/**
 * Tracks and updates the active {@link Hypothesis} on a scratchpad using small-model LLM calls.
 */
export default class HypothesisTracker {
  private readonly client: OpenAI
  private readonly model: string

  constructor(model: string = 'gpt-4o-mini') {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
    this.model = model
  }

  /**
   * Creates the first active hypothesis from task text and context, persisted on the scratchpad.
   */
  async formInitialHypothesis(
    taskDescription: string,
    taskType: string,
    scratchpadId: string,
    availableContext: string[],
  ): Promise<Hypothesis> {
    const context = availableContext.slice(0, 2).join('\n')
    const system = `Form an initial solution hypothesis for this task.
A hypothesis is a clear, testable statement of the proposed approach.
Be specific but acknowledge uncertainty.

Return ONLY valid JSON:
{
  "statement": "The solution is to...",
  "confidence": 0.0,
  "supportingEvidence": ["evidence from context..."],
  "contradictingEvidence": [],
  "status": "active"
}`

    const user = `Task type: ${taskType}
Task: ${taskDescription}
Context:
${context}`

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })

      const text = completion.choices[0]?.message?.content?.trim() ?? ''
      if (!text) throw new Error('Empty hypothesis response')

      const parsed = parseJsonObject(text) as Record<string, unknown>
      const statement = typeof parsed.statement === 'string' ? parsed.statement.trim() : ''
      if (statement.length === 0) throw new Error('Missing statement')

      const confidence =
        typeof parsed.confidence === 'number' && !Number.isNaN(parsed.confidence)
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.5

      const payload: Omit<Hypothesis, 'id' | 'updatedAt'> = {
        statement,
        confidence,
        supportingEvidence: asStringArray(parsed.supportingEvidence),
        contradictingEvidence: asStringArray(parsed.contradictingEvidence),
        status: 'active',
      }

      const pad = scratchpadStore.updateHypothesis(scratchpadId, payload)
      const active = pad.activeHypothesis
      if (active === null) throw new Error('Hypothesis not stored')
      console.log(`${LOG} Initial hypothesis formed (confidence: ${String(active.confidence.toFixed(2))})`)
      return active
    } catch (err) {
      console.warn(`${LOG} Initial hypothesis failed, using fallback`, err)
      const fallback: Omit<Hypothesis, 'id' | 'updatedAt'> = {
        statement: `Provisional approach: address the task "${taskDescription.slice(0, 120)}…"`,
        confidence: 0.35,
        supportingEvidence: [],
        contradictingEvidence: [],
        status: 'active',
      }
      try {
        const pad = scratchpadStore.updateHypothesis(scratchpadId, fallback)
        return pad.activeHypothesis ?? this.minimalHypothesis(fallback.statement)
      } catch {
        return this.minimalHypothesis(fallback.statement)
      }
    }
  }

  private minimalHypothesis(statement: string): Hypothesis {
    const now = new Date().toISOString()
    return {
      id: 'fallback-hypothesis',
      statement,
      confidence: 0.35,
      supportingEvidence: [],
      contradictingEvidence: [],
      status: 'active',
      updatedAt: now,
    }
  }

  private parseObservationUpdate(
    parsed: Record<string, unknown>,
    prev: Hypothesis,
  ): {
    payload: Omit<Hypothesis, 'id' | 'updatedAt'>
    changed: boolean
    changeReason: string
    persistHypothesis: boolean
  } {
    const statement = typeof parsed.statement === 'string' ? parsed.statement.trim() : prev.statement
    const confidence =
      typeof parsed.confidence === 'number' && !Number.isNaN(parsed.confidence)
        ? Math.min(1, Math.max(0, parsed.confidence))
        : prev.confidence
    const supportingEvidence = asStringArray(parsed.supportingEvidence)
    const contradictingEvidence = asStringArray(parsed.contradictingEvidence)
    const statusRaw = typeof parsed.status === 'string' ? parsed.status.trim().toLowerCase() : 'active'
    const status: Hypothesis['status'] =
      statusRaw === 'confirmed' || statusRaw === 'rejected' ? statusRaw : 'active'
    const changed = parsed.changed === true
    const changeReason =
      typeof parsed.changeReason === 'string' && parsed.changeReason.length > 0
        ? parsed.changeReason
        : 'Model update'

    const payload: Omit<Hypothesis, 'id' | 'updatedAt'> = {
      statement,
      confidence,
      supportingEvidence: supportingEvidence.length > 0 ? supportingEvidence : prev.supportingEvidence,
      contradictingEvidence:
        contradictingEvidence.length > 0 ? contradictingEvidence : prev.contradictingEvidence,
      status,
    }

    return {
      payload,
      changed,
      changeReason,
      persistHypothesis: changed || status === 'rejected',
    }
  }

  /**
   * Revises the hypothesis from a new observation; may record insights or dead ends.
   */
  async updateFromObservation(
    scratchpadId: string,
    observationContent: string,
    observationStatus: string,
  ): Promise<Hypothesis | null> {
    const pad: CoTScratchpad | null = scratchpadStore.get(scratchpadId)
    if (pad === null || pad.activeHypothesis === null) {
      return null
    }
    const prev = pad.activeHypothesis

    const system = `Update a solution hypothesis based on a new observation.

Return ONLY valid JSON:
{
  "statement": "updated or unchanged hypothesis statement",
  "confidence": 0.0,
  "supportingEvidence": ["all supporting evidence including new"],
  "contradictingEvidence": ["all contradicting evidence"],
  "status": "active",
  "changed": false,
  "changeReason": "why it changed (if changed)"
}`

    const user = `Current hypothesis: ${prev.statement}
Current confidence: ${String(prev.confidence)}
New observation (${observationStatus}): ${observationContent.slice(0, 500)}`

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })

      const text = completion.choices[0]?.message?.content?.trim() ?? ''
      if (!text) throw new Error('Empty update response')

      const parsed = parseJsonObject(text) as Record<string, unknown>
      const { payload, changed, changeReason, persistHypothesis } = this.parseObservationUpdate(
        parsed,
        prev,
      )

      if (persistHypothesis) {
        scratchpadStore.updateHypothesis(scratchpadId, payload)
      }

      if (changed) {
        scratchpadStore.addInsight(
          scratchpadId,
          `Hypothesis updated: ${changeReason}`,
          'medium',
        )
        console.log(`${LOG} Hypothesis updated: ${changeReason}`)
      }

      if (payload.status === 'rejected') {
        scratchpadStore.recordDeadEnd(scratchpadId, {
          approach: prev.statement,
          whyItFailed: changeReason,
          avoidanceHint: `Do not attempt: ${prev.statement.slice(0, 200)}`,
        })
        console.log(`${LOG} Hypothesis rejected — recording dead end`)
      }

      scratchpadStore.updateConfidence(scratchpadId, payload.confidence)

      if (!persistHypothesis) {
        return null
      }

      const next = scratchpadStore.get(scratchpadId)
      return next?.activeHypothesis ?? null
    } catch (err) {
      console.warn(`${LOG} Update failed, keeping existing hypothesis`, err)
      return prev
    }
  }

  /**
   * Returns assumption ids that appear contradicted by the observation (heuristic + LLM confirm).
   */
  async detectAssumptionViolation(
    scratchpadId: string,
    observationContent: string,
  ): Promise<string[]> {
    const pad = scratchpadStore.get(scratchpadId)
    if (pad === null) return []

    const active = pad.assumptions.filter((a) => a.invalidatedAt === undefined)
    if (active.length === 0) return []

    const heuristicHits = active.filter((a) =>
      heuristicAssumptionConflict(a.content, observationContent),
    )

    const toCheck = heuristicHits.length > 0 ? heuristicHits : active

    try {
      const list = toCheck.map((a) => ({ id: a.id, content: a.content }))
      const system = `You decide which assumptions are violated by an observation.
Return ONLY valid JSON: { "violatedIds": ["id1"] } — use empty array if none.`

      const user = `Observation:
${observationContent.slice(0, 2000)}

Assumptions:
${JSON.stringify(list)}`

      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })

      const text = completion.choices[0]?.message?.content?.trim() ?? ''
      if (!text) return []

      const parsed = parseJsonObject(text) as Record<string, unknown>
      const ids = asStringArray(parsed.violatedIds)
      const valid = new Set(active.map((a) => a.id))
      return ids.filter((id) => valid.has(id))
    } catch (err) {
      console.warn(`${LOG} Assumption violation check failed`, err)
      return []
    }
  }
}
