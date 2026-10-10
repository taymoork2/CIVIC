import type { Id } from '@convex/_generated/dataModel'
import { useEffect, useRef, useState } from 'react'
import { ChemistryScreen, GoingInto, chemistryGroups } from '@/laundry/chemistry-view'
import { Button } from '@/components/ui/button'
import { chemistryText, preparationText } from '@/copy-laundry'
import { machineStepText, sourceIssueText } from '@/copy'
import type { HubState } from '@/home/hub-state'
import type { Care, Inventory, Textile } from '@/household/inventory-types'
import { LaundryView, laundryPageClassName, type LaundryCalls } from '@/laundry/laundry-view'
import type { LoadCardView } from '@/laundry/load-card'
import type { LoadReviewModel } from '@/laundry/load-review'
import { LoadScreen } from '@/laundry/load-screen'
import { BackButton, Note, TaskHeading } from '@/laundry/laundry-ui'
import type { MachineFacts } from '@/laundry/machine-step'
import { GarmentIcon } from '@/kit/garment-icon'
import { HomePreview } from '@/dev/home-preview'
import { RunningLoadSheetView, type RunningLoadDetail } from '@/laundry/running-load-sheet'
import { LoadSummaryView, MachineStepPresenter, ReviewStep, type LoadRecord, StartMinutesField, sessionPageClassName, stepActions, stepOptionLabels, stepRecoveryLabels, type Action } from '@/laundry/session-view'
import { blockingCount, nextCheck, sourceGroups, type IssueAction, type SourceGroup } from '@/products/source-issues'
import { StainInspectionSheet } from '@/closet/stain-inspection'
import { WasherPathScreen, type RoomProduct } from '@/laundry/washer-path'
import { PreparationPaused, type PreparationIssue } from '@/laundry/preparation-paused'
import { previewCall, previewUnavailableCalls } from '@/dev/preview-calls'
import { FixtureConvex } from '@/dev/fixture-preview'
import { useUnits } from '@/kit/units'

