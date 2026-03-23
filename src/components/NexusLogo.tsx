import { cn } from '@/lib/utils'

const LOGO_SRC = '/favicon.svg'

type NexusLogoProps = {
  /** Pixel width/height (square). */
  size?: number
  className?: string
}

export function NexusLogo({ size = 32, className }: NexusLogoProps) {
  return (
    <img
      src={LOGO_SRC}
      alt="Nexus"
      width={size}
      height={size}
      draggable={false}
      className={cn('shrink-0 select-none', className)}
    />
  )
}
