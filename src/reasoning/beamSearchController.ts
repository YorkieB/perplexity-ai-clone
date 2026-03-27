/**
 * Beam search driver for the Tree-of-Thoughts engine: expand, score, prune, and select a path.
 *
 * Beam selection is applied to each newly generated sibling set; `getBeamNodes` in `./totTypes`
 * lists non-pruned nodes at a depth (e.g. for inspection).
 *
 * @module reasoning/beamSearchController
 */

import { telemetry } from '@/lib/observability/telemetryCollector'

import BranchGenerator from './branchGenerator'
import BranchScorer, { type ScoringContext } from './branchScorer'
import {
  TOT_DEFAULTS,
  createNode,
  getNodePath,
  type BranchCandidate,
  type ThoughtNode,
  type ToTTree,
  type ToTResult,
} from './totTypes'

const LOG = '[BeamSearch]'

/**
 * Hyperparameters and task context for {@link BeamSearchController.search}.
 */
export interface BeamSearchConfig {
  beamWidth?: number
  branchFactor?: number
  maxDepth?: number
  pruneThreshold?: number
  scoringContext: ScoringContext
  sessionId: string
}

/**
 * Runs width-limited breadth expansion with LLM branch generation and scoring.
 */
export default class BeamSearchController {
  private readonly branchGenerator: BranchGenerator
  private readonly scorer: BranchScorer
  private readonly beamWidth: number
  private readonly branchFactor: number
  private readonly maxDepth: number
  private readonly pruneThreshold: number
  private readonly scoringContext: ScoringContext
  private readonly sessionId: string

  /**
   * @param config - Search limits and {@link ScoringContext} for the value function.
   */
  constructor(config: BeamSearchConfig) {
    this.branchGenerator = new BranchGenerator()
    this.scorer = new BranchScorer()
    this.beamWidth = config.beamWidth ?? TOT_DEFAULTS.BEAM_WIDTH
    this.branchFactor = config.branchFactor ?? TOT_DEFAULTS.BRANCH_FACTOR
    this.maxDepth = config.maxDepth ?? TOT_DEFAULTS.MAX_DEPTH
    this.pruneThreshold = config.pruneThreshold ?? TOT_DEFAULTS.PRUNE_THRESHOLD
    this.scoringContext = config.scoringContext
    this.sessionId = config.sessionId
  }

  /**
   * Generates the tree, applies beam pruning each depth, and returns the best {@link ToTResult}.
   */
  async search(tree: ToTTree): Promise<ToTResult> {
    const searchStart = Date.now()

    const rootCandidates = await this.branchGenerator.generateRootBranches(
      tree.taskDescription,
      tree.taskType,
      this.sessionId,
      this.branchFactor,
    )

    const rootNodes = rootCandidates.map((c: BranchCandidate, i) => createNode(null, 0, i, c))
    for (const rootNode of rootNodes) {
      tree.nodes.set(rootNode.id, rootNode)
    }
    if (rootNodes.length > 0) {
      tree.rootNodeId = rootNodes[0].id
    }
    tree.totalNodesGenerated += rootNodes.length

    await this.scorer.scoreBatch(rootNodes, tree, this.scoringContext)

    const rootMax = Math.max(...rootNodes.map((n) => n.score), 0)
    console.log(
      `${LOG} Depth 0: ${String(rootNodes.length)} branches generated, top score: ${rootMax.toFixed(2)}`,
    )

    let currentBeam = this._applyBeamWidth(rootNodes, this.beamWidth)
    this._pruneNodes(rootNodes, currentBeam, tree)

    for (let depth = 1; depth <= this.maxDepth; depth++) {
      if (currentBeam.length === 0) {
        break
      }

      currentBeam.forEach((n) => {
        n.status = 'expanded'
      })

      const branchResults = await Promise.all(
        currentBeam.map((beamNode) =>
          this.branchGenerator.generateBranches(
            tree.taskDescription,
            tree.taskType,
            beamNode,
            tree,
            this.sessionId,
            this.branchFactor,
          ),
        ),
      )

      const nextLevelNodes: ThoughtNode[] = []
      currentBeam.forEach((beamNode, i) => {
        const childCandidates = branchResults[i] ?? []
        const childNodes = childCandidates.map((c: BranchCandidate, j) => {
          const node = createNode(beamNode.id, depth, j, c)
          tree.nodes.set(node.id, node)
          beamNode.children.push(node.id)
          return node
        })
        nextLevelNodes.push(...childNodes)
        tree.totalNodesGenerated += childNodes.length
      })

      await this.scorer.scoreBatch(nextLevelNodes, tree, this.scoringContext)

      const levelMax = nextLevelNodes.length === 0 ? 0 : Math.max(...nextLevelNodes.map((n) => n.score), 0)
      console.log(
        `${LOG} Depth ${String(depth)}: ${String(currentBeam.length)} nodes expanded in parallel → ${String(nextLevelNodes.length)} children, top score: ${levelMax.toFixed(2)}`,
      )

      currentBeam = this._applyBeamWidth(nextLevelNodes, this.beamWidth)
      this._pruneNodes(nextLevelNodes, currentBeam, tree)
    }

    const bestNode = this._selectBestNode(tree)
    tree.bestNodeId = bestNode.id
    tree.selectedPath = getNodePath(tree, bestNode.id).map((n) => n.id)
    bestNode.status = 'selected'
    tree.completedAt = new Date().toISOString()

    telemetry.record('tot_search_complete', this.sessionId, {
      treeId: tree.treeId,
      nodesGenerated: tree.totalNodesGenerated,
      nodesPruned: tree.totalNodesPruned,
      bestScore: bestNode.score,
      depth: tree.maxDepth,
      durationMs: Date.now() - searchStart,
      taskType: tree.taskType,
    })

    console.log(
      `${LOG} Search complete — best node: ${bestNode.id.slice(0, 8)} score: ${bestNode.score.toFixed(2)} explored: ${String(tree.totalNodesGenerated)} nodes, pruned: ${String(tree.totalNodesPruned)}`,
    )

    return this._buildResult(tree, bestNode)
  }

