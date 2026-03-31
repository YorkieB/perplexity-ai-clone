/**
 * Optional overlay for guide/tutorial mode — draws a pulsing frame around a target rect (screen or viewport coords).
 */

export interface GuidanceHighlightProps {
  targetRect: { x: number; y: number; width: number; height: number } | null
  label?: string
}

export function GuidanceHighlight({ targetRect, label }: GuidanceHighlightProps) {
  if (!targetRect) return null
  return (
    <div
      className="pointer-events-none fixed z-[9999] animate-pulse rounded-md border-2 border-blue-400"
      style={{
        left: targetRect.x,
        top: targetRect.y,
        width: targetRect.width,
        height: targetRect.height,
      }}
    >
      {label ? (
        <span className="absolute -top-6 left-0 rounded bg-blue-500 px-2 py-1 text-xs text-white">{label}</span>
      ) : null}
    </div>
  )
}
