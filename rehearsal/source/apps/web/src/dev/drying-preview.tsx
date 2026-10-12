import { chooseDryerSetting, dryerHeats, dryerShare, isKnit, pieceMethod, planDryerLoads } from '@washcloset/planner'
import { useRef, useState } from 'react'
import type { Id } from '@convex/_generated/dataModel'
import { dryerLoadView, DryingView, type DryingCalls, type DryingQueue, type DryingScreen } from '@/drying/drying-view'
import { DryingMethodSheet } from '@/drying/drying-method'
import { dryingDesignText } from '@/copy-drying'
import { Button } from '@/components/ui/button'
import { previewCall, previewConvexCall } from '@/dev/preview-calls'
import { PreviewSteps, type PreviewStep } from '@/dev/fixture-preview'

export const previewDryingCalls: DryingCalls = {
  setPiece: previewConvexCall('save the piece'), setPreference: previewConvexCall('save the drying preference'),
  startAir: previewConvexCall('start air drying'), start: previewConvexCall('start the dryer'),
  addLabel: previewConvexCall('add the dryer'), check: previewConvexCall('save the dryness check'), putAway: previewConvexCall('put the pieces away'),
  hang: previewConvexCall('hang them while the dryer is busy'), remind: previewConvexCall('remind you when the dryer is done'),
}

type Piece = DryingQueue['pieces'][number]
const groups: { key: string; name: string; kind: Piece['kind']; color: string; colorGroup: Piece['colorGroup']; count: number; washerName: string; heat: Piece['maxHeat']; natural?: boolean }[] = [
  { key: 'tee', name: 'White cotton tee', kind: 't_shirt', color: 'White', colorGroup: 'white', count: 2, washerName: 'Washer 14', heat: 'low' },
  { key: 'navy', name: 'Navy everyday tee', kind: 't_shirt', color: 'Navy', colorGroup: 'dark', count: 2, washerName: 'Washer 9', heat: 'low' },
  { key: 'pyjamas', name: 'Striped pajamas', kind: 'pajamas', color: 'Pink stripe', colorGroup: 'light', count: 2, washerName: 'Washer 9', heat: 'low' },
  { key: 'towel', name: 'Gray bath towel', kind: 'towel', color: 'Gray', colorGroup: 'dark', count: 4, washerName: 'Washer 14', heat: 'medium' },
  { key: 'leggings', name: 'Black leggings', kind: 'pants', color: 'Black', colorGroup: 'dark', count: 2, washerName: 'Washer 14', heat: null, natural: true },
  { key: 'jeans', name: 'Indigo jeans', kind: 'pants', color: 'Indigo', colorGroup: 'dark', count: 1, washerName: 'Washer 9', heat: null, natural: true },
]
const now = Date.UTC(2026, 9, 2, 19)
const minute = 60_000
const pieces: Piece[] = groups.flatMap((group) => Array.from({ length: group.count }, (_, index) => ({
  pieceId: `preview-dry-${group.key}-${index}` as Id<'dryingPieces'>,
  textileId: `preview-${group.key}` as Id<'textiles'>,
  name: group.name, kind: group.kind, color: group.color, colorGroup: group.colorGroup,
  // Out of the washer 25 minutes ago: only the smell sample says it sat wet long.
  washerName: group.washerName, status: 'queued', queuedAt: now - 25 * minute, own: false, need: null,
  label: group.natural ? 'do_not_tumble_dry' : 'tumble_dry', method: group.natural ? 'rack_line' : 'tumble',
  source: 'label', evidence: group.natural ? 'not_specified' : 'allowed', preference: null, dried: null,
  maxHeat: group.heat, hold: null, bulkUnits: group.kind === 'towel' ? 3 : 1,
  dryingRunId: null, driedIn: null,
})))
const dryers: DryingQueue['dryers'] = [{ number: 4, capacityUnits: 28 }, { number: 2, capacityUnits: 8 }, { number: 7, capacityUnits: null }].map(({ number, capacityUnits }) => ({
  machineId: `preview-dryer-${number}` as Id<'machines'>, name: `Dryer ${number}`,
  location: 'shared', capacityUnits,
  heatSettings: [{ heat: 'low', label: 'Low' }, { heat: 'medium', label: 'Medium' }], pricePerStart: 1.5,
}))

