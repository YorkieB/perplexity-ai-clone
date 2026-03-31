/**
 * DOM inspector types (guest page snapshot + pick/hover events).
 */

export interface DomBoundingRect {
  x: number
  y: number
  width: number
  height: number
}

export interface DomNode {
  nodeId: string
  tagName: string
  id?: string
  classes: string[]
  attributes: Record<string, string>
  inlineStyle?: string
  children: DomNode[]
  boundingRect?: DomBoundingRect
}

export interface InspectorSelectionEvent {
  tabId: string
  nodeId: string
  domPath: number[]
  boundingRect?: DomBoundingRect
}

export interface InspectorHoverEvent {
  tabId: string
  nodeId: string
  domPath: number[]
  boundingRect?: DomBoundingRect
}
