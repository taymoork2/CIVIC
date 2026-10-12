import type { Id } from '@convex/_generated/dataModel'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { startOfDay } from '@/laundry/day-plan'
import { FixtureConvex, PreviewSteps, SeedPhone, type PhoneSeed, type PreviewStep } from '@/dev/fixture-preview'
import { dryingFacts, hubState, sharedPicks, sharedWasherCount, urgentFlag, type DayPlan, type DaySession, type EarlyCheck, type HubState } from '@/home/hub-state'
import type { Care, Inventory, Machine, Textile } from '@/household/inventory-types'
import { LaundryView } from '@/laundry/laundry-view'
import { laundryPreviewCalls } from '@/dev/laundry-preview'
import { previewCall } from '@/dev/preview-calls'

/**
 * Laundry day on the Laundry tab, from fixture server facts: a plan, the loads running and the drying
 * queue go through the app's own `hubState`, and the real `LaundryView` shows the result. The Convex
 * client here answers only the queries those presenters read and refuses every save. Visual data only.
 */

export const now = Date.UTC(2026, 9, 2, 19)
const minute = 60_000
const provenance = { source: 'Synthetic laundry-day visual fixture only', confidence: 'user-supplied' as const }
const care: Care = { material: null, washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, bleach: 'none', restrictions: [], dryMethod: 'tumble_dry', dryMethodInferred: false, dryHeat: 'low', ironSteam: null, status: 'confirmed', provenance }

const groups: { key: string; name: string; kind: Textile['kind']; color: string; colorGroup: Textile['colorGroup']; count: number; wearer: 'alex' | 'sam' | null }[] = [
  { key: 'tee', name: 'White cotton tee', kind: 't_shirt', color: 'White', colorGroup: 'white', count: 2, wearer: 'alex' },
  { key: 'towel', name: 'Gray bath towel', kind: 'towel', color: 'Gray', colorGroup: 'dark', count: 4, wearer: null },
  { key: 'jeans', name: 'Indigo jeans', kind: 'pants', color: 'Indigo', colorGroup: 'dark', count: 1, wearer: 'alex' },
  { key: 'pyjamas', name: 'Striped pajamas', kind: 'pajamas', color: 'Pink stripe', colorGroup: 'light', count: 2, wearer: 'sam' },
  { key: 'linen', name: 'Rust linen shirt', kind: 'shirt', color: 'Rust', colorGroup: 'saturated', count: 1, wearer: 'alex' },
]
const wearers: Inventory['wearers'] = [
  { wearerId: 'preview-alex' as Id<'wearers'>, name: 'Alex', kind: 'adult', principalKey: 'preview-user' },
  { wearerId: 'preview-sam' as Id<'wearers'>, name: 'Sam', kind: 'adult', principalKey: null },
]
const textiles = (inLoad: Readonly<Record<string, string>>, several: boolean): Textile[] => groups.flatMap((group) => Array.from({ length: group.count }, (_, index): Textile => ({
  textileId: `preview-${group.key}-${index}` as Id<'textiles'>, name: group.name, kind: group.kind, color: group.color, colorGroup: group.colorGroup,
  // One wearer unless the sample is about several (the owner's trial has one).
  wearerId: group.wearer === null ? null : `preview-${several ? group.wearer : 'alex'}` as Id<'wearers'>,
  occasions: [], tags: [], status: 'dirty', guest: false, inLoad: (inLoad[group.key] ?? null) as Id<'sessions'> | null, care,
  // A fresh food stain: this load goes first (`urgentFlag`).
  flag: group.key === 'tee' ? { reasons: ['food'], flaggedBy: 'preview-user', flaggedAt: now - 3 * 60 * minute } : null,
  soilLevel: 'normal', statusSince: now, washCount: 3, firstWash: false, bulkUnits: null, fromFixture: false, lastWornAt: null, wearsSinceClean: 0,
  lastCleanedAt: null, cleanerNote: null, cleanerPickupBy: null, identity: null, createdAt: now,
})))
const idsFor = (...keys: string[]) => groups.filter((group) => keys.includes(group.key)).flatMap((group) => Array.from({ length: group.count }, (_, index) => `preview-${group.key}-${index}`))

