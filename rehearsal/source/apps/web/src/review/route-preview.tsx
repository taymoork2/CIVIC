import { useState, useSyncExternalStore } from 'react'
import { ConvexProvider, type ConvexReactClient } from 'convex/react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider, useRouter, useRouterState } from '@tanstack/react-router'
import type { Id } from '@convex/_generated/dataModel'
import { AddClothesFlow } from '@/closet/add-clothes'
import { GarmentSheet, type GarmentCalls } from '@/closet/garment-sheet'
import { GarmentRecordView, type GarmentRecord } from '@/closet/garment-record'
import { ClosetView } from '@/closet/closet-view'
import { reviewTextiles, reviewGarmentRecord } from '@/dev/closet-preview'
import { previewUnavailableCalls } from '@/dev/preview-calls'
import { previewDryingCalls } from '@/dev/drying-preview'
import { laundryPreviewCalls, recipeActions } from '@/dev/laundry-preview'
import { LaundryView } from '@/laundry/laundry-view'
import { SessionView, type Detail, type LoadRecord, queueReady } from '@/laundry/session-view'
import { DryingView, type DryingQueue } from '@/drying/drying-view'
import { HomeOverview } from '@/routes/index'
import { MePreview } from '@/dev/me-preview'
import { Button } from '@/components/ui/button'
import type { Inventory } from '@/household/inventory-types'
import type { ReviewConfig } from './store'
import { planDryerLoads } from '@washcloset/planner'

const now = Date.UTC(2026, 9, 10, 19)
const sessionId = 'preview-route-wash' as Id<'sessions'>
const item = 'preview-tee-1'
const closetItem = `/closet?item=${item}`
const washUrl = `/session/${sessionId}`
const washedUrl = washUrl
const finishedUrl = `${washUrl}?from=me`
const today = { ready: [], readyCount: 0, notReady: { dirty: 2, in_wash: 0, hanging: 0, needs_dry_clean: 0, at_cleaner: 0, needs_refresh: 0 }, notReadyForOccasion: [], notWornDays: 90 }
const calls = previewUnavailableCalls({ flagDirty: 'mark it dirty', setRefresh: 'refresh it', unflag: 'remove it from the hamper', refreshed: 'mark it refreshed', pickedUp: 'pick it up', allDry: 'mark it dry', droppedAtCleaner: 'drop it off', retire: 'retire it', washedElsewhere: 'record a wash elsewhere' }) satisfies GarmentCalls
const tees = reviewTextiles.filter((piece) => piece.textileId.startsWith('preview-tee-')).slice(1)
const wash = { at: now - 90 * 60_000, washerName: 'Washer 14', cycle: 'normal', drying: { outcome: 'tumble_dried' as const, dryerName: 'Dryer 4', heat: 'low' as const, minutes: 40 }, recordId: undefined, observation: undefined, products: [] }
const record: GarmentRecord = { ...reviewGarmentRecord, washes: [wash] }
const loadRecord: LoadRecord = { sessionId, completedAt: now - 60 * 60_000, pieces: tees.map((piece) => ({ textileId: piece.textileId, name: piece.name, color: piece.color, wash })) }

export function routeSession(stage: 'running' | 'washed' | 'completed'): Detail {
  return {
    sessionId, householdId: 'preview-household' as Id<'households'>, planId: 'preview-plan' as Id<'plans'>, planInputHash: 'synthetic-route', idempotencyKey: 'synthetic-route', loadId: 'preview-load',
    status: stage === 'completed' ? 'completed' : 'running', revision: 1, timelineRevision: 1,
    startedAt: now - 40 * 60_000, completedAt: stage === 'completed' ? now - 10 * 60_000 : null, putAwayAt: stage === 'completed' ? now : null,
    machineName: 'Washer 14', machineStartedAt: now - 40 * 60_000, cycle: 'normal', cycleMinutes: stage === 'running' ? 50 : 40, doorLocks: false, finishConfidence: 'user-supplied', estimatedFinishAt: stage === 'running' ? now + 10 * 60_000 : now,
    estimatedDoneAt: stage === 'running' ? now + 10 * 60_000 : now, washFinishedAt: stage === 'running' ? null : now, dryerStartedAt: null, drumFullness: null, dryerFullness: null, drying: null,
    loadName: 'White cotton tees', loadNumber: 1, loadCount: 1,
    textiles: tees.map((piece) => ({ textileId: piece.textileId, name: piece.name, color: piece.color, colorGroup: piece.colorGroup ?? undefined, status: stage === 'completed' ? 'clean' : 'dirty', washCount: 4, ...(stage === 'completed' ? { drying: 'put_away' as const } : {}) })),
    actions: [...recipeActions.map((action): Detail['actions'][number] => ({ ...action, textileId: action.textileId === undefined ? undefined : item, status: 'confirmed' })), { ...recipeActions[4]!, id: 'preview-route-dryer', task: 'dryer_start', phase: 'dryer_start', order: 5, status: stage === 'completed' ? 'confirmed' : 'pending' }], reminders: [], usage: [],
  }
}

