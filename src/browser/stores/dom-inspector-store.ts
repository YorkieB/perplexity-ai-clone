import { create } from 'zustand'
import type { DomNode } from '@/browser/types-inspector'
import { getJarvisBrowserInspectorBridge } from '@/browser/electron-browser-bridge'

export interface DomInspectorTabState {
  tabId: string
  tree: DomNode | null
  isLoadingSnapshot: boolean
  inspectModeEnabled: boolean
  selectedNodeId: string | null
  hoverNodeId: string | null
}

function defaultTabState(tabId: string): DomInspectorTabState {
  return {
    tabId,
    tree: null,
    isLoadingSnapshot: false,
    inspectModeEnabled: false,
    selectedNodeId: null,
    hoverNodeId: null,
  }
}

export interface DomInspectorState {
  tabs: Record<string, DomInspectorTabState>
  activeTabId: string | null
  setActiveTab: (tabId: string | null) => void
  setSnapshot: (tabId: string, tree: DomNode | null) => void
  setLoading: (tabId: string, isLoading: boolean) => void
  setInspectMode: (tabId: string, enabled: boolean) => void
  setSelectedNode: (tabId: string, nodeId: string | null) => void
  setHoverNode: (tabId: string, nodeId: string | null) => void
  ensureTab: (tabId: string) => DomInspectorTabState
}

let bridgeSubscriptionsWired = false
let unsubHover: (() => void) | null = null
let unsubSelect: (() => void) | null = null

async function maybeRefreshSnapshotAfterSelect(tabId: string): Promise<void> {
  const inspector = getJarvisBrowserInspectorBridge()
  if (!inspector) return
  const { tabs } = useDomInspectorStore.getState()
  if (tabs[tabId]?.tree) return
  useDomInspectorStore.getState().setLoading(tabId, true)
  try {
    const tree = await inspector.captureSnapshot(tabId)
    useDomInspectorStore.getState().setSnapshot(tabId, tree)
  } catch {
    /* ignore — panel can call refreshSnapshot manually */
  } finally {
    useDomInspectorStore.getState().setLoading(tabId, false)
  }
}

/**
 * Subscribe once to Electron inspector hover/select and mirror into the store.
 * Safe to call from every `useDomInspector` mount; only the first successful wire sticks.
 */
export function ensureDomInspectorBridgeWired(): void {
  if (bridgeSubscriptionsWired) return
  const inspector = getJarvisBrowserInspectorBridge()
  if (!inspector) return

  unsubHover = inspector.onHover((ev) => {
    useDomInspectorStore.getState().ensureTab(ev.tabId)
    useDomInspectorStore.getState().setHoverNode(ev.tabId, ev.nodeId)
  })

  unsubSelect = inspector.onSelect((ev) => {
    const st = useDomInspectorStore.getState()
    st.ensureTab(ev.tabId)
    st.setSelectedNode(ev.tabId, ev.nodeId)
    st.setInspectMode(ev.tabId, false)
    void maybeRefreshSnapshotAfterSelect(ev.tabId)
    const bridge = getJarvisBrowserInspectorBridge()
    if (bridge) {
      bridge.highlightNode(ev.tabId, ev.nodeId).catch(() => {})
    }
  })

  bridgeSubscriptionsWired = true
}

/** For tests or teardown (optional). */
export function teardownDomInspectorBridgeWiring(): void {
  unsubHover?.()
  unsubSelect?.()
  unsubHover = null
  unsubSelect = null
  bridgeSubscriptionsWired = false
}

export const useDomInspectorStore = create<DomInspectorState>((set, get) => ({
  tabs: {},
  activeTabId: null,

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  ensureTab: (tabId) => {
    const { tabs } = get()
    const existing = tabs[tabId]
    if (existing) return existing
    const next = defaultTabState(tabId)
    set({ tabs: { ...tabs, [tabId]: next } })
    return next
  },

  setSnapshot: (tabId, tree) => {
    get().ensureTab(tabId)
    set((s) => ({
      tabs: {
        ...s.tabs,
        [tabId]: { ...s.tabs[tabId], tree },
      },
    }))
  },

  setLoading: (tabId, isLoading) => {
    get().ensureTab(tabId)
    set((s) => ({
      tabs: {
        ...s.tabs,
        [tabId]: { ...s.tabs[tabId], isLoadingSnapshot: isLoading },
      },
    }))
  },

  setInspectMode: (tabId, enabled) => {
    get().ensureTab(tabId)
    set((s) => ({
      tabs: {
        ...s.tabs,
        [tabId]: { ...s.tabs[tabId], inspectModeEnabled: enabled },
      },
    }))
  },

  setSelectedNode: (tabId, nodeId) => {
    get().ensureTab(tabId)
    set((s) => ({
      tabs: {
        ...s.tabs,
        [tabId]: { ...s.tabs[tabId], selectedNodeId: nodeId },
      },
    }))
  },

  setHoverNode: (tabId, nodeId) => {
    get().ensureTab(tabId)
    set((s) => ({
      tabs: {
        ...s.tabs,
        [tabId]: { ...s.tabs[tabId], hoverNodeId: nodeId },
      },
    }))
  },
}))