const now = Date.UTC(2026, 9, 2, 19)
const calls: LaundryCalls = {
  ...previewUnavailableCalls({
    recompute: 'replan the loads', start: 'start the load', confirmRecipe: 'confirm the recipe', setRanOut: 'record the product ran out',
    addMachineLikeIt: 'add a matching machine', setRefresh: 'set it to refresh', unflag: 'take it out of the hamper', refreshed: 'mark it refreshed',
    washedElsewhere: 'record a wash elsewhere', deleteTextile: 'delete the garment', droppedAtCleaner: 'record the cleaner drop-off',
    pickedUp: 'mark it picked up', flagDirty: 'mark it dirty', answerTagQuestions: 'save the tag answers', moveToDryCleaning: 'move it to dry cleaning',
    setTextileStatus: 'save the garment status', updateMachine: 'save the machine', answerLabelRow: 'save the label amount',
    updateSupply: 'save the product', allDry: 'mark it dry',
  }),
  washerGroup: (id) => [id],
}
/** The Laundry tab's refused saves, shared with the laundry-day samples. */
export const laundryPreviewCalls = calls
const care: Care = { material: null, washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, bleach: 'none', restrictions: [], dryMethod: 'tumble_dry', dryMethodInferred: false, dryHeat: 'low', ironSteam: null, status: 'confirmed', provenance: { source: 'Frozen visual fixture only', confidence: 'user-supplied' } }
const groups: { key: string; name: string; kind: Textile['kind']; color: string; colorGroup: Textile['colorGroup']; count: number; owner: string | null }[] = [
  { key: 'tee', name: 'White cotton tee', kind: 't_shirt', color: 'White', colorGroup: 'white', count: 2, owner: 'alex' },
  { key: 'towel', name: 'Gray bath towel', kind: 'towel', color: 'Gray', colorGroup: 'dark', count: 4, owner: null },
  { key: 'jeans', name: 'Indigo jeans', kind: 'pants', color: 'Indigo', colorGroup: 'dark', count: 1, owner: 'alex' },
  { key: 'leggings', name: 'Black leggings', kind: 'pants', color: 'Black', colorGroup: 'dark', count: 2, owner: 'sam' },
  { key: 'pyjamas', name: 'Striped pajamas', kind: 'pajamas', color: 'Pink stripe', colorGroup: 'light', count: 2, owner: 'mia' },
]
const textiles: Textile[] = groups.flatMap((group) => Array.from({ length: group.count }, (_, index): Textile => ({
  textileId: `preview-${group.key}-${index}` as Id<'textiles'>, name: group.name, kind: group.kind,
  color: group.color, colorGroup: group.colorGroup, wearerId: group.owner === null ? null : `preview-${group.owner}` as Id<'wearers'>,
  occasions: [], tags: [], status: 'dirty', guest: false, inLoad: null, care,
  flag: group.key === 'tee' ? { reasons: ['food'], flaggedBy: 'preview-user', flaggedAt: now } : null,
  soilLevel: 'normal', statusSince: now, washCount: 0, firstWash: group.key === 'jeans', bulkUnits: null,
  fromFixture: false, lastWornAt: null, wearsSinceClean: 0, lastCleanedAt: null,
  cleanerNote: null, cleanerPickupBy: null, identity: null, createdAt: now,
})))
const inventory: Inventory = {
  planning: {}, machines: [], supplies: [], textiles,
  wearers: [
    { wearerId: 'preview-alex' as Id<'wearers'>, name: 'Alex', kind: 'adult', principalKey: 'preview-user' },
    { wearerId: 'preview-sam' as Id<'wearers'>, name: 'Sam', kind: 'adult', principalKey: null },
    { wearerId: 'preview-mia' as Id<'wearers'>, name: 'Mia', kind: 'child', principalKey: null },
  ],
}
const idsFor = (...keys: string[]) => textiles.filter((piece) => keys.some((key) => piece.textileId.startsWith(`preview-${key}-`))).map((piece) => piece.textileId)
const hub: HubState = { kind: 'pass', planId: 'preview-plan', number: 1, count: 4, ready: false, loads: [
  { loadId: 'preview-whites', number: 1, textileIds: idsFor('tee'), startable: false, dryerRuns: 1 },
  { loadId: 'preview-lights', number: 2, textileIds: idsFor('pyjamas'), startable: false, dryerRuns: 1 },
  { loadId: 'preview-darks', number: 3, textileIds: idsFor('towel', 'leggings'), startable: false, dryerRuns: 1 },
  { loadId: 'preview-jeans', number: 4, textileIds: idsFor('jeans'), startable: false, dryerRuns: 1 },
] }
const load: LoadCardView = {
  loadId: 'preview-whites', number: 1, title: 'Whites load',
  items: textiles.filter((piece) => piece.name === 'White cotton tee'), itemsLine: 'White cotton tee ×2',
  settings: 'Normal · 30°C', doses: [], dry: null, stains: [], why: null, cautions: [], blockers: [],
}
const review: LoadReviewModel = {
  garments: [{ key: 'tee', textileIds: idsFor('tee'), candidates: [], name: 'White cotton tee', kind: 't_shirt', colorGroup: 'white', color: 'White', owner: 'Alex', wash: 'Machine wash · 30°C' }],
  leftOut: [], requirements: null,
  products: { detergent: { key: 'detergent', supplyId: 'preview-tide', name: 'Tide', fact: 'Detergent · Liquid · oxygen bleach' }, pretreat: [], softener: { supplyId: 'preview-softener', name: 'Fabric softener', on: false, canToggle: true }, other: [] },
}
const problems: SourceGroup[] = [
  ...stainProblems('pretreatment_choice_needed'),
  { source: { kind: 'product', id: 'preview-tide' }, name: 'Tide', issues: [{ reasonId: 'preview-bleach', kind: 'conflict', blocking: true, title: 'Tide can’t be used with White cotton tee', detail: 'Recorded: oxygen bleach. Tag: do not bleach.', actions: [{ label: 'Use another detergent', action: { kind: 'leave-out-product', supplyId: 'preview-tide' } }, { label: 'Leave these 2 pieces out', action: { kind: 'leave-out-garments', textileIds: idsFor('tee') } }] }] },
]

