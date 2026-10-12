import { ConvexProvider } from 'convex/react'
import { projectFetch } from './project-request'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { useEffect, useState, useCallback, useRef, Component, type ReactNode } from 'react'
import { Toaster } from 'sonner'
import { AddClothesSheet, EditClothesSheet, GarmentSettings, emptyAddDraft, type AddCalls, type AddDraft, type IntakePresentation, type IntakeReviewState } from '@/closet/add-clothes'
import { readFixtureFields, type JourneyState } from './journey'
import { GarmentSheet, type GarmentCalls } from '@/closet/garment-sheet'
import { GarmentRecordView } from '@/closet/garment-record'
import { reviewGarmentRecord } from '@/dev/closet-preview'
import { PreviewSteps } from '@/dev/fixture-preview'
import { BottleSheet } from '@/products/bottle-sheet'
import { MachineSheet, machineGroups } from '@/household/machine-sheet'
import { WearerSheetView } from '@/household/household-people'
import { WaterSheet } from '@/household/water-sheet'
import { Button } from '@/components/ui/button'
import { PreviewUnits } from '@/kit/units'
import { emptyTag } from '@/laundry/tag-step'
import { DesignPreviewScreen } from '@/routes/design-preview'
import { reviewClient, type ReviewConfig, type ReviewData, type ReviewSnapshot } from './store'
import scenarios from './scenarios.json'
import { RoutePreview, routePreviewScenarios } from './route-preview'
import { FamilyPreview } from './family-preview'
import { ReminderPreview } from './reminder-preview'
import '@/app.css'
import '@/generated/tokens.css'
import './review.css'

const params = new URLSearchParams(location.search)
export const config: ReviewConfig = { scenario: params.get('scenario') ?? 'intake.pack.type', persona: params.get('persona') === 'parent' ? 'parent' : params.get('persona') === 'student' ? 'student' : 'single', role: params.get('role') === 'member' ? 'member' : 'owner', condition: ['save-error', 'offline', 'missing-care'].includes(params.get('condition') ?? '') ? params.get('condition') as ReviewConfig['condition'] : 'normal', theme: params.get('theme') === 'dark' ? 'dark' : 'light', textScale: params.get('scale') === '2' ? 2 : 1, width: Number(params.get('width')) || 393 }
document.documentElement.dataset.theme = config.theme
document.documentElement.style.fontSize = config.textScale === 2 ? '200%' : '100%'
document.documentElement.dataset.reviewCondition = config.condition
// The scenario's stable CIVIC target ID, so a whole-screen annotation is found again on any revision (D37).
document.documentElement.dataset.civicId = `target:laundry.${config.scenario}`
const local = reviewClient(config)
const indexResponse = await projectFetch('/api/review/index')
if (!indexResponse.ok) throw new Error('Review source receipt unavailable. Reload after signing in.')
const { revision, design } = await indexResponse.json() as ReviewSnapshot
window.reviewPreview = { retryWrites: () => { local.retryWrites(); document.documentElement.dataset.reviewCondition = 'normal' }, restart: local.restart, data: local.getData, config, snapshot: { revision, design } }

function workingDraft(fixture: string, step: string, data: ReviewData): AddDraft {
  const towel = fixture === 'towel'
  const beforeCare = ['type', 'details', 'fabric', 'color'].includes(step)
  return { ...emptyAddDraft, whose: towel ? 'shared' : { wearerId: data.wearers[0]!.wearerId }, kind: towel ? 'towel' : 't_shirt', name: towel ? 'Cotton/polyester bath towel' : 'Everyday multicolor tee pack', colour: towel ? 'light' : 'white', colorName: towel ? 'Gray' : 'White', count: towel ? 1 : 2, dyeRun: 'unknown', material: towel ? 'cotton 80%, polyester 20%' : 'cotton', stain: 'none',
    ...(towel ? {} : { additionalColors: [{ colour: 'dark', colorName: 'Navy', count: 2, dyeRun: 'unknown' }, { colour: 'saturated', colorName: 'Red', count: 2, dyeRun: 'unknown' }], sameCareInstructions: true }),
    tag: beforeCare ? emptyTag : { ...emptyTag, method: 'machine', dots: 1, bars: 0, bleach: 'none', dryer: 'low' } }
}

