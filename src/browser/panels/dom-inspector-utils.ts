import type { DomNode } from '@/browser/types-inspector'

/** Depth-first search for a node by `nodeId`. */
export function findDomNodeById(root: DomNode | null, nodeId: string | null): DomNode | null {
  if (!root || !nodeId) return null
  if (root.nodeId === nodeId) return root
  for (const child of root.children) {
    const found = findDomNodeById(child, nodeId)
    if (found) return found
  }
  return null
}

/** True if `descendantId` appears anywhere in the subtree rooted at `ancestorId` (not counting the ancestor node itself). */
export function domSubtreeContainsNode(
  root: DomNode,
  ancestorId: string,
  descendantId: string
): boolean {
  const ancestor = findDomNodeById(root, ancestorId)
  if (!ancestor) return false
  const stack = [...ancestor.children]
  while (stack.length > 0) {
    const n = stack.pop()!
    if (n.nodeId === descendantId) return true
    stack.push(...n.children)
  }
  return false
}
