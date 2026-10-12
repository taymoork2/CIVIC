import { useEffect, useMemo, useState } from 'react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider, useRouter, useRouterState } from '@tanstack/react-router'
import { FixtureConvex, SeedPhone } from '@/dev/fixture-preview'
import { previewDryingCalls } from '@/dev/drying-preview'
import { previewUnavailableCalls } from '@/dev/preview-calls'
import { HomeOverview } from '@/routes/index'
import { ClosetView } from '@/closet/closet-view'
import { LaundryDock } from '@/laundry/laundry-day'
import { homeDockStep } from '@/home/home-dock'
import { DryingView, type DryingQueue } from '@/drying/drying-view'
import { AppShell } from '@/kit/app-shell'
import { reviewTextiles } from '@/dev/closet-preview'
import { planDryerLoads } from '@washcloset/planner'
import { LaundryView } from '@/laundry/laundry-view'
import { laundryPreviewCalls } from '@/dev/laundry-preview'

const now = Date.UTC(2026, 9, 11, 19)
const householdId = 'preview-rehearsal-reminder'
const initialRun = 'preview-rehearsal-air-1'
const dockState = (count: number, runId: string) => ({ kind: 'drying' as const, count, sessionIds: [], runId })
const initialState = dockState(2, initialRun)
const step = homeDockStep(initialState)
const initialTask = JSON.stringify([initialState.kind, step.target, step.title, step.detail, initialState.sessionIds])
const calls = previewUnavailableCalls({ flagDirty: 'mark it dirty', setRefresh: 'refresh it', unflag: 'remove it from the hamper', refreshed: 'mark it refreshed', pickedUp: 'pick it up', allDry: 'mark it dry', droppedAtCleaner: 'drop it off', retire: 'retire it', washedElsewhere: 'record a wash elsewhere' })

/** Real reminder/presenters, declared task changes and refused household effects. */
export function ReminderPreview({ scenario }: { scenario: string }) {
  const [router] = useState(() => {
    const root = createRootRoute({ component: () => <ReminderPages scenario={scenario} /> })
    const page = createRoute({ getParentRoute: () => root, path: '$', component: () => null })
    return createRouter({ routeTree: root.addChildren([page]), history: createMemoryHistory({ initialEntries: [scenario === 'route.drying.reminder-check' ? `/drying?run=${initialRun}` : '/closet'] }) })
  })
  return <RouterProvider router={router} />
}

function ReminderPages({ scenario }: { scenario: string }) {
  const router = useRouter()
  const href = useRouterState({ select: (state) => state.location.href })
  const url = new URL(href, 'http://review.local')
  const [changed, setChanged] = useState(scenario === 'route.home.reminder-changed')
  const count = changed ? 3 : 2, runId = changed ? 'preview-rehearsal-air-2' : initialRun
  const [seeds] = useState(() => [{ key: 'washcloset:private:dismissed-care-reminder', event: 'washcloset:dismissed-care-reminder', value: { householdId, task: scenario === 'route.home.reminder-visible' || scenario === 'route.drying.reminder-check' ? '' : initialTask } }])
  const textiles = useMemo(() => reviewTextiles.filter((piece) => piece.textileId.startsWith('preview-tee-')).slice(0, count).map((piece) => ({ ...piece, status: 'hanging' as const, inLoad: null })), [count])
  const inventory = { planning: {}, textiles, wearers: [], machines: [], supplies: [] }
  const today = { ready: [], readyCount: 0, notReady: { dirty: 0, in_wash: 0, hanging: count, needs_dry_clean: 0, at_cleaner: 0, needs_refresh: 0 }, notReadyForOccasion: [], notWornDays: 90 }
  const attention = { hamper: { count: 0, loads: null, handWash: 0 }, top: null, cards: [] }
  const pieces: DryingQueue['pieces'] = textiles.map((piece, index) => ({ pieceId: `preview-reminder-piece-${index}` as DryingQueue['pieces'][number]['pieceId'], textileId: piece.textileId, name: piece.name, kind: piece.kind, color: piece.color, colorGroup: piece.colorGroup, washerName: 'Synthetic washer', status: 'drying', queuedAt: now, own: false, need: null, label: 'line_dry', method: 'rack_line', source: 'label', evidence: 'allowed', preference: null, dried: null, maxHeat: null, hold: null, bulkUnits: 1, dryingRunId: runId as DryingQueue['runs'][number]['runId'], driedIn: null }))
  const queue: DryingQueue = { pieces, runs: [{ runId: runId as DryingQueue['runs'][number]['runId'], dryerId: null, reminded: false, kind: 'air', method: 'rack_line', dryerName: null, heatLabel: null, startedAt: now, minutes: null, pieceIds: pieces.map((piece) => piece.pieceId) }], homeDryerId: null, homeDryerSessionId: null, dryers: [], hangingDryers: [], equipment: { tumble: false, heated_hanging: false }, capacityUnits: null, capacities: [], plan: planDryerLoads([], { combine: false, capacityUnits: null }) }
  useEffect(() => {
    const bridge = window.reviewPreview
    if (!bridge) return
    const before = bridge.data
    bridge.data = () => ({ textiles, runs: queue.runs, path: href })
    return () => { bridge.data = before }
  }, [textiles, href, runId])
  const go = (path: string) => void router.navigate({ to: path })
  const navigation = <ul>{[{ label: 'Home', to: '/' }, { label: 'Closet', to: '/closet' }, { label: 'Laundry', to: '/laundry' }].map(({ label, to }) => <li key={to}><a href={to} onClick={(event) => { event.preventDefault(); go(to) }}>{label}</a></li>)}</ul>
  const data = { 'plans:upNext': null, 'execution:householdSessions': [], 'inventory:list': inventory, 'closet:attention': attention, 'dryingQueue:queue': queue }
  return <>
    <SeedPhone seeds={seeds} />
    <details className="rh-family-controls"><summary>Reminder fixture conditions</summary><p>Synthetic task and care records. Opening or dismissing changes no dryness state. Household writes are refused.</p><button disabled={changed} onClick={() => setChanged(true)}>Change synthetic drying task</button></details>
    <FixtureConvex key={runId} data={data}>
      <AppShell navigation={navigation} focus={url.pathname === '/drying'} dock={<LaundryDock householdId={householdId} now={now} idle={false} renderLink={(target, props) => { const path = target.to === 'drying' ? `/drying${'run' in target && target.run ? `?run=${target.run}` : ''}` : '/'; return <a {...props} href={path} onClick={(event) => { event.preventDefault(); go(path) }} /> }} />}>
        {url.pathname === '/drying' ? <DryingView key={url.searchParams.get('run')} queue={queue} householdId={householdId} now={now} initialScreen={{ kind: 'check', runId: url.searchParams.get('run') ?? runId }} onBack={() => go('/laundry')} combine={false} onCombine={() => {}} onCapacity={() => {}} calls={previewDryingCalls} /> : url.pathname === '/' ? <HomeOverview inventory={inventory} today={today} state={dockState(count, runId)} now={now} /> : url.pathname === '/laundry' ? <LaundryView now={now} householdId={householdId} viewerKey="preview-reminder-user" inventory={inventory} hamper={attention.hamper} draft={null} onDraft={() => {}} planId={null} plan={null} questions={[]} calls={laundryPreviewCalls} onPlan={() => {}} onSession={() => {}} /> : <ClosetView now={now} inventory={inventory} attention={attention} today={today} sessions={[]} meWearerId={null} wearerChip="everyone" onWearerChip={() => {}} calls={calls} onItemOpen={() => {}} />}
      </AppShell>
    </FixtureConvex>
  </>
}