export type DryingPreviewState = 'index' | 'empty' | 'putaway-one' | 'unknown' | 'method-conflict' | 'preference' | 'second-wash' | 'dryer' | 'check' | 'check-empty' | 'putaway' | 'home' | 'stain'
  | 'scale-plan' | 'scale-mixed' | 'scale-check' | 'scale-putaway'
  | 'wait' | 'wait-smell' | 'none-free' | 'early-check' | 'check-marks' | 'take-out-early' | 'check-missed'
export const dryingPreviewStates: readonly DryingPreviewState[] = ['index', 'empty', 'putaway-one', 'unknown', 'method-conflict', 'preference', 'second-wash', 'dryer', 'check', 'check-empty', 'putaway', 'home', 'stain',
  'wait', 'wait-smell', 'none-free', 'early-check', 'check-marks', 'take-out-early', 'check-missed', 'scale-plan', 'scale-mixed', 'scale-check', 'scale-putaway']
const atHome = (variant: DryingPreviewState) => variant === 'home' || variant === 'wait' || variant === 'wait-smell'
const ids = (list: readonly Piece[], ...keys: string[]) => list.filter((piece) => keys.some((key) => piece.pieceId.startsWith(`preview-dry-${key}-`))).map((piece) => piece.pieceId)
/** An early check (design 8.4) for the tees, due `dueIn` minutes from now; `missed` once the run ended without it. */
const teeCheck = (dueIn: number, missed = false) => ({ at: now + dueIn * minute, atMinute: 25, pieceIds: ids(pieces, 'tee'), reasons: ['knit' as const], missed })
const run = (runId: string, patch: Partial<DryingQueue['runs'][number]>): DryingQueue['runs'][number] => ({ runId: runId as Id<'dryingRuns'>, dryerId: null, reminded: false, kind: 'dryer', method: 'tumble',
  dryerName: 'Dryer 4', heatLabel: 'Low', startedAt: now, minutes: 50, pieceIds: [], ...patch })

/** The laundry-day runs: the towels in the busy home dryer, a full rack, and shared-room runs with an early check. */
function laundryDayRuns(variant: DryingPreviewState, list: readonly Piece[]): DryingQueue['runs'] | null {
  const drying = (...keys: string[]) => ids(list.filter((piece) => piece.status === 'drying'), ...keys) as Id<'dryingPieces'>[]
  if (variant === 'wait' || variant === 'wait-smell') return [
    run('preview-home-run', { dryerId: 'preview-home-dryer' as Id<'machines'>, dryerName: 'Dryer', heatLabel: 'Medium', startedAt: now - 30 * minute, minutes: 60, pieceIds: drying('towel') }),
    ...(variant === 'wait-smell' ? [run('preview-rack-run', { kind: 'air', method: 'rack_line', dryerName: null, heatLabel: null, startedAt: now - 60 * minute, minutes: null, pieceIds: drying('leggings') })] : []),
  ]
  if (variant === 'check-marks') return [
    run('preview-run-4', { dryerId: 'preview-dryer-4' as Id<'machines'>, startedAt: now - 13 * minute, pieceIds: drying('tee', 'towel'), check: teeCheck(12) }),
    run('preview-run-7', { dryerId: 'preview-dryer-7' as Id<'machines'>, dryerName: 'Dryer 7', startedAt: now - 26 * minute, pieceIds: drying('navy', 'pyjamas'), check: { ...teeCheck(-1), pieceIds: ids(list, 'navy') } }),
  ]
  if (variant === 'take-out-early') return [run('preview-run-4', { dryerId: 'preview-dryer-4' as Id<'machines'>, startedAt: now - 26 * minute, pieceIds: drying('tee', 'towel'), check: teeCheck(-1) })]
  if (variant === 'check-missed') return [run('preview-run-4', { dryerId: 'preview-dryer-4' as Id<'machines'>, startedAt: now - 55 * minute, pieceIds: drying('tee', 'towel'), check: teeCheck(-30, true) })]
  return null
}