export function routeDryingQueue(combine = false, queued = true): DryingQueue {
  const pieces: DryingQueue['pieces'] = (queued ? tees : []).map((piece, index) => ({
    pieceId: `preview-route-dry-${index}` as Id<'dryingPieces'>, textileId: piece.textileId, name: piece.name, kind: piece.kind, color: piece.color, colorGroup: piece.colorGroup,
    washerName: 'Washer 14', status: 'queued', queuedAt: now, own: false, need: null, label: 'tumble_dry', method: 'tumble', source: 'label', evidence: 'allowed', preference: null, dried: null, maxHeat: 'low', hold: null, bulkUnits: 1, dryingRunId: null, driedIn: null,
  }))
  return { homeDryerId: null, homeDryerSessionId: null, dryers: [], runs: [], hangingDryers: [], equipment: { tumble: false, heated_hanging: false }, capacityUnits: null, capacities: [], pieces, plan: planDryerLoads(pieces.map((piece) => ({ id: piece.pieceId, bulkUnits: piece.bulkUnits, maxHeat: piece.maxHeat, source: piece.washerName, method: piece.method, own: piece.own })), { combine, capacityUnits: null }) }
}

const entries: Record<string, string[]> = {
  'legacy.home-empty': ['/'],
  'route.closet.add-choose': ['/', '/closet?add=choose'],
  'legacy.closet-record': [closetItem],
  'route.closet.running': [closetItem],
  'route.laundry.session-closet': [closetItem, `${washUrl}?from=closet`],
  'route.laundry.hamper-item': [closetItem, `/laundry?item=${item}`],
  'route.laundry.washed': [washedUrl],
  'route.drying.washer-queued': [washedUrl, '/drying'],
  'legacy.laundry-completed': ['/me', finishedUrl],
  'route.closet.history': ['/me', finishedUrl, `${closetItem}&tab=history`],
}
export const routePreviewScenarios = new Set(Object.keys(entries))
type Progress = { washed: boolean; queued: boolean; revision: number; listeners: Set<() => void> }

/** A bounded memory-only route fixture; production navigation and mutation guards remain in the real presenters. */
export function RoutePreview({ scenario, config, readOnly = false }: { scenario: string; config: ReviewConfig; readOnly?: boolean }) {
  const [progress] = useState<Progress>(() => ({ washed: scenario === 'route.laundry.washed' || scenario === 'route.drying.washer-queued', queued: scenario === 'route.drying.washer-queued', revision: 0, listeners: new Set() }))
  const update = () => { progress.revision++; progress.listeners.forEach((listener) => listener()) }
  const [router] = useState(() => {
    const paths = entries[scenario]!
    const history = createMemoryHistory({ initialEntries: paths, initialIndex: paths.length - 1 })
    if (paths.length > 1) history.replace(paths.at(-1)!, { itemReturnTo: paths.at(-2)! })
    const parent = createRootRoute({ component: () => <RoutePages scenario={scenario} config={config} readOnly={readOnly} progress={progress} /> })
    const page = createRoute({ getParentRoute: () => parent, path: '$', component: () => null })
    return createRouter({ routeTree: parent.addChildren([page]), history })
  })
  const inventory: Inventory = { planning: {}, machines: [], supplies: [], wearers: [], textiles: scenario === 'route.closet.add-choose' || scenario === 'legacy.home-empty' ? [] : tees }
  const [client] = useState(() => ({
    connectionState: () => ({ isWebSocketConnected: true, hasEverConnected: true, oldestInflightRequestStartedAt: null, hasInflightRequests: false }),
    subscribeToConnectionState: () => () => {},
    watchQuery: (query: FunctionReference<'query'>) => ({ localQueryResult: () => {
      const name = getFunctionName(query)
      return name === 'inventory:list' ? inventory : name === 'sessions:loadRecord' ? loadRecord : name === 'sessions:garmentRecord' ? record : name === 'dryingQueue:queue' ? routeDryingQueue(false, progress.queued) : []
    }, onUpdate: (listener: () => void) => { progress.listeners.add(listener); return () => progress.listeners.delete(listener) }, journal: () => undefined }),
    mutation: async (reference: FunctionReference<'mutation'>, args: Record<string, unknown>) => {
      const name = getFunctionName(reference)
      if (!['execution:washFinished', 'dryingQueue:queueFromWasher'].includes(name) || args.sessionId !== sessionId) throw new Error('This operation is outside the route fixture. No household request was sent.')
      if (readOnly || config.condition === 'offline') throw new Error('This operation is unavailable in this state.')
      if (name === 'execution:washFinished') { progress.washed = true; update(); return { sessionId, washFinishedAt: now } }
      if (!progress.washed || !queueReady(routeSession('washed'))) throw new Error('The washer transfer is unavailable in this state.')
      if (config.condition === 'save-error') throw new ConvexError({ code: 'SYNTHETIC_TRANSFER_FAILED', message: 'Synthetic washer transfer failed. The washed pieces are retained; try again.' })
      const already = progress.queued
      progress.queued = true
      update()
      return { queued: already ? 0 : tees.length, already }
    },
    action: async () => { throw new Error('Server actions are outside the route fixture.') },
  }) as unknown as ConvexReactClient)
  return <ConvexProvider client={client}><RouterProvider router={router} /></ConvexProvider>
}