function WorkingPreview() {
  const [data, setData] = useState(local.getData)
  const [open, setOpen] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [presentation, setPresentation] = useState<IntakePresentation>({})
  const version = useRef<number | null>(null)
  const reviewState = useRef<(JourneyState & IntakeReviewState) | null>(null)
  const lastAction = useRef('')
  const journey = params.get('journey') === 'towel'
  const notifyState = useCallback((state: IntakeReviewState) => {
    reviewState.current = { ...state, fields: readFixtureFields(document), title: document.querySelector('[role="dialog"] h2')?.textContent ?? '', action: document.querySelector('button[type="submit"]')?.textContent ?? '', proposalVersion: version.current }
    window.dispatchEvent(new CustomEvent('journey-state', { detail: reviewState.current }))
  }, [])
  const notifyTransition = useCallback((from: string, to: string) => {
    window.dispatchEvent(new CustomEvent('journey-transition', { detail: { from, to, state: reviewState.current, fields: readFixtureFields(document), action: lastAction.current || reviewState.current?.action || 'Application transition' } }))
    lastAction.current = ''
  }, [])
  useEffect(() => {
    if (!journey) return
    window.towelJourney = { state: () => reviewState.current, snapshot: { revision, design }, setPresentation: (edits, nextVersion) => { version.current = nextVersion; setPresentation(edits) } }
    const refreshFields = () => {
      if (!reviewState.current) return
      reviewState.current = { ...reviewState.current, fields: readFixtureFields(document), title: document.querySelector('[role="dialog"] h2')?.textContent ?? '', action: document.querySelector('button[type="submit"]')?.textContent ?? '', proposalVersion: version.current }
      window.dispatchEvent(new CustomEvent('journey-state', { detail: reviewState.current }))
    }
    const observer = new MutationObserver(refreshFields)
    const rememberAction = (event: MouseEvent) => { lastAction.current = (event.target as Element).closest('button')?.getAttribute('aria-label') || (event.target as Element).closest('button')?.textContent?.trim() || '' }
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true })
    document.addEventListener('input', refreshFields)
    document.addEventListener('click', rememberAction, true)
    refreshFields()
    return () => { observer.disconnect(); document.removeEventListener('input', refreshFields); document.removeEventListener('click', rememberAction, true); delete window.towelJourney }
  }, [journey])
  useEffect(() => local.subscribe(() => setData(local.getData())), [])
  const scenario = scenarios.find((entry) => entry.id === config.scenario)
  const fixture = scenario?.fixture ?? 'pack'
  const close = () => {
    if (journey && reviewState.current) {
      notifyTransition(reviewState.current.screen, 'closed')
      notifyState({ ...reviewState.current, screen: 'closed' })
    }
    setOpen(false)
  }
  const call = (name: string) => (args: Record<string, unknown>) => local.mutate(name, args)
  const addCalls: AddCalls = {
    createTextiles: ((args) => local.mutate('inventory:createTextiles', { ...args, reviewFixture: fixture })) as AddCalls['createTextiles'], addMatchingTextiles: call('inventory:addMatchingTextiles') as AddCalls['addMatchingTextiles'], trashTextiles: call('inventory:trashTextiles') as AddCalls['trashTextiles'], createWearer: call('inventory:createWearer') as AddCalls['createWearer'], updateTextile: call('inventory:updateTextile') as AddCalls['updateTextile'], answerTagQuestions: call('inventory:answerTagQuestions') as AddCalls['answerTagQuestions'], setMaterial: call('inventory:setMaterial') as AddCalls['setMaterial'], setPrivacy: call('inventory:setPrivacy'), clearCare: call('closet:unflag') as AddCalls['clearCare'], uploadPhoto: async () => { throw new Error('Photo uploads are outside synthetic review. Save without a photo.') },
  }
  const calls: GarmentCalls = { flagDirty: call('closet:flagDirty') as GarmentCalls['flagDirty'], setRefresh: call('closet:setRefresh') as GarmentCalls['setRefresh'], unflag: call('closet:unflag') as GarmentCalls['unflag'], refreshed: call('closet:refreshed') as GarmentCalls['refreshed'], pickedUp: call('closet:pickedUp') as GarmentCalls['pickedUp'], allDry: call('closet:allDry') as GarmentCalls['allDry'], droppedAtCleaner: call('closet:droppedAtCleaner') as GarmentCalls['droppedAtCleaner'], updateTags: call('inventory:updateTags'), answerCare: call('inventory:answerTagQuestions'), retire: call('inventory:trashTextiles') as GarmentCalls['retire'] }
  const pieces = data.textiles.filter((piece) => data.saved[fixture] ? data.saved[fixture]!.includes(piece.textileId) : fixture === 'towel' ? piece.kind === 'towel' : piece.textileId.startsWith('preview-tee-'))
  const edit = (onClose: () => void, focusField?: Parameters<typeof EditClothesSheet>[0]['focusField'], careOnly?: Parameters<typeof EditClothesSheet>[0]['careOnly']) => <EditClothesSheet editing={pieces} wearers={data.wearers} calls={addCalls} focusField={focusField} careOnly={careOnly} renderPhotos={() => <p>Photo uploads are not simulated.</p>} renderSettings={(section, disabled) => <GarmentSettings textiles={pieces} section={section} disabled={disabled} />} onClose={onClose} onSaved={onClose} />
  const machine = data.machines.find((entry) => data.saved.appliance?.includes(entry.machineId)) ?? data.machines[0]!
  const product = data.supplies.find((entry) => data.saved.product?.includes(entry.supplyId)) ?? data.supplies[1] ?? data.supplies[0]
  let preview: ReactNode
  if (local.loadError) preview = <div className="page"><h1>Preview unavailable</h1><p role="alert">{local.loadError}</p><p>Saved data was preserved. Use Restart scenario to reset this synthetic dataset.</p></div>
  else if (!open) preview = <div className="page grid gap-4"><h1>Preview closed</h1><p>Saved synthetic records are retained in this browser.</p><p>{data.textiles.length} pieces · {data.machines.length} appliances · {data.supplies.length} products</p>{journey ? <p>Choose a screen in the journey and Start here for a new run.</p> : <Button onClick={() => setOpen(true)}>Open this state again</Button>}</div>
  else if (routePreviewScenarios.has(config.scenario)) preview = <RoutePreview scenario={config.scenario} config={config} readOnly={params.get('readOnly') === '1'} />
  else if (scenario?.renderer === 'family') preview = <FamilyPreview config={config} />
  else if (scenario?.renderer === 'reminder') preview = <ReminderPreview scenario={config.scenario} />
  else if (!scenario) preview = <DesignPreviewScreen screen={config.scenario.replace(/^legacy\./, '')} onBack={close} />
  else if (scenario.renderer === 'intake') preview = <AddClothesSheet householdId="preview-household" mode={{ kind: 'add', target: 'closet' }} wearers={data.wearers} calls={addCalls} initial={{ ...workingDraft(fixture, scenario.step ?? 'type', data), ...(params.get('branch') === 'pre-owned' ? { preOwned: { smell: null, fragile: false, heatTreat: false }, dyeRun: 'unknown' as const } : {}) }} initialStep={scenario.step as Parameters<typeof AddClothesSheet>[0]['initialStep']} initialCareStep={params.get('care') === 'bleach' ? 'bleach' : params.get('care') === 'dry' ? 'dry' : undefined} presentation={journey ? presentation : undefined} onReviewState={journey ? notifyState : undefined} onReviewTransition={journey ? notifyTransition : undefined} onClose={close} onSaved={close} />
  else if (scenario.renderer.startsWith('garment')) {
    if (scenario.renderer === 'garment-edit') preview = edit(close)
    else preview = pieces.length ? <GarmentSheet facts={{ members: pieces, wearerName: fixture === 'towel' ? null : data.wearers[0]!.name, now: Date.now(), notWornDays: 90, doneAt: null, hangingSessionId: null }} calls={calls} knownTags={['Everyday', 'Home', 'Work']} renderRecord={(panels) => <GarmentRecordView record={reviewGarmentRecord} {...panels} />} renderEdit={(editing, onClose) => edit(onClose, editing.focusField, editing.careOnly)} onClose={close} onDone={close} onNext={close} /> : <p role="status">This synthetic item was removed. Restart to restore the specimen.</p>
  } else if (scenario.renderer.startsWith('machine')) preview = <MachineSheet householdId="preview-household" group={scenario.renderer === 'machine-new' ? null : machineGroups([machine])[0]} initialFocus={scenario.renderer === 'machine-edit' ? 'identity' : undefined} onClose={close} />
  else if (scenario.renderer.startsWith('product')) preview = <BottleSheet householdId="preview-household" supply={scenario.renderer === 'product-new' ? null : product} supplies={data.supplies} initialTab={scenario.renderer === 'product-contents' ? 'contents' : undefined} onClose={close} />
  else if (scenario.renderer === 'profile') preview = <WearerSheetView wearer={data.wearers[data.wearers.length - 1]!} supplies={data.supplies} onClose={close} onSave={async (draft) => { try { await local.mutate('inventory:updateWearer', { wearerId: data.wearers[data.wearers.length - 1]!.wearerId, name: draft.name, kind: draft.kind, requirements: { fragranceFree: draft.fragranceFree, dyeFree: draft.dyeFree, avoidIngredients: draft.avoid, acceptedSupplyIds: draft.accepted } }); return true } catch (caught) { setError((caught as Error).message); return false } }} error={error} />
  else preview = <WaterSheet householdId={'preview-household' as any} water={data.water} onClose={close} />
  return <ConvexProvider client={local.client}><PreviewUnits>{preview}{open && scenario?.renderer === 'garment-tags' ? <PreviewSteps steps={[{ tap: 'Details' }, { tap: 'Tags' }]} /> : open && scenario?.renderer === 'garment-care' ? <PreviewSteps steps={[{ click: 'button[aria-label^="Washing:"]' }]} /> : null}<Toaster position="top-center" className={config.scenario.startsWith('family.') ? 'rh-family-notifications' : undefined} /></PreviewUnits></ConvexProvider>
}

class PreviewError extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(error: Error) { return { error: error.message } }
  render() { return this.state.error ? <div className="page"><h1>Preview unavailable</h1><p role="alert">{this.state.error}</p><p>This state is not verified. Restart to try again.</p></div> : this.props.children }
}
const router = createRouter({ routeTree: createRootRoute({ component: () => <PreviewError><WorkingPreview /></PreviewError> }), history: createMemoryHistory({ initialEntries: ['/'] }) })
createRoot(document.getElementById('review-root')!).render(<RouterProvider router={router} />)
