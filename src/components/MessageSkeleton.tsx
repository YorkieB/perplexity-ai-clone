import { Skeleton } from '@/components/ui/skeleton'

export function MessageSkeleton() {
  return (
    <div className="flex gap-4 py-6">
      <Skeleton className="shrink-0 w-8 h-8 rounded-full" />
      <div className="flex-1 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  )
}
