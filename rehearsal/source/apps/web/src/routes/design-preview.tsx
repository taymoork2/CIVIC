import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { BackButton, Note, TaskHeading } from '@/laundry/laundry-ui'
import { LoadScreen } from '@/laundry/load-screen'
import type { LoadCardView } from '@/laundry/load-card'
import type { LoadReviewModel } from '@/laundry/load-review'
import { WasherPathScreen } from '@/laundry/washer-path'
import { ChemistryScreen, type ChemistryGroup } from '@/laundry/chemistry-view'
import { DryingView, type DryingQueue } from '@/drying/drying-view'
import { GarmentIcon } from '@/kit/garment-icon'
import { CelebrationScreen, ChooseScreen, NextStepsScreen, NameScreen, SetupScreen } from '@/account/onboarding-screens'
import { InviteConfirm, InviteLinkNotice, JoinWithCode, SignedOutInvite } from '@/account/join-flow'
import { InviteSheet } from '@/household/household-invite'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { PlanQuestion } from '@/laundry/laundry-pass'
import { QuestionCard, type QuestionAction } from '@/laundry/question-card'
import { Button } from '../components/ui/button'
import { DailyOutfitCard, OutfitPickerSheet } from '@/closet/daily-outfit'
import { AccountForm, ForgotPassword, resetApi } from '@/account/auth-pages'
import { noticeText, showTimerNotice } from '@/laundry/timer-notices'
import { HomeCareOverview } from '@/home/home-sections'
import { homeHeroText } from '../copy-closet'
import { HomePreview, type HomePreviewState } from '@/dev/home-preview'
import { ClosetPreview, type ClosetPreviewState } from '@/dev/closet-preview'
import { MePreview } from '@/dev/me-preview'
import { SettingsPreview } from '@/dev/settings-preview'
import { HouseholdPreview, type HouseholdPreviewState } from '@/dev/household-preview'
import { WearerEditorView } from '@/household/household-people'
import type { Inventory } from '@/household/inventory-types'
import { LaundryPreview, type LaundryPreviewState } from '@/dev/laundry-preview'
import { LaundryDayPreview, laundryDayScreens, type LaundryDayPreviewState } from '@/dev/laundry-day-preview'
import { PreviewUnits } from '@/kit/units'
import { DryingPreview, dryingPreviewStates, previewDryingCalls, type DryingPreviewState } from '@/dev/drying-preview'
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group'
import { BottleFields, draftFromSupply, newBottleDraft, suggestedBottle, type BottleDraft } from '@/products/bottle-sheet'
import type { Supply } from '@/household/inventory-types'
import { machineStepText, productText } from '../copy'
import { previewCall } from '@/dev/preview-calls'

/**
 * Dev-only samples of the real screen components. Indexed drying samples update local
 * preview state; session samples are visual-only. Neither changes household records.
 */