/** Interactive, memory-only examples. Calls never write to a household or start real equipment. */
export function DryingPreview({ variant = 'index', state, pieceCount = 1000, onBack = previewCall('go back') }: { variant?: DryingPreviewState; state?: 'invalid' | 'error' | 'busy'; pieceCount?: 100 | 500 | 1000; onBack?: () => void }) {
  const unknown = variant === 'unknown'
  const [combine, setCombine] = useState(false)
  const [capacityUnits, setCapacity] = useState<number | null>(unknown ? null : 28)
  const [chooserOpen, setChooserOpen] = useState(variant === 'method-conflict')
  const [stainOpen, setStainOpen] = useState(variant === 'stain')
  const [selectedPieces, setPieces] = useState(() => piecesFor(variant, pieceCount))
  const [reset, setReset] = useState(0)
  const sequence = useRef(0)
  const homeDryer = { ...dryers[0]!, machineId: 'preview-home-dryer' as Id<'machines'>, name: 'Dryer', location: 'home' as const, pricePerStart: null }
  const home = atHome(variant)
  const hasHanging = !home
  const [extraDryers, setExtraDryers] = useState<DryingQueue['dryers']>([])
  const initialRuns = (): DryingQueue['runs'] => {
    const laundryDay = laundryDayRuns(variant, piecesFor(variant, pieceCount))
    if (laundryDay !== null) return laundryDay
    const runPieces = piecesFor(variant, pieceCount).filter((piece) => piece.status === 'drying')
    return runPieces.length === 0 ? [] : [{
      runId: 'preview-drying-run' as Id<'dryingRuns'>, dryerId: null, reminded: false,
      kind: variant === 'putaway' || variant === 'scale-check' ? 'air' : 'dryer', method: variant === 'putaway' || variant === 'scale-check' ? 'rack_line' : 'tumble',
      dryerName: variant === 'putaway' || variant === 'scale-check' ? null : 'Dryer 4', heatLabel: variant === 'putaway' || variant === 'scale-check' ? null : 'Low',
      startedAt: now - (variant === 'putaway' ? 30 : 41) * 60_000,
      minutes: variant === 'putaway' || variant === 'scale-check' ? null : 40, pieceIds: runPieces.map((piece) => piece.pieceId),
    }]
  }
  const [runs, setRuns] = useState(initialRuns)
  const queuedPieces = selectedPieces.filter((piece) => piece.status === 'queued').map((piece) => ({
    id: piece.pieceId, bulkUnits: piece.bulkUnits, maxHeat: piece.maxHeat,
    source: piece.washerName, method: piece.method, own: piece.own,
    ...(piece.need === null ? {} : { need: piece.need }),
  }))
  const share = dryerShare(queuedPieces, { capacityUnits, knit: new Set(selectedPieces.filter((piece) => isKnit(piece.kind)).map((piece) => piece.pieceId as string)) })
  const queue: DryingQueue = {
    pieces: selectedPieces,
    dryers: [...(home ? [homeDryer] : unknown ? dryers.map((dryer) => ({ ...dryer, capacityUnits: null })) : dryers), ...extraDryers],
    runs,
    capacityUnits, capacities: unknown ? [] : home ? [28] : [8, 28],
    homeDryerId: home ? homeDryer.machineId : null,
    homeDryerSessionId: null,
    hangingDryers: hasHanging ? [{ machineId: 'preview-heated-hanging' as Id<'machines'>, name: 'Heated hanging dryer' }] : [],
    equipment: { tumble: true, heated_hanging: hasHanging },
    plan: planDryerLoads(queuedPieces, { combine, capacityUnits }),
    ...(share === null ? {} : { share }),
  }
  const initialScreen: DryingScreen = variant === 'dryer' && queue.plan.loads[0] ? { kind: 'dryer', number: 1, heat: queue.plan.loads[0].heat, pieceIds: queue.plan.loads[0].pieceIds }
    // "Which dryer?" for the first planned load, before a dryer is entered.
    : variant === 'none-free' && queue.plan.loads[0] ? { kind: 'dryer', number: 1, heat: queue.plan.loads[0].heat, pieceIds: queue.plan.loads[0].pieceIds }
    // The tees and towels shared on low in Dryer 4, as "All on low heat" plans them.
    : variant === 'early-check' ? { kind: 'dryer', number: 1, heat: 'low', pieceIds: ids(selectedPieces, 'tee', 'towel'), dryerId: 'preview-dryer-4' }
    : variant === 'take-out-early' || variant === 'check-missed' ? { kind: 'check', runId: 'preview-run-4' }
    : variant === 'check' || variant === 'check-empty' || variant === 'scale-check' ? { kind: 'check', runId: 'preview-drying-run' }
    : variant === 'putaway' || variant === 'putaway-one' || variant === 'scale-putaway' ? { kind: 'putaway' } : { kind: 'plan' }
  const nextRunId = () => `preview-drying-run-${++sequence.current}` as Id<'dryingRuns'>
  const calls: DryingCalls = {
    setPiece: { ...previewConvexCall('save the piece'), run: async (args) => {
      const ids = new Set(args.pieceIds ?? [args.pieceId])
      const garment = selectedPieces.find((piece) => piece.pieceId === args.pieceId)
      setPieces((current) => current.map((piece) => {
        const preference = args.remember && piece.textileId === garment?.textileId ? args.method ?? null : piece.preference
        const once = ids.has(piece.pieceId) && args.method !== undefined ? args.remember ? null : args.method : piece.source === 'once' ? piece.method : null
        return { ...piece, preference, ...pieceMethod(piece.label, { preference, once }),
          ...(ids.has(piece.pieceId) ? { ...(args.own === undefined ? {} : { own: args.own }), ...(args.need === undefined ? {} : { need: args.need }) } : {}) }
      }))
      return null
    } },
    setPreference: { ...previewConvexCall('save the drying preference'), run: async ({ textileId, textileIds, method }) => {
      const ids = new Set(textileIds ?? [textileId])
      setPieces((current) => current.map((piece) => !ids.has(piece.textileId) ? piece : {
        ...piece, preference: method, ...pieceMethod(piece.label, { preference: method, once: piece.source === 'once' ? piece.method : null }),
      }))
      return null
    } },
    startAir: { ...previewConvexCall('start air drying'), run: async ({ pieceIds, method, machineId }) => {
      const runId = nextRunId()
      setPieces((current) => current.map((piece) => !pieceIds.includes(piece.pieceId) ? piece : { ...piece, status: 'drying', dryingRunId: runId }))
      setRuns((current) => [...current, { runId, dryerId: null, reminded: false, kind: 'air', method: method ?? 'rack_line', startedAt: now, minutes: null, pieceIds,
        dryerName: machineId ? queue.hangingDryers.find((dryer) => dryer.machineId === machineId)?.name ?? null : null, heatLabel: null }])
      return runId
    } },
    start: { ...previewConvexCall('start the dryer'), run: async ({ pieceIds, dryerId, minutes, heat }) => {
      const dryer = queue.dryers.find((entry) => entry.machineId === dryerId)!
      const loading = selectedPieces.filter((piece) => pieceIds.includes(piece.pieceId))
      const fit = dryerLoadView(loading, dryer)
      const runId = nextRunId()
      const limits = loading.flatMap((piece) => piece.maxHeat === null ? [] : [dryerHeats.indexOf(piece.maxHeat)])
      const setting = heat ? dryer.heatSettings.find((entry) => entry.heat === heat)
        : chooseDryerSetting(dryer.heatSettings, limits.length ? dryerHeats[Math.min(...limits)]! : 'high')?.setting
      setPieces((current) => current.map((piece) => !fit.going.includes(piece.pieceId) ? piece : { ...piece, status: 'drying', dryingRunId: runId }))
      setRuns((current) => [...current, { runId, dryerId, reminded: false, kind: 'dryer', method: 'tumble', dryerName: dryer.name, heatLabel: setting?.label ?? null,
        startedAt: now, minutes, pieceIds: fit.going as Id<'dryingPieces'>[] }])
      return { runId, going: fit.going as Id<'dryingPieces'>[], staying: fit.staying as Id<'dryingPieces'>[], fit: fit.fit }
    } },
    addLabel: { ...previewConvexCall('add the dryer'), run: async ({ machineId, name }) => {
      const machine = queue.dryers.find((entry) => entry.machineId === machineId)!
      const added = `preview-dryer-added-${++sequence.current}` as Id<'machines'>
      setExtraDryers((current) => [...current, { ...machine, machineId: added, name, capacityUnits: null }])
      return added
    } },
    check: { ...previewConvexCall('save the dryness check'), pending: state === 'busy', error: state === 'error' ? 'Couldn’t save the dryness check. Try again.' : null, run: async ({ runId, dryPieceIds, extraMinutes }) => {
      if (state === 'busy' || state === 'error') return undefined
      const run = runs.find((entry) => entry.runId === runId)!
      const damp = run.pieceIds.filter((id) => !dryPieceIds.includes(id))
      setPieces((current) => current.map((piece) => !dryPieceIds.includes(piece.pieceId) ? piece : { ...piece, status: 'dry', driedIn: run.dryerName }))
      setRuns((current) => current.flatMap((entry) => entry.runId !== runId ? [entry] : damp.length ? [{ ...entry, pieceIds: damp, ...(extraMinutes === undefined ? {} : { minutes: extraMinutes, startedAt: now }) }] : []))
      return { dry: dryPieceIds.length, damp: damp.length, hung: 0 }
    } },
    putAway: { ...previewConvexCall('put the pieces away'), run: async ({ pieceIds }) => {
      setPieces((current) => current.filter((piece) => !pieceIds.includes(piece.pieceId)))
      return { putAway: pieceIds.length }
    } },
    answerStain: previewConvexCall('save the stain answer'),
    hang: previewConvexCall('hang them while the dryer is busy'), remind: previewConvexCall('remind you when the dryer is done'),
  }
  const stainedTees = selectedPieces.filter((piece) => piece.stained === true)
  return <>
    <div className="mx-auto flex max-w-[36rem] flex-wrap items-center justify-between gap-2 px-4 py-2 text-[length:var(--step--1)] text-muted-foreground" role="note">
      <span>Interactive preview · changes stay on this page</span>
      <Button variant="ghost" size="sm" onClick={() => { setPieces(piecesFor(variant, pieceCount)); setRuns(initialRuns()); setExtraDryers([]); setCombine(false); setCapacity(unknown ? null : 28); setChooserOpen(variant === 'method-conflict'); setReset((value) => value + 1) }}>Reset preview</Button>
    </div>
    <DryingView key={reset} queue={queue} householdId="preview-household" now={now} initialScreen={initialScreen} recentDryers={['preview-dryer-4', 'preview-dryer-2']}
      onBack={onBack} combine={combine} onCombine={setCombine} onCapacity={setCapacity} calls={calls}
      dryerProducts={variant === 'dryer' ? [{ supplyId: 'preview-dryer-sheets' as Id<'supplies'>, name: 'Dryer sheets', kind: 'dryer_sheet', usable: true, omission: null, dose: null, atMachine: false }] : undefined} />
    <PreviewSteps steps={previewSteps[variant] ?? noSteps} />
    {chooserOpen ? <DryingMethodSheet name="Indigo jeans" kicker="from Washer 9" label="do_not_tumble_dry"
      current="rack_line" initialMethod="tumble" preference={null} need={null} equipment={{ tumble: true, heated_hanging: true }}
      onSave={(choice) => {
        const jeans = selectedPieces.filter((piece) => piece.pieceId.startsWith('preview-dry-jeans-'))
        void calls.setPiece.run({ pieceId: jeans[0]!.pieceId, pieceIds: jeans.map((piece) => piece.pieceId),
          ...(choice.methodChanged ? { method: choice.method, remember: choice.remember } : {}), need: choice.need })
          .then(() => setChooserOpen(false))
      }} onClose={() => setChooserOpen(false)} /> : null}
    {stainOpen && stainedTees[0] !== undefined ? <DryingMethodSheet name={stainedTees[0].name ?? 'White cotton tee'} count={stainedTees.length} kicker={dryingDesignText.method.fromWasher(stainedTees[0].washerName)} label={stainedTees[0].label}
      maxHeat={stainedTees[0].labelMaxHeat ?? null} current={stainedTees[0].method} preference={null} need={null} equipment={queue.equipment}
      onStainAnswer={(answer) => { previewCall(`record the stain as ${answer}`)(); setStainOpen(false) }}
      onSave={() => { previewCall('save the drying method')(); setStainOpen(false) }} onClose={() => setStainOpen(false)} /> : null}
  </>
}

