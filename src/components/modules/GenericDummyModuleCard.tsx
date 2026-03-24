import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface GenericDummyModuleCardProps {
  readonly title: string
  readonly description?: string
  readonly icon: LucideIcon
  readonly iconClassName?: string
  readonly accentClassName?: string
  readonly children: ReactNode
}

export function GenericDummyModuleCard({
  title,
  description,
  icon: Icon,
  iconClassName,
  accentClassName,
  children,
}: GenericDummyModuleCardProps) {
  return (
    <Card className={cn('gap-3 py-4 shadow-none', accentClassName)}>
      <CardHeader className="px-4 pb-0">
        <div className="flex items-center gap-2">
          <Icon className={cn('size-5', iconClassName)} aria-hidden />
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? (
              <CardDescription className="text-xs">{description}</CardDescription>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pt-0">{children}</CardContent>
    </Card>
  )
}