const machine = (key: string, name: string, patch: Partial<Machine>): Machine => ({
  machineId: `preview-${key}` as Id<'machines'>, name, model: null, applianceType: 'front_load_washer', highEfficiency: true, heatSettings: [], capacityUnits: 12, capacityConfidence: 'user-supplied',
  supportedCycles: [], placements: [], cycleMinutes: {}, availability: 'available', location: 'home', pricePerStart: null, blockMinutes: null, drumVolume: null, archived: false, provenance, ...patch,
})
const homeMachines = [machine('home-washer', 'Washer', {}), machine('home-dryer', 'Dryer', { applianceType: 'tumble_dryer', highEfficiency: null, heatSettings: [{ heat: 'low', label: 'Low' }, { heat: 'medium', label: 'Medium' }] })]
const sharedMachines = [
  ...['9', '14', '3B'].map((number) => machine(`washer-${number}`, `Washer ${number}`, { location: 'shared', pricePerStart: 2.5 })),
  ...['4', '2', '7'].map((number) => machine(`dryer-${number}`, `Dryer ${number}`, { applianceType: 'tumble_dryer', highEfficiency: null, location: 'shared', pricePerStart: 1.5, heatSettings: [{ heat: 'low', label: 'Low' }] })),
]

type Load = { readonly key: string; readonly textiles: readonly string[]; readonly ids?: readonly string[]; readonly wash: number | null; readonly dry: number | null }
// Wash and dryer minutes as the washer and dryer recorded them; a null dryer hangs to dry.
const whites: Load = { key: 'whites', textiles: ['tee'], wash: 45, dry: 65 }
const darks: Load = { key: 'darks', textiles: ['towel', 'jeans'], wash: 55, dry: 80 }
const lights: Load = { key: 'lights', textiles: ['pyjamas'], wash: 45, dry: 50 }
const brights: Load = { key: 'brights', textiles: ['linen'], wash: 45, dry: 40 }
const loadId = (load: Load) => `preview-load-${load.key}`
const planId = 'preview-day-plan'

function dayPlan(loads: readonly Load[], sessions: Readonly<Record<string, string>> = {}, timed = true): DayPlan {
  return { planId, loads: loads.map((load) => {
    const ids = load.ids ?? idsFor(...load.textiles)
    return { loadId: loadId(load), sessionId: sessions[load.key] ?? null, startable: true, textileIds: ids, washMinutes: timed ? load.wash : null, washLearned: null,
      dryer: load.dry === null ? null : { minutes: timed ? load.dry : null, tumbleCount: ids.length, fit: 'fits' }, blockers: [] }
  }) }
}

/** The stored plan `plans.get` returns, as far as the day plan reads it: the planner's loads and why the lights were kept apart. */
function storedPlan(loads: readonly Load[]) {
  return {
    planId, textileIds: loads.flatMap((load) => load.ids ?? idsFor(...load.textiles)), pass: { mode: 'normal', loadPins: [], dismissedQuestions: [], excludedSupplyIds: [] },
    result: {
      loads: loads.map((load) => ({ id: loadId(load), textileIds: load.ids ?? idsFor(...load.textiles), machineId: 'preview-home-washer', cycle: 'normal', temperatureC: 30,
        bulkUnits: load === darks ? 8 : 2, capacityUnits: 12,
        drying: load.dry === null ? null : { dryerId: 'preview-home-dryer', heatLabel: 'Low', bulkUnits: load === darks ? 8 : 2, capacityUnits: 12 } })),
      // Kept apart only for heavy and light pieces: a preference, so "could go together" may offer it.
      reasons: [{ code: 'preference_applied', details: { cause: 'heavy_light_mixing_avoidance' }, loadId: loadId(brights) }],
    },
  }
}

const session = (key: string, facts: Partial<DaySession>): DaySession => ({
  sessionId: `preview-wash-${key}`, machineName: 'Washer', dryerName: null, status: 'running', machineStartedAt: now - 60 * minute, washFinishAt: null, washFinishedAt: null,
  dryerStartedAt: null, dryMinutes: null, hasDrying: true, dryerStepRecorded: false, dryerUnloaded: false, ...facts,
})

