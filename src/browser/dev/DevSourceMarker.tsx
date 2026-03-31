import type { HTMLAttributes, ReactNode } from 'react'
import { DATA_J_SOURCE_ATTR } from '@/browser/types-layout'
import type { SourceLocation } from '@/browser/types-layout'

export type DevSourceMarkerProps = {
  workspaceId: string
  filePath: string
  markerId: string
  children?: ReactNode
  className?: string
}

/**
 * Dev-only helper: wraps children in a `display: contents` span with {@link DATA_J_SOURCE_ATTR}
 * as JSON (paths safe on Windows). Prefer a bundler AST plugin long-term; this keeps the pipeline real.
 */
export function DevSourceMarker({
  workspaceId,
  filePath,
  markerId,
  children,
  className,
}: DevSourceMarkerProps) {
  const payload: SourceLocation = { workspaceId, filePath, markerId }
  const encoded = JSON.stringify(payload)
  return (
    <span
      className={className}
      style={{ display: 'contents' }}
      {...({ [DATA_J_SOURCE_ATTR]: encoded } as HTMLAttributes<HTMLSpanElement>)}
    >
      {children}
    </span>
  )
}