function stainProblems(cause: string): SourceGroup[] {
  return sourceGroups([
    { source: { kind: 'garment', id: 'preview-tee-0' }, reasonId: 'preview-stain', kind: 'confirm', blocking: true, textileIds: ['preview-tee-0'], supplyIds: ['preview-spray'] },
  ], [{ id: 'preview-stain', code: 'needs_confirmation', textileIds: ['preview-tee-0'], priority: 1, details: { cause } }], [], load.loadId, {
    garment: () => 'White cotton tee', product: () => 'Stain remover spray', washer: () => 'Washer 14',
  })
}
const products: RoomProduct[] = [
  { supplyId: 'preview-liquid', name: 'Fragrance-free liquid', fact: 'Detergent · planned · Liquid', detergent: true, ranOut: false },
  { supplyId: 'preview-tide', name: 'Tide', fact: 'Detergent · Liquid', detergent: true, ranOut: false },
  { supplyId: 'preview-pods', name: 'Free & clear pods', fact: 'Detergent · Pod', detergent: true, ranOut: false },
]
const options = ['9', '14', '3B'].map((number) => ({ machineId: `preview-washer-${number}`, name: `Washer ${number}` }))
const machineFacts: MachineFacts = { doorLocks: false, cycle: 'normal', cycleMinutes: null, washerName: 'Washer 14', drying: null }
/** The preparation fixture's steps; the specimen opens on index 1, the detergent poured into the drum. */
export const recipeActions: Action[] = [
  { id: 'preview-pretreat', kind: 'treatment', phase: 'drum', order: 0, supplyId: 'preview-spray', supplyName: 'Stain remover spray', textileId: 'preview-tee-0', textileName: 'White cotton tee ×2', dose: { amount: 2, unit: 'spray' }, placement: 'on_stain', stage: 'pretreat', timing: 'Wait 5 min before washing', confidence: 'verified', basis: 'Synthetic visual fixture directions; not a real-use amount.', status: 'pending' },
  { id: 'preview-detergent', kind: 'treatment', phase: 'drum', order: 1, supplyId: 'preview-liquid', supplyName: 'Fragrance-free liquid', dose: { amount: 25, unit: 'ml' }, placement: 'direct_to_drum', stage: 'wash', timing: null, confidence: 'verified', basis: 'Synthetic visual fixture directions: HE, normal soil, small load; not a real-use amount.', status: 'pending' },
  { id: 'preview-clothes', kind: 'task', task: 'load', phase: 'with_load', order: 2, title: 'Load 2 pieces', detail: 'White cotton tee ×2. No special clothing loading order recorded.', supplyId: '', supplyName: null, dose: null, placement: '', stage: '', timing: null, confidence: 'verified', status: 'pending' },
  { id: 'preview-close', kind: 'task', task: 'close', phase: 'close', order: 3, supplyId: '', supplyName: null, dose: null, placement: '', stage: '', timing: null, confidence: 'verified', status: 'pending' },
  { id: 'preview-start', kind: 'task', task: 'start', phase: 'start', order: 4, detail: 'normal cycle, 30 °C', supplyId: '', supplyName: null, dose: null, placement: '', stage: '', timing: null, confidence: 'verified', status: 'pending' },
]
/** The same steps with the detergent's printed cap marks recorded, so the step draws the cap filled to the planned mark. */
const capActions: Action[] = recipeActions.map((action) => action.id === 'preview-detergent' ? { ...action, dose: { amount: 30, unit: 'ml', mark: '3', marks: ['1', '3', '5'] } } : action)
const recipePieces = [{ label: 'White cotton tee', count: 2, kind: 't_shirt', colorGroup: 'white', media: <GarmentIcon kind="t_shirt" colorGroup="white" /> }]
export type LaundryPreviewState = 'index' | 'hamper' | 'review' | 'review-stain' | 'room' | 'laundromat' | 'room-picked' | 'room-blocked' | 'chemistry' | 'preparation' | 'preparation-paused' | 'preparation-ball' | 'preparation-long' | 'preparation-cap' | 'session' | 'completed' | 'completed-early'

