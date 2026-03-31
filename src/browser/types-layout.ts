import type { DomNode } from '@/browser/types-inspector'

/**
 * DOM layout edits (guest script) and optional IDE source-backed moves.
 *
 * ## `data-j-source`
 *
 * Encodes where a DOM node was produced in workspace source. Prefer JSON in dev builds
 * so `filePath` can contain `:` (Windows) or other special characters:
 *
 * ```json
 * {"workspaceId":"default","filePath":"src/App.tsx","markerId":"m42"}
 * ```
 *
 * Legacy delimiter form (no `:` in `workspaceId` or `filePath`): `workspaceId:filePath:markerId`
 * — parsed using first and last `:` so `filePath` may include colons only if it is the middle segment.
 */

export type LayoutEditKind = 'moveBefore' | 'moveAfter' | 'appendChild'

export type LayoutEditAction = {
  kind: LayoutEditKind
  sourceNodeId: string
  targetNodeId: string
}

/** Attribute name for JSX/HTML → inspector source mapping (dev instrumentation). */
export const DATA_J_SOURCE_ATTR = 'data-j-source'

export type SourceLocation = {
  workspaceId: string
  filePath: string
  markerId: string
}

/** Stable MIME type for tree DnD (Chromium/Electron). */
export const JARVIS_LAYOUT_DRAG_MIME = 'application/x-jarvis-dom-node-id'

export type NodeAttributeEditKind = 'set-attribute' | 'remove-attribute' | 'set-style'

export type NodeAttributeEdit = {
  kind: NodeAttributeEditKind
  nodeId: string
  name?: string
  value?: string
}

export type InspectorAiRequestKind = 'explain-node' | 'fix-attributes' | 'fix-layout'

export type InspectorAiRequest = {
  kind: InspectorAiRequestKind
  tabId: string
  node: DomNode
  source?: SourceLocation | null
}

/** Bumps `nonce` each emit so {@link CodeEditorModal} can run a one-shot inspector chat turn. */
export type InspectorChatTicket = { nonce: number; request: InspectorAiRequest }
