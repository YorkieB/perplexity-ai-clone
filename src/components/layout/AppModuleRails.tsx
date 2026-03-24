import type { ReactNode } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { MediaPlayerModule } from '@/components/modules/MediaPlayerModule'
import { NowTVModuleCard } from '@/components/modules/NowTVModuleCard'
import { NewsDummyCard, PodcastDummyCard } from '@/components/modules/RailDummyWidgets'
import { CalendarModuleCard } from '@/components/modules/CalendarModuleCard'
import { WeatherModuleCard } from '@/components/modules/WeatherModuleCard'
import { TuneInModuleCard } from '@/components/modules/TuneInModuleCard'
import { SocialTimelineModuleCard } from '@/components/modules/SocialTimelineModuleCard'

interface AppModuleRailsProps {
  readonly children: ReactNode
  readonly onOpenSettings?: () => void
}

/**
 * Uses horizontal space with fixed side rails (xl+) so module cards (media, widgets)
 * sit beside the main column instead of empty viewport margins.
 */
export function AppModuleRails({ children, onOpenSettings }: AppModuleRailsProps) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside
        className="hidden min-h-0 w-[min(18rem,22vw)] shrink-0 border-r border-border bg-muted/15 xl:flex xl:flex-col"
        aria-label="Left modules"
      >
        <ScrollArea className="h-full min-h-0">
          <div className="space-y-3 p-3">
            <WeatherModuleCard />
            <TuneInModuleCard />
            <CalendarModuleCard onOpenSettings={onOpenSettings} />
            <SocialTimelineModuleCard />
          </div>
        </ScrollArea>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>

      <aside
        className="hidden min-h-0 w-[min(20rem,26vw)] shrink-0 border-l border-border bg-muted/15 xl:flex xl:flex-col"
        aria-label="Right modules"
      >
        <ScrollArea className="h-full min-h-0">
          <div className="space-y-3 p-3">
            <MediaPlayerModule />
            <NowTVModuleCard />
            <NewsDummyCard />
            <PodcastDummyCard />
          </div>
        </ScrollArea>
      </aside>
    </div>
  )
}