/** Real presenters with synthetic data and no backend, persistence or navigation writes. */
export function LaundryPreview({ variant, state }: { variant: LaundryPreviewState; state?: 'invalid' | 'error' | 'busy' }) {
  const [atRoom, setAtRoom] = useState(false)
  if (variant === 'session') return <RunningPreview state={state} />
  if (variant === 'chemistry') return <div className={`${sessionPageClassName} machine-screen`}>
    <ChemistryScreen groups={chemistryGroups(recipeActions, false, { clothes: true })} settings={['Normal · 30°C or lower', '$2.50 recorded wash price']} pieces={recipePieces} washer="Washer 14" machineFact="Washer 14 · HE" unrecorded={false} startAmounts={false} onContinue={previewCall('continue')} continueLabel={chemistryText.startPreparation} disabled={false} back={<BackButton label="Back to the room" onClick={previewCall('go back to the room')} />} extra={<Note>Synthetic visual fixture amounts; not real-use instructions.</Note>} />
  </div>
  if (variant === 'preparation' || variant === 'preparation-cap') return <PreparationPreview actions={variant === 'preparation-cap' ? capActions : recipeActions} />
  if (variant === 'completed' || variant === 'completed-early') return <CompletedPreview early={variant === 'completed-early'} />
  if (variant === 'preparation-paused' || variant === 'preparation-ball' || variant === 'preparation-long') return <PausedPreparationPreview state={state} ball={variant === 'preparation-ball'} long={variant === 'preparation-long'} />
  // The day plan reads the drying queue itself: answered here (a shared room, nothing drying), never from the backend.
  if (variant === 'index' || variant === 'hamper') return <FixtureConvex data={{ 'dryingQueue:queue': { pieces: [], runs: [], homeDryerId: null, homeDryerSessionId: null, dryers: [] } }}><LaundryView now={now} householdId="preview-household" viewerKey="preview-user" inventory={inventory} hamper={{ count: textiles.length, loads: variant === 'hamper' ? null : 4 }} draft={null} onDraft={previewCall('save the draft')} planId={null} plan={null} questions={[]} calls={calls} onPlan={previewCall('open the plan')} onSession={previewCall('open the session')} hub={variant === 'hamper' ? undefined : hub} onItemOpen={previewCall('open the garment')}
    renderLink={(_, { className, children }) => <Button variant="unstyled" size="unstyled" className={className} onClick={previewCall('follow the link')}>{children}</Button>} /></FixtureConvex>
  if ((variant === 'review' || variant === 'review-stain') && !atRoom) return <ReviewPreview state={state} inspect={variant === 'review-stain'} onAtRoom={() => setAtRoom(true)} />
  return <WasherArrivalPreview variant={variant} pending={state === 'busy'} blocked={variant === 'room-blocked' || variant === 'review' || variant === 'review-stain'} onBack={() => setAtRoom(false)} />
}

