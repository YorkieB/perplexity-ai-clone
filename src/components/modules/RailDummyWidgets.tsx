import { Calendar, CloudSun, Mic2, Newspaper } from 'lucide-react'

import { GenericDummyModuleCard } from '@/components/modules/GenericDummyModuleCard'

export function WeatherDummyCard() {
  return (
    <GenericDummyModuleCard
      title="Weather"
      description="Forecast · dummy"
      icon={CloudSun}
      iconClassName="text-sky-500"
    >
      <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold tabular-nums">18°</span>
          <span className="text-xs text-muted-foreground">Partly cloudy</span>
        </div>
        <div className="grid grid-cols-4 gap-1 text-center text-[10px] text-muted-foreground">
          {['Now', '+3h', '+6h', '+9h'].map((t, i) => (
            <span key={t}>
              <span className="block font-medium text-foreground">{[18, 17, 16, 15][i]}°</span>
              {t}
            </span>
          ))}
        </div>
      </div>
    </GenericDummyModuleCard>
  )
}

export function CalendarDummyCard() {
  return (
    <GenericDummyModuleCard
      title="Calendar"
      description="Today · dummy"
      icon={Calendar}
      iconClassName="text-orange-500"
    >
      <ul className="space-y-1.5 text-xs">
        <li className="flex justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
          <span className="truncate font-medium">Stand-up</span>
          <span className="shrink-0 text-muted-foreground">10:00</span>
        </li>
        <li className="flex justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
          <span className="truncate font-medium">Design review</span>
          <span className="shrink-0 text-muted-foreground">14:30</span>
        </li>
        <li className="flex justify-between gap-2 rounded-md border border-dashed border-border px-2 py-1.5 text-muted-foreground">
          <span>Focus block</span>
          <span>16:00</span>
        </li>
      </ul>
    </GenericDummyModuleCard>
  )
}

export function NewsDummyCard() {
  return (
    <GenericDummyModuleCard
      title="Headlines"
      description="News · dummy"
      icon={Newspaper}
      iconClassName="text-blue-500"
    >
      <ul className="space-y-2 text-xs">
        <li className="border-b border-border/60 pb-2 leading-snug">
          Tech sector outlook: analysts revise targets…
        </li>
        <li className="border-b border-border/60 pb-2 leading-snug">
          Local transport: weekend service changes…
        </li>
        <li className="leading-snug text-muted-foreground">Science: new telescope batch…</li>
      </ul>
    </GenericDummyModuleCard>
  )
}

export function PodcastDummyCard() {
  return (
    <GenericDummyModuleCard
      title="Podcasts"
      description="Queue · dummy"
      icon={Mic2}
      iconClassName="text-purple-500"
    >
      <div className="space-y-2">
        <div className="rounded-md border border-border bg-muted/30 px-2 py-2">
          <p className="text-xs font-medium">The Daily Brief</p>
          <p className="text-[10px] text-muted-foreground">24 min left</p>
        </div>
        <div className="rounded-md border border-dashed border-border px-2 py-2 text-[10px] text-muted-foreground">
          + Add show (dummy)
        </div>
      </div>
    </GenericDummyModuleCard>
  )
}
