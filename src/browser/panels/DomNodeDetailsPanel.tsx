import { useCallback, useEffect, useMemo, useState } from 'react'
import { MagicWand, Wrench } from '@phosphor-icons/react'
import { parseSourceLocationFromNode } from '@/browser/inspector/source-mapping'
import type { DomNode } from '@/browser/types-inspector'
import type { InspectorAiRequest, NodeAttributeEdit } from '@/browser/types-layout'
import { DATA_J_SOURCE_ATTR } from '@/browser/types-layout'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

export type DomNodeDetailsPanelProps = {
  selectedNode: DomNode | null
  tabId?: string | null
  onAttributeEdit?: (edit: NodeAttributeEdit) => void
  onAiRequest?: (request: InspectorAiRequest) => void
}

function openTagPreview(node: DomNode): string {
  const tag = node.tagName.toLowerCase()
  const idAttr = node.id ? ` id="${escapeAttr(node.id)}"` : ''
  const classAttr =
    node.classes.length > 0 ? ` class="${escapeAttr(node.classes.join(' '))}"` : ''
  return `<${tag}${idAttr}${classAttr}>`
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

const ATTR_SKIP = new Set(['id', 'class', 'style', DATA_J_SOURCE_ATTR])

function DomNodeDetailsBody({
  node,
  tabId,
  onAttributeEdit,
  onAiRequest,
}: {
  node: DomNode
  tabId: string | null
  onAttributeEdit?: (edit: NodeAttributeEdit) => void
  onAiRequest?: (request: InspectorAiRequest) => void
}) {
  const extraAttrs = useMemo(
    () =>
      Object.entries(node.attributes).filter(([name]) => !ATTR_SKIP.has(name.toLowerCase())),
    [node.attributes]
  )

  const sourceLoc = useMemo(() => parseSourceLocationFromNode(node), [node])

  const [idDraft, setIdDraft] = useState(() => node.id ?? '')
  const [classDraft, setClassDraft] = useState(() => node.classes.join(' '))
  const [styleDraft, setStyleDraft] = useState(() => node.inlineStyle ?? '')
  const [attrDrafts, setAttrDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(extraAttrs.map(([k, v]) => [k, v]))
  )

  const snapshotSig = useMemo(
    () =>
      `${node.nodeId}|${node.id ?? ''}|${node.classes.join(' ')}|${node.inlineStyle ?? ''}|${JSON.stringify(node.attributes)}`,
    [node]
  )

  useEffect(() => {
    setIdDraft(node.id ?? '')
    setClassDraft(node.classes.join(' '))
    setStyleDraft(node.inlineStyle ?? '')
    const extra = Object.entries(node.attributes).filter(([name]) => !ATTR_SKIP.has(name.toLowerCase()))
    setAttrDrafts(Object.fromEntries(extra.map(([k, v]) => [k, v])))
  }, [node, snapshotSig])

  const commitId = useCallback(() => {
    if (!onAttributeEdit) return
    const orig = node.id ?? ''
    const next = idDraft.trim()
    if (next === orig) return
    if (!next) {
      onAttributeEdit({ kind: 'remove-attribute', nodeId: node.nodeId, name: 'id' })
    } else {
      onAttributeEdit({ kind: 'set-attribute', nodeId: node.nodeId, name: 'id', value: next })
    }
  }, [idDraft, node.id, node.nodeId, onAttributeEdit])

  const commitClass = useCallback(() => {
    if (!onAttributeEdit) return
    const orig = node.classes.join(' ')
    const next = classDraft.trim()
    if (next === orig) return
    if (!next) {
      onAttributeEdit({ kind: 'remove-attribute', nodeId: node.nodeId, name: 'class' })
    } else {
      onAttributeEdit({ kind: 'set-attribute', nodeId: node.nodeId, name: 'class', value: next })
    }
  }, [classDraft, node.classes, node.nodeId, onAttributeEdit])

  const commitStyle = useCallback(() => {
    if (!onAttributeEdit) return
    const orig = node.inlineStyle ?? ''
    const next = styleDraft.trim()
    if (next === orig) return
    onAttributeEdit({ kind: 'set-style', nodeId: node.nodeId, value: next })
  }, [node.inlineStyle, node.nodeId, onAttributeEdit, styleDraft])

  const commitAttr = useCallback(
    (name: string, original: string) => {
      if (!onAttributeEdit) return
      const next = (attrDrafts[name] ?? '').trim()
      const orig = original ?? ''
      if (next === orig) return
      if (!next) {
        onAttributeEdit({ kind: 'remove-attribute', nodeId: node.nodeId, name })
      } else {
        onAttributeEdit({ kind: 'set-attribute', nodeId: node.nodeId, name, value: next })
      }
    },
    [attrDrafts, node.nodeId, onAttributeEdit]
  )

  const emitAi = useCallback(
    (kind: InspectorAiRequest['kind']) => {
      if (!tabId || !onAiRequest) return
      onAiRequest({
        kind,
        tabId,
        node,
        source: sourceLoc,
      })
    },
    [node, onAiRequest, sourceLoc, tabId]
  )

  const canAi = Boolean(tabId && onAiRequest)

  return (
    <div className="space-y-4 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase tracking-wide">
            Element
          </div>
          <code className="bg-muted/60 block rounded-md px-2 py-1.5 font-mono text-xs break-all">
            {openTagPreview(node)}
          </code>
        </div>
        {canAi ? (
          <div className="flex shrink-0 flex-wrap gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => emitAi('explain-node')}
            >
              <MagicWand size={14} aria-hidden />
              Explain
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => emitAi('fix-attributes')}
            >
              <Wrench size={14} aria-hidden />
              Fix attrs
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => emitAi('fix-layout')}
            >
              Layout
            </Button>
          </div>
        ) : null}
      </div>

      {sourceLoc && (
        <div>
          <div className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase tracking-wide">
            Source (data-j-source)
          </div>
          <div className="grid gap-1 font-mono text-[11px]">
            <div className="grid grid-cols-[5.5rem_1fr] gap-2">
              <span className="text-muted-foreground">workspace</span>
              <span className="break-all">{sourceLoc.workspaceId}</span>
            </div>
            <div className="grid grid-cols-[5.5rem_1fr] gap-2">
              <span className="text-muted-foreground">file</span>
              <span className="break-all">{sourceLoc.filePath}</span>
            </div>
            <div className="grid grid-cols-[5.5rem_1fr] gap-2">
              <span className="text-muted-foreground">marker</span>
              <span className="break-all">{sourceLoc.markerId}</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-2 text-xs">
        <div className="grid grid-cols-[4rem_1fr] items-center gap-2">
          <span className="text-muted-foreground shrink-0">id</span>
          {onAttributeEdit ? (
            <input
              className="bg-background border-input focus-visible:ring-ring w-full rounded border px-2 py-1 font-mono text-[11px] outline-none focus-visible:ring-1"
              value={idDraft}
              onChange={(e) => setIdDraft(e.target.value)}
              onBlur={commitId}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              aria-label="Element id"
            />
          ) : (
            <span className="font-mono break-all">{node.id ?? '(none)'}</span>
          )}
        </div>
        <div className="grid grid-cols-[4rem_1fr] items-start gap-2">
          <span className="text-muted-foreground shrink-0 pt-1.5">class</span>
          {onAttributeEdit ? (
            <input
              className="bg-background border-input focus-visible:ring-ring w-full rounded border px-2 py-1 font-mono text-[11px] outline-none focus-visible:ring-1"
              value={classDraft}
              onChange={(e) => setClassDraft(e.target.value)}
              onBlur={commitClass}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              aria-label="Element class list"
            />
          ) : (
            <span className="font-mono break-all">
              {node.classes.length > 0 ? node.classes.join(' ') : '(none)'}
            </span>
          )}
        </div>
      </div>

      <div>
        <div className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase tracking-wide">
          Attributes
        </div>
        {extraAttrs.length === 0 ? (
          <p className="text-muted-foreground text-xs">No other attributes.</p>
        ) : (
          <ul className="divide-border divide-y rounded-md border border-border text-xs">
            {extraAttrs.map(([name, value]) => (
              <li key={name} className="grid grid-cols-[minmax(5rem,28%)_1fr] gap-2 px-2 py-1.5">
                <span className="text-muted-foreground pt-1.5 font-mono">{name}</span>
                {onAttributeEdit ? (
                  <input
                    className="bg-background border-input focus-visible:ring-ring w-full rounded border px-2 py-1 font-mono text-[11px] outline-none focus-visible:ring-1"
                    value={attrDrafts[name] ?? ''}
                    onChange={(e) =>
                      setAttrDrafts((prev) => ({ ...prev, [name]: e.target.value }))
                    }
                    onBlur={() => commitAttr(name, value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    }}
                    aria-label={`Attribute ${name}`}
                  />
                ) : (
                  <span className="font-mono break-all">{value}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase tracking-wide">
          Inline style
        </div>
        {onAttributeEdit && (
          <textarea
            className={cn(
              'bg-background border-input focus-visible:ring-ring w-full resize-y rounded border p-2 font-mono text-[11px] leading-relaxed outline-none focus-visible:ring-1',
              'min-h-[72px]'
            )}
            value={styleDraft}
            onChange={(e) => setStyleDraft(e.target.value)}
            onBlur={commitStyle}
            placeholder="e.g. color: red; margin: 0;"
            aria-label="Inline style"
          />
        )}
        {!onAttributeEdit && node.inlineStyle?.trim() && (
          <pre
            className={cn(
              'bg-muted/40 max-h-40 overflow-auto rounded-md border border-border p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all'
            )}
          >
            {node.inlineStyle}
          </pre>
        )}
        {!onAttributeEdit && !node.inlineStyle?.trim() && (
          <p className="text-muted-foreground text-xs">No inline styles.</p>
        )}
      </div>

      {node.boundingRect && (
        <div>
          <div className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase tracking-wide">
            Bounding rect
          </div>
          <p className="font-mono text-xs">
            x {node.boundingRect.x.toFixed(0)} · y {node.boundingRect.y.toFixed(0)} · w{' '}
            {node.boundingRect.width.toFixed(0)} · h {node.boundingRect.height.toFixed(0)}
          </p>
        </div>
      )}
    </div>
  )
}

export function DomNodeDetailsPanel({
  selectedNode,
  tabId = null,
  onAttributeEdit,
  onAiRequest,
}: DomNodeDetailsPanelProps) {
  if (!selectedNode) {
    return (
      <div className="text-muted-foreground flex h-full min-h-[120px] items-center justify-center p-4 text-center text-sm">
        No element selected. Use the tree or &quot;Select element&quot; to choose one.
      </div>
    )
  }

  return (
    <ScrollArea className="h-full min-h-0">
      <DomNodeDetailsBody
        key={selectedNode.nodeId}
        node={selectedNode}
        tabId={tabId ?? null}
        onAttributeEdit={onAttributeEdit}
        onAiRequest={onAiRequest}
      />
    </ScrollArea>
  )
}