function ReviewPreview({ state, inspect = false, onAtRoom }: { state?: 'invalid' | 'error' | 'busy'; inspect?: boolean; onAtRoom: () => void }) {
  const [chosen, setChosen] = useState(false)
  const [inspecting, setInspecting] = useState(inspect)
  const [piece, setPiece] = useState<Textile>(() => ({ ...textiles.find((piece) => piece.textileId === 'preview-tee-0')!,
    flag: { reasons: ['food'], flaggedAt: now, flaggedBy: 'preview-user', stainReport: { kind: 'protein', priorTreatmentAttempts: [] } },
  }))
  const [note, setNote] = useState<string | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const report = piece.flag?.stainReport
  const supported = report?.kind === 'protein' && Array.isArray(report.priorTreatmentAttempts) && report.priorTreatmentAttempts.length === 0
  const currentProblems = [...(chosen && supported ? [] : stainProblems(supported ? 'pretreatment_choice_needed' : report?.kind === 'unknown' || !Array.isArray(report?.priorTreatmentAttempts) || report.priorTreatmentAttempts.length > 0 ? 'unknown_stain_report' : 'unsupported_stain_chemistry')), problems[1]!]
  const check = nextCheck(currentProblems)
  const runAction = (action: IssueAction) => {
    if (action.kind === 'choose-pretreatment') { setChosen(true); setNote('Pretreatment added to the recipe. The treatment step is still to do in Preparation.'); titleRef.current?.focus() }
    else if (action.kind === 'inspect-stain') setInspecting(true)
    else setNote('This visual sample does not save changes to the household.')
  }
  const currentReview: LoadReviewModel = { ...review, products: { ...review.products, pretreat: chosen && supported ? [{ key: 'preview-stain', supplyId: 'preview-spray', name: 'Stain remover spray', fact: 'Pretreatment · White cotton tee' }] : [] } }
  return <div className={laundryPageClassName}>
    <LoadScreen view={load} review={currentReview} start="blocked" pending={state === 'busy'} loadCount={4} allowMove={true} problems={currentProblems} titleRef={titleRef} washer={{ title: 'Chosen when you arrive', fact: 'You enter its number once you’re at it. Nothing is reserved.' }} otherClassNote={null} next={check === null ? null : { label: check.label, compactLabel: check.action.kind === 'choose-pretreatment' ? sourceIssueText.choosePretreatment : undefined, remaining: blockingCount(currentProblems), issue: currentProblems[0]?.issues[0]?.title, onClick: () => runAction(check.action) }} onAtRoom={onAtRoom} openLink={null} onRunAction={runAction} onMove={previewCall('move the garment')} onNotThisTime={previewCall('leave it out this time')} onQuantity={previewCall('change the quantity')} onPutBack={previewCall('put it back')} onPickDetergent={previewCall('pick a detergent')} onToggleSoftener={previewCall('toggle the softener')} onBack={previewCall('go back')} extra={note === null ? undefined : <Note>{note}</Note>} />
    {!inspecting ? null : <StainInspectionSheet textile={piece} now={now} flag={async (args) => {
      if (state === 'error') throw new Error('Couldn’t save stain details. Try again.')
      if (state === 'busy') return new Promise(() => {})
      setPiece((current) => ({ ...current, flag: { ...current.flag!, stainNote: args.stainNote, stainReport: args.stainReport } }))
      setChosen(false)
      return { changed: 1, skipped: 0, toDryClean: [], alerted: false }
    }} onClose={() => setInspecting(false)} onSaved={() => { setInspecting(false); setNote('Stain details updated in this visual sample.'); titleRef.current?.focus() }} />}
  </div>
}