function RoutePages({ scenario, config, readOnly, progress }: { scenario: string; config: ReviewConfig; readOnly: boolean; progress: Progress }) {
  useSyncExternalStore((listener) => { progress.listeners.add(listener); return () => progress.listeners.delete(listener) }, () => progress.revision)
  const router = useRouter()
  const href = useRouterState({ select: (state) => state.location.href })
  const url = new URL(href, 'http://review.local')
  const [combine, setCombine] = useState(false)
  const [out, setOut] = useState<string[]>([])
  const running = scenario === 'route.closet.running' || scenario === 'route.laundry.session-closet'
  const history = url.searchParams.get('tab') === 'history'
  const initialPieces = scenario === 'legacy.home-empty' || scenario === 'route.closet.add-choose' ? [] : scenario === 'legacy.closet-record' ? reviewTextiles.filter((piece) => piece.textileId.startsWith('preview-tee-')) : tees
  const queued = progress.queued
  const inventory: Inventory = { planning: {}, machines: [], supplies: [], wearers: [], textiles: initialPieces.map((piece) => ({ ...piece, status: history ? 'clean' : queued ? 'hanging' : piece.status, inLoad: running ? sessionId : null })) }
  const go = (path: string) => void router.navigate({ to: path, state: { itemReturnTo: href } })
  const back = (fallback: string) => { if (router.history.location.state.__TSR_index > 0) router.history.back(); else go(fallback) }
  if (url.pathname === '/') return <HomeOverview inventory={{ ...inventory, textiles: [] }} today={{ ...today, notReady: { ...today.notReady, dirty: 0 } }} state={{ kind: 'empty' }} now={now} />
  if (url.pathname === '/me') return <MePreview variant="history" />
  if (url.pathname.startsWith('/session/')) {
    const stage = url.searchParams.get('from') === 'me' || queued ? 'completed' : progress.washed ? 'washed' : 'running'
    return <SessionView detail={routeSession(stage)} now={now} online={config.condition !== 'offline'} savedAt={readOnly ? now : undefined} from={url.searchParams.get('from') === 'closet' ? 'closet' : url.searchParams.get('from') === 'me' ? 'me' : undefined} />
  }
  if (url.pathname === '/drying') return <DryingView queue={routeDryingQueue(combine)} householdId="preview-household" now={now} onBack={() => go('/laundry')} combine={combine} onCombine={setCombine} onCapacity={() => {}} calls={previewDryingCalls} />
  if (url.pathname === '/laundry') return <>
    <LaundryView now={now} householdId="preview-household" viewerKey="preview-user" inventory={inventory} hamper={{ count: queued ? 0 : 2, loads: null }} draft={null} onDraft={() => {}} planId={null} plan={null} questions={[]} calls={laundryPreviewCalls} onPlan={() => {}} onSession={() => {}} />
    {url.searchParams.has('item') && <GarmentSheet facts={{ members: inventory.textiles, wearerName: null, now, notWornDays: 0, doneAt: null, hangingSessionId: null }} calls={calls} planning={{ selectedIds: tees.map((piece) => piece.textileId).filter((id) => !out.includes(id)), onGroupCountChange: (ids, count) => setOut(ids.slice(count)) }} onClose={() => back(closetItem)} onDone={() => back(closetItem)} onNext={() => {}} />}
  </>
  return <>
    <ClosetView now={now} inventory={inventory} attention={{ hamper: { count: 2, loads: null, handWash: 0 }, top: null, cards: [] }} today={today} sessions={[]} meWearerId={null} wearerChip="everyone" onWearerChip={() => {}} calls={calls} onItemOpen={(id) => go(`/closet?item=${id}`)} />
    {url.searchParams.get('add') === 'choose' ? <AddClothesFlow householdId="preview-household" mode={{ kind: 'add', target: 'closet' }} onClose={() => back('/closet')} /> : url.searchParams.has('item') ? <GarmentSheet key={history ? 'history' : 'record'} facts={{ members: inventory.textiles, wearerName: null, now, notWornDays: 90, doneAt: null, hangingSessionId: null }} calls={calls}
      renderLink={(target, { className, children, 'aria-label': ariaLabel }) => <Button variant="unstyled" size="unstyled" className={className} aria-label={ariaLabel} onClick={() => go(target.to === 'session' ? `${washUrl}?from=closet` : `/laundry?item=${target.item}`)}>{children}</Button>}
      renderRecord={(panels) => <GarmentRecordView record={record} initialTab={history ? 'history' : 'care'} {...panels} />} onClose={() => back('/closet')} onDone={() => back('/closet')} onNext={() => {}} /> : null}
  </>
}
