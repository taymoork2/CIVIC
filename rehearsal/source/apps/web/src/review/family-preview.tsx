import { useEffect, useMemo, useState } from 'react'
import { ConvexProvider, type ConvexReactClient } from 'convex/react'
import { getFunctionName } from 'convex/server'
import { ConvexError } from 'convex/values'
import { planDryerLoads } from '@washcloset/planner'
import { useRouter } from '@tanstack/react-router'
import { DryingView, type DryingCalls, type DryingQueue } from '@/drying/drying-view'
import { previewConvexCall } from '@/dev/preview-calls'
import { FixtureConvex } from '@/dev/fixture-preview'
import { laundryPreviewCalls } from '@/dev/laundry-preview'
import { LaundryView } from '@/laundry/laundry-view'
import { SessionView } from '@/laundry/session-view'
import { AppShell } from '@/kit/app-shell'
import { hubState, dryingFacts, type DayPlan } from '@/home/hub-state'
import { routeSession } from './route-preview'
import { seedReview, type ReviewConfig } from './store'

export type FamilySimulation = { pieces: 100 | 500 | 1000; stage: 'planning' | 'washing' | 'drying' | 'putaway' }
const stages = ['planning', 'washing', 'drying', 'putaway'] as const
const now = Date.UTC(2026, 9, 11, 19)

