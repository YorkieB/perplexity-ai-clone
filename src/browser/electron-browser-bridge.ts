import { loadBrowserSettings } from '@/browser/stores/settings-store'
import type { DomNode, InspectorHoverEvent, InspectorSelectionEvent } from '@/browser/types-inspector'
import type { LayoutEditAction, NodeAttributeEdit } from '@/browser/types-layout'

export interface DownloadProgressPayload {
  id: string
  url: string
  fileName: string
  status: string
  bytesReceived: number
  totalBytes?: number
  path: string
}

export interface JarvisBrowserInspectorBridge {
  captureSnapshot: (tabId: string) => Promise<DomNode>
  enableInspectMode: (tabId: string) => Promise<void>
  disableInspectMode: (tabId: string) => Promise<void>
  highlightNode: (tabId: string, nodeId: string) => Promise<void>
  clearPageHighlight: (tabId: string) => Promise<void>
  applyLayoutEdit: (tabId: string, action: LayoutEditAction) => Promise<void>
  applyAttributeEdit: (tabId: string, edit: NodeAttributeEdit) => Promise<void>
  onHover: (listener: (event: InspectorHoverEvent) => void) => () => void
  onSelect: (listener: (event: InspectorSelectionEvent) => void) => () => void
}

export function getElectronInAppBrowser(): Window['electronInAppBrowser'] {
  if (typeof window === 'undefined') return undefined
  return window.electronInAppBrowser
}

/**
 * Returns true when the Electron desktop shell is active (preload injected
 * `window.electronInAppBrowser`).  Used to skip the dev-server proxy for the
 * in-app browser iframe — Electron's session strips X-Frame-Options directly.
 */
export function isElectronDesktop(): boolean {
  return Boolean(getElectronInAppBrowser())
}

/**
 * Disabled: Electron `<webview>` has an unresolved GPU compositor issue on
 * Windows where the guest surface never paints into the host window.  The
 * browser now uses `<iframe>` in all modes — Electron strips X-Frame-Options
 * via session.webRequest; web-dev uses the Vite browse-proxy plugin.
 */
export function isElectronWebviewAvailable(): boolean {
  return false
}

export async function syncBrowserSettingsToMain(): Promise<void> {
  const api = getElectronInAppBrowser()
  if (!api?.applyJarvisBrowserSettings) return
  const s = loadBrowserSettings()
  await api.applyJarvisBrowserSettings({
    privacy: s.privacy,
    sitePermissions: s.sitePermissions as Record<string, Record<string, 'allow' | 'block' | 'ask'>>,
  })
}

/**
 * Typed DOM inspector API (guest script in `electron/webview-injected/inspector.js` + main IPC).
 * Returns null outside Electron desktop.
 */
export function getJarvisBrowserInspectorBridge(): JarvisBrowserInspectorBridge | null {
  const ins = getElectronInAppBrowser()?.jarvisBrowserInspector
  if (!ins) return null

  return {
    async captureSnapshot(tabId: string): Promise<DomNode> {
      const r = await ins.captureSnapshot(tabId)
      if (!r?.ok) {
        throw new Error(typeof r?.error === 'string' ? r.error : 'captureSnapshot failed')
      }
      const data = r.data as DomNode & { error?: string }
      if (data && typeof data === 'object' && typeof data.error === 'string') {
        throw new Error(data.error)
      }
      return data as DomNode
    },

    async enableInspectMode(tabId: string): Promise<void> {
      const r = await ins.enableInspectMode(tabId)
      if (!r?.ok) {
        throw new Error(typeof r?.error === 'string' ? r.error : 'enableInspectMode failed')
      }
    },

    async disableInspectMode(tabId: string): Promise<void> {
      const r = await ins.disableInspectMode(tabId)
      if (!r?.ok) {
        throw new Error(typeof r?.error === 'string' ? r.error : 'disableInspectMode failed')
      }
    },

    async highlightNode(tabId: string, nodeId: string): Promise<void> {
      const r = await ins.highlightNode(tabId, nodeId)
      if (!r?.ok) {
        throw new Error(typeof r?.error === 'string' ? r.error : 'highlightNode failed')
      }
    },

    async clearPageHighlight(tabId: string): Promise<void> {
      const r = await ins.clearPageHighlight(tabId)
      if (!r?.ok) {
        throw new Error(typeof r?.error === 'string' ? r.error : 'clearPageHighlight failed')
      }
    },

    async applyLayoutEdit(tabId: string, action: LayoutEditAction): Promise<void> {
      const r = await ins.applyLayoutEdit(tabId, action)
      if (!r?.ok) {
        throw new Error(typeof r?.error === 'string' ? r.error : 'applyLayoutEdit failed')
      }
    },

    async applyAttributeEdit(tabId: string, edit: NodeAttributeEdit): Promise<void> {
      const r = await ins.applyAttributeEdit(tabId, edit)
      if (!r?.ok) {
        throw new Error(typeof r?.error === 'string' ? r.error : 'applyAttributeEdit failed')
      }
    },

    onHover(listener: (event: InspectorHoverEvent) => void) {
      return ins.onHover((payload) => {
        listener({
          tabId: payload.tabId,
          nodeId: payload.nodeId,
          domPath: payload.domPath,
          boundingRect: payload.boundingRect,
        })
      })
    },

    onSelect(listener: (event: InspectorSelectionEvent) => void) {
      return ins.onSelect((payload) => {
        listener({
          tabId: payload.tabId,
          nodeId: payload.nodeId,
          domPath: payload.domPath,
          boundingRect: payload.boundingRect,
        })
      })
    },
  }
}
