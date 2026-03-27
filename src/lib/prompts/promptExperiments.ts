/**
 * Lightweight in-memory A/B assignment for registered prompt versions: deterministic per-session
 * traffic split, outcome counters, and optional winner deployment via {@link promptRegistry}.
 */

import { v4 as uuidv4 } from 'uuid'

import { promptRegistry } from './promptRegistry'
import type { PromptVersion } from './promptRegistry'

const LOG = '[Experiments]'

/** Aggregated metrics collected while an experiment runs. */
export interface ExperimentResults {
  controlCalls: number
  variantCalls: number
  controlMisroutes: number
  variantMisroutes: number
  controlAvgVerification: number
  variantAvgVerification: number
  winner?: 'control' | 'variant' | 'inconclusive'
}

/** Definition and live stats for a single prompt A/B test. */
export interface PromptExperiment {
  id: string
  name: string
  /** Registry version id for the production / baseline prompt. */
  controlVersionId: string
  /** Registry version id for the candidate prompt. */
  variantVersionId: string
  /** Fraction of sessions assigned to the variant (0–1). */
  trafficSplit: number
  startedAt: string
  endedAt?: string
  active: boolean
  results: ExperimentResults
}

function emptyResults(): ExperimentResults {
  return {
    controlCalls: 0,
    variantCalls: 0,
    controlMisroutes: 0,
    variantMisroutes: 0,
    controlAvgVerification: 0,
    variantAvgVerification: 0,
  }
}

function findVersionById(versionId: string): PromptVersion | undefined {
  return promptRegistry.getVersionHistory().find((v) => v.id === versionId)
}

function misrouteRate(misroutes: number, calls: number): number | null {
  if (calls <= 0) {
    return null
  }
  return misroutes / calls
}

/**
 * Tracks prompt experiments against the shared {@link promptRegistry}.
 */
export class PromptExperimentTracker {
  private readonly experimentsById = new Map<string, PromptExperiment>()

  /**
   * djb2 over `sessionId`, reduced to a deterministic bucket in [0, 99].
   */
  private _hashSessionId(sessionId: string): number {
    let hash = 5381
    for (let i = 0; i < sessionId.length; i++) {
      hash = (hash * 33 + sessionId.charCodeAt(i)) | 0
    }
    return Math.abs(hash) % 100
  }

  private sessionGetsVariant(sessionId: string, trafficSplit: number): boolean {
    const h = this._hashSessionId(sessionId)
    return h < trafficSplit * 100
  }

  /**
   * Registers a new active experiment; supersedes any previously active experiment (marks it inactive and ended).
   */
  createExperiment(
    name: string,
    controlVersionId: string,
    variantVersionId: string,
    trafficSplit: number = 0.1,
  ): PromptExperiment {
    if (trafficSplit < 0 || trafficSplit > 1 || Number.isNaN(trafficSplit)) {
      throw new Error(`${LOG} trafficSplit must be between 0 and 1`)
    }
    const control = findVersionById(controlVersionId)
    const variant = findVersionById(variantVersionId)
    if (control === undefined) {
      throw new Error(`${LOG} control version not found: ${controlVersionId}`)
    }
    if (variant === undefined) {
      throw new Error(`${LOG} variant version not found: ${variantVersionId}`)
    }

    const now = new Date().toISOString()
    for (const e of this.experimentsById.values()) {
      if (e.active && e.endedAt === undefined) {
        e.active = false
        e.endedAt = now
      }
    }

    const experiment: PromptExperiment = {
      id: uuidv4(),
      name: name.trim(),
      controlVersionId,
      variantVersionId,
      trafficSplit,
      startedAt: now,
      active: true,
      results: emptyResults(),
    }
    this.experimentsById.set(experiment.id, experiment)
    const pct = Math.round(trafficSplit * 1000) / 10
    console.info(`${LOG} Created: ${experiment.name} (${String(pct)}% variant traffic)`)
    return experiment
  }

  private getActiveExperiment(): PromptExperiment | null {
    const actives = [...this.experimentsById.values()].filter((e) => e.active && e.endedAt === undefined)
    if (actives.length === 0) {
      return null
    }
    actives.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    return actives[0] ?? null
  }

  /**
   * Every experiment that is still marked active and not ended (may be multiple during transitions).
   */
  listActiveExperiments(): PromptExperiment[] {
    return [...this.experimentsById.values()].filter((e) => e.active && e.endedAt === undefined)
  }

