import { getJarvisBrowserInspectorBridge } from '@/browser/electron-browser-bridge'
import type { DomNode } from '@/browser/types-inspector'
import type { LayoutEditAction, NodeAttributeEdit } from '@/browser/types-layout'
import {
  applyAttributeEditToSource,
  applyLayoutEditToSource,
  parseSourceLocationFromNode,
} from '@/browser/inspector/source-mapping'

/** How an inspector edit was applied (for UI toasts / telemetry). */
export type InspectorEditApplyMode = 'none' | 'source' | 'dom'

/** Depth-first lookup by `nodeId` (v1; fine for moderate trees). */
export function findNodeById(root: DomNode | null, nodeId: string): DomNode | null {
  if (!root) return null
  if (root.nodeId === nodeId) return root
  for (const child of root.children) {
    const found = findNodeById(child, nodeId)
    if (found) return found
  }
  return null
}

/**
 * Source-backed when both nodes carry `data-j-source` in the same file/workspace; otherwise
 * applies the DOM mutation in the guest page via IPC.
 */
export async function applyLayoutEdit(
  tabId: string,
  tree: DomNode | null,
  action: LayoutEditAction
): Promise<InspectorEditApplyMode> {
  const inspector = getJarvisBrowserInspectorBridge()
  if (!inspector || !tree) return 'none'

  const sourceNode = findNodeById(tree, action.sourceNodeId)
  const targetNode = findNodeById(tree, action.targetNodeId)
  if (!sourceNode || !targetNode) return 'none'

  const sourceLoc = parseSourceLocationFromNode(sourceNode)
  const targetLoc = parseSourceLocationFromNode(targetNode)

  if (
    sourceLoc &&
    targetLoc &&
    sourceLoc.workspaceId === targetLoc.workspaceId &&
    sourceLoc.filePath === targetLoc.filePath
  ) {
    await applyLayoutEditToSource({
      source: sourceLoc,
      target: targetLoc,
      action,
    })
    return 'source'
  }

  await inspector.applyLayoutEdit(tabId, action)
  return 'dom'
}

/**
 * When the node has `data-j-source`, log/IDE stub only; otherwise patch live DOM in the guest.
 */
export async function applyAttributeEdit(
  tabId: string,
  tree: DomNode | null,
  edit: NodeAttributeEdit
): Promise<InspectorEditApplyMode> {
  const inspector = getJarvisBrowserInspectorBridge()
  if (!inspector || !tree) return 'none'

  const node = findNodeById(tree, edit.nodeId)
  if (!node) return 'none'

  const loc = parseSourceLocationFromNode(node)
  if (loc) {
    await applyAttributeEditToSource(loc, edit)
    return 'source'
  }

  await inspector.applyAttributeEdit(tabId, edit)
  return 'dom'
}
