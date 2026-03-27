/**
 * KnowledgeGraphModal — interactive D3 force-directed graph showing the
 * entities and relationships extracted from the current conversation thread.
 *
 * Features:
 *  - Force-directed layout (D3 v7)
 *  - Drag, pan, and zoom
 *  - Color-coded nodes by entity type
 *  - Hover tooltip with entity details
 *  - Legend
 *  - Live re-renders when messages change
 */

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Graph } from '@phosphor-icons/react'
import { buildKnowledgeGraph, type EntityType, type KGEdge, type KGNode } from '@/lib/knowledge-graph'
import type { Message } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

const TYPE_COLOR: Record<EntityType, string> = {
  concept:      '#6366f1', // indigo
  technology:   '#10b981', // emerald
  person:       '#f59e0b', // amber
  organization: '#3b82f6', // blue
  source:       '#8b5cf6', // violet
}

const TYPE_LABEL: Record<EntityType, string> = {
  concept:      'Concept',
  technology:   'Technology',
  person:       'Person',
  organization: 'Organization',
  source:       'Source',
}

// ---------------------------------------------------------------------------
// D3 graph renderer
// ---------------------------------------------------------------------------

interface D3Node extends d3.SimulationNodeDatum, KGNode {}
interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  weight: number
  source: D3Node
  target: D3Node
}

function renderGraph(
  svgEl: SVGSVGElement,
  graph: { nodes: KGNode[]; edges: KGEdge[] },
  width: number,
  height: number
) {
  // Deep-clone so D3 mutations don't bleed into graph state
  const nodes: D3Node[] = graph.nodes.map((n) => ({ ...n }))
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const links: D3Link[] = graph.edges
    .map((e) => ({
      source: nodeById.get(e.source)!,
      target: nodeById.get(e.target)!,
      weight: e.weight,
    }))
    .filter((e) => e.source && e.target) as D3Link[]

  const svg = d3.select(svgEl)
  svg.selectAll('*').remove()

  // Zoom container
  const container = svg.append('g').attr('class', 'kg-container')

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 4])
    .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      container.attr('transform', event.transform.toString())
    })
  svg.call(zoom)

  // Arrow marker
  svg.append('defs').append('marker')
    .attr('id', 'kg-arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 18)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#4b5563')

  // Force simulation
  const simulation = d3.forceSimulation<D3Node>(nodes)
    .force('link', d3.forceLink<D3Node, D3Link>(links)
      .id((d) => d.id)
      .distance((l) => 90 + (1 / (l.weight + 1)) * 60))
    .force('charge', d3.forceManyBody().strength(-220))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide<D3Node>().radius((d) => nodeRadius(d) + 6))

  // Edges
  const link = container.append('g')
    .attr('class', 'kg-links')
    .selectAll<SVGLineElement, D3Link>('line')
    .data(links)
    .join('line')
    .attr('stroke', '#374151')
    .attr('stroke-opacity', (d) => Math.min(0.85, 0.3 + d.weight * 0.15))
    .attr('stroke-width', (d) => Math.min(3, 0.8 + d.weight * 0.4))

  // Node groups
  const node = container.append('g')
    .attr('class', 'kg-nodes')
    .selectAll<SVGGElement, D3Node>('g')
    .data(nodes)
    .join('g')
    .attr('class', 'kg-node')
    .style('cursor', 'grab')

  // Drag
  const drag = d3.drag<SVGGElement, D3Node>()
    .on('start', (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
      d3.select(event.sourceEvent.target as Element)
        .closest('.kg-node')
        ?.setAttribute('style', 'cursor: grabbing')
    })
    .on('drag', (event, d) => {
      d.fx = event.x
      d.fy = event.y
    })
    .on('end', (event, d) => {
      if (!event.active) simulation.alphaTarget(0)
      d.fx = null
      d.fy = null
      d3.select(event.sourceEvent.target as Element)
        .closest('.kg-node')
        ?.setAttribute('style', 'cursor: grab')
    })
  node.call(drag)

  // Node circles
  node.append('circle')
    .attr('r', (d) => nodeRadius(d))
    .attr('fill', (d) => TYPE_COLOR[d.type])
    .attr('fill-opacity', 0.85)
    .attr('stroke', (d) => d3.color(TYPE_COLOR[d.type])?.darker(0.6)?.toString() ?? '#fff')
    .attr('stroke-width', 1.5)

  // Node labels
  node.append('text')
    .text((d) => truncateLabel(d.label, 20))
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', (d) => Math.min(11, 7 + d.weight))
    .attr('font-family', 'system-ui, sans-serif')
    .attr('fill', '#f9fafb')
    .attr('pointer-events', 'none')

  // Tooltip (native title for lightweight implementation)
  node.append('title')
    .text((d) => `${d.label}\nType: ${TYPE_LABEL[d.type]}\nMentions: ${d.weight}`)

  // Tick
  simulation.on('tick', () => {
    link
      .attr('x1', (d) => (d.source as D3Node).x ?? 0)
      .attr('y1', (d) => (d.source as D3Node).y ?? 0)
      .attr('x2', (d) => (d.target as D3Node).x ?? 0)
      .attr('y2', (d) => (d.target as D3Node).y ?? 0)
    node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
  })

  return () => simulation.stop()
}

