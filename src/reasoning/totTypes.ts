/**
 * Shared types and small helpers for the Jarvis Tree-of-Thoughts (ToT) engine.
 *
 * @module reasoning/totTypes
 */

import { v4 as uuidv4 } from 'uuid'

/** Lifecycle / search state of a single thought in the tree. */
export type ThoughtNodeStatus =
  | 'pending'
  | 'expanded'
  | 'scored'
  | 'pruned'
  | 'selected'
  | 'backtracked'

/** How the tree search orders expansions. */
export type ToTSearchStrategy = 'beam' | 'bfs' | 'dfs'

/**
 * One node in a ToT search tree: a scored reasoning branch point.
 */
export interface ThoughtNode {
  /** Stable node id (uuid v4). */
  id: string
  /** Parent id, or `null` for the root. */
  parentId: string | null
  /** Distance from root; root has depth `0`. */
  depth: number
  /** Sibling index among nodes sharing the same parent and depth. */
  branchIndex: number
  /** Full natural-language reasoning at this node. */
  thought: string
  /** Short human-readable label (e.g. approach name). */
  approach: string
  /** Value-function aggregate in \([0, 1]\). */
  score: number
  /** Estimated probability this line succeeds in \([0, 1]\). */
  feasibility: number
  /** How completely the task is covered in \([0, 1]\). */
  completeness: number
  /** Distinctness from siblings in \([0, 1]\). */
  novelty: number
  status: ThoughtNodeStatus
  /** Child node ids (empty until expanded). */
  children: string[]
  /** Engine-specific annotations (timings, model ids, etc.). */
  metadata: Record<string, unknown>
  createdAt: string
}

/**
 * Mutable search tree for a single task within a session.
 */
export interface ToTTree {
  treeId: string
  sessionId: string
  taskType: string
  taskDescription: string
  /** Id of the root {@link ThoughtNode}; empty string until the root is inserted. */
  rootNodeId: string
  nodes: Map<string, ThoughtNode>
  beamWidth: number
  maxDepth: number
  branchFactor: number
  /** Best path so far: ids from root to chosen leaf. */
  selectedPath: string[]
  bestNodeId: string | null
  totalNodesGenerated: number
  totalNodesPruned: number
  searchStrategy: ToTSearchStrategy
  createdAt: string
  completedAt?: string
}

/**
 * Raw expansion proposal before it is attached as a {@link ThoughtNode}.
 */
export interface BranchCandidate {
  approach: string
  thought: string
  keyAssumptions: string[]
  estimatedSteps: number
  riskFactors: string[]
}

/**
 * Final packaged output of a ToT search run.
 */
export interface ToTResult {
  tree: ToTTree
  selectedNode: ThoughtNode
  selectedPath: string[]
  bestApproach: string
  bestThought: string
  searchSummary: string
  nodesExplored: number
  nodesPruned: number
  confidence: number
  alternativeApproaches: string[]
}

/** Default hyperparameters for Jarvis ToT (tuned for cost vs coverage). */
export const TOT_DEFAULTS = {
  BEAM_WIDTH: 3,
  BRANCH_FACTOR: 4,
  MAX_DEPTH: 2,
  PRUNE_THRESHOLD: 0.35,
  MIN_NOVELTY: 0.2,
} as const

export type TotConfigDefaults = typeof TOT_DEFAULTS

/**
 * Builds an empty tree shell; set {@link ToTTree.rootNodeId} when the root node is stored.
 */
export function createTree(
  sessionId: string,
  taskType: string,
  taskDescription: string,
  config?: Partial<TotConfigDefaults>,
): ToTTree {
  const merged = { ...TOT_DEFAULTS, ...config }
  return {
    treeId: uuidv4(),
    sessionId,
    taskType,
    taskDescription,
    rootNodeId: '',
    nodes: new Map(),
    beamWidth: merged.BEAM_WIDTH,
    maxDepth: merged.MAX_DEPTH,
    branchFactor: merged.BRANCH_FACTOR,
    selectedPath: [],
    bestNodeId: null,
    totalNodesGenerated: 0,
    totalNodesPruned: 0,
    searchStrategy: 'beam',
    createdAt: new Date().toISOString(),
  }
}

/**
 * Materialises a {@link BranchCandidate} as a new {@link ThoughtNode} (not yet inserted into a tree).
 */
export function createNode(
  parentId: string | null,
  depth: number,
  branchIndex: number,
  candidate: BranchCandidate,
): ThoughtNode {
  return {
    id: uuidv4(),
    parentId,
    depth,
    branchIndex,
    thought: candidate.thought,
    approach: candidate.approach,
    score: 0,
    feasibility: 0,
    completeness: 0,
    novelty: 0,
    status: 'pending',
    children: [],
    metadata: {},
    createdAt: new Date().toISOString(),
  }
}

/**
 * Returns the ancestor chain from root to `nodeId` (inclusive). Empty if the node is missing or orphaned.
 */
export function getNodePath(tree: ToTTree, nodeId: string): ThoughtNode[] {
  const pathRev: ThoughtNode[] = []
  const seen = new Set<string>()
  let currentId: string | null = nodeId

  while (currentId !== null) {
    if (seen.has(currentId)) {
      return []
    }
    seen.add(currentId)
    const node = tree.nodes.get(currentId)
    if (node === undefined) {
      return []
    }
    pathRev.push(node)
    currentId = node.parentId
  }

  return pathRev.reverse()
}

/**
 * Non-pruned nodes at `depth`, highest {@link ThoughtNode.score} first.
 */
export function getBeamNodes(tree: ToTTree, depth: number): ThoughtNode[] {
  const out: ThoughtNode[] = []
  for (const node of tree.nodes.values()) {
    if (node.depth === depth && node.status !== 'pruned') {
      out.push(node)
    }
  }
  out.sort((a, b) => b.score - a.score)
  return out
}
