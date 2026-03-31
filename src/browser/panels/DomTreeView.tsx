/* Tree row: disclosure, drag handle strip, optional append-drop control, selection/hover. */
/* eslint-disable sonarjs/cognitive-complexity */
import { memo, useCallback, useEffect, useState } from 'react'
import { ArrowBendDownRight, CaretDown, CaretRight } from '@phosphor-icons/react'
import type { DomNode } from '@/browser/types-inspector'
import type { LayoutEditAction, LayoutEditKind } from '@/browser/types-layout'
import { JARVIS_LAYOUT_DRAG_MIME } from '@/browser/types-layout'
import { cn } from '@/lib/utils'
import { domSubtreeContainsNode } from '@/browser/panels/dom-inspector-utils'

export type DomTreeViewProps = {
  root: DomNode | null
  selectedNodeId: string | null
  hoverNodeId: string | null
  onSelectNode: (nodeId: string) => void
  onHoverNode?: (nodeId: string | null) => void
  onDropLayoutEdit?: (action: LayoutEditAction) => void
}

function formatNodeLabel(node: DomNode): string {
  const tag = node.tagName.toLowerCase()
  const idPart = node.id ? `#${node.id}` : ''
  const classPart =
    node.classes.length > 0 ? `.${node.classes.join('.')}` : ''
  return `${tag}${idPart}${classPart}`
}

function isLayoutDropAllowed(
  treeRoot: DomNode,
  sourceId: string,
  targetId: string,
  kind: LayoutEditKind
): boolean {
  if (sourceId === targetId) return false
  if (kind === 'appendChild') {
    if (domSubtreeContainsNode(treeRoot, sourceId, targetId)) return false
  } else if (domSubtreeContainsNode(treeRoot, sourceId, targetId)) {
    return false
  }
  return true
}

type RowProps = {
  treeRoot: DomNode
  node: DomNode
  depth: number
  expanded: Set<string>
  toggleExpanded: (nodeId: string) => void
  selectedNodeId: string | null
  hoverNodeId: string | null
  onSelectNode: (nodeId: string) => void
  onHoverNode?: (nodeId: string | null) => void
  onDropLayoutEdit?: (action: LayoutEditAction) => void
}