const noSteps: readonly PreviewStep[] = []
/** What a person taps or types to reach these states; the presenter keeps them in its own state. */
const previewSteps: Partial<Record<DryingPreviewState, readonly PreviewStep[]>> = {
  'none-free': [{ tap: 'None free' }],
  // 50 minutes on the dryer: the early check is about half of it.
  'early-check': [{ type: '#dryer-minutes', value: '50' }],
}

function piecesFor(variant: DryingPreviewState, pieceCount: 100 | 500 | 1000): Piece[] {
  if (variant === 'empty') return []
  if (variant === 'putaway-one') return [{ ...pieces.find(piece => piece.kind === 'towel')!, name: 'Cream towel', status: 'dry', washerName: 'Washer', driedIn: 'Air dried' }]
  if (variant.startsWith('scale-')) return Array.from({ length: pieceCount }, (_, index) => ({
    ...pieces[0]!, pieceId: `scale-${index}` as Id<'dryingPieces'>, textileId: `scale-textile-${index}` as Id<'textiles'>,
    name: `Family item ${String(index).padStart(4, '0')}`, washerName: `Washer ${index % 5 + 1}`,
    label: variant === 'scale-mixed' && index % 2 === 0 ? 'tumble_dry' : 'line_dry',
    method: variant === 'scale-mixed' && index % 2 === 0 ? 'tumble' : 'rack_line',
    status: variant === 'scale-check' ? 'drying' : variant === 'scale-putaway' ? 'dry' : 'queued',
    dryingRunId: variant === 'scale-check' ? 'preview-drying-run' as Id<'dryingRuns'> : null,
    driedIn: variant === 'scale-putaway' ? 'Line' : null,
  }))
  const is = (piece: Piece, key: string) => piece.pieceId.startsWith(`preview-dry-${key}-`)
  let result = pieces
  if (variant === 'method-conflict' || variant === 'preference') result = result.filter((piece) => !is(piece, 'pyjamas'))
  if (variant === 'second-wash') result = result.filter((piece) => is(piece, 'towel') || is(piece, 'leggings') || is(piece, 'jeans'))
  if (variant === 'check') result = result.filter((piece) => is(piece, 'tee') || is(piece, 'navy') || is(piece, 'pyjamas') || is(piece, 'towel'))
  if (variant === 'putaway') result = result.filter((piece) => is(piece, 'towel') || is(piece, 'tee') || is(piece, 'navy') || is(piece, 'leggings'))
  if (variant === 'home') result = [...result, ...Array.from({ length: 10 }, (_, index) => ({ ...pieces.find((piece) => is(piece, 'towel'))!, pieceId: `preview-dry-towel-${index + 4}` as Id<'dryingPieces'> }))]
  if (variant === 'putaway') result = [...result.filter((piece) => is(piece, 'towel')), ...result.filter((piece) => !is(piece, 'towel'))]
  if (variant === 'take-out-early' || variant === 'check-missed') result = result.filter((piece) => is(piece, 'tee') || is(piece, 'towel'))
  const runOf = (runId: string) => ({ status: 'drying' as const, dryingRunId: runId as Id<'dryingRuns'> })
  return result.map((piece): Piece => {
    if (variant === 'home') return { ...piece, washerName: 'Washer' }
    // At home the towels are in the dryer; with the smell sample the rest sat wet seven hours and the rack holds the leggings.
    if (variant === 'wait' || variant === 'wait-smell') return { ...piece, washerName: 'Washer', ...(variant === 'wait-smell' ? { queuedAt: now - 7 * 60 * minute } : {}),
      ...(is(piece, 'towel') ? runOf('preview-home-run') : variant === 'wait-smell' && is(piece, 'leggings') ? runOf('preview-rack-run') : {}) }
    if (variant === 'check-marks') return is(piece, 'tee') || is(piece, 'towel') ? { ...piece, ...runOf('preview-run-4') } : is(piece, 'navy') || is(piece, 'pyjamas') ? { ...piece, ...runOf('preview-run-7') } : piece
    if (variant === 'take-out-early' || variant === 'check-missed') return { ...piece, ...runOf('preview-run-4') }
    // A washed stain air dries until someone checks it; the dryer refuses it, whatever the label allows.
    if (variant === 'stain' && is(piece, 'tee')) return { ...piece, stained: true, labelMaxHeat: piece.maxHeat, maxHeat: null, ...pieceMethod(piece.label, { stained: true }) }
    if (variant === 'preference' && is(piece, 'navy')) return { ...piece, need: 'today' }
    if (variant === 'preference' && is(piece, 'jeans')) return { ...piece, preference: 'heated_hanging', ...pieceMethod(piece.label, { preference: 'heated_hanging' }) }
    if (variant === 'second-wash' && is(piece, 'towel')) return { ...piece, preference: 'rack_line', ...pieceMethod(piece.label, { preference: 'rack_line' }) }
    if (variant === 'check' && !is(piece, 'towel')) return { ...piece, status: 'drying', dryingRunId: 'preview-drying-run' as Id<'dryingRuns'> }
    if (variant === 'putaway') return is(piece, 'leggings')
      ? { ...piece, status: 'drying', dryingRunId: 'preview-drying-run' as Id<'dryingRuns'> }
      : { ...piece, status: 'dry', driedIn: is(piece, 'towel') ? 'Dryer 7' : 'Dryer 4' }
    return piece
  })
}
