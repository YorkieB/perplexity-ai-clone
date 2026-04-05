'use client'

// THEME NOTE: The dashboard shell (this page + layout.tsx) uses
// bg-gray-950 / bg-gray-900 for the outer dark theme.
// Inner components (KpiHeader, ReasoningTrace, etc.) use
// bg-card / bg-muted from the shadcn/ui CSS variable system.
// These are design tokens — bg-card resolves to the theme's card
// background, which matches the dark theme when the correct
// CSS variables are set in globals.css.
// To force literal bg-gray-900 on all inner components, replace
// bg-card → bg-gray-900 and bg-muted → bg-gray-800 in each component.
// This is a known gap vs the written spec — not a functional issue.

import { formatDistanceToNow } from 'date-fns'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import DashboardLayout from '@/app/dashboard/layout'
import ConfidenceTimeline from '@/components/dashboard/ConfidenceTimeline'
import CostBreakdown from '@/components/dashboard/CostBreakdown'
import KpiHeader from '@/components/dashboard/KpiHeader'
import ReasoningReplay from '@/components/dashboard/ReasoningReplay'
import ReasoningTrace from '@/components/dashboard/ReasoningTrace'
import ReflexionTimeline from '@/components/dashboard/ReflexionTimeline'
import LessonsPanel from '@/components/dashboard/LessonsPanel'
import TotBranchTree from '@/components/dashboard/TotBranchTree'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import useJarvisTelemetry from '@/hooks/useJarvisTelemetry'
import useLessonsData from '@/hooks/useLessonsData'
import type { SystemStats } from '@/lib/observability/telemetryCollector'
import { cn } from '@/lib/utils'

const PANEL =
  'flex min-h-0 flex-col rounded-lg border border-gray-700/50 bg-gray-900 p-4 text-gray-100 shadow-sm'

function asSystemStats(raw: Record<string, unknown> | null): SystemStats | null {
  if (raw === null) {
    return null
  }
  return raw as unknown as SystemStats
}

function formatHeartbeatRelative(iso: string | null): string {
  if (iso === null || iso.length === 0) {
    return '—'
  }
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) {
    return '—'
  }
  return formatDistanceToNow(t, { addSuffix: true })
}