function nodeRadius(node: KGNode): number {
  return Math.min(28, 10 + node.weight * 2.5)
}

function truncateLabel(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

// ---------------------------------------------------------------------------
// Trigger button (standalone, rendered in the thread header)
// ---------------------------------------------------------------------------

interface KnowledgeGraphButtonProps {
  messages: Message[]
}

export function KnowledgeGraphButton({ messages }: KnowledgeGraphButtonProps) {
  const [open, setOpen] = useState(false)

  const assistantCount = messages.filter((m) => m.role === 'assistant').length
  if (assistantCount < 1) return null

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(true)}
          >
            <Graph size={15} weight="duotone" />
            Knowledge Graph
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Visualise entities &amp; relationships in this thread
        </TooltipContent>
      </Tooltip>

      <KnowledgeGraphModal open={open} onOpenChange={setOpen} messages={messages} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Modal + D3 canvas
// ---------------------------------------------------------------------------

interface KnowledgeGraphModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  messages: Message[]
}

export function KnowledgeGraphModal({ open, onOpenChange, messages }: KnowledgeGraphModalProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [nodeCount, setNodeCount] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)
  const [isEmpty, setIsEmpty] = useState(false)

  useEffect(() => {
    if (!open || !svgRef.current || !containerRef.current) return

    const graph = buildKnowledgeGraph(messages)
    setNodeCount(graph.nodes.length)
    setEdgeCount(graph.edges.length)

    if (graph.nodes.length === 0) {
      setIsEmpty(true)
      return
    }
    setIsEmpty(false)

    const { width, height } = containerRef.current.getBoundingClientRect()
    const stop = renderGraph(svgRef.current, graph, width, height)
    return stop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, messages.length])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Graph size={18} weight="duotone" className="text-accent" />
                Knowledge Graph
              </DialogTitle>
              {!isEmpty && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {nodeCount} entities &middot; {edgeCount} relationships
                  &nbsp;&mdash;&nbsp;drag to rearrange, scroll to zoom
                </p>
              )}
            </div>
            {/* Legend */}
            {!isEmpty && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {(Object.entries(TYPE_COLOR) as [EntityType, string][]).map(([type, color]) => (
                  <span key={type} className="flex items-center gap-1">
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    {TYPE_LABEL[type]}
                  </span>
                ))}
              </div>
            )}
          </div>
        </DialogHeader>

        <div ref={containerRef} className="flex-1 relative overflow-hidden bg-muted/10">
          {isEmpty ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8">
              <Graph size={48} weight="thin" className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Not enough content yet to build a knowledge graph.
                <br />
                Continue the conversation and check back after a few exchanges.
              </p>
            </div>
          ) : (
            <svg
              ref={svgRef}
              className="absolute inset-0 w-full h-full"
              aria-label="Knowledge graph of entities and relationships"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