export function FamilyPreview({ config }: { config: ReviewConfig }) {
  const params = new URLSearchParams(location.search)
  const [simulation, setSimulation] = useState<FamilySimulation>(() => ({ pieces: [100, 500, 1000].includes(Number(params.get('familySize'))) ? Number(params.get('familySize')) as FamilySimulation['pieces'] : 1000, stage: stages.includes(params.get('familyStage') as FamilySimulation['stage']) ? params.get('familyStage') as FamilySimulation['stage'] : config.scenario.split('.').at(-1) as FamilySimulation['stage'] }))
  const [reset, setReset] = useState(0)
  const [pending, setPending] = useState<FamilySimulation | null>(null)
  useEffect(() => { config.simulation = simulation }, [config, simulation])
  const restart = (next: FamilySimulation) => { setSimulation(next); setReset((value) => value + 1); setPending(null) }
  return <>
    <details className="rh-family-controls" aria-label="Synthetic account and scenario">
      <summary>Simulation settings</summary>
      <div>
      <h1>Family of five</h1>
      <p>Two adults · three children. Synthetic account; no sign-in or household connection.</p>
      <label>Family size<select value={simulation.pieces} onChange={(event) => setPending({ ...simulation, pieces: Number(event.target.value) as FamilySimulation['pieces'] })}>{[100, 500, 1000].map((count) => <option key={count} value={count}>{count} items</option>)}</select></label>
      <label>Starting stage<select value={simulation.stage} onChange={(event) => setPending({ ...simulation, stage: event.target.value as FamilySimulation['stage'] })}>{stages.map((stage) => <option key={stage} value={stage}>{stage === 'putaway' ? 'Put away' : stage[0]!.toUpperCase() + stage.slice(1)}</option>)}</select></label>
      <button onClick={() => setPending(simulation)}>Reset synthetic run…</button>
      {pending && <div role="alert"><p>Restart with {pending.pieces} items at {pending.stage}? This discards this preview's actions. Saved reviews and proposals remain.</p><button onClick={() => restart(pending)}>Restart simulation</button><button onClick={() => setPending(null)}>Keep current run</button></div>}
      <p role="note">Planning uses declared 20-item loads. Each completed load transfers its own items into drying; the whole care loop runs in memory. This is not planner, chemistry, permission or backend proof.</p>
      </div>
    </details>
    <AppShell focus><FamilyStage key={`${simulation.pieces}:${simulation.stage}:${reset}`} config={config} simulation={simulation} /></AppShell>
  </>
}

function FamilyStage({ config, simulation }: { config: ReviewConfig; simulation: FamilySimulation }) {
  const router = useRouter()
  const [stage, setStage] = useState(simulation.stage)
  const [loadIndex, setLoadIndex] = useState(0)
  const [washedLoads, setWashedLoads] = useState<number[]>([])
  const washed = washedLoads.includes(loadIndex)
  const [transferred, setTransferred] = useState<number[]>(() => simulation.stage === 'drying' || simulation.stage === 'putaway' ? Array.from({ length: simulation.pieces / 20 }, (_, index) => index) : [])
  const [unsupported, setUnsupported] = useState('')
  useEffect(() => router.subscribe('onResolved', ({ toLocation }) => {
    if (toLocation.pathname === '/laundry') setStage('planning')
    if (toLocation.pathname === '/drying') setStage('drying')
  }), [router])
  useEffect(() => { config.simulation = { ...simulation, stage } }, [config, simulation, stage])
  const [data] = useState(() => {
    const seed = seedReview({ ...config, persona: 'parent' })
    const base = seed.textiles[0]!
    const care = base.care === null ? null : { ...base.care, dryMethod: 'line_dry' as const, dryHeat: null }
    const wearers = ['Alex', 'Sam', 'Charlie', 'Riley', 'Jordan'].map((name, index) => ({ ...seed.wearers[0]!, wearerId: `preview-family-${index}` as typeof seed.wearers[number]['wearerId'], name, kind: index < 2 ? 'adult' as const : 'child' as const, principalKey: null }))
    return { ...seed, planning: {}, wearers, textiles: Array.from({ length: simulation.pieces }, (_, index) => ({ ...base, care, textileId: `preview-family-item-${index}` as typeof seed.textiles[number]['textileId'], name: `${wearers[index % 5]!.name} · item ${String(index).padStart(4, '0')}`, wearerId: wearers[index % 5]!.wearerId, status: 'dirty' as const, inLoad: null, flag: null })) }
  })
  const makePiece = (item: typeof data.textiles[number], status: 'queued' | 'drying' | 'dry'): DryingQueue['pieces'][number] => ({
    pieceId: `preview-family-dry-${item.textileId}` as DryingQueue['pieces'][number]['pieceId'], textileId: item.textileId,
    name: item.name, kind: item.kind, color: item.color, colorGroup: item.colorGroup,
    washerName: 'Family washer', status, queuedAt: now, own: false, need: null,
    label: 'line_dry', method: 'rack_line', source: 'label', evidence: 'allowed', preference: null,
    dried: null, maxHeat: null, hold: null, bulkUnits: 1, dryingRunId: status === 'drying' ? 'preview-family-air' as DryingQueue['runs'][number]['runId'] : null, driedIn: status === 'dry' ? 'Line' : null,
  })
  const [pieces, setPieces] = useState<DryingQueue['pieces']>(() => simulation.stage === 'drying' || simulation.stage === 'putaway' ? data.textiles.map((item) => makePiece(item, simulation.stage === 'drying' ? 'drying' : 'dry')) : [])
  const [runs, setRuns] = useState<DryingQueue['runs']>(() => simulation.stage === 'drying' ? [{ runId: 'preview-family-air' as DryingQueue['runs'][number]['runId'], dryerId: null, reminded: false, kind: 'air', method: 'rack_line', dryerName: null, heatLabel: null, startedAt: now, minutes: null, pieceIds: pieces.map((piece) => piece.pieceId) }] : [])
  const [putAwayIds, setPutAwayIds] = useState<string[]>([])
  const [combine, setCombine] = useState(false)
  const [capacityUnits, setCapacity] = useState<number | null>(28)
  const refuse = () => setUnsupported('This action is outside this memory-only fixture. No household request was sent.')
  const queue: DryingQueue = { pieces, runs, homeDryerId: null, homeDryerSessionId: null, dryers: [], capacityUnits, capacities: [], hangingDryers: [], equipment: { tumble: false, heated_hanging: false }, plan: planDryerLoads(pieces.filter((piece) => piece.status === 'queued').map((piece) => ({ id: piece.pieceId, bulkUnits: piece.bulkUnits, maxHeat: piece.maxHeat, source: piece.washerName, method: piece.method, own: piece.own })), { combine, capacityUnits }) }
  const inventory = { ...data, textiles: data.textiles.map((item, index) => ({ ...item, status: putAwayIds.includes(item.textileId) ? 'clean' as const : transferred.includes(Math.floor(index / 20)) ? 'hanging' as const : 'dirty' as const, inLoad: !transferred.includes(Math.floor(index / 20)) && (washedLoads.includes(Math.floor(index / 20)) || stage === 'washing' && Math.floor(index / 20) === loadIndex) ? `preview-family-wash-${Math.floor(index / 20)}` as ReturnType<typeof routeSession>['sessionId'] : null, washCount: washedLoads.includes(Math.floor(index / 20)) || transferred.includes(Math.floor(index / 20)) ? 1 : 0 })) }
  const plan: DayPlan = { planId: 'preview-family-plan', loads: Array.from({ length: simulation.pieces / 20 }, (_, index) => ({ loadId: `preview-family-load-${index}`, sessionId: null, startable: true, textileIds: data.textiles.slice(index * 20, index * 20 + 20).map((piece) => piece.textileId), washMinutes: null, dryer: null, blockers: [] })) }
  const remainingPlan = { ...plan, loads: plan.loads.filter((_, index) => !transferred.includes(index)) }
  const hub = hubState({ hamper: { count: 0, loads: null }, plan: remainingPlan, sessions: [], hanging: { count: 0, sessionIds: [] }, textileNames: new Map(data.textiles.map((piece) => [piece.textileId, piece.name])), drying: dryingFacts(queue), urgentIds: new Set() }, now)
  useEffect(() => {
    const bridge = window.reviewPreview
    if (!bridge) return
    const previous = bridge.data
    bridge.data = () => inventory
    return () => { bridge.data = previous }
  }, [inventory])
  const client = useMemo(() => ({
    connectionState: () => ({ isWebSocketConnected: true, hasEverConnected: true, oldestInflightRequestStartedAt: null, hasInflightRequests: false }),
    subscribeToConnectionState: () => () => {},
    watchQuery: () => ({ localQueryResult: () => undefined, onUpdate: () => () => {}, journal: () => undefined }),
    mutation: async (reference: Parameters<ConvexReactClient['mutation']>[0], args: { sessionId?: string }) => {
      const name = getFunctionName(reference)
      if (!['execution:washFinished', 'dryingQueue:queueFromWasher'].includes(name)) throw new ConvexError({ code: 'SYNTHETIC_UNSUPPORTED', message: 'Unsupported family fixture action. No household request was sent.' })
      if (config.condition !== 'normal') throw new ConvexError({ code: 'SYNTHETIC_UNAVAILABLE', message: 'Synthetic wash unavailable in this condition; the current load is retained.' })
      if (args.sessionId !== `preview-family-wash-${loadIndex}`) throw new ConvexError({ code: 'SYNTHETIC_UNAVAILABLE', message: 'The selected family load changed; no items were transferred.' })
      if (name === 'execution:washFinished') { setWashedLoads((current) => current.includes(loadIndex) ? current : [...current, loadIndex]); return { sessionId: args.sessionId, washFinishedAt: now } }
      if (!washed) throw new ConvexError({ code: 'SYNTHETIC_UNAVAILABLE', message: 'Finish this wash before transferring its items.' })
      const incoming = data.textiles.slice(loadIndex * 20, loadIndex * 20 + 20).map((item) => makePiece(item, 'queued'))
      setPieces((current) => [...current, ...incoming.filter((item) => !current.some((piece) => piece.pieceId === item.pieceId) && !putAwayIds.includes(item.textileId))])
      setTransferred((current) => current.includes(loadIndex) ? current : [...current, loadIndex])
      setStage('drying'); return { queued: incoming.length }
    },
    action: async () => { throw Error('Server actions are outside the family fixture.') },
  }) as unknown as ConvexReactClient, [config.condition, loadIndex, washed, data, putAwayIds])
  const unavailable = { ...previewConvexCall('unsupported family action'), run: async () => { refuse(); return undefined } }
  const allowed = () => { if (config.condition === 'normal') return true; setUnsupported('Synthetic drying unavailable in this condition; all items and selections are retained.'); return false }
  const calls: DryingCalls = {
    setPiece: unavailable, setPreference: unavailable, start: unavailable, addLabel: unavailable, hang: unavailable, remind: unavailable, answerStain: unavailable,
    startAir: { ...unavailable, run: async ({ pieceIds, method }) => {
      if (!allowed()) return undefined
      if (method !== undefined && method !== 'rack_line' || !pieceIds.length || new Set(pieceIds).size !== pieceIds.length || pieceIds.some((id) => !pieces.some((piece) => piece.pieceId === id && piece.status === 'queued'))) { refuse(); return undefined }
      const runId = `preview-family-air-${transferred.length}-${runs.length}` as DryingQueue['runs'][number]['runId']
      setPieces((current) => current.map((piece) => pieceIds.includes(piece.pieceId) ? { ...piece, status: 'drying', dryingRunId: runId } : piece))
      setRuns((current) => [...current, { runId, dryerId: null, reminded: false, kind: 'air', method: 'rack_line', dryerName: null, heatLabel: null, startedAt: now, minutes: null, pieceIds }]); return runId
    } },
    check: { ...unavailable, run: async ({ runId, dryPieceIds }) => {
      if (!allowed()) return undefined
      const run = runs.find((entry) => entry.runId === runId)
      if (!run || new Set(dryPieceIds).size !== dryPieceIds.length || dryPieceIds.some((id) => !run.pieceIds.includes(id))) { refuse(); return undefined }
      const damp = run.pieceIds.filter((id) => !dryPieceIds.includes(id))
      setPieces((current) => current.map((piece) => dryPieceIds.includes(piece.pieceId) ? { ...piece, status: 'dry', driedIn: 'Line', dryingRunId: null } : piece))
      setRuns((current) => current.flatMap((entry) => entry.runId !== runId ? [entry] : damp.length ? [{ ...entry, pieceIds: damp }] : []))
      setStage(dryPieceIds.length ? 'putaway' : 'drying'); return { dry: dryPieceIds.length, damp: damp.length, hung: 0 }
    } },
    putAway: { ...unavailable, run: async ({ pieceIds }) => {
      if (!allowed()) return undefined
      if (new Set(pieceIds).size !== pieceIds.length || pieceIds.some((id) => !pieces.some((piece) => piece.pieceId === id && piece.status === 'dry'))) { refuse(); return undefined }
      setPutAwayIds((current) => [...current, ...pieces.filter((piece) => pieceIds.includes(piece.pieceId)).map((piece) => piece.textileId)])
      setPieces((current) => current.filter((piece) => !pieceIds.includes(piece.pieceId))); setStage('drying'); return { putAway: pieceIds.length }
    } },
  }
  const remaining = simulation.pieces - transferred.length * 20
  const nextLoad = () => { const next = plan.loads.findIndex((_, index) => !transferred.includes(index)); if (next >= 0) { setLoadIndex(next); setStage('washing') } }
  const detail = { ...routeSession(washed ? 'washed' : 'running'), sessionId: `preview-family-wash-${loadIndex}` as ReturnType<typeof routeSession>['sessionId'], machineStartedAt: now - 40 * 60_000, estimatedFinishAt: now + 10 * 60_000, washFinishedAt: washed ? now : null, loadName: `Family fixture · load ${loadIndex + 1}`, loadCount: plan.loads.length, textiles: data.textiles.slice(loadIndex * 20, loadIndex * 20 + 20).map((piece) => ({ textileId: piece.textileId, name: piece.name, color: piece.color, status: piece.status, washCount: 0 })) }
  return <>
    <div className="mx-auto flex max-w-[36rem] flex-wrap gap-2 px-4 py-2" aria-label="Family care progress">
      <p role="status">{remaining} awaiting wash · {pieces.length} in drying · {putAwayIds.length} put away</p>
      {remaining > 0 && stage !== 'washing' && <button onClick={nextLoad}>Wash next load</button>}
      {(stage === 'planning' || stage === 'washing') && pieces.length > 0 && <button onClick={() => setStage('drying')}>View drying queue</button>}
    </div>
    {unsupported && <p role="alert">{unsupported}</p>}
    {stage === 'washing' && <ConvexProvider client={client}><p role="note">Load {loadIndex + 1} of {plan.loads.length} · 20 items. Only this completed load transfers to drying.</p><SessionView key={loadIndex} detail={detail} now={now} online={config.condition === 'normal'} /></ConvexProvider>}
    {stage === 'planning' && <FixtureConvex data={{ 'dryingQueue:queue': queue }}><LaundryView now={now} householdId="preview-household" viewerKey="preview-user" inventory={inventory} hamper={{ count: 0, loads: null }} draft={null} onDraft={refuse} planId={null} plan={null} questions={[]} calls={laundryPreviewCalls} onPlan={nextLoad} onSession={nextLoad} hub={hub} /></FixtureConvex>}
    <div hidden={stage === 'washing' || stage === 'planning'}><DryingView queue={queue} householdId="preview-household" now={now} initialScreen={simulation.stage === 'drying' ? { kind: 'check', runId: 'preview-family-air' } : simulation.stage === 'putaway' ? { kind: 'putaway' } : { kind: 'plan' }} recentDryers={[]} onBack={() => setStage('planning')} combine={combine} onCombine={setCombine} onCapacity={setCapacity} calls={calls} /></div>
  </>
}