const DomTreeRow = memo(function DomTreeRow({
  treeRoot,
  node,
  depth,
  expanded,
  toggleExpanded,
  selectedNodeId,
  hoverNodeId,
  onSelectNode,
  onHoverNode,
  onDropLayoutEdit,
}: RowProps) {
  const hasChildren = node.children.length > 0
  const isExpanded = expanded.has(node.nodeId)
  const isSelected = selectedNodeId === node.nodeId
  const isHovered = hoverNodeId === node.nodeId
  const dnd = Boolean(onDropLayoutEdit)

  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onSelectNode(node.nodeId)
    },
    [node.nodeId, onSelectNode]
  )

  const handleDisclosureClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      toggleExpanded(node.nodeId)
    },
    [node.nodeId, toggleExpanded]
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!onDropLayoutEdit) return
      const el = e.target
      if (el instanceof Element && el.closest('button')) {
        e.preventDefault()
        return
      }
      e.dataTransfer.setData(JARVIS_LAYOUT_DRAG_MIME, node.nodeId)
      e.dataTransfer.effectAllowed = 'move'
    },
    [node.nodeId, onDropLayoutEdit]
  )

  const emitDrop = useCallback(
    (e: React.DragEvent, kind: LayoutEditKind) => {
      e.preventDefault()
      e.stopPropagation()
      if (!onDropLayoutEdit) return
      const sourceId = e.dataTransfer.getData(JARVIS_LAYOUT_DRAG_MIME)
      if (!sourceId) return
      const action: LayoutEditAction = {
        kind,
        sourceNodeId: sourceId,
        targetNodeId: node.nodeId,
      }
      if (!isLayoutDropAllowed(treeRoot, sourceId, node.nodeId, kind)) return
      onDropLayoutEdit(action)
    },
    [node.nodeId, onDropLayoutEdit, treeRoot]
  )

  const handleDragOverStrip = useCallback((e: React.DragEvent) => {
    if (!onDropLayoutEdit) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [onDropLayoutEdit])

  const handleDropStrip = useCallback(
    (e: React.DragEvent) => {
      if (!onDropLayoutEdit) return
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const mid = rect.top + rect.height / 2
      const kind: LayoutEditKind = e.clientY < mid ? 'moveBefore' : 'moveAfter'
      emitDrop(e, kind)
    },
    [emitDrop, onDropLayoutEdit]
  )

  const handleDropAppend = useCallback(
    (e: React.DragEvent) => {
      emitDrop(e, 'appendChild')
    },
    [emitDrop]
  )

  return (
    <li className="list-none" role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined}>
      <div
        role="none"
        className={cn(
          'flex items-stretch gap-0.5 rounded-sm py-0.5 pr-0.5 text-left text-xs leading-tight',
          isSelected && 'bg-primary/15 ring-1 ring-primary/40',
          !isSelected && isHovered && 'bg-muted/80',
          !isSelected && !isHovered && 'hover:bg-muted/50'
        )}
        style={{ paddingLeft: `${6 + depth * 12}px` }}
        onClick={handleRowClick}
        onMouseEnter={onHoverNode ? () => onHoverNode(node.nodeId) : undefined}
        onMouseLeave={onHoverNode ? () => onHoverNode(null) : undefined}
      >
        {hasChildren ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex h-6 w-5 shrink-0 items-center justify-center rounded"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            onClick={handleDisclosureClick}
          >
            {isExpanded ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
          </button>
        ) : (
          <span className="inline-block w-5 shrink-0" aria-hidden />
        )}
        <div
          role="none"
          draggable={dnd}
          onDragStart={handleDragStart}
          onDragOver={handleDragOverStrip}
          onDrop={handleDropStrip}
          className={cn(
            'flex min-h-6 min-w-0 flex-1 items-center rounded-sm px-0.5 font-mono text-[11px]',
            dnd && 'cursor-grab active:cursor-grabbing'
          )}
        >
          {formatNodeLabel(node)}
        </div>
        {dnd && (
          <button
            type="button"
            title="Drop to nest inside"
            aria-label="Drop dragged node to nest inside this element"
            className="text-muted-foreground hover:text-foreground hover:bg-muted/80 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-dashed border-border/60"
            onClick={(e) => e.stopPropagation()}
            onDragOver={handleDragOverStrip}
            onDrop={handleDropAppend}
          >
            <ArrowBendDownRight size={14} weight="bold" aria-hidden />
          </button>
        )}
      </div>
      {hasChildren && isExpanded && (
        <ul className="border-border/40 ml-0 border-l border-dashed pl-0" role="group">
          {node.children.map((child) => (
            <DomTreeRow
              key={child.nodeId}
              treeRoot={treeRoot}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              selectedNodeId={selectedNodeId}
              hoverNodeId={hoverNodeId}
              onSelectNode={onSelectNode}
              onHoverNode={onHoverNode}
              onDropLayoutEdit={onDropLayoutEdit}
            />
          ))}
        </ul>
      )}
    </li>
  )
})

export function DomTreeView({
  root,
  selectedNodeId,
  hoverNodeId,
  onSelectNode,
  onHoverNode,
  onDropLayoutEdit,
}: DomTreeViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!root) {
      setExpanded(new Set())
      return
    }
    setExpanded(new Set([root.nodeId]))
  }, [root])

  const toggleExpanded = useCallback((nodeId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  if (!root) {
    return (
      <div className="text-muted-foreground flex h-full min-h-[120px] items-center justify-center p-4 text-center text-sm">
        <div>
          <p className="font-medium">No DOM snapshot</p>
          <p className="mt-1 text-xs">Click &quot;Refresh DOM&quot; to capture the page tree.</p>
        </div>
      </div>
    )
  }

  return (
    <ul className="m-0 min-h-0 flex-1 list-none overflow-auto p-1" role="tree">
      <DomTreeRow
        treeRoot={root}
        node={root}
        depth={0}
        expanded={expanded}
        toggleExpanded={toggleExpanded}
        selectedNodeId={selectedNodeId}
        hoverNodeId={hoverNodeId}
        onSelectNode={onSelectNode}
        onHoverNode={onHoverNode}
        onDropLayoutEdit={onDropLayoutEdit}
      />
    </ul>
  )
}