function WasherArrivalPreview({ variant, pending, blocked, onBack }: { variant: LaundryPreviewState; pending: boolean; blocked: boolean; onBack: () => void }) {
  const [pickedId, setPickedId] = useState<string | null>(variant === 'room-picked' || variant === 'room-blocked' ? 'preview-washer-14' : null)
  const [confirmedId, setConfirmedId] = useState<string | null>(null)
  const [check, setCheck] = useState<string | null>(null)
  const picked = options.find((option) => option.machineId === pickedId)
  const ranOut = variant === 'room-picked' || variant === 'room'
  return <div className={laundryPageClassName}>
    <WasherPathScreen view={{ number: 1, loadTitle: 'Whites load', itemsLine: load.itemsLine, shared: true, place: variant === 'laundromat' ? 'laundromat' : 'shared',
      washer: picked === undefined ? null : { label: picked.name, fact: 'Front-loading · HE · softener compartment' },
      refusal: null, recipe: picked === undefined ? [] : [{ kind: 'ask', product: 'Fragrance-free liquid', slot: 'Main wash compartment' }], changes: [], confirmed: pickedId !== null && confirmedId === pickedId,
      ready: !blocked,
      requirements: 'Mia (fragrance-free, dye-free)',
      problems: blocked ? problems : [],
      products: ranOut ? [{ ...products[0]!, ranOut: true }, { supplyId: 'preview-spray', name: 'Stain remover spray', fact: 'Pretreatment · Spray', form: 'spray', detergent: false, ranOut: false }, ...products.slice(1)] : products,
      detergent: { chosenId: 'preview-liquid', options: products.map((product) => ({ supplyId: product.supplyId, name: product.name, fits: product.supplyId === 'preview-liquid' })) },
    }} pending={pending} options={options} onPick={(id) => { setPickedId(id); setConfirmedId(null) }} onNoNumber={() => setPickedId(options[0]!.machineId)} onConfirm={() => setConfirmedId(pickedId)} onContinue={previewCall('continue')} onBack={onBack}
      onRunAction={(action) => setCheck(action.kind === 'question' ? 'Pack check opened in this visual sample. No recorded facts changed.' : 'This action would update the wash plan. Visual sample only; nothing was saved.')}
      onRanOut={previewCall('record the product ran out')} onSwitchDetergent={previewCall('switch detergent')} onUseAnother={previewCall('use another product')} onRestock={previewCall('restock the product')} />
    {check === null ? null : <Note>{check}</Note>}
  </div>
}

function RunningPreview({ state }: { state?: 'invalid' | 'error' | 'busy' }) {
  const [open, setOpen] = useState(true)
  const detail: RunningLoadDetail = {
    status: 'running', machineName: 'Washer 14', machineStartedAt: now - 29 * 60_000,
    estimatedFinishAt: now + 16 * 60_000, cycleMinutes: 45, finishConfidence: 'observed',
    washFinishedAt: null, dryerStartedAt: null, drying: null, doorLocks: false,
    textiles: Array.from({ length: 4 }, (_, index) => ({ textileId: `preview-towel-${index}` as Id<'textiles'>, name: 'Gray bath towel', color: null, status: 'dirty', washCount: 0 })),
    actions: recipeActions.filter((action) => action.textileId === undefined).map((action): Action => ({ ...action, status: 'confirmed',
      ...(action.kind === 'treatment' ? { dose: { amount: 40, unit: 'ml' } } : action.task === 'load' ? { title: 'Load 4 pieces', detail: 'Gray bath towel ×4' } : action.task === 'start' ? { detail: 'Normal · 40°C' } : {}),
    })),
  }
  return <><HomePreview variant="running" />{open ? <RunningLoadSheetView detail={detail} now={now} pending={state === 'busy'} error={state === 'error' ? 'Couldn’t move this load to drying. Try again.' : null} onClose={() => setOpen(false)} onFinished={previewCall('mark the load finished')} onAddTime={previewCall('add time')} openLink={({ className, children }) => <Button variant="unstyled" size="unstyled" className={className} onClick={previewCall('follow the link')}>{children}</Button>} /> : null}</>
}

