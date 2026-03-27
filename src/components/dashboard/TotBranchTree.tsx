'use client'

import { useMemo, useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { TotSearchSummary } from '@/hooks/useJarvisTelemetry'
import type { ThoughtNode, ThoughtNodeStatus, ToTTree } from '@/reasoning/totTypes'

export interface TotBranchTreeProps {
  searches: TotSearchSummary[]
  /** Live tree from the ToT engine; when missing, search summaries are shown as cards. */
  latestTree?: ToTTree | null
}

const NODE_W = 120
const NODE_H = 60
const DEPTH_X = 200
const BASE_X = 80
const VERT_GAP = 80
const MARGIN = 32

function getNodesMap(tree: ToTTree): Map<string, ThoughtNode> {
  const raw = tree.nodes
  if (raw instanceof Map) {
    return raw
  }
  if (raw !== null && typeof raw === 'object') {
    return new Map(Object.entries(raw as Record<string, ThoughtNode>))
  }
  return new Map()
}

function scoreFill(score: number): string {
  if (score >= 0.8) return '#10b981'
  if (score >= 0.6) return '#60a5fa'
  if (score >= 0.4) return '#fbbf24'
  return '#f87171'
}

function truncateApproach(s: string, max = 20): string {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

interface NodeLayout {
  id: string
  x: number
  y: number
  node: ThoughtNode
}

function buildLayout(tree: ToTTree): { layouts: NodeLayout[]; width: number; height: number } {
  const nodesMap = getNodesMap(tree)
  const byDepth = new Map<number, ThoughtNode[]>()

  for (const node of nodesMap.values()) {
    const list = byDepth.get(node.depth) ?? []
    list.push(node)
    byDepth.set(node.depth, list)
  }

  let maxDepth = 0
  for (const d of byDepth.keys()) {
    if (d > maxDepth) maxDepth = d
  }

  for (const arr of byDepth.values()) {
    arr.sort((a, b) => {
      const pa = a.parentId ?? ''
      const pb = b.parentId ?? ''
      if (pa !== pb) return pa.localeCompare(pb)
      return a.branchIndex - b.branchIndex
    })
  }

  let maxN = 1
  for (const arr of byDepth.values()) {
    maxN = Math.max(maxN, arr.length)
  }

  const totalHeight = MARGIN * 2 + (maxN - 1) * VERT_GAP + NODE_H
  const layouts: NodeLayout[] = []

  for (let d = 0; d <= maxDepth; d++) {
    const layer = byDepth.get(d) ?? []
    const n = layer.length
    const colH = (n - 1) * VERT_GAP + NODE_H
    const offsetY = (totalHeight - colH) / 2
    const x = BASE_X + d * DEPTH_X

    layer.forEach((node, i) => {
      const y = offsetY + i * VERT_GAP
      layouts.push({ id: node.id, x, y, node })
    })
  }

  const width = BASE_X + maxDepth * DEPTH_X + NODE_W + MARGIN
  const height = totalHeight

  return { layouts, width, height }
}

function isPrunedNode(n: ThoughtNode): boolean {
  return n.status === 'pruned' || n.status === 'backtracked'
}

function isSelectedNode(tree: ToTTree, n: ThoughtNode): boolean {
  if (tree.bestNodeId === n.id) return true
  if (n.status === 'selected') return true
  return tree.selectedPath.includes(n.id)
}

function edgeIsPruned(child: ThoughtNode): boolean {
  return isPrunedNode(child)
}

function rectStrokeColor(selected: boolean, pruned: boolean): string {
  if (selected) return '#059669'
  if (pruned) return '#9ca3af'
  return '#1f2937'
}

function rectStrokeWidthPx(selected: boolean, pruned: boolean): number {
  if (selected) return 3
  if (pruned) return 1.5
  return 1
}

function statusBadgeClass(status: ThoughtNodeStatus): string {
  if (status === 'selected' || status === 'scored') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-900'
  }
  if (status === 'pruned' || status === 'backtracked') {
    return 'border-gray-200 bg-gray-50 text-gray-700'
  }
  return 'border-border bg-muted text-foreground'
}

interface TooltipState {
  x: number
  y: number
  node: ThoughtNode
}

function TotTreeSvg({
  tree,
  searches,
}: {
  tree: ToTTree
  searches: TotSearchSummary[]
}) {
  const [tip, setTip] = useState<TooltipState | null>(null)

  const { layouts, width, height } = useMemo(() => buildLayout(tree), [tree])
  const posById = useMemo(() => new Map(layouts.map((l) => [l.id, l])), [layouts])

  const stats = useMemo(() => {
    const last = searches[searches.length - 1]
    return {
      explored: tree.totalNodesGenerated,
      pruned: tree.totalNodesPruned,
      bestScore: (() => {
        if (tree.bestNodeId !== null) {
          const bn = getNodesMap(tree).get(tree.bestNodeId)
          if (bn !== undefined) return bn.score
        }
        return last?.bestScore ?? 0
      })(),
      durationMs: last?.durationMs ?? 0,
    }
  }, [tree, searches])

  const edges = useMemo(() => {
    const out: { parentId: string; childId: string; child: ThoughtNode }[] = []
    const nodesMap = getNodesMap(tree)
    for (const node of nodesMap.values()) {
      if (node.parentId === null) continue
      out.push({ parentId: node.parentId, childId: node.id, child: node })
    }
    return out
  }, [tree])

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="max-w-none text-gray-500"
        role="img"
        aria-label="Tree of Thoughts beam search"
      >
        <defs>
          <marker
            id="tot-arrow-active"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="#6b7280" />
          </marker>
          <marker
            id="tot-arrow-pruned"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="#d1d5db" />
          </marker>
          <filter id="tot-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#059669" floodOpacity="0.45" />
          </filter>
        </defs>

        {edges.map(({ parentId, childId, child }) => {
          const p = posById.get(parentId)
          const c = posById.get(childId)
          if (p === undefined || c === undefined) return null
          const x1 = p.x + NODE_W
          const y1 = p.y + NODE_H / 2
          const x2 = c.x
          const y2 = c.y + NODE_H / 2
          const midX = (x1 + x2) / 2
          const dPath = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
          const pruned = edgeIsPruned(child)
          return (
            <path
              key={`${parentId}->${childId}`}
              d={dPath}
              fill="none"
              stroke={pruned ? '#d1d5db' : '#6b7280'}
              strokeWidth={1.5}
              markerEnd={pruned ? 'url(#tot-arrow-pruned)' : 'url(#tot-arrow-active)'}
            />
          )
        })}

        {layouts.map(({ id, x, y, node }) => {
          const pruned = isPrunedNode(node)
          const selected = isSelectedNode(tree, node)
          const fill = scoreFill(node.score)
          return (
            <g
              key={id}
              transform={`translate(${x},${y})`}
              onMouseEnter={(e) => {
                setTip({ x: e.clientX, y: e.clientY, node })
              }}
              onMouseMove={(e) => {
                setTip((prev) => {
                  if (prev !== null && prev.node.id === id) {
                    return { x: e.clientX, y: e.clientY, node }
                  }
                  return prev
                })
              }}
              onMouseLeave={() => {
                setTip((prev) => (prev?.node.id === id ? null : prev))
              }}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={8}
                ry={8}
                fill={fill}
                opacity={pruned ? 0.3 : 1}
                stroke={rectStrokeColor(selected, pruned)}
                strokeWidth={rectStrokeWidthPx(selected, pruned)}
                strokeDasharray={pruned ? '6 4' : undefined}
                filter={selected ? 'url(#tot-glow)' : undefined}
                className="cursor-default"
              />
              <text x={NODE_W / 2} y={22} textAnchor="middle" className="fill-gray-900 text-[11px] font-medium" style={{ pointerEvents: 'none' }}>
                {truncateApproach(node.approach)}
              </text>
              <text x={NODE_W / 2} y={42} textAnchor="middle" className="fill-gray-800 text-[10px]" style={{ pointerEvents: 'none' }}>
                {(node.score * 100).toFixed(0)}% score
              </text>
            </g>
          )
        })}
      </svg>

      {tip !== null ? (
        <div
          className="border-border bg-popover text-popover-foreground pointer-events-none fixed z-50 max-w-sm rounded-md border px-3 py-2 text-xs shadow-lg"
          style={{
            left: tip.x + 12,
            top: tip.y + 12,
          }}
        >
          <p className="text-foreground font-medium">{tip.node.approach}</p>
          <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">{tip.node.thought}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
            <dt className="text-muted-foreground">Feasibility</dt>
            <dd className="tabular-nums">{(tip.node.feasibility * 100).toFixed(0)}%</dd>
            <dt className="text-muted-foreground">Completeness</dt>
            <dd className="tabular-nums">{(tip.node.completeness * 100).toFixed(0)}%</dd>
            <dt className="text-muted-foreground">Novelty</dt>
            <dd className="tabular-nums">{(tip.node.novelty * 100).toFixed(0)}%</dd>
          </dl>
          <p className="mt-2">
            <span
              className={cn(
                'inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize',
                statusBadgeClass(tip.node.status),
              )}
            >
              {tip.node.status}
            </span>
          </p>
        </div>
      ) : null}

      <TotStatsBar
        explored={stats.explored}
        pruned={stats.pruned}
        bestScore={stats.bestScore}
        durationMs={stats.durationMs}
      />
    </div>
  )
}