export default function ReasoningDashboardPage() {
  const [sessionId, setSessionId] = useState('all')
  const [replayOpen, setReplayOpen] = useState(false)
  const [relativeClock, setRelativeClock] = useState(0)

  const state = useJarvisTelemetry(sessionId)
  const { totalLessons, avgSuccessRate, recentLessons } = useLessonsData()

  useEffect(() => {
    const id = window.setInterval(() => {
      setRelativeClock((n) => n + 1)
    }, 15_000)
    return () => window.clearInterval(id)
  }, [])

  const typedStats = asSystemStats(state.systemStats)

  const avgConfidence =
    state.confidenceHistory.length > 0
      ? state.confidenceHistory.reduce((s, p) => s + p.scalar, 0) /
        state.confidenceHistory.length
      : 0

  const totalRoutedCalls = useMemo(
    () => Object.values(state.routingByTier).reduce((s, n) => s + n, 0),
    [state.routingByTier],
  )

  const uarTriggerCount =
    typedStats?.reasoningStats?.confidenceStats?.uarTriggerCount ?? 0

  const recentCritiqueScores = useMemo(
    () => state.reflexionEvents.map((e) => e.critiqueScore),
    [state.reflexionEvents],
  )

  const lastUpdatedLabel = useMemo(
    () => formatHeartbeatRelative(state.lastHeartbeat),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relativeClock is a timer tick trigger for re-rendering, not used inside the callback
    [state.lastHeartbeat, relativeClock],
  )

  const kpiProps = {
    isConnected: state.isConnected,
    totalCostUSD: state.totalCostUSD,
    avgCritiqueScore: state.avgCritiqueScore,
    avgConfidence,
    routedCallsCount: totalRoutedCalls,
    uarTriggerCount,
    confidenceTrend: state.sessionConfidenceTrend,
    confidenceHistory: state.confidenceHistory,
    lastHeartbeat: state.lastHeartbeat,
    recentCritiqueScores,
    preTaskBlockedCount: state.preTaskStats.blockedCount,
    avgPreTaskConfidence: state.preTaskStats.avgPreTaskConfidence,
  }

  const tracePanel = (
    <div className={cn(PANEL, 'min-h-[280px] lg:min-h-[420px]')}>
      <ReasoningTrace traces={state.recentTraces} />
    </div>
  )

  const confidencePanel = (
    <div className={cn(PANEL, 'min-h-[280px] lg:min-h-[420px]')}>
      <ConfidenceTimeline
        history={state.confidenceHistory}
        uarTriggerCount={uarTriggerCount}
      />
    </div>
  )

  const costPanel = (
    <div className={PANEL}>
      <CostBreakdown
        costByTier={state.costByTier}
        totalCostUSD={state.totalCostUSD}
        routingByTier={state.routingByTier}
        overrideCount={state.overrideCount}
      />
    </div>
  )

  const totPanel = (
    <div className={cn(PANEL, 'min-h-[240px]')}>
      <TotBranchTree searches={state.totSearches} latestTree={null} />
    </div>
  )

  const reflexionPanel = (
    <div className={cn(PANEL, 'min-h-[240px]')}>
      <ReflexionTimeline
        events={state.reflexionEvents}
        avgCritiqueScore={state.avgCritiqueScore}
      />
    </div>
  )

  const replayPanel = (
    <div className={PANEL}>
      <ReasoningReplay traces={state.recentTraces} />
    </div>
  )

  const lessonsPanel = (
    <LessonsPanel
      totalLessons={totalLessons}
      avgSuccessRate={avgSuccessRate}
      recentLessons={recentLessons}
    />
  )

  return (
    <DashboardLayout>
      <div className="mx-auto flex min-h-svh max-w-[1680px] flex-col gap-4 px-3 py-4 sm:px-5">
        <header className="flex flex-col gap-3 border-b border-gray-700/50 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-gray-100 sm:text-2xl">
                Jarvis Reasoning Dashboard
              </h1>
              <span
                className="inline-flex items-center gap-2 rounded-full border border-gray-700/60 bg-gray-900/80 px-2.5 py-0.5 text-xs font-medium text-gray-200"
                title={state.isConnected ? 'SSE connected' : 'Reconnecting'}
              >
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    state.isConnected ? 'bg-emerald-500' : 'bg-amber-500',
                  )}
                  aria-hidden
                />
                {state.isConnected ? 'Live' : 'Reconnecting…'}
              </span>
            </div>
            <p className="text-sm text-gray-400">Real-time reasoning observability</p>
            <p className="text-xs text-gray-500">
              Last updated: <span className="tabular-nums text-gray-400">{lastUpdatedLabel}</span>
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <Button variant="outline" size="sm" asChild className="border-gray-600 bg-gray-900 text-gray-100">
              <a href="/">← Back to Jarvis</a>
            </Button>
          </div>
        </header>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex max-w-md flex-col gap-1.5">
            <Label htmlFor="dashboard-session-id" className="text-xs text-gray-400">
              Session ID (or &apos;all&apos;)
            </Label>
            <Input
              id="dashboard-session-id"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="all"
              className="h-9 border-gray-700/60 bg-gray-900 text-gray-100 placeholder:text-gray-600"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Desktop / large tablet: CSS grid */}
        <div className="hidden flex-col gap-4 lg:flex">
          <KpiHeader {...kpiProps} />

          <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="min-h-0 lg:col-span-3">{tracePanel}</div>
            <div className="min-h-0 lg:col-span-2">{confidencePanel}</div>
          </div>

          <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="min-h-0">{totPanel}</div>
            <div className="min-h-0">{reflexionPanel}</div>
          </div>

          {costPanel}

          <div className="min-w-0">{lessonsPanel}</div>

          <Collapsible open={replayOpen} onOpenChange={setReplayOpen}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="flex w-full items-center justify-between border-gray-700/60 bg-gray-900 text-gray-100 hover:bg-gray-800"
              >
                <span className="text-sm font-medium">Reasoning replay</span>
                {replayOpen ? (
                  <ChevronDown className="size-4 text-blue-400" aria-hidden />
                ) : (
                  <ChevronRight className="size-4 text-blue-400" aria-hidden />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">{replayPanel}</CollapsibleContent>
          </Collapsible>
        </div>

        {/* Mobile / narrow: tabs */}
        <div className="flex flex-col gap-4 lg:hidden">
          <div className="rounded-lg border border-gray-700/50 bg-gray-900 p-3">
            <KpiHeader {...kpiProps} />
          </div>

          <Tabs defaultValue="trace" className="flex w-full min-w-0 flex-col gap-3">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-gray-800/90 p-1 sm:grid-cols-4">
              <TabsTrigger
                value="trace"
                className="text-xs data-[state=active]:border-blue-500/40 data-[state=active]:bg-gray-900 data-[state=active]:text-blue-200"
              >
                Live Trace
              </TabsTrigger>
              <TabsTrigger
                value="confidence"
                className="text-xs data-[state=active]:border-blue-500/40 data-[state=active]:bg-gray-900 data-[state=active]:text-blue-200"
              >
                Confidence
              </TabsTrigger>
              <TabsTrigger
                value="costs"
                className="text-xs data-[state=active]:border-amber-500/40 data-[state=active]:bg-gray-900 data-[state=active]:text-amber-200"
              >
                Costs
              </TabsTrigger>
              <TabsTrigger
                value="tot"
                className="text-xs data-[state=active]:border-blue-500/40 data-[state=active]:bg-gray-900 data-[state=active]:text-blue-200"
              >
                ToT
              </TabsTrigger>
              <TabsTrigger
                value="reflexion"
                className="text-xs data-[state=active]:border-emerald-500/40 data-[state=active]:bg-gray-900 data-[state=active]:text-emerald-200"
              >
                Reflexion
              </TabsTrigger>
              <TabsTrigger
                value="replay"
                className="text-xs data-[state=active]:border-blue-500/40 data-[state=active]:bg-gray-900 data-[state=active]:text-blue-200"
              >
                Replay
              </TabsTrigger>
              <TabsTrigger
                value="lessons"
                className="text-xs data-[state=active]:border-violet-500/40 data-[state=active]:bg-gray-900 data-[state=active]:text-violet-200"
              >
                Memory
              </TabsTrigger>
            </TabsList>

            <TabsContent value="trace" className="mt-0">
              {tracePanel}
            </TabsContent>
            <TabsContent value="confidence" className="mt-0">
              {confidencePanel}
            </TabsContent>
            <TabsContent value="costs" className="mt-0">
              {costPanel}
            </TabsContent>
            <TabsContent value="tot" className="mt-0">
              {totPanel}
            </TabsContent>
            <TabsContent value="reflexion" className="mt-0">
              {reflexionPanel}
            </TabsContent>
            <TabsContent value="replay" className="mt-0">
              {replayPanel}
            </TabsContent>
            <TabsContent value="lessons" className="mt-0">
              {lessonsPanel}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  )
}