const homeQueue = { pieces: [], runs: [], homeDryerId: 'preview-home-dryer', homeDryerSessionId: null, dryers: [{ machineId: 'preview-home-dryer', name: 'Dryer' }] }
const sharedQueue = { pieces: [], runs: [], homeDryerId: null, homeDryerSessionId: null, dryers: [] }

export const laundryDayScreens = ['next-joined', 'next-held', 'times', 'day-plan', 'day-scale', 'day-home-until', 'day-spread', 'day-strip', 'day-strip-open', 'day-hang-now', 'shared-ask', 'shared-answered', 'early-check', 'early-check-due'] as const
export type LaundryDayPreviewState = (typeof laundryDayScreens)[number]

type Sample = { plan: DayPlan; loads: readonly Load[]; sessions: DaySession[]; place: 'home' | 'shared'; pieces?: Textile[]; several?: boolean; steps?: readonly PreviewStep[]; seeds?: readonly PhoneSeed[]; checks?: readonly EarlyCheck[] }

/** "All today" picked this morning, as the day plan saves it on the phone (`DayPick`). */
const dayPick = (patch: object): PhoneSeed => ({ key: 'washcloset:private:day-pick', event: 'washcloset:day-pick',
  value: { planId, mode: 'all', day: startOfDay(now), end: null, until: '21:00', rest: 0, perDay: 2, rolled: [], hang: [], hangNow: [], ...patch } })
const all = [whites, darks, lights, brights]
const sharedLoads: Load[] = [whites, darks, { ...lights, dry: null }]
// Twenty pieces per load is declared visual fixture data, not a capacity or care decision.
const scalePieces = Array.from({ length: 1000 }, (_, i): Textile => ({ ...textiles({}, false)[0]!, textileId: `preview-day-piece-${i}` as Id<'textiles'>, name: `Family piece ${String(i).padStart(4, '0')}`, flag: null }))
const scaleLoads: Load[] = Array.from({ length: 50 }, (_, i) => ({ key: `family-${i}`, textiles: [], ids: scalePieces.slice(i * 20, (i + 1) * 20).map(piece => piece.textileId), wash: null, dry: null }))

const samples: Record<LaundryDayPreviewState, Sample> = {
  // The whites' wash is done and the home dryer is free: move them, and the next wash joins this trip.
  'next-joined': { plan: dayPlan(all, { whites: 'preview-wash-whites' }), loads: all, place: 'home',
    sessions: [session('whites', { washFinishAt: now - 3 * minute, dryMinutes: whites.dry, textileIds: idsFor('tee') })] },
  // The darks are in the home dryer for about 80 min: the next wash is held back to end with it.
  'next-held': { plan: dayPlan(all, { darks: 'preview-wash-darks' }), loads: all, place: 'home',
    sessions: [session('darks', { machineStartedAt: now - 70 * minute, washFinishedAt: now - 8 * minute, dryerStartedAt: now - 2 * minute, dryerName: 'Dryer', dryMinutes: darks.dry, dryerStepRecorded: true, textileIds: idsFor('towel', 'jeans') })] },
  // No minutes recorded for any machine: nothing is asked or guessed, and no clock until they are known.
  times: { plan: dayPlan(all, {}, false), loads: all, place: 'home', sessions: [] },
  'day-plan': { plan: dayPlan(all), loads: all, place: 'home', sessions: [] },
  'day-scale': { plan: dayPlan(scaleLoads, {}, false), loads: scaleLoads, pieces: scalePieces, place: 'home', sessions: [] },
  'day-home-until': { plan: dayPlan(all), loads: all, place: 'home', sessions: [], steps: [{ tap: 'All today' }] },
  'day-spread': { plan: dayPlan(all), loads: all, place: 'home', sessions: [], several: true, steps: [{ tap: 'Spread out' }] },
  'day-strip': { plan: dayPlan(all), loads: all, place: 'home', sessions: [], seeds: [dayPick({})] },
  'day-strip-open': { plan: dayPlan(all), loads: all, place: 'home', sessions: [], seeds: [dayPick({})], steps: [{ open: '.day-plan-sources' }] },
  // "Home until 4:00": the lights didn't fit and stayed in the hamper, so today's plan holds two loads.
  'day-hang-now': { plan: dayPlan([whites, darks]), loads: [whites, darks], place: 'home', sessions: [], seeds: [dayPick({ until: '16:00', hangNow: ['Lights'] })] },
  'shared-ask': { plan: dayPlan(sharedLoads), loads: sharedLoads, place: 'shared', sessions: [] },
  'shared-answered': { plan: dayPlan(sharedLoads), loads: sharedLoads, place: 'shared', sessions: [] },
  // Dryer 7 started 13 minutes ago with an early check at about half the time: its countdown, then the one action once due.
  'early-check': { plan: dayPlan(all), loads: all, place: 'shared', sessions: [], checks: [{ runId: 'preview-run', dryer: 'Dryer 7', names: 'Blue tee', at: now + 12 * minute, startedAt: now - 13 * minute }] },
  'early-check-due': { plan: dayPlan(all), loads: all, place: 'shared', sessions: [], checks: [{ runId: 'preview-run', dryer: 'Dryer 7', names: 'Blue tee', at: now - minute, startedAt: now - 26 * minute }] },
}

