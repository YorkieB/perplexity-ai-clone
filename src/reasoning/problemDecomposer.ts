/**
 * LLM-driven task decomposition into ordered {@link SubGoal}s and scratchpad updates.
 *
 * @module reasoning/problemDecomposer
 */

import OpenAI from 'openai'
import { v4 as uuidv4 } from 'uuid'

import type { Assumption, SubGoal } from './cotScratchpad'
import { scratchpadStore } from './scratchpadStore'

const LOG = '[ProblemDecomposer]'

/** Parsed model output before ids are attached. */
export interface DecompositionResult {
  subGoals: SubGoal[]
  assumptions: Assumption[]
  openQuestions: string[]
  estimatedComplexity: 'simple' | 'moderate' | 'complex' | 'very_complex'
  decompositionRationale: string
}

/** Sub-goal count bands for complexity labels (Phase 4 ToT hint at very_complex). */
export const COMPLEXITY_THRESHOLDS = {
  simple: 1,
  moderate: 3,
  complex: 5,
  very_complex: 99,
} as const

interface RawDecompositionJson {
  subGoals?: unknown
  assumptions?: unknown
  openQuestions?: unknown
  estimatedComplexity?: unknown
  decompositionRationale?: unknown
}

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

function norm(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * Maps dependency labels from the model (other sub-goal descriptions) to stable ids.
 */
function resolveDependsOnIds(
  descriptions: string[],
  ids: string[],
  dependsLabels: string[],
  selfIndex: number,
): string[] {
  const descNorm = descriptions.map(norm)
  const out: string[] = []
  for (const dep of dependsLabels) {
    const nd = norm(dep)
    if (nd.length === 0) continue
    let found: string | undefined
    for (let j = 0; j < descNorm.length; j++) {
      if (j === selfIndex) continue
      const d = descNorm[j]!
      if (d === nd || d.includes(nd) || nd.includes(d)) {
        found = ids[j]
        break
      }
    }
    if (found !== undefined) {
      out.push(found)
    }
  }
  return [...new Set(out)]
}

function isAssumptionSource(s: string): s is Assumption['source'] {
  return s === 'user_message' || s === 'rag_context' || s === 'reasoning' || s === 'observation'
}

interface ParsedGoalRow {
  description: string
  depLabels: string[]
  blockedReason?: string
}

function extractGoalRow(g: unknown): ParsedGoalRow | null {
  if (g === null || typeof g !== 'object') return null
  const o = g as Record<string, unknown>
  const description = typeof o.description === 'string' ? o.description.trim() : ''
  if (description.length === 0) return null
  const depLabels: string[] = []
  if (Array.isArray(o.dependsOn)) {
    for (const x of o.dependsOn) {
      if (typeof x === 'string' && x.trim().length > 0) depLabels.push(x.trim())
    }
  }
  let blockedReason: string | undefined
  if (o.blockedReason != null && String(o.blockedReason).length > 0) {
    blockedReason = String(o.blockedReason)
  }
  return { description, depLabels, blockedReason }
}

function parseComplexity(
  raw: unknown,
  subGoalCount: number,
): DecompositionResult['estimatedComplexity'] {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (
    s === 'simple' ||
    s === 'moderate' ||
    s === 'complex' ||
    s === 'very_complex'
  ) {
    return s
  }
  if (subGoalCount >= 6) return 'very_complex'
  if (subGoalCount >= 4) return 'complex'
  if (subGoalCount >= 2) return 'moderate'
  return 'simple'
}

/**
 * Uses an LLM to split work into {@link SubGoal}s and writes results to the scratchpad.
 */
export default class ProblemDecomposer {
  private readonly client: OpenAI
  private readonly model: string

  constructor(model: string = 'gpt-4o') {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
    this.model = model
  }

  /**
   * Decomposes a task, persists goals/assumptions/questions on the scratchpad, returns structured result.
   */
  async decompose(
    taskDescription: string,
    taskType: string,
    availableContext: string[],
    scratchpadId: string,
  ): Promise<DecompositionResult> {
    const contextBlock = availableContext
      .slice(0, 3)
      .join('\n---\n')
      .slice(0, 1000)
    const { system, user } = this.buildDecompositionMessages(taskDescription, taskType, contextBlock)

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
      if (!text) {
        throw new Error('Empty decomposition response')
      }

      const parsed = parseJsonObject(text) as RawDecompositionJson
      const subGoals = this.parseSubGoalsFromJson(parsed)
      const assumptionPayloads = this.parseAssumptionPayloads(parsed)
      const openQuestions = this.parseOpenQuestionsList(parsed)
      const estimatedComplexity = parseComplexity(parsed.estimatedComplexity, subGoals.length)
      const decompositionRationale =
        typeof parsed.decompositionRationale === 'string'
          ? parsed.decompositionRationale
          : 'Decomposition complete.'

      const assumptionsOut = this.persistDecomposition(
        scratchpadId,
        subGoals,
        assumptionPayloads,
        openQuestions,
      )

      console.log(
        `${LOG} Decomposed into ${String(subGoals.length)} sub-goals (complexity: ${estimatedComplexity})`,
      )

      return {
        subGoals,
        assumptions: assumptionsOut,
        openQuestions,
        estimatedComplexity,
        decompositionRationale,
      }
    } catch (err) {
      console.warn(`${LOG} Decomposition failed, using single sub-goal fallback`, err)
      return this.applyFallbackDecomposition(taskDescription, scratchpadId)
    }
  }

  private buildDecompositionMessages(
    taskDescription: string,
    taskType: string,
    contextBlock: string,
  ): { system: string; user: string } {
    const system = `You are a task decomposition agent. Break the given task into 
the minimum number of ordered sub-goals needed to complete it.

Rules:
- Sub-goals must be concrete and independently executable
- Each sub-goal should produce a verifiable output
- List dependencies between sub-goals explicitly
- Identify assumptions that must be true for the plan to work
- Flag any information gaps as open questions
- Be conservative — do not over-decompose simple tasks

Task type: ${taskType}

Return ONLY valid JSON:
{
  "subGoals": [
    {
      "description": "...",
      "status": "pending",
      "dependsOn": [],
      "blockedReason": null
    }
  ],
  "assumptions": [
    { "content": "...", "confidence": 0.0, "source": "reasoning" }
  ],
  "openQuestions": ["..."],
  "estimatedComplexity": "simple|moderate|complex|very_complex",
  "decompositionRationale": "why this breakdown makes sense"
}`

    const user = `Task: ${taskDescription}

Available context:
${contextBlock}`
    return { system, user }
  }

  private parseSubGoalsFromJson(parsed: RawDecompositionJson): SubGoal[] {
    const rawGoals = Array.isArray(parsed.subGoals) ? parsed.subGoals : []
    const rows: ParsedGoalRow[] = []
    for (const g of rawGoals) {
      const row = extractGoalRow(g)
      if (row !== null) rows.push(row)
    }

    if (rows.length === 0) {
      throw new Error('No sub-goals in response')
    }

    const descriptions = rows.map((r) => r.description)
    const depLabels = rows.map((r) => r.depLabels)
    const blockedReasons = rows.map((r) => r.blockedReason)
    const ids = descriptions.map(() => uuidv4())
    return descriptions.map((description, i) => {
      const dependsOn = resolveDependsOnIds(descriptions, ids, depLabels[i] ?? [], i)
      const blockedReason = blockedReasons[i]
      return {
        id: ids[i]!,
        description,
        status: 'pending' as const,
        dependsOn,
        ...(blockedReason !== undefined ? { blockedReason } : {}),
      }
    })
  }

  private parseAssumptionPayloads(parsed: RawDecompositionJson): Omit<Assumption, 'id'>[] {
    const rawAssumptions = Array.isArray(parsed.assumptions) ? parsed.assumptions : []
    const out: Omit<Assumption, 'id'>[] = []
    for (const a of rawAssumptions) {
      if (a === null || typeof a !== 'object') continue
      const o = a as Record<string, unknown>
      const content = typeof o.content === 'string' ? o.content.trim() : ''
      if (content.length === 0) continue
      const confidence =
        typeof o.confidence === 'number' && !Number.isNaN(o.confidence)
          ? Math.min(1, Math.max(0, o.confidence))
          : 0.5
      const srcRaw = typeof o.source === 'string' ? o.source : 'reasoning'
      const source: Assumption['source'] = isAssumptionSource(srcRaw) ? srcRaw : 'reasoning'
      out.push({ content, confidence, source })
    }
    return out
  }

  private parseOpenQuestionsList(parsed: RawDecompositionJson): string[] {
    const raw = Array.isArray(parsed.openQuestions) ? parsed.openQuestions : []
    return raw.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
  }

  private persistDecomposition(
    scratchpadId: string,
    subGoals: SubGoal[],
    assumptionPayloads: Omit<Assumption, 'id'>[],
    openQuestions: string[],
  ): Assumption[] {
    scratchpadStore.appendStructuredSubGoals(scratchpadId, subGoals)
    const assumptionsOut: Assumption[] = []
    for (const ap of assumptionPayloads) {
      const pad = scratchpadStore.addAssumption(scratchpadId, ap)
      const last = pad.assumptions[pad.assumptions.length - 1]
      if (last !== undefined) assumptionsOut.push(last)
    }
    for (const q of openQuestions) {
      scratchpadStore.addOpenQuestion(scratchpadId, q)
    }
    return assumptionsOut
  }

  private applyFallbackDecomposition(
    taskDescription: string,
    scratchpadId: string,
  ): DecompositionResult {
    const id = uuidv4()
    const single: SubGoal = {
      id,
      description: taskDescription,
      status: 'pending',
      dependsOn: [],
    }
    scratchpadStore.appendStructuredSubGoals(scratchpadId, [single])
    return {
      subGoals: [single],
      assumptions: [],
      openQuestions: [],
      estimatedComplexity: 'simple',
      decompositionRationale: 'Fallback: single sub-goal after decomposition failure.',
    }
  }

  /**
   * Fast gate: whether to run full decomposition (rules first, then a tiny model for borderline cases).
   */
  async shouldDecompose(taskDescription: string, taskType: string): Promise<boolean> {
    const t = taskType.trim().toLowerCase()
    if (t === 'conversational' || t === 'clarification_needed') {
      return false
    }
    const hasAndConnector = /\band\b/i.test(taskDescription)
    if (taskDescription.length < 80 && !hasAndConnector) {
      return false
    }

    try {
      const res = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: `Answer YES or NO only: Does this task require multiple distinct steps that depend on each other? Task: ${taskDescription}`,
          },
        ],
      })
      const text = res.choices[0]?.message?.content?.trim().toUpperCase() ?? ''
      return text.startsWith('Y')
    } catch {
      return taskDescription.length >= 80 || hasAndConnector
    }
  }

  /**
   * Abandons incomplete goals and re-runs decomposition with extra context after a failure.
   */
  async redecompose(
    scratchpadId: string,
    reason: string,
    updatedContext: string[],
  ): Promise<DecompositionResult> {
    console.log(`${LOG} Redecomposing after: ${reason}`)
    const pad = scratchpadStore.get(scratchpadId)
    if (pad === null) {
      return {
        subGoals: [],
        assumptions: [],
        openQuestions: [],
        estimatedComplexity: 'simple',
        decompositionRationale: 'No scratchpad found.',
      }
    }
    scratchpadStore.abandonIncompleteSubGoals(scratchpadId)
    const augmented = `${pad.taskDescription}\n\nReplan context (what failed and why): ${reason}`
    return this.decompose(augmented, pad.taskType, updatedContext, scratchpadId)
  }
}
