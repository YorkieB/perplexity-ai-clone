import type { DomNode } from '@/browser/types-inspector'
import type { LayoutEditAction, NodeAttributeEdit, SourceLocation } from '@/browser/types-layout'
import { DATA_J_SOURCE_ATTR } from '@/browser/types-layout'

/**
 * Read {@link DATA_J_SOURCE_ATTR} from a snapshot node.
 * Supports JSON (`{"workspaceId","filePath","markerId"}`) or `workspaceId:filePath:markerId`
 * (first/last colon split so paths may contain colons between them).
 */
export function parseSourceLocationFromNode(node: DomNode): SourceLocation | null {
  const raw = node.attributes?.[DATA_J_SOURCE_ATTR]
  if (!raw || typeof raw !== 'string') return null
  const t = raw.trim()
  if (t.startsWith('{')) {
    try {
      const o = JSON.parse(t) as Record<string, unknown>
      const workspaceId = typeof o.workspaceId === 'string' ? o.workspaceId : ''
      const filePath = typeof o.filePath === 'string' ? o.filePath : ''
      const markerId = typeof o.markerId === 'string' ? o.markerId : ''
      if (!workspaceId || !filePath || !markerId) return null
      return { workspaceId, filePath, markerId }
    } catch {
      return null
    }
  }
  const first = t.indexOf(':')
  const last = t.lastIndexOf(':')
  if (first <= 0 || last <= first) return null
  const workspaceId = t.slice(0, first)
  const markerId = t.slice(last + 1)
  const filePath = t.slice(first + 1, last)
  if (!workspaceId || !filePath || !markerId) return null
  return { workspaceId, filePath, markerId }
}

export type ApplySourceLayoutEditParams = {
  source: SourceLocation
  target: SourceLocation
  action: LayoutEditAction
}

/**
 * v1 stub: log intent. Later: load file, find `markerId`, rewrite JSX/HTML, save, HMR.
 */
export async function applyLayoutEditToSource(params: ApplySourceLayoutEditParams): Promise<void> {
  console.info('[jarvis-layout] applyLayoutEditToSource (stub)', params)
}

/** v1 stub: log intent; later rewrite JSX/HTML at `markerId` for attribute/style changes. */
export async function applyAttributeEditToSource(
  location: SourceLocation,
  edit: NodeAttributeEdit
): Promise<void> {
  console.info('[JarvisInspector] applyAttributeEditToSource (stub)', { location, edit })
}