  /**
   * Resolves prompt text for a session: registry default when no experiment, otherwise control vs variant by hash.
   */
  getActivePromptForRequest(sessionId: string): string {
    const exp = this.getActiveExperiment()
    if (exp === null) {
      return promptRegistry.getActivePrompt() ?? ''
    }
    const variant = findVersionById(exp.variantVersionId)
    const control = findVersionById(exp.controlVersionId)
    if (variant === undefined || control === undefined) {
      console.warn(`${LOG} Missing registry version; falling back to global active prompt`)
      return promptRegistry.getActivePrompt() ?? ''
    }
    if (this.sessionGetsVariant(sessionId, exp.trafficSplit)) {
      return variant.prompt
    }
    return control.prompt
  }

  /**
   * Records a single turn outcome for the session's assigned arm (active experiment only).
   */
  recordOutcome(
    sessionId: string,
    outcome: { misrouted: boolean; verificationScore: number },
  ): void {
    const exp = this.getActiveExperiment()
    if (exp === null) {
      return
    }
    const useVariant = this.sessionGetsVariant(sessionId, exp.trafficSplit)
    const r = exp.results
    const score = Number.isFinite(outcome.verificationScore) ? outcome.verificationScore : 0

    if (useVariant) {
      r.variantCalls++
      if (outcome.misrouted) {
        r.variantMisroutes++
      }
      const n = r.variantCalls
      r.variantAvgVerification = (r.variantAvgVerification * (n - 1) + score) / n
    } else {
      r.controlCalls++
      if (outcome.misrouted) {
        r.controlMisroutes++
      }
      const n = r.controlCalls
      r.controlAvgVerification = (r.controlAvgVerification * (n - 1) + score) / n
    }
  }

  /**
   * Computes misroute rates, compares verification averages, sets {@link ExperimentResults.winner}, and returns a recommendation.
   */
  analyseExperiment(experimentId: string): ExperimentResults & { recommendation: string } {
    const exp = this.experimentsById.get(experimentId)
    if (exp === undefined) {
      throw new Error(`${LOG} Unknown experiment id: ${experimentId}`)
    }
    const r = exp.results
    const cRate = misrouteRate(r.controlMisroutes, r.controlCalls)
    const vRate = misrouteRate(r.variantMisroutes, r.variantCalls)

    let winner: ExperimentResults['winner']
    let recommendation: string

    if (r.controlCalls < 1 || r.variantCalls < 1) {
      winner = 'inconclusive'
      recommendation =
        'Not enough traffic on both arms yet. Keep collecting outcomes before choosing a winner.'
    } else if (cRate === null || vRate === null) {
      winner = 'inconclusive'
      recommendation = 'Could not compute misroute rates; treat as inconclusive.'
    } else if (vRate > cRate) {
      winner = 'control'
      recommendation =
        'Variant misroutes more often than control. Keep the control prompt unless you iterate on the variant.'
    } else if (vRate < cRate && r.variantAvgVerification > r.controlAvgVerification) {
      winner = 'variant'
      recommendation =
        'Variant shows lower misroute rate and higher average verification. Strong candidate to promote.'
    } else {
      winner = 'inconclusive'
      recommendation =
        'Mixed signals (misroutes vs verification do not both favour variant). Extend the test or revise the variant.'
    }

    r.winner = winner
    return {
      ...r,
      recommendation,
    }
  }

  /**
   * Stops the experiment; optionally promotes the winning registry version.
   */
  endExperiment(experimentId: string, deployWinner: boolean): void {
    const exp = this.experimentsById.get(experimentId)
    if (exp === undefined) {
      throw new Error(`${LOG} Unknown experiment id: ${experimentId}`)
    }
    const now = new Date().toISOString()
    exp.active = false
    exp.endedAt = now

    const analysis = this.analyseExperiment(experimentId)
    const w = analysis.winner ?? 'inconclusive'

    if (deployWinner) {
      if (w === 'variant') {
        promptRegistry.activate(exp.variantVersionId)
      } else if (w === 'control') {
        promptRegistry.activate(exp.controlVersionId)
      } else {
        console.warn(`${LOG} deployWinner ignored: result is inconclusive`)
      }
    }

    console.info(`${LOG} Ended: ${exp.name}. Winner: ${w}. Deployed: ${String(deployWinner)}`)
  }
}

/** Process-wide experiment tracker (in-memory). */
export const promptExperiments = new PromptExperimentTracker()