function PreparationPreview({ actions: recipeActions }: { actions: Action[] }) {
  const [at, setAt] = useState(1)
  const [reviewing, setReviewing] = useState<number | null>(null)
  const [minutes, setMinutes] = useState('')
  const [optionsOpen, setOptionsOpen] = useState(false)
  // Choices that would record or open a sheet only say so in the visible preview status.
  const [simulated, setSimulated] = useState<string | null>(null)
  const simulate = (label: string) => () => setSimulated(label)
  const action = recipeActions[at]!
  const facts: MachineFacts = { ...machineFacts, preparationSettings: recipeActions.find((entry) => entry.kind === 'task' && entry.task === 'start')?.detail ?? null }
  const starts = action.kind === 'task' && action.task === 'start'
  const minutesOk = Number(minutes) >= 1 && Number(minutes) <= 300
  // The same eligibility as the live step; in this fixture the wash-stage product is the detergent.
  const eligible = stepActions(action, { paused: false, readOnly: false, preparing: true, isDetergent: action.kind === 'treatment' && action.stage === 'wash', hasLoad: true })
  return <div className={`${sessionPageClassName} machine-screen`}>
    <TaskHeading title={preparationText.title} back={<BackButton label="Back to Laundry" onClick={simulate('Back to Laundry')} />} mark={{ tone: 'waiting', text: 'Not started' }} caption={preparationText.notStarted('Washer 14')} />
    <Note role="status">{simulated === null ? machineStepText.previewOnly : machineStepText.previewWould(simulated)}</Note>
    {reviewing !== null ? <ReviewStep action={{ ...recipeActions[reviewing]!, status: 'confirmed' }} facts={facts} progress={`${reviewing + 1} of 5`} drumFullness={null} onNext={() => setReviewing(reviewing + 1 >= at ? null : reviewing + 1)} rememberExplanation={false} /> :
      <MachineStepPresenter action={action} facts={facts} titleId="preview-preparation-step" progress={`${at + 1} of 5`}
        previous={at > 0 ? { label: preparationText.previousStep, onClick: () => setReviewing(at - 1) } : undefined}
        primary={{ label: starts ? preparationText.ivStarted('Washer 14') : preparationText.doneNext, onClick: starts ? simulate(preparationText.ivStarted('Washer 14')) : () => { setSimulated(null); setAt(at + 1) }, disabled: starts && !minutesOk }}
        note={starts ? minutesOk ? preparationText.timerNote : minutes === '' ? preparationText.enterMinutes : undefined : undefined}
        minutesField={starts ? <StartMinutesField washer="Washer 14" value={minutes} onChange={setMinutes} /> : undefined}
        options={eligible.options.map((key) => ({ key, label: stepOptionLabels[key], onClick: simulate(stepOptionLabels[key]) }))}
        recovery={eligible.recovery.map((key) => ({ key, label: stepRecoveryLabels[key], onClick: simulate(stepRecoveryLabels[key]) }))}
        optionsOpen={optionsOpen} onOptionsOpenChange={setOptionsOpen}
        canRecord={true} error={null} textileName={() => 'White cotton tee'} rememberExplanation={false} />}
    <GoingInto title="Going into Washer 14" washer="Washer 14" pieces={recipePieces} />
    <Note>{preparationText.progressNote(at, 5)}</Note>
  </div>
}

/**
 * A completed load whose matching tees share one history: the load history shows one ×2 entry.
 * `early`: the tees were taken out at the early check after 25 min in Dryer 3 and hung.
 */
function CompletedPreview({ early = false }: { early?: boolean }) {
  const { system } = useUnits()
  const tees = idsFor('tee').map((textileId) => ({ textileId, name: 'White cotton tee', color: 'White', colorGroup: 'white', status: 'clean' as const, washCount: 4, drying: 'put_away' as const }))
  const wash = { at: now - 90 * 60_000, washerName: 'Washer 14', cycle: 'normal', drying: early ? { outcome: 'left_hanging' as const, method: 'rack_line', scope: 'once' as const, tumbledMinutes: 25, dryerName: 'Dryer 3', heat: 'low' as const }
    : { outcome: 'tumble_dried' as const, dryerName: 'Dryer 4', heat: 'low' as const, minutes: 40 }, recordId: undefined, observation: undefined, assessments: undefined, products: [{ name: 'Fragrance-free liquid', amount: 30, unit: 'ml', placement: 'detergent_compartment' }] }
  const record: LoadRecord = { sessionId: 'preview-session' as Id<'sessions'>, completedAt: now - 60 * 60_000, pieces: tees.map(({ textileId, name, color }) => ({ textileId, name, color, wash })) }
  return <LoadSummaryView detail={{ status: 'completed', machineName: 'Washer 14', cycle: 'normal', completedAt: now - 60 * 60_000, usage: [], doorLocks: false, textiles: tees }} record={record} now={now} system={system}
    back={<BackButton label="Back to Me" onClick={previewCall('go back to Me')} />} footer={<Button size="lg" className="w-full" onClick={previewCall('go back to Me')}>Back to Me</Button>}
    kindOf={() => 't_shirt'}
    pieceLink={(_, label, children, className) => <Button variant="unstyled" size="unstyled" className={className} aria-label={label} onClick={previewCall('open the piece history')}>{children}</Button>} />
}