export const Route = createFileRoute('/design-preview')({
  validateSearch: (search: Record<string, unknown>): { screen: string; state: 'invalid' | 'error' | 'busy' | undefined; textScale: 1 | 2 } => ({
    screen: typeof search.screen === 'string' ? search.screen : 'dose-question',
    state: search.state === 'invalid' || search.state === 'error' || search.state === 'busy' ? search.state : undefined,
    textScale: search.textScale === 2 || search.textScale === '2' ? 2 : 1,
  }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  component: DesignPreviewRoute,
})

/** A root-font stress fixture; this does not emulate a phone's accessibility settings. */
function DesignPreviewRoute() {
  const { textScale } = Route.useSearch()
  return <>
    {textScale === 2 ? <style>{'html { font-size: 200%; }'}</style> : null}
    <DesignPreview />
  </>
}

const cap = { kind: 'cap' as const, marks: [{ label: '1' }, { label: '3' }, { label: '5' }] }

const samples: Record<string, PlanQuestion> = {
  'dose-question': {
    kind: 'label_row',
    key: { kind: 'label_row', subjectId: 'sample-tide', context: { soilLevel: 'normal' } },
    subjectIds: [],
    context: { loadId: 'sample-load', soilLevel: 'normal', stage: 'washer' },
    product: { supplyId: 'sample-tide', name: 'Tide Ultra Concentrate liquid detergent', use: 'detergent', measure: cap },
  } as unknown as PlanQuestion,
  'dose-count': {
    kind: 'label_row',
    key: { kind: 'label_row', subjectId: 'sample-pods', context: { soilLevel: 'normal' } },
    subjectIds: [],
    context: { loadId: 'sample-load', soilLevel: 'normal', stage: 'washer' },
    product: { supplyId: 'sample-pods', name: 'Tide Pods', use: 'pods', measure: { kind: 'count', countUnit: 'pod' } },
  } as unknown as PlanQuestion,
}

function DesignPreview() {
  const { screen, state, textScale } = Route.useSearch()
  const navigate = useNavigate()
  return <DesignPreviewScreen screen={screen} state={state} onBack={() => void navigate({ to: '/design-preview', search: { screen: 'laundry-index', state: undefined, textScale } })} />
}

/** The same specimens mount in isolated review without the app's live shell. */
export function DesignPreviewScreen({ screen, state, onBack }: { screen: string; state?: 'invalid' | 'error' | 'busy'; onBack: () => void }) {
  const [last, setLast] = useState<QuestionAction | null>(null)
  const question = samples[screen] ?? samples['dose-question']!
  if (screen.startsWith('drying-') && (dryingPreviewStates as readonly string[]).includes(screen.slice(7))) return <PreviewUnits><DryingPreview key={`${screen}:${state}`} variant={screen.slice(7) as DryingPreviewState} state={state} onBack={onBack} /></PreviewUnits>
  if (screen === 'preparation' || screen === 'running') return <PreviewUnits><LaundryPreview key={`${screen}:${state}`} variant={screen === 'preparation' ? 'preparation' : 'session'} state={state} /></PreviewUnits>
  if (screen === 'product-new' || screen === 'product-barcode' || screen === 'product-sheets') return <ProductFormPreview key={screen} draft={productDrafts[screen]} title={screen === 'product-sheets' ? sampleSheets.name : productText.addProduct} />
  if ((laundryDayScreens as readonly string[]).includes(screen.slice(8)) && screen.startsWith('laundry-')) return <PreviewUnits><LaundryDayPreview key={screen} variant={screen.slice(8) as LaundryDayPreviewState} /></PreviewUnits>
  if (['laundry-index', 'laundry-hamper', 'laundry-review', 'laundry-review-stain', 'laundry-room', 'laundry-laundromat', 'laundry-room-picked', 'laundry-room-blocked', 'laundry-chemistry', 'laundry-preparation', 'laundry-preparation-paused', 'laundry-preparation-ball', 'laundry-preparation-long', 'laundry-preparation-cap', 'laundry-session', 'laundry-completed', 'laundry-completed-early'].includes(screen)) return <PreviewUnits><LaundryPreview key={`${screen}:${state}`} variant={screen.slice(8) as LaundryPreviewState} state={state} /></PreviewUnits>
  if (screen === 'me-index' || screen === 'me-costs' || screen === 'me-history') return <MePreview key={screen} variant={screen === 'me-history' ? 'history' : screen === 'me-costs' ? 'priced' : 'empty'} loading={state === 'busy'} />
  if (screen === 'settings-index' || screen === 'settings-password' || screen === 'settings-password-saved' || screen === 'me-account') return <SettingsPreview key={`${screen}:${state}`} password={screen.startsWith('settings-password')} passwordState={screen === 'settings-password-saved' ? 'saved' : state} account={screen === 'me-account'} />
  if (['household-index', 'household-people', 'household-people-member', 'household-people-long', 'household-invite', 'household-profile', 'household-water', 'household-water-sheet', 'household-laundry-day'].includes(screen)) return <HouseholdPreview key={`${screen}:${state}`} variant={screen.slice(10) as HouseholdPreviewState} state={state} />
  if (screen === 'profile-form' || screen === 'profile-form-long') return <ProfileFormPreview key={`${screen}:${state}`} long={screen === 'profile-form-long'} state={state} />
  if (['closet-index', 'closet-record', 'closet-stain-check', 'closet-stain-next', 'closet-add-details', 'closet-add-stain-set-in', 'closet-tags', 'closet-tags-long', 'closet-tags-pending', 'closet-care-question', 'closet-care-question-pending', 'closet-care-wash', 'closet-care-dry', 'closet-add-type', 'closet-add-color', 'closet-add-care', 'closet-add-label', 'closet-add-stains', 'closet-add-search', 'closet-first-wash'].includes(screen)) return <ClosetPreview key={screen} variant={screen.slice(7) as ClosetPreviewState} />
  if (['home-empty', 'home-one', 'home-planned', 'home-running', 'home-sequential', 'home-dryer-busy', 'home-check-now'].includes(screen)) return <HomePreview variant={screen.slice(5) as HomePreviewState} />
  if (screen === 'care-family') return <div className="page grid gap-3">
    <HomeCareOverview title={homeHeroText.overview.title} caption={homeHeroText.overview.pieces(500)}
      counts={[
        { key: 'ready', label: homeHeroText.overview.ready, count: 314, dot: 'bg-ready' },
        { key: 'hamper', label: homeHeroText.overview.hamper, count: 142, dot: 'bg-hamper' },
        { key: 'washing', label: homeHeroText.overview.washing, count: 24, dot: 'bg-washing' },
        { key: 'refresh', label: 'Refresh', count: 20, dot: 'bg-hamper' },
      ]} labelFlag={{ text: homeHeroText.overview.labelFlag, target: { to: 'closet' } }}
      renderLink={(_, { className, children, ariaLabel }) => <Button variant="unstyled" size="unstyled" className={className} aria-label={ariaLabel} onClick={previewCall('follow the link')}>{children}</Button>} />
  </div>
  if (screen === 'sign-in' || screen === 'create-account') return <AccountForm key={`${screen}:${state}`} mode={screen === 'sign-in' ? 'sign-in' : 'create'} visualPreview previewState={state} />
  // Reset email defaults to its unavailable state; an explicit field state shows the sending form.
  if (screen === 'reset-email' || screen === 'reset-code' || screen === 'reset-password') return <ForgotPassword key={`${screen}:${state}`} step={screen === 'reset-email' ? 'email' : screen === 'reset-code' ? 'code' : 'password'} {...(screen === 'reset-email' && state !== undefined ? { api: { ...resetApi, available: true } } : {})} visualPreview previewState={state} />
  if (screen === 'outfit-picker' || screen === 'outfit-picker-empty' || screen === 'outfit-picker-stale') return <OutfitPreview key={`${screen}:${state}`} empty={screen === 'outfit-picker-empty'} stale={screen === 'outfit-picker-stale'} state={state} />
  if (screen === 'outfit-populated' || screen === 'outfit-empty' || screen === 'outfit-suggested') return <div inert className="page grid gap-3">
    <DailyOutfitCard items={screen === 'outfit-empty' ? [] : [
      { key: 'tee', name: 'White cotton tee', color: 'White', colorGroup: 'white', kind: 't_shirt', brand: null, wearerId: null, quantity: 1 },
      { key: 'jeans', name: 'Indigo jeans', color: 'Indigo', colorGroup: 'dark', kind: 'pants', brand: null, wearerId: null, quantity: 1 },
    ]} controls={screen === 'outfit-empty' ? null : <RadioGroup variant="segment" aria-label="Whose outfit" value={screen === 'outfit-suggested' ? 'sam' : 'mine'} onValueChange={previewCall('switch whose outfit')} className="max-w-full overflow-x-auto [&_button]:whitespace-nowrap"><RadioGroupItem variant="segment" value="mine">Mine</RadioGroupItem><RadioGroupItem variant="segment" value="sam">From Sam</RadioGroupItem></RadioGroup>}
      by={screen === 'outfit-suggested' ? 'Suggested by Sam · household' : 'Your pick'}
      emptyTitle="Your next outfit is already here"
      emptyText="Choose from your ready clothes now. One less decision when it’s time to get dressed."
      emptyAction={<Button variant="secondary" size="lg" className="w-full">Choose today’s outfit</Button>}
      wearAction={<Button variant="outline" size="sm" className="shrink-0 px-3.5 text-[length:var(--step-1)]">Wear this</Button>} />
    {screen === 'outfit-populated' ? <Button variant="outline" className="w-full">Change today’s outfit</Button> : null}
  </div>
  if (screen === 'household-choice') return <ChooseScreen onCreate={previewCall('create a household')} onJoin={previewCall('join a household')} />
  if (screen === 'setup-first-use' || screen === 'setup-closet') return <NextStepsScreen onClothes={previewCall('start with clothes')} onSkip={previewCall('skip for now')} onInvite={screen === 'setup-closet' ? undefined : previewCall('invite someone')} />
  if (screen === 'household-setup' || screen === 'household-created') return <SetupScreen created={screen === 'household-created'} place="home" machines={[]} products={6} onWhere={previewCall('choose where you wash')} onMachines={previewCall('set up machines')} onProducts={previewCall('set up products')} onDone={previewCall('continue setup')} />
  if (screen === 'household-name') return <NameScreen key={`${screen}:${state}`} value="" onChange={previewCall('change the name')} pending={state === 'busy'} error={state === 'error' ? 'We couldn’t create your household. Try again.' : null} onSubmit={previewCall('create the household')} onBack={previewCall('go back')} />
  if (screen === 'household-joined') return <CelebrationScreen kind="joined" householdName="Our apartment" primaryLabel="Continue" onPrimary={previewCall('continue')} />
  if (screen === 'join-code') return <JoinWithCode key={`${screen}:${state}`} displayName="Jordan Lee" onBack={previewCall('go back')} onJoined={previewCall('open the joined household')} visualPreview previewState={state} />
  if (screen === 'join-link-signed-out') return <SignedOutInvite code="LC-7Q2M" />
  if (screen === 'join-link-invalid' || screen === 'join-link-expired' || screen === 'join-link-used' || screen === 'join-link-member') return <InviteLinkNotice problem={screen === 'join-link-member' ? null : screen === 'join-link-expired' ? { status: 'expired', expiresAt: Date.UTC(2026, 9, 1, 12) } : { status: screen === 'join-link-used' ? 'used' : 'unknown' }} onHome={previewCall('go home')} />
  if (screen === 'join-preview' || screen === 'join-link' || screen === 'join-long' || screen === 'join-link-long') return <InviteConfirm key={`${screen}:${state}`} code="LC-7Q2M" preview={{ status: 'valid', householdName: screen === 'join-long' || screen === 'join-link-long' ? 'AlexandriaAndMontgomeryFamilyHouseholdWithAnUnusuallyLongName' : 'Our apartment', inviterName: screen === 'join-long' || screen === 'join-link-long' ? 'Alexandria-Montgomery-WithAnUnusuallyLongFamilyName' : 'Alex Rivera', wearerName: 'Sam', role: 'member', expiresAt: Date.UTC(2026, 9, 8, 12) }} displayName="Jordan Lee" via={screen.startsWith('join-link') ? 'link' : 'code'} onJoined={previewCall('open the joined household')} onNotNow={previewCall('leave the invite for now')} visualPreview previewState={state} />
  if (screen === 'invite-sheet' || screen === 'invite-sheet-long') return <InviteSheet key={`${screen}:${state}`} householdName={screen === 'invite-sheet-long' ? 'AlexandriaAndMontgomeryFamilyHouseholdWithAnUnusuallyLongName' : 'Our apartment'} invite={{ code: '48RL-TSGF-7N5F-RVSZ', expiresAt: Date.UTC(2026, 9, 15, 12) }} pending={state === 'busy'} error={state === 'error' ? 'We couldn’t make a new invite link. Try again.' : null} onNew={previewCall('make a new invite link')} onCancel={previewCall('cancel the invite')} onClose={previewCall('close the sheet')} visualPreview />
  const laundry = laundryPreview(screen)
  if (laundry !== null) return <div inert className="page grid gap-5 [&>.page]:w-full [&>.page]:max-w-none [&>.page]:mx-0 [&>.page]:pt-0">{laundry}</div>
  if (screen === 'timer-notice') return (
    <div className="page grid gap-6 max-w-[30rem] mx-auto pt-2">
      <TaskHeading title="Timer notices" mark={{ tone: 'waiting', text: 'Preview' }} caption="Shown when a timer ends while the app is open" />
      <Button size="lg" onClick={() => showTimerNotice(noticeText.washDone('Top-loader 3'), noticeText.moveToDrying, () => {})}>Washer finished</Button>
      <Button size="lg" variant="outline" onClick={() => showTimerNotice(noticeText.dryDone('Dryer 4'), noticeText.checkDryness, () => {})}>Dryer finished</Button>
    </div>
  )
  return (
    <div className="page grid gap-6 max-w-[30rem] mx-auto pt-2">
      <TaskHeading title="Check product directions" mark={{ tone: 'waiting', text: 'Preview' }} caption="Sample product · nothing is saved" />
      <QuestionCard question={question} nameOf={() => 'Sample garment'} loadSize={screen === 'dose-checks' ? 'small' : undefined} pending={state === 'busy'} onAction={setLast} docked />
      <Note>{last === null ? `Screens: ${Object.keys(samples).join(', ')}` : `Would send: ${last.kind}`}</Note>
    </div>
  )
}

const sampleSheets: Supply = {
  supplyId: 'preview-sheets' as Id<'supplies'>, name: 'Free & clear dryer sheets', kind: 'dryer_sheet', use: 'dryer_sheets',
  formulation: { name: 'Free & clear dryer sheets', form: 'sheet' }, measure: null, archived: false, ranOutAt: null,
  provenance: { source: 'Synthetic visual fixture only', confidence: 'user-supplied' }, rules: [],
}
const barcodeName = 'Tide Free & Clear liquid laundry detergent'
/** The drafts the product sheet starts from: a blank add, a barcode match's suggestion, and a saved product. */
const productDrafts: Record<'product-new' | 'product-barcode' | 'product-sheets', BottleDraft> = {
  'product-new': newBottleDraft(),
  // The same merge the sheet's barcode lookup applies to a catalog match.
  'product-barcode': { ...newBottleDraft(), name: barcodeName, ...suggestedBottle(barcodeName, ['Laundry detergents', 'Liquid detergents']) },
  'product-sheets': draftFromSupply(sampleSheets),
}

/** The product sheet's real fields with the draft held in memory; nothing is saved. */
function ProductFormPreview({ draft: initial, title }: { draft: BottleDraft; title: string }) {
  const [draft, setDraft] = useState(initial)
  return <div className="page grid gap-4 max-w-[30rem] mx-auto pt-2">
    <TaskHeading title={title} mark={{ tone: 'waiting', text: 'Preview' }} caption={machineStepText.previewOnly} />
    <BottleFields draft={draft} onChange={setDraft} />
  </div>
}

/** The existing clothing-profile form with local pending/rejected save dependencies. */
function ProfileFormPreview({ long, state }: { long: boolean; state?: 'invalid' | 'error' | 'busy' }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const supplies = [
    { supplyId: 'preview-known', name: long ? 'AlexandriaMontgomeryFamilyFragranceFreeLiquidDetergent' : 'Known product', kind: 'chemical', archived: false },
    { supplyId: 'preview-other', name: 'Other product', kind: 'chemical', archived: false },
  ] as Inventory['supplies']
  return open ? <WearerEditorView wearer={{ wearerId: 'preview-mia' as Id<'wearers'>, name: 'Mia', kind: 'child', principalKey: null, requirements: { fragranceFree: true, dyeFree: true, avoidIngredients: long ? ['Optical brighteners', 'lanolin', 'sodium carbonate', 'benzisothiazolinone'] : ['Optical brighteners'], acceptedSupplyIds: ['preview-known' as Id<'supplies'>] } }} supplies={supplies} pending={pending} error={error} onClose={() => setOpen(false)} onSave={async () => {
    setPending(true)
    if (state === 'busy') await new Promise<never>(() => {})
    setError('This visual preview does not save changes.')
    setPending(false)
    return false
  }} /> : null
}

/** The actual picker with local-only selection and rejecting/pending save dependencies. */
function OutfitPreview({ empty, stale, state }: { empty: boolean; stale: boolean; state?: 'invalid' | 'error' | 'busy' }) {
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [tag, setTag] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const selectedCount = Object.values(draft).reduce((sum, count) => sum + count, 0)
  const choices = empty || tag === 'Work' ? [] : [
    ['tee', { textile: { name: 'White cotton tee', color: 'White', colorGroup: 'white' as const }, count: 2 }],
    ['long', { textile: { name: 'AlexandriaMontgomeryFamilySpecialOccasionShirt', color: 'Navy', colorGroup: 'dark' as const }, count: 25 }],
  ] as const
  const save = async () => {
    setPending(true)
    setError(null)
    try {
      if (state === 'busy') await new Promise<never>(() => {})
      throw new Error('This visual preview does not save changes.')
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setPending(false)
    }
  }
  return open ? <OutfitPickerSheet choices={choices} tags={empty ? [] : ['Everyday', 'Work']} tag={tag} draft={draft} dirty={selectedCount > 0} pending={pending} staleDraft={stale} selectedCount={selectedCount} hasOutfit={false} error={error} onClose={() => setOpen(false)} onSave={() => void save()} onTag={setTag} onChange={(key, quantity) => setDraft((current) => ({ ...current, [key]: quantity }))} /> : null
}

const samplePieces = [{ label: 'White cotton tee', count: 2, media: <GarmentIcon kind="t_shirt" colorGroup="white" /> }, { label: 'White towel', count: 1, media: <GarmentIcon kind="towel" colorGroup="white" /> }]
const sampleItems = ['tee-1', 'tee-2', 'towel'].map((textileId, index) => ({ textileId, name: index === 2 ? 'White towel' : 'White cotton tee', kind: index === 2 ? 'towel' : 't_shirt', colorGroup: 'white' }))
const sampleLoad: LoadCardView = { loadId: 'preview', number: 1, title: 'White load', items: sampleItems, itemsLine: 'White cotton tee ×2, White towel', settings: 'Normal · cold', doses: [], dry: null, stains: [], why: null, cautions: [], blockers: [] }
const sampleReview: LoadReviewModel = {
  garments: [
    { key: 'tee', textileIds: ['tee-1', 'tee-2'], candidates: [], name: 'White cotton tee', kind: 't_shirt', colorGroup: 'white', color: 'White', owner: 'Me', wash: 'Machine wash, cold, normal' },
    { key: 'towel', textileIds: ['towel'], candidates: [], name: 'White towel', kind: 'towel', colorGroup: 'white', color: 'White', owner: 'Shared', wash: 'Machine wash, warm, normal' },
  ], leftOut: [], requirements: null,
  products: { detergent: { key: 'detergent', supplyId: 'preview', name: 'Sample liquid detergent', fact: 'Liquid · no bleach listed' }, pretreat: [], softener: null, other: [] },
}
const sampleChemistry: ChemistryGroup[] = [{ key: 'dispenser', title: 'In the dispenser', rows: [{ id: 'detergent', stage: 'Detergent', product: 'Sample liquid detergent', where: 'Main wash compartment', amount: { kind: 'dose', dose: { amount: 30, unit: 'ml', mark: null } }, when: null, reminder: null, basis: 'Sample label row: normal soil, small load', done: false }] }]
const sampleDryPiece: DryingQueue['pieces'][number] = {
  pieceId: 'preview-piece' as Id<'dryingPieces'>, textileId: 'preview-textile' as Id<'textiles'>, name: 'White cotton tee', kind: 't_shirt', color: 'White', colorGroup: 'white', washerName: 'Washer 3', status: 'queued', queuedAt: 0, own: false, need: null,
  label: 'tumble_dry', method: 'tumble', source: 'label', evidence: 'allowed', preference: null, dried: null, maxHeat: 'low', hold: null, bulkUnits: 1, dryingRunId: null, driedIn: null,
}
const sampleDryQueue: DryingQueue = {
  pieces: [sampleDryPiece, { ...sampleDryPiece, pieceId: 'preview-dry' as Id<'dryingPieces'>, name: 'White towel', kind: 'towel', status: 'dry', driedIn: 'Dryer 4' }, { ...sampleDryPiece, pieceId: 'preview-running' as Id<'dryingPieces'>, name: 'Indigo jeans', kind: 'pants', color: 'Indigo', colorGroup: 'dark', status: 'drying', dryingRunId: 'preview-run' as Id<'dryingRuns'> }],
  plan: { loads: [{ pieceIds: ['preview-piece'], heat: 'low', bulkUnits: 1, capacityUnits: null, fit: 'not_checked', sources: ['Washer 3'], need: null }], natural: [], unset: [], mixedHeats: false },
  capacityUnits: null, capacities: [], homeDryerId: null, homeDryerSessionId: null, hangingDryers: [], equipment: { tumble: true, heated_hanging: false }, dryers: [],
  runs: [{ runId: 'preview-run' as Id<'dryingRuns'>, dryerId: null, reminded: false, kind: 'dryer', method: 'tumble', dryerName: 'Dryer 4', heatLabel: 'Low', startedAt: 0, minutes: 30, pieceIds: ['preview-running' as Id<'dryingPieces'>] }],
}

function laundryPreview(screen: string) {
  const back = <BackButton label="Back" onClick={previewCall('go back')} />
  if (screen === 'load-review') return <LoadScreen view={sampleLoad} review={sampleReview} start="start" pending={false} loadCount={1} allowMove={false} problems={[]} washer={{ title: 'Chosen when you arrive', fact: 'Shared laundry room' }} otherClassNote={null} next={null} onAtRoom={previewCall('mark you at the room')} openLink={null} onRunAction={previewCall('run the check')} onMove={previewCall('move the garment')} onNotThisTime={previewCall('leave it out this time')} onQuantity={previewCall('change the quantity')} onPutBack={previewCall('put it back')} onBack={previewCall('go back')} />
  if (screen === 'washer' || screen === 'washer-confirmed') return <WasherPathScreen
    view={{ number: 1, loadTitle: 'White load', itemsLine: sampleLoad.itemsLine, shared: true, washer: screen === 'washer' ? null : { label: 'Washer 3', fact: 'Front-loading · HE' }, refusal: null, recipe: [], changes: [], confirmed: screen === 'washer-confirmed', products: [], detergent: null }}
    pending={false} options={[{ machineId: 'preview-washer', name: 'Washer 3' }]} onPick={previewCall('pick the washer')} onConfirm={previewCall('confirm the washer')} onContinue={previewCall('continue')} onBack={previewCall('go back')} />
  if (screen === 'chemistry') return <ChemistryScreen groups={sampleChemistry} settings={['Normal · cold']} pieces={samplePieces} washer="Washer 3" unrecorded={false} startAmounts={false} onContinue={previewCall('continue')} continueLabel="Continue to preparation" disabled={false} back={back} />
  if (screen === 'drying' || screen === 'dryer-entry' || screen === 'dryness' || screen === 'put-away') return <DryingView queue={sampleDryQueue} householdId="preview-household" now={15 * 60_000} combine={false} onBack={previewCall('go back')} onCombine={previewCall('combine the loads')} onCapacity={previewCall('set the dryer capacity')} calls={previewDryingCalls} initialScreen={screen === 'dryer-entry' ? { kind: 'dryer', number: 1, heat: 'low', pieceIds: [] } : screen === 'dryness' ? { kind: 'check', runId: 'preview-run' } : screen === 'put-away' ? { kind: 'putaway' } : { kind: 'plan' }} />
  return null
}
