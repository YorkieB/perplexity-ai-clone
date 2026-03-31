import { useCallback, useMemo } from 'react'
import { ArrowsClockwise, CursorClick } from '@phosphor-icons/react'
import { useDomInspector } from '@/browser/hooks/useDomInspector'
import { applyAttributeEdit, applyLayoutEdit } from '@/browser/inspector/layout-editor'
import type { InspectorAiRequest, LayoutEditAction, NodeAttributeEdit } from '@/browser/types-layout'
import { showBrowserToast } from '@/ui/toast/toast-helpers'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { DomNodeDetailsPanel } from '@/browser/panels/DomNodeDetailsPanel'
import { DomTreeView } from '@/browser/panels/DomTreeView'
import { findDomNodeById } from '@/browser/panels/dom-inspector-utils'

export type DevToolsDomInspectorPanelProps = {
  activeTabId: string | null
  onAiRequest?: (request: InspectorAiRequest) => void
}

/**
 * DOM inspector UI: toolbar, expandable tree, and details for the selected node.
 * Pass `activeTabId` from the browser shell (e.g. {@link JarvisBrowserShell}).
 */
export function DevToolsDomInspectorPanel({
  activeTabId,
  onAiRequest,
}: Readonly<DevToolsDomInspectorPanelProps>) {
  const {
    tree,
    isLoadingSnapshot,
    inspectModeEnabled,
    selectedNodeId,
    hoverNodeId,
    refreshSnapshot,
    toggleInspectMode,
    selectNode,
    highlightNode,
    clearTreeHoverHighlight,
  } = useDomInspector(activeTabId)

  const selectedNode = useMemo(
    () => findDomNodeById(tree, selectedNodeId),
    [tree, selectedNodeId]
  )

  const handleDropLayoutEdit = useCallback(
    async (action: LayoutEditAction) => {
      if (!activeTabId) return
      const mode = await applyLayoutEdit(activeTabId, tree, action)
      if (mode === 'source') {
        showBrowserToast('Applied edit against source (stubbed: no file write yet).', 'success')
      } else if (mode === 'dom') {
        showBrowserToast('Applied change only to live DOM (no source mapping).', 'warning')
      }
      await refreshSnapshot()
    },
    [activeTabId, refreshSnapshot, tree]
  )

  const handleAttributeEdit = useCallback(
    async (edit: NodeAttributeEdit) => {
      if (!activeTabId) return
      const mode = await applyAttributeEdit(activeTabId, tree, edit)
      if (mode === 'source') {
        showBrowserToast('Recorded attribute edit for source (stubbed: no file write yet).', 'success')
      } else if (mode === 'dom') {
        showBrowserToast('Applied attribute change only to live DOM (no source mapping).', 'warning')
      }
      await refreshSnapshot()
    },
    [activeTabId, refreshSnapshot, tree]
  )

  return (
    <div
      className={cn(
        'border-border bg-background flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border',
        'max-h-[min(70vh,560px)]'
      )}
    >
      <div className="border-border flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          disabled={!activeTabId || isLoadingSnapshot}
          onClick={() => {
            void refreshSnapshot()
          }}
        >
          <ArrowsClockwise
            size={16}
            className={cn(isLoadingSnapshot && 'animate-spin')}
            aria-hidden
          />
          Refresh DOM
        </Button>
        <Button
          type="button"
          variant={inspectModeEnabled ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5"
          disabled={!activeTabId}
          onClick={() => {
            void toggleInspectMode()
          }}
        >
          <CursorClick size={16} aria-hidden />
          {inspectModeEnabled ? 'Stop picking' : 'Select element'}
        </Button>
        {isLoadingSnapshot && (
          <span className="text-muted-foreground text-xs">Capturing…</span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div className="border-border flex min-h-[200px] min-w-0 flex-1 flex-col border-b sm:border-b-0 sm:border-r">
          <div className="text-muted-foreground border-b border-border px-2 py-1 text-[10px] font-medium uppercase tracking-wide">
            DOM tree
            {tree ? (
              <span className="text-muted-foreground/80 ml-2 font-normal normal-case">
                Drag the tag label; drop upper/lower half to reorder, or the right control to nest.
              </span>
            ) : null}
          </div>
          <ScrollArea className="min-h-0 flex-1">
            {!tree && isLoadingSnapshot && (
              <div className="text-muted-foreground flex min-h-[160px] items-center justify-center p-4 text-sm">
                Capturing DOM…
              </div>
            )}
            {!tree && !isLoadingSnapshot && (
              <div className="text-muted-foreground flex min-h-[160px] items-center justify-center p-4 text-center text-sm">
                <p>
                  No snapshot yet. Choose a tab and click <strong>Refresh DOM</strong>.
                </p>
              </div>
            )}
            {tree && (
              <DomTreeView
                root={tree}
                selectedNodeId={selectedNodeId}
                hoverNodeId={hoverNodeId}
                onSelectNode={(nodeId) => {
                  selectNode(nodeId)
                }}
                onHoverNode={(nodeId) => {
                  if (nodeId) highlightNode(nodeId).catch(() => {})
                  else clearTreeHoverHighlight().catch(() => {})
                }}
                onDropLayoutEdit={handleDropLayoutEdit}
              />
            )}
          </ScrollArea>
        </div>
        <div className="flex min-h-[180px] w-full min-w-0 flex-1 flex-col sm:max-w-[50%]">
          <div className="text-muted-foreground border-b border-border px-2 py-1 text-[10px] font-medium uppercase tracking-wide">
            Details
          </div>
          <div className="min-h-0 flex-1">
            <DomNodeDetailsPanel
              selectedNode={selectedNode}
              tabId={activeTabId}
              onAttributeEdit={(edit) => {
                void handleAttributeEdit(edit)
              }}
              onAiRequest={onAiRequest}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
