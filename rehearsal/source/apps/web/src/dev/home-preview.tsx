import type { Id } from '@convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { Today } from '@/closet/closet-view'
import { DailyOutfitCard, DailyOutfitSummary } from '@/closet/daily-outfit'
import { FixtureConvex } from '@/dev/fixture-preview'
import { dryingFacts, hubState, type HubState } from '@/home/hub-state'
import type { Inventory, Textile } from '@/household/inventory-types'
import { HomeOverview } from '@/home/home-page'

// Visual data only: never seeded or sent to Convex. Names/counts follow the frozen Home presets.
const groups: { key: string; name: string; kind: Textile['kind']; color: string; colorGroup: Textile['colorGroup']; count: number; ready: number; tags: string[] }[] = [
  { key: 'tee', name: 'White cotton tee', kind: 't_shirt', color: 'White', colorGroup: 'white', count: 3, ready: 1, tags: ['Everyday'] },
  { key: 'towel', name: 'Gray bath towel', kind: 'towel', color: 'Gray', colorGroup: 'light', count: 4, ready: 0, tags: ['Home'] },
  { key: 'jeans', name: 'Indigo jeans', kind: 'pants', color: 'Indigo', colorGroup: 'dark', count: 2, ready: 1, tags: ['Everyday', 'Work'] },
  { key: 'leggings', name: 'Black leggings', kind: 'pants', color: 'Black', colorGroup: 'dark', count: 2, ready: 0, tags: ['Sport'] },
  { key: 'navy', name: 'Navy everyday tee', kind: 't_shirt', color: 'Navy', colorGroup: 'dark', count: 2, ready: 2, tags: ['Everyday'] },
  { key: 'pyjamas', name: 'Striped pajamas', kind: 'pajamas', color: 'Pink stripe', colorGroup: 'light', count: 3, ready: 1, tags: ['Sleep'] },
  { key: 'linen', name: 'Rust linen shirt', kind: 'shirt', color: 'Rust', colorGroup: 'saturated', count: 1, ready: 1, tags: ['Work'] },
]
const provenance = { source: 'Frozen design visual fixture', confidence: 'user-supplied' as const }
const recordedCare: NonNullable<Textile['care']> = {
  material: null, washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, restrictions: [], dryMethod: 'tumble_dry', dryMethodInferred: false, dryHeat: 'low', ironSteam: null, status: 'confirmed', provenance,
}
const machine: Inventory['machines'][number] = {
  machineId: 'preview-washer' as Id<'machines'>, name: 'Washer 14', model: null, applianceType: 'top_load_washer', highEfficiency: true, heatSettings: [], capacityUnits: null, capacityConfidence: 'unknown', supportedCycles: [], placements: [], cycleMinutes: {}, availability: 'available', location: 'shared', pricePerStart: null, blockMinutes: null, drumVolume: null, archived: false, provenance,
}
const supply: Inventory['supplies'][number] = {
  supplyId: 'preview-product' as Id<'supplies'>, name: 'Fragrance-free liquid', kind: 'chemical', use: 'detergent', formulation: null, measure: null, archived: false, ranOutAt: null, rules: [], provenance,
}

export type HomePreviewState = 'empty' | 'one' | 'planned' | 'running' | 'sequential' | 'dryer-busy' | 'check-now' | 'drying'

/**
 * Laundry-day hub states from fixture server facts, through the app's own `hubState`. Dryer busy: at
 * home the striped pajamas' wash is done while the towels' run has about 30 min left. Check now: a
 * shared-room run whose early check for the tees came due a minute ago.
 */
function laundryDayState(variant: 'dryer-busy' | 'check-now', now: number): HubState {
  const minute = 60_000
  const piece = (key: string, status: string, name: string) => ({ pieceId: `preview-dry-${key}`, status, queuedAt: now - 40 * minute, method: 'tumble', name })
  const queue = variant === 'dryer-busy'
    ? { homeDryerId: 'preview-home-dryer', pieces: [piece('towel', 'drying', 'Gray bath towel')],
      runs: [{ runId: 'preview-run-towels', kind: 'dryer' as const, dryerId: 'preview-home-dryer', dryerName: 'Dryer', method: 'tumble', startedAt: now - 30 * minute, minutes: 60, reminded: false }] }
    : { homeDryerId: null, pieces: [piece('tee', 'drying', 'White cotton tee'), piece('towel', 'drying', 'Gray bath towel')],
      runs: [{ runId: 'preview-run-4', kind: 'dryer' as const, dryerId: 'preview-dryer-4', dryerName: 'Dryer 4', method: 'tumble', startedAt: now - 26 * minute, minutes: 50, reminded: false,
        check: { at: now - minute, missed: false, pieceIds: ['preview-dry-tee'] } }] }
  const sessions = variant === 'dryer-busy' ? [{ sessionId: 'preview-wash-pyjamas', machineName: 'Washer', dryerName: null, status: 'running', machineStartedAt: now - 50 * minute, washFinishAt: null,
    washFinishedAt: now - 4 * minute, dryerStartedAt: null, dryMinutes: 50, hasDrying: true, dryerStepRecorded: false, dryerUnloaded: false }] : []
  return hubState({ hamper: { count: 0, loads: null }, plan: null, sessions, hanging: { count: 0, sessionIds: [] }, drying: dryingFacts(queue) }, now)
}