function PausedPreparationPreview({ state, ball = false, long = false }: { state?: 'invalid' | 'error' | 'busy'; ball?: boolean; long?: boolean }) {
  const [recovered, setRecovered] = useState<'direct_to_drum' | 'downy_ball' | 'left_out' | null>(null)
  const [ballAdded, setBallAdded] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (recovered !== null) { titleRef.current?.focus({ preventScroll: true }); titleRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }) } }, [recovered])
  const issue: PreparationIssue = { actionId: 'preview-softener', product: long ? 'Household fragrance-free fabric softener concentrate' : 'Fabric softener', washer: 'Washer 14', placement: 'softener_compartment' }
  const ballStep = recovered === 'downy_ball' && !ballAdded
  const stepCount = recovered === 'downy_ball' ? 5 : 4
  const done = ballAdded ? 3 : 2
  const action: Action = ballStep
    ? { id: 'preview-softener', kind: 'treatment', phase: 'with_load', order: 2, supplyId: 'preview-softener', supplyName: 'Fabric softener', dose: { amount: 30, unit: 'ml' }, placement: 'downy_ball', stage: 'rinse', timing: 'Before starting the cycle.', confidence: 'verified', status: 'pending' }
    : { id: 'preview-close', kind: 'task', task: 'close', phase: 'close', order: done, title: 'Close the lid', detail: null, supplyId: '', supplyName: null, dose: null, placement: '', stage: '', timing: null, confidence: 'verified', status: 'pending' }
  return <div className={`${sessionPageClassName} machine-screen`}>
    <TaskHeading titleRef={titleRef} title={preparationText.title} back={<BackButton label="Back to Laundry" onClick={previewCall('go back to Laundry')} />} mark={{ tone: 'waiting', text: 'Not started' }} caption={preparationText.notStarted('Washer 14')} />
    <MachineStepPresenter action={action} facts={{ ...machineFacts, productUse: () => 'softener', preparationSettings: 'Normal, 40°C' }} titleId="preview-paused-step" progress={`${done + 1} of ${stepCount}`}
      primary={{ label: preparationText.doneNext, onClick: ballStep ? () => setBallAdded(true) : previewCall('go to the next step'), disabled: recovered === null }} note={recovered === null ? 'Paused · Choose an option' : recovered === 'left_out' ? 'Fabric softener is left out of this load.' : 'Recipe updated. Continue preparation.'} canRecord={true} error={null} textileName={() => 'Gray bath towel'} rememberExplanation={false} />
    <GoingInto title="Going into Washer 14" washer="Washer 14" pieces={[{ label: 'Gray bath towel', count: 4, media: <GarmentIcon kind="towel" colorGroup="dark" /> }]} />
    <Note>{preparationText.progressNote(done, stepCount)}</Note>
    {recovered !== null ? null : <PreparationPaused issue={issue} options={[
      { placement: 'direct_to_drum', label: 'Add it by hand during the cycle', dose: { amount: 30, unit: 'ml' }, timing: 'At the start of the final rinse.', unavailable: state === 'invalid' || ball ? 'The recorded product directions do not say when to add it by hand.' : null },
      { placement: 'downy_ball', label: 'Use a dispensing ball', dose: ball ? { amount: 30, unit: 'ml' } : null, timing: ball ? 'Before starting the cycle.' : null, unavailable: ball ? null : 'No dispensing ball is recorded for this washer.' },
    ]} pending={state === 'busy'} error={state === 'error' ? 'Couldn’t update this load. Try again.' : null} onRecover={setRecovered} onMachineProblem={previewCall('report a machine problem')} onLeaveOut={() => setRecovered('left_out')} />}
  </div>
}