/** This sample's hub state, worked out by the app's own `hubState` from its server facts. */
export function laundryDayHub(variant: LaundryDayPreviewState): { state: HubState; inventory: Inventory } {
  const sample = samples[variant]
  const inLoad = Object.fromEntries(sample.sessions.flatMap((entry) => groups.filter((group) => entry.textileIds?.includes(`preview-${group.key}-0`)).map((group) => [group.key, entry.sessionId])))
  const pieces = sample.pieces ?? textiles(inLoad, sample.several === true)
  const inventory: Inventory = { planning: {}, machines: sample.place === 'home' ? homeMachines : sharedMachines, supplies: [], textiles: pieces, wearers: sample.several === true ? wearers : wearers.slice(0, 1) }
  const waiting = pieces.filter((piece) => piece.inLoad === null)
  const state = hubState({
    hamper: { count: waiting.length, loads: sample.loads.length }, plan: sample.plan, sessions: sample.sessions, hanging: { count: 0, sessionIds: [] },
    textileNames: new Map(pieces.map((piece) => [piece.textileId as string, piece.name])), drying: dryingFacts(sample.place === 'home' ? homeQueue : sharedQueue),
    urgentIds: new Set(pieces.filter((piece) => urgentFlag(piece.flag, now)).map((piece) => piece.textileId as string)),
    sharedStart: { entry: null, washers: sharedWasherCount(inventory.machines) },
  }, now)
  return { state, inventory }
}

/** The real Laundry tab for one laundry-day sample; every save is refused and nothing reaches the backend. */
export function LaundryDayPreview({ variant }: { variant: LaundryDayPreviewState }) {
  const sample = samples[variant]
  const [{ state, inventory }] = useState(() => laundryDayHub(variant))
  const [seeds] = useState(() => sample.seeds ?? (variant === 'shared-answered' && state.kind === 'pass' && state.loads !== undefined
    // "Washers free: 3+", "Dryers free: 1", turned into loads by the app's own `sharedPicks`.
    ? [{ key: 'washcloset:private:shared-start', event: 'washcloset:shared-start', value: { planId, ...sharedPicks(state.loads, 3, 1) } }] : []))
  return <FixtureConvex data={{ 'dryingQueue:queue': sample.place === 'home' ? homeQueue : sharedQueue, 'plans:get': storedPlan(sample.loads) }}>
    <SeedPhone seeds={seeds} />
    <LaundryView now={now} householdId="preview-household" viewerKey="preview-user" inventory={inventory} hamper={{ count: 0, loads: null }} place={sample.place === 'home' ? 'home' : 'shared'}
      draft={null} onDraft={previewCall('save the draft')} planId={null} plan={null} questions={[]} calls={laundryPreviewCalls} onPlan={previewCall('open the plan')} onSession={previewCall('open the load')}
      hub={state} checks={sample.checks} onItemOpen={previewCall('open the garment')}
      renderLink={(_, { className, children }) => <Button variant="unstyled" size="unstyled" className={className} onClick={previewCall('follow the link')}>{children}</Button>} />
    <PreviewSteps steps={sample.steps ?? []} />
  </FixtureConvex>
}