function TotStatsBar({
  explored,
  pruned,
  bestScore,
  durationMs,
}: {
  explored: number
  pruned: number
  bestScore: number
  durationMs: number
}) {
  return (
    <p className="text-muted-foreground mt-3 border-t pt-3 text-center text-xs tabular-nums">
      Explored: {explored} | Pruned: {pruned} | Best score: {(bestScore * 100).toFixed(0)}% | Duration:{' '}
      {(durationMs / 1000).toFixed(1)}s
    </p>
  )
}

function SearchSummaryCards({ searches }: { searches: TotSearchSummary[] }) {
  const last = searches[searches.length - 1]
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {searches.map((s, i) => (
          <Card key={`${s.timestamp}-${String(i)}`} className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Search {i + 1}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-1 text-xs">
              <p>
                {s.nodesExplored} nodes · {s.nodesPruned} pruned
              </p>
              <p>Best: {(s.bestScore * 100).toFixed(0)}%</p>
              <p>Duration: {(s.durationMs / 1000).toFixed(1)}s</p>
              <p className="text-[10px] opacity-80">{s.taskType}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {last !== undefined ? (
        <TotStatsBar
          explored={last.nodesExplored}
          pruned={last.nodesPruned}
          bestScore={last.bestScore}
          durationMs={last.durationMs}
        />
      ) : null}
    </div>
  )
}

/**
 * Tree-of-Thoughts beam visual: SVG branch view when a {@link ToTTree} is supplied, otherwise compact search cards.
 */
export function TotBranchTree({ searches, latestTree }: TotBranchTreeProps) {
  const hasSearches = searches.length > 0
  const hasTree = latestTree !== null && latestTree !== undefined
  const nodesMap = hasTree ? getNodesMap(latestTree) : new Map()
  const treeReady = hasTree && latestTree.rootNodeId.length > 0 && nodesMap.size > 0

  if (!hasSearches && !treeReady) {
    return (
      <section className="py-10 text-center" aria-label="Tree of Thoughts">
        <p className="text-muted-foreground text-sm">
          No Tree of Thoughts searches yet — complex tasks will populate this view
        </p>
      </section>
    )
  }

  if (!treeReady) {
    return (
      <section className="space-y-3" aria-label="Tree of Thoughts">
        <h2 className="text-lg font-semibold tracking-tight">Tree of Thoughts</h2>
        <SearchSummaryCards searches={searches} />
      </section>
    )
  }

  return (
    <section className="space-y-3" aria-label="Tree of Thoughts">
      <h2 className="text-lg font-semibold tracking-tight">Tree of Thoughts</h2>
      <TotTreeSvg tree={latestTree} searches={searches} />
    </section>
  )
}

export default TotBranchTree