export function HomePreview({ variant }: { variant: HomePreviewState }) {
  const now = Date.UTC(2026, 9, 2, 19)
  const chosen = variant === 'empty' ? [] : variant === 'one' ? groups.slice(0, 1) : variant === 'drying' ? groups.slice(1, 2) : groups
  const textiles: Textile[] = chosen.flatMap((group) => Array.from({ length: group.count }, (_, index): Textile => ({
    textileId: `preview-${group.key}-${index}` as Id<'textiles'>, name: group.name, kind: group.kind, color: group.color, colorGroup: group.colorGroup, wearerId: null, occasions: [], tags: group.tags,
    status: variant === 'drying' ? 'hanging' : variant === 'one' || index < group.ready ? 'clean' : 'dirty', guest: false,
    inLoad: variant === 'dryer-busy' && group.key === 'pyjamas' && index >= group.ready ? 'preview-wash-pyjamas' as Id<'sessions'> : (variant === 'running' || variant === 'sequential') && group.key === 'towel' ? 'preview-wash-1' as Id<'sessions'> : variant === 'running' && group.key === 'pyjamas' && index >= group.ready ? 'preview-wash-2' as Id<'sessions'> : null,
    care: group.key === 'linen' ? null : recordedCare, flag: null, soilLevel: 'normal', statusSince: now, washCount: 0, firstWash: false, bulkUnits: null, fromFixture: false, lastWornAt: null, wearsSinceClean: 0, lastCleanedAt: null, cleanerNote: null, cleanerPickupBy: null, identity: null, createdAt: now,
  })))
  const ready = textiles.filter((textile) => textile.status === 'clean' && textile.inLoad === null)
  const today: Today = {
    ready: ready.map((textile) => ({ _id: textile.textileId, name: textile.name, kind: textile.kind ?? undefined, color: textile.color ?? undefined, colorGroup: textile.colorGroup ?? undefined, wearerId: undefined, occasions: [], wearsSinceClean: 0, lastWornAt: undefined, lastCleanedAt: undefined, createdAt: now })),
    readyCount: ready.length, notReady: { dirty: textiles.filter((textile) => textile.status === 'dirty' && textile.inLoad === null).length, in_wash: textiles.filter((textile) => textile.inLoad !== null).length, hanging: variant === 'drying' ? textiles.length : 0, needs_dry_clean: 0, at_cleaner: 0, needs_refresh: 0 }, notReadyForOccasion: [], notWornDays: 90,
  }
  const state: HubState = variant === 'dryer-busy' || variant === 'check-now' ? laundryDayState(variant, now) : variant === 'running' || variant === 'sequential'
    ? { kind: 'running', rows: [
      { sessionId: 'preview-wash-1', machine: variant === 'sequential' ? 'Home washer' : 'Washer 14', stage: 'washing', startedAt: now - (variant === 'sequential' ? 20 : 29) * 60_000, doneAt: now + (variant === 'sequential' ? 30 : 16) * 60_000, name: 'Gray bath towel ×4' },
      ...(variant === 'running' ? [{ sessionId: 'preview-wash-2', machine: 'Washer 9', stage: 'washing' as const, startedAt: now - 12 * 60_000, doneAt: now + 26 * 60_000, name: 'Striped pajamas ×2' }] : []),
    ], next: null }
    : variant === 'planned' ? { kind: 'pass', planId: 'preview-plan', number: 1, count: 4, ready: false,
      blocker: { source: 'product', name: supply.name, code: 'needs_confirmation', details: { cause: 'insufficient_product_evidence' } },
    } : variant === 'drying' ? { kind: 'drying', count: textiles.length, sessionIds: ['preview-wash'], runId: 'preview-air' } : { kind: 'empty' }
  const inventory: Inventory = { planning: {}, wearers: [], textiles, machines: variant === 'empty' ? [] : [machine], supplies: variant === 'empty' ? [] : [supply] }
  return <div inert className="contents"><HomeOverview inventory={inventory} today={today} state={state} now={now} washPlace={variant === 'empty' ? null : variant === 'sequential' || variant === 'dryer-busy' ? 'home' : 'shared'}
    outfitSummary={variant === 'one' ? <FixtureConvex data={{ 'outfits:today': [{ isYou: true, items: [{ key: 'tee', name: 'White cotton tee', kind: 't_shirt', colorGroup: 'white', quantity: 1 }] }] }}><DailyOutfitSummary householdId="preview-household" wearerId={null} now={now} /></FixtureConvex> : undefined}
    outfit={<><DailyOutfitCard items={['tee', 'jeans'].map((key) => {
      const group = groups.find((item) => item.key === key)!
      return { key, name: group.name, color: group.color, colorGroup: group.colorGroup, kind: group.kind, brand: null, wearerId: null, quantity: 1 }
    })} by="Your pick" controls={<RadioGroup variant="segment" aria-label="Whose outfit" value="mine" onValueChange={() => {}} className="max-w-full overflow-x-auto [&_button]:whitespace-nowrap"><RadioGroupItem variant="segment" value="mine">Mine</RadioGroupItem><RadioGroupItem variant="segment" value="sam">From Sam</RadioGroupItem></RadioGroup>} wearAction={<Button variant="outline" size="sm">Wear this</Button>} /><Button variant="secondary" className="w-full">Change today’s outfit</Button></>} />
  </div>
}