  /** Keeps the top `beamWidth` nodes by {@link ThoughtNode.score}. */
  private _applyBeamWidth(nodes: ThoughtNode[], beamWidth: number): ThoughtNode[] {
    const sorted = [...nodes].sort((a, b) => b.score - a.score)
    return sorted.slice(0, Math.max(0, beamWidth))
  }

  /**
   * Marks nodes outside the beam as pruned (low score) or backtracked (competitive but dropped).
   */
  private _pruneNodes(allNodes: ThoughtNode[], keepNodes: ThoughtNode[], tree: ToTTree): void {
    const keepIds = new Set(keepNodes.map((n) => n.id))
    for (const node of allNodes) {
      if (keepIds.has(node.id)) {
        continue
      }
      if (node.score < this.pruneThreshold) {
        node.status = 'pruned'
        tree.totalNodesPruned++
      } else {
        node.status = 'backtracked'
      }
    }
  }

  /**
   * Picks the highest-scoring active leaf; tie-break deeper depth; else best root by score.
   */
  private _selectBestNode(tree: ToTTree): ThoughtNode {
    const active = (n: ThoughtNode) => n.status !== 'pruned' && n.status !== 'backtracked'

    const candidates: ThoughtNode[] = []
    for (const node of tree.nodes.values()) {
      if (!active(node)) continue
      if (this._isLeaf(tree, node)) {
        candidates.push(node)
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return b.depth - a.depth
      })
      return candidates[0]
    }

    const roots: ThoughtNode[] = []
    for (const node of tree.nodes.values()) {
      if (node.depth === 0 && active(node)) {
        roots.push(node)
      }
    }
    if (roots.length > 0) {
      roots.sort((a, b) => b.score - a.score)
      return roots[0]
    }

    const any = [...tree.nodes.values()].sort((a, b) => b.score - a.score)
    return any[0] ?? [...tree.nodes.values()][0]
  }

  /** True when the node has no live (non-pruned / non-backtracked) children. */
  private _isLeaf(tree: ToTTree, node: ThoughtNode): boolean {
    if (node.children.length === 0) {
      return true
    }
    return node.children.every((id) => {
      const c = tree.nodes.get(id)
      if (c === undefined) return true
      return c.status === 'pruned' || c.status === 'backtracked'
    })
  }

  /** Assembles {@link ToTResult} from the chosen node and tree statistics. */
  private _buildResult(tree: ToTTree, bestNode: ThoughtNode): ToTResult {
    const pathNodes = getNodePath(tree, bestNode.id)
    const pathIds = pathNodes.map((n) => n.id)

    const alternatives: string[] = []
    const others = [...tree.nodes.values()]
      .filter((n) => n.id !== bestNode.id)
      .sort((a, b) => b.score - a.score)
    const seen = new Set<string>()
    for (const n of others) {
      const a = n.approach.trim()
      if (a.length === 0 || seen.has(a)) continue
      seen.add(a)
      alternatives.push(a)
      if (alternatives.length >= 3) break
    }

    const levels = this.maxDepth + 1
    const searchSummary = `Explored ${String(tree.totalNodesGenerated)} branches across ${String(levels)} levels. Best approach (score: ${bestNode.score.toFixed(2)}): ${bestNode.approach}. Pruned ${String(tree.totalNodesPruned)} low-score branches.`

    return {
      tree,
      selectedNode: bestNode,
      selectedPath: pathIds,
      bestApproach: bestNode.approach,
      bestThought: bestNode.thought,
      searchSummary,
      nodesExplored: tree.totalNodesGenerated,
      nodesPruned: tree.totalNodesPruned,
      confidence: bestNode.score,
      alternativeApproaches: alternatives,
    }
  }
}
