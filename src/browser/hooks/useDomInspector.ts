import { useCallback, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/shallow'
import type { DomNode } from '@/browser/types-inspector'
import { getJarvisBrowserInspectorBridge } from '@/browser/electron-browser-bridge'
import {
  ensureDomInspectorBridgeWired,
  useDomInspectorStore,
} from '@/browser/stores/dom-inspector-store'

type DomInspectorTabSlice = {
  tree: DomNode | null
  isLoadingSnapshot: boolean
  inspectModeEnabled: boolean
  selectedNodeId: string | null
  hoverNodeId: string | null
}

const emptyTab: DomInspectorTabSlice = {
  tree: null,
  isLoadingSnapshot: false,
  inspectModeEnabled: false,
  selectedNodeId: null,
  hoverNodeId: null,
}

/**
 * Tab-scoped DOM inspector UI API (state in {@link useDomInspectorStore}, bridge events wired once).
 *
 * @example
 * ```tsx
 * const { tree, refreshSnapshot, toggleInspectMode } = useDomInspector(activeTabId)
 * ```
 */
export function useDomInspector(tabId: string | null | undefined) {
  const id = tabId ?? null

  useEffect(() => {
    ensureDomInspectorBridgeWired()
  }, [])

  useEffect(() => {
    if (!id) return
    useDomInspectorStore.getState().ensureTab(id)
    useDomInspectorStore.getState().setActiveTab(id)
  }, [id])

  const tabSlice = useDomInspectorStore(
    useShallow((s) => {
      if (!id) return emptyTab
      const t = s.tabs[id]
      if (!t) return emptyTab
      return {
        tree: t.tree,
        isLoadingSnapshot: t.isLoadingSnapshot,
        inspectModeEnabled: t.inspectModeEnabled,
        selectedNodeId: t.selectedNodeId,
        hoverNodeId: t.hoverNodeId,
      }
    })
  )

  const {
    tree,
    isLoadingSnapshot,
    inspectModeEnabled,
    selectedNodeId,
    hoverNodeId,
  } = tabSlice

  const inspector = useMemo(() => getJarvisBrowserInspectorBridge(), [])

  const refreshSnapshot = useCallback(async () => {
    if (!id || !inspector) return
    const { setLoading, setSnapshot } = useDomInspectorStore.getState()
    setLoading(id, true)
    try {
      const next = await inspector.captureSnapshot(id)
      setSnapshot(id, next)
    } finally {
      setLoading(id, false)
    }
  }, [id, inspector])

  const enableInspectMode = useCallback(async () => {
    if (!id || !inspector) return
    const { setInspectMode } = useDomInspectorStore.getState()
    try {
      await inspector.enableInspectMode(id)
      setInspectMode(id, true)
    } catch {
      setInspectMode(id, false)
    }
  }, [id, inspector])

  const disableInspectMode = useCallback(async () => {
    if (!id || !inspector) return
    const { setInspectMode } = useDomInspectorStore.getState()
    try {
      await inspector.disableInspectMode(id)
    } catch {
      /* still reflect desired UI state */
    } finally {
      setInspectMode(id, false)
    }
  }, [id, inspector])

  const toggleInspectMode = useCallback(async () => {
    if (!id) return
    const enabled = useDomInspectorStore.getState().tabs[id]?.inspectModeEnabled ?? false
    if (enabled) await disableInspectMode()
    else await enableInspectMode()
  }, [id, disableInspectMode, enableInspectMode])

  const highlightNode = useCallback(
    async (nodeId: string) => {
      if (!id || !inspector) return
      useDomInspectorStore.getState().setHoverNode(id, nodeId)
      try {
        await inspector.highlightNode(id, nodeId)
      } catch {
        /* ignore */
      }
    },
    [id, inspector]
  )

  const clearTreeHoverHighlight = useCallback(async () => {
    if (!id || !inspector) return
    useDomInspectorStore.getState().setHoverNode(id, null)
    const sel = useDomInspectorStore.getState().tabs[id]?.selectedNodeId
    if (sel) {
      try {
        await inspector.highlightNode(id, sel)
      } catch {
        /* ignore */
      }
    } else {
      try {
        await inspector.clearPageHighlight(id)
      } catch {
        /* ignore */
      }
    }
  }, [id, inspector])

  const selectNode = useCallback(
    (nodeId: string) => {
      if (!id || !inspector) return
      useDomInspectorStore.getState().setSelectedNode(id, nodeId)
      inspector.highlightNode(id, nodeId).catch(() => {})
    },
    [id, inspector]
  )

  return {
    tree,
    isLoadingSnapshot,
    inspectModeEnabled,
    selectedNodeId,
    hoverNodeId,
    refreshSnapshot,
    enableInspectMode,
    disableInspectMode,
    toggleInspectMode,
    highlightNode,
    clearTreeHoverHighlight,
    selectNode,
  }
}
